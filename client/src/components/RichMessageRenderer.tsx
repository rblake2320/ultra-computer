/**
 * RichMessageRenderer — renders chat messages with full rich content support:
 * - Markdown with GFM (tables, strikethrough, task lists)
 * - Syntax-highlighted code blocks
 * - Inline image previews (from URLs, sandbox paths, DALL-E URLs)
 * - Audio players for audio file references
 * - Video players for video file references
 * - File download links for other file types
 * - Clickable image lightbox for full-size viewing
 */
import { useState, useCallback, useMemo, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import {
  Download, ExternalLink, Maximize2, X, Copy, Check,
  Image as ImageIcon, Music, Film, FileText
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convert a sandbox file path to a serveable raw URL */
function sandboxPathToRawUrl(filePath: string): string {
  // Handle absolute paths like /path/to/sandbox/images/file.png
  // Extract the relative path after "sandbox/"
  const sandboxIdx = filePath.indexOf("sandbox/");
  if (sandboxIdx !== -1) {
    const relative = filePath.slice(sandboxIdx + "sandbox/".length);
    return `/api/sandbox/files/${encodeURIComponent(relative)}/raw`;
  }
  // Handle relative paths like images/file.png
  if (!filePath.startsWith("http") && !filePath.startsWith("/api/")) {
    return `/api/sandbox/files/${encodeURIComponent(filePath)}/raw`;
  }
  return filePath;
}

/** Check if a URL/path points to an image */
function isImageUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return /\.(png|jpg|jpeg|gif|webp|svg|bmp|ico)(\?.*)?$/i.test(lower) ||
    lower.includes("oaidalleapiprodscus") || // DALL-E URLs
    lower.includes("openai.com") && lower.includes("image");
}

/** Check if a URL/path points to audio */
function isAudioUrl(url: string): boolean {
  return /\.(mp3|wav|ogg|flac|aac|m4a)(\?.*)?$/i.test(url.toLowerCase());
}

/** Check if a URL/path points to video */
function isVideoUrl(url: string): boolean {
  return /\.(mp4|webm|ogv|avi|mov)(\?.*)?$/i.test(url.toLowerCase());
}

/** Extract image/audio/video URLs from text that aren't in markdown syntax */
function extractMediaUrls(text: string): { images: string[]; audio: string[]; video: string[] } {
  const images: string[] = [];
  const audio: string[] = [];
  const video: string[] = [];

  // Match URLs (http/https)
  const urlRegex = /https?:\/\/[^\s<>"')\]]+/gi;
  const matches = text.match(urlRegex) || [];

  for (const url of matches) {
    if (isImageUrl(url)) images.push(url);
    else if (isAudioUrl(url)) audio.push(url);
    else if (isVideoUrl(url)) video.push(url);
  }

  // Match sandbox paths like sandbox/images/generated_123.png or images/file.png
  const pathRegex = /(?:sandbox\/)?images\/[\w\-./]+\.(png|jpg|jpeg|gif|webp)/gi;
  const pathMatches = text.match(pathRegex) || [];
  for (const p of pathMatches) {
    const url = sandboxPathToRawUrl(p);
    if (!images.includes(url)) images.push(url);
  }

  return { images, audio, video };
}

// ─── Lightbox Component ───────────────────────────────────────────────────────

function ImageLightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="relative max-w-[90vw] max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <button
          onClick={onClose}
          className="absolute -top-10 right-0 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          aria-label="Close lightbox"
        >
          <X className="w-5 h-5" />
        </button>
        <img
          src={src}
          alt={alt}
          className="max-w-full max-h-[85vh] rounded-lg shadow-2xl object-contain"
        />
        <div className="flex items-center gap-2 mt-2 justify-center">
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/20 text-white text-xs transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Open original
          </a>
          <a
            href={src}
            download
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/20 text-white text-xs transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> Download
          </a>
        </div>
      </div>
    </div>
  );
}

// ─── Copy Button for Code Blocks ──────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      className="absolute top-2 right-2 p-1.5 rounded-md bg-white/5 hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover:opacity-100"
      aria-label="Copy code"
      title="Copy code"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

// ─── Inline Image Preview ─────────────────────────────────────────────────────

function InlineImage({ src, alt }: { src: string; alt: string }) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [error, setError] = useState(false);

  const resolvedSrc = useMemo(() => {
    if (src.startsWith("http") || src.startsWith("/api/")) return src;
    return sandboxPathToRawUrl(src);
  }, [src]);

  if (error) {
    return (
      <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-muted/50 border border-border text-xs text-muted-foreground">
        <ImageIcon className="w-3.5 h-3.5" />
        <span>{alt || "Image"}</span>
        <a href={resolvedSrc} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    );
  }

  return (
    <>
      <div className="rich-image-container my-3">
        <div className="relative group rounded-lg overflow-hidden border border-border bg-muted/30 inline-block max-w-full">
          <img
            src={resolvedSrc}
            alt={alt || "Generated image"}
            className="max-w-full max-h-[500px] object-contain cursor-pointer"
            loading="lazy"
            onError={() => setError(true)}
            onClick={() => setLightboxOpen(true)}
          />
          <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-2 py-1.5 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
            <span className="text-[10px] text-white/80 truncate max-w-[60%]">{alt || "Generated image"}</span>
            <div className="flex items-center gap-1">
              <button
                onClick={(e) => { e.stopPropagation(); setLightboxOpen(true); }}
                className="p-1 rounded bg-white/10 hover:bg-white/20 text-white transition-colors"
                title="View full size"
              >
                <Maximize2 className="w-3 h-3" />
              </button>
              <a
                href={resolvedSrc}
                download
                onClick={e => e.stopPropagation()}
                className="p-1 rounded bg-white/10 hover:bg-white/20 text-white transition-colors"
                title="Download"
              >
                <Download className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      </div>
      {lightboxOpen && (
        <ImageLightbox src={resolvedSrc} alt={alt || "Generated image"} onClose={() => setLightboxOpen(false)} />
      )}
    </>
  );
}

// ─── Inline Audio Player ──────────────────────────────────────────────────────

function InlineAudioPlayer({ src, label }: { src: string; label?: string }) {
  const resolvedSrc = useMemo(() => {
    if (src.startsWith("http") || src.startsWith("/api/")) return src;
    return sandboxPathToRawUrl(src);
  }, [src]);

  return (
    <div className="rich-audio-container my-3 rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex items-center gap-2 mb-2">
        <Music className="w-4 h-4 text-primary" />
        <span className="text-xs font-medium text-foreground">{label || "Audio"}</span>
        <a
          href={resolvedSrc}
          download
          className="ml-auto p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          title="Download audio"
        >
          <Download className="w-3.5 h-3.5" />
        </a>
      </div>
      <audio controls className="w-full h-8" preload="metadata">
        <source src={resolvedSrc} />
        Your browser does not support the audio element.
      </audio>
    </div>
  );
}

// ─── Inline Video Player ──────────────────────────────────────────────────────

function InlineVideoPlayer({ src, label }: { src: string; label?: string }) {
  const resolvedSrc = useMemo(() => {
    if (src.startsWith("http") || src.startsWith("/api/")) return src;
    return sandboxPathToRawUrl(src);
  }, [src]);

  return (
    <div className="rich-video-container my-3 rounded-lg border border-border bg-muted/30 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <Film className="w-4 h-4 text-primary" />
        <span className="text-xs font-medium text-foreground">{label || "Video"}</span>
        <a
          href={resolvedSrc}
          download
          className="ml-auto p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          title="Download video"
        >
          <Download className="w-3.5 h-3.5" />
        </a>
      </div>
      <video controls className="w-full max-h-[400px]" preload="metadata">
        <source src={resolvedSrc} />
        Your browser does not support the video element.
      </video>
    </div>
  );
}

// ─── Artifact Preview ─────────────────────────────────────────────────────────

export function ArtifactPreview({ artifact }: { artifact: { path: string; type: string } }) {
  const isImage = artifact.type.startsWith("image/");
  const isAudio = artifact.type.startsWith("audio/");
  const isVideo = artifact.type.startsWith("video/");
  const filename = artifact.path.split("/").pop() || artifact.path;

  const rawUrl = sandboxPathToRawUrl(artifact.path);
  const downloadUrl = rawUrl.replace("/raw", "/download");

  if (isImage) {
    return <InlineImage src={rawUrl} alt={filename} />;
  }

  if (isAudio) {
    return <InlineAudioPlayer src={rawUrl} label={filename} />;
  }

  if (isVideo) {
    return <InlineVideoPlayer src={rawUrl} label={filename} />;
  }

  // Generic file
  return (
    <div className="flex items-center gap-2 my-2 px-3 py-2 rounded-lg border border-border bg-muted/30">
      <FileText className="w-4 h-4 text-muted-foreground" />
      <span className="text-xs font-medium text-foreground truncate">{filename}</span>
      <span className="text-[10px] text-muted-foreground">({artifact.type})</span>
      <a
        href={downloadUrl}
        download
        className="ml-auto flex items-center gap-1 px-2 py-1 rounded text-xs bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
      >
        <Download className="w-3 h-3" /> Download
      </a>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface RichMessageRendererProps {
  content: string;
  className?: string;
  /** Optional artifacts from tool calls to render inline */
  artifacts?: { path: string; type: string }[];
}

export function RichMessageRenderer({ content, className = "", artifacts }: RichMessageRendererProps) {
  const [lightboxImage, setLightboxImage] = useState<{ src: string; alt: string } | null>(null);

  // Extract standalone media URLs that aren't in markdown image/link syntax
  const standaloneMedia = useMemo(() => {
    // Remove markdown images and links before scanning for standalone URLs
    const stripped = content
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, "")
      .replace(/\[([^\]]*)\]\(([^)]+)\)/g, "");
    return extractMediaUrls(stripped);
  }, [content]);

  return (
    <div className={`rich-message prose-ultra ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // ── Code blocks with syntax highlighting ──
          code({ node, className: codeClassName, children, ...props }) {
            const match = /language-(\w+)/.exec(codeClassName || "");
            const codeString = String(children).replace(/\n$/, "");

            // Inline code
            if (!match && !codeString.includes("\n")) {
              return (
                <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono" {...props}>
                  {children}
                </code>
              );
            }

            // Block code with syntax highlighting
            const language = match ? match[1] : "text";
            return (
              <div className="relative group my-3">
                <div className="flex items-center justify-between px-3 py-1.5 bg-muted/80 border border-border rounded-t-md">
                  <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wide">{language}</span>
                  <CopyButton text={codeString} />
                </div>
                <SyntaxHighlighter
                  style={oneDark}
                  language={language}
                  PreTag="div"
                  customStyle={{
                    margin: 0,
                    borderTopLeftRadius: 0,
                    borderTopRightRadius: 0,
                    borderBottomLeftRadius: "0.375rem",
                    borderBottomRightRadius: "0.375rem",
                    fontSize: "0.75rem",
                    lineHeight: "1.5",
                    border: "1px solid hsl(var(--border))",
                    borderTop: "none",
                  }}
                  showLineNumbers={codeString.split("\n").length > 5}
                  wrapLongLines
                >
                  {codeString}
                </SyntaxHighlighter>
              </div>
            );
          },

          // ── Images with preview and lightbox ──
          img({ src, alt, ...props }) {
            if (!src) return null;
            return <InlineImage src={src} alt={alt || ""} />;
          },

          // ── Links — detect media links and render appropriately ──
          a({ href, children, ...props }) {
            if (!href) return <span>{children}</span>;

            if (isImageUrl(href)) {
              return <InlineImage src={href} alt={String(children) || ""} />;
            }
            if (isAudioUrl(href)) {
              return <InlineAudioPlayer src={href} label={String(children) || undefined} />;
            }
            if (isVideoUrl(href)) {
              return <InlineVideoPlayer src={href} label={String(children) || undefined} />;
            }

            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline inline-flex items-center gap-0.5"
                {...props}
              >
                {children}
                <ExternalLink className="w-3 h-3 inline-block ml-0.5 opacity-50" />
              </a>
            );
          },

          // ── Tables ──
          table({ children }) {
            return (
              <div className="overflow-x-auto my-3 rounded-lg border border-border">
                <table className="w-full text-sm">{children}</table>
              </div>
            );
          },

          // ── Blockquotes ──
          blockquote({ children }) {
            return (
              <blockquote className="border-l-2 border-primary pl-3 text-muted-foreground italic text-sm mb-3 my-3">
                {children}
              </blockquote>
            );
          },

          // ── Paragraphs — check for standalone image URLs ──
          p({ children, ...props }) {
            // Check if this paragraph contains only an image
            const childArray = Array.isArray(children) ? children : [children];
            const hasOnlyImage = childArray.length === 1 &&
              typeof childArray[0] === "object" &&
              childArray[0] !== null &&
              "type" in childArray[0] &&
              (childArray[0] as any).type === InlineImage;

            if (hasOnlyImage) {
              return <>{children}</>;
            }

            return <p className="text-sm leading-relaxed mb-3" {...props}>{children}</p>;
          },
        }}
      >
        {content}
      </ReactMarkdown>

      {/* Render standalone image URLs found in text but not in markdown syntax */}
      {standaloneMedia.images.length > 0 && (
        <div className="mt-2 space-y-2">
          {standaloneMedia.images.map((url, i) => (
            <InlineImage key={`standalone-img-${i}`} src={url} alt={`Image ${i + 1}`} />
          ))}
        </div>
      )}

      {/* Render standalone audio URLs */}
      {standaloneMedia.audio.length > 0 && (
        <div className="mt-2 space-y-2">
          {standaloneMedia.audio.map((url, i) => (
            <InlineAudioPlayer key={`standalone-audio-${i}`} src={url} label={`Audio ${i + 1}`} />
          ))}
        </div>
      )}

      {/* Render standalone video URLs */}
      {standaloneMedia.video.length > 0 && (
        <div className="mt-2 space-y-2">
          {standaloneMedia.video.map((url, i) => (
            <InlineVideoPlayer key={`standalone-video-${i}`} src={url} label={`Video ${i + 1}`} />
          ))}
        </div>
      )}

      {/* Render tool call artifacts */}
      {artifacts && artifacts.length > 0 && (
        <div className="mt-3 space-y-2">
          {artifacts.map((artifact, i) => (
            <ArtifactPreview key={`artifact-${i}`} artifact={artifact} />
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightboxImage && (
        <ImageLightbox
          src={lightboxImage.src}
          alt={lightboxImage.alt}
          onClose={() => setLightboxImage(null)}
        />
      )}
    </div>
  );
}

export default RichMessageRenderer;
