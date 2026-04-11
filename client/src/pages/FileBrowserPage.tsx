import { useState, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  File, Folder, FolderOpen, Download, Trash2, Upload, RefreshCw, Search,
  ChevronRight, ChevronDown, X, FileText, Image, FileCode, Eye,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ─── URL helpers ─────────────────────────────────────────────────────────────

/** Encode each path segment but keep slashes so Express 5 wildcards work */
function encodePath(filePath: string): string {
  return filePath.split("/").map(s => encodeURIComponent(s)).join("/");
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface FileEntry {
  path: string;
  name: string;
  type: "file" | "dir";
  size: number;
  modified: string;
  ext: string;
}

interface FilesResponse {
  files: FileEntry[];
  sandboxDir: string;
}

interface FileContent {
  content?: string;
  binary?: boolean;
  size: number;
  type: "text" | "binary" | "dir";
  ext: string;
  truncated?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function formatDate(iso: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "avif"]);
const CODE_EXTS = new Set([
  "js", "ts", "tsx", "jsx", "py", "sh", "bash", "html", "htm", "css",
  "scss", "json", "yaml", "yml", "toml", "xml", "sql", "rs", "go",
  "java", "c", "cpp", "h", "cs", "rb", "php", "swift", "kt", "tf",
  "graphql", "gql", "vue", "svelte", "astro", "mdx", "prisma", "hcl",
]);

function getFileIcon(entry: FileEntry, open = false) {
  if (entry.type === "dir") {
    return open
      ? <FolderOpen className="w-4 h-4 shrink-0 text-yellow-500" />
      : <Folder className="w-4 h-4 shrink-0 text-yellow-500" />;
  }
  if (IMAGE_EXTS.has(entry.ext)) return <Image className="w-4 h-4 shrink-0 text-blue-400" />;
  if (CODE_EXTS.has(entry.ext)) return <FileCode className="w-4 h-4 shrink-0 text-green-400" />;
  if (entry.ext === "md") return <FileText className="w-4 h-4 shrink-0 text-purple-400" />;
  return <File className="w-4 h-4 shrink-0 text-muted-foreground" />;
}

function getLangClass(ext: string): string {
  const map: Record<string, string> = {
    js: "language-javascript", ts: "language-typescript", tsx: "language-tsx",
    jsx: "language-jsx", py: "language-python", sh: "language-bash",
    bash: "language-bash", html: "language-html", css: "language-css",
    json: "language-json", yaml: "language-yaml", yml: "language-yaml",
    xml: "language-xml", sql: "language-sql", rs: "language-rust",
    go: "language-go", java: "language-java", c: "language-c",
    cpp: "language-cpp", md: "language-markdown",
  };
  return map[ext] || "";
}

// Build tree structure from flat list
interface TreeNode {
  entry: FileEntry;
  children: TreeNode[];
}

function buildTree(files: FileEntry[]): TreeNode[] {
  const roots: TreeNode[] = [];
  const nodeMap = new Map<string, TreeNode>();

  // Sort: dirs first, then files, both alphabetically
  const sorted = [...files].sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  for (const entry of sorted) {
    const node: TreeNode = { entry, children: [] };
    nodeMap.set(entry.path, node);
    const parentPath = entry.path.includes("/")
      ? entry.path.split("/").slice(0, -1).join("/")
      : null;
    if (parentPath && nodeMap.has(parentPath)) {
      nodeMap.get(parentPath)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

// ─── Tree Node Component ──────────────────────────────────────────────────────

function TreeItem({
  node,
  depth,
  selectedPath,
  onSelect,
  filter,
}: {
  node: TreeNode;
  depth: number;
  selectedPath: string | null;
  onSelect: (entry: FileEntry) => void;
  filter: string;
}) {
  const [open, setOpen] = useState(depth < 2);
  const { entry } = node;

  const matchesFilter = !filter || entry.name.toLowerCase().includes(filter.toLowerCase());
  const childrenMatchFilter = filter
    ? node.children.some(c => subtreeMatches(c, filter))
    : true;

  if (!matchesFilter && !childrenMatchFilter) return null;

  const isSelected = selectedPath === entry.path;
  const isDir = entry.type === "dir";

  return (
    <div>
      <button
        data-testid={`tree-item-${entry.path.replace(/[/\\]/g, "-")}`}
        className={`w-full flex items-center gap-1.5 px-2 py-1 rounded text-sm text-left transition-colors
          ${isSelected
            ? "bg-primary/10 text-primary font-medium"
            : "text-foreground hover:bg-muted"
          }`}
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
        onClick={() => {
          if (isDir) setOpen(o => !o);
          onSelect(entry);
        }}
        title={entry.path}
      >
        {isDir && (
          <span className="text-muted-foreground">
            {open
              ? <ChevronDown className="w-3 h-3" />
              : <ChevronRight className="w-3 h-3" />
            }
          </span>
        )}
        {!isDir && <span className="w-3" />}
        {getFileIcon(entry, open)}
        <span className="truncate flex-1">{entry.name}</span>
        {entry.type === "file" && (
          <span className="text-xs text-muted-foreground shrink-0">{formatSize(entry.size)}</span>
        )}
      </button>

      {isDir && open && node.children.length > 0 && (
        <div>
          {node.children.map(child => (
            <TreeItem
              key={child.entry.path}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              onSelect={onSelect}
              filter={filter}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function subtreeMatches(node: TreeNode, filter: string): boolean {
  if (node.entry.name.toLowerCase().includes(filter.toLowerCase())) return true;
  return node.children.some(c => subtreeMatches(c, filter));
}

// ─── File Preview ─────────────────────────────────────────────────────────────

function FilePreview({ entry }: { entry: FileEntry }) {
  const { data, isLoading, isError } = useQuery<FileContent>({
    queryKey: ["/api/sandbox/files/" + encodePath(entry.path)],
    enabled: entry.type === "file",
  });

  if (entry.type === "dir") {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
        <FolderOpen className="w-12 h-12 text-yellow-500 opacity-60" />
        <p className="text-sm">Folder — select a file to preview</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" />
        Loading…
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
        <X className="w-8 h-8" />
        <p className="text-sm">Failed to load file</p>
      </div>
    );
  }

  if (data.binary) {
    if (IMAGE_EXTS.has(entry.ext)) {
      const base = (import.meta as any).env?.VITE_API_BASE || "";
      const src = `${base}/api/sandbox/files/${encodePath(entry.path)}/download`;
      return (
        <div className="flex items-center justify-center h-full p-4">
          <img
            src={src}
            alt={entry.name}
            className="max-h-full max-w-full object-contain rounded"
            data-testid="preview-image"
          />
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
        <Eye className="w-10 h-10 opacity-40" />
        <p className="text-sm">Binary file — use download to open</p>
        <Badge variant="outline" className="text-xs">{entry.ext.toUpperCase()} · {formatSize(data.size)}</Badge>
      </div>
    );
  }

  if (data.content !== undefined) {
    // Markdown
    if (entry.ext === "md" || entry.ext === "mdx") {
      return (
        <ScrollArea className="h-full">
          <div className="p-4">
            {data.truncated && (
              <div className="mb-3 px-3 py-2 bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded text-xs text-yellow-700 dark:text-yellow-400">
                File truncated to 2 MB for display
              </div>
            )}
            <pre
              className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-foreground"
              data-testid="preview-markdown"
            >
              {data.content}
            </pre>
          </div>
        </ScrollArea>
      );
    }

    // Code / text
    const langClass = getLangClass(data.ext);
    return (
      <ScrollArea className="h-full">
        <div className="p-4">
          {data.truncated && (
            <div className="mb-3 px-3 py-2 bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded text-xs text-yellow-700 dark:text-yellow-400">
              File truncated to 2 MB for display
            </div>
          )}
          <pre
            className={`text-xs leading-relaxed font-mono whitespace-pre-wrap break-all text-foreground ${langClass}`}
            data-testid="preview-code"
          >
            {data.content}
          </pre>
        </div>
      </ScrollArea>
    );
  }

  return null;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function FileBrowserPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  const [selectedEntry, setSelectedEntry] = useState<FileEntry | null>(null);
  const [filter, setFilter] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [uploadDest, setUploadDest] = useState("");

  const { data, isLoading, isError, refetch } = useQuery<FilesResponse>({
    queryKey: ["/api/sandbox/files"],
  });

  const deleteMutation = useMutation({
    mutationFn: (filePath: string) =>
      apiRequest("DELETE", "/api/sandbox/files/" + encodePath(filePath)),
    onSuccess: (_, filePath) => {
      toast({ title: "Deleted", description: filePath });
      if (selectedEntry?.path === filePath) setSelectedEntry(null);
      qc.invalidateQueries({ queryKey: ["/api/sandbox/files"] });
    },
    onError: (err: Error) => {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    },
  });

  const uploadFiles = useCallback(async (files: FileList | File[], destination = "") => {
    const formData = new FormData();
    for (const file of Array.from(files)) {
      formData.append("files", file);
    }
    if (destination) formData.append("destination", destination);

    const base = (import.meta as any).env?.VITE_API_BASE || "";
    const res = await fetch(`${base}/api/sandbox/files/upload`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Upload failed" }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  }, []);

  const handleUpload = useCallback(async (files: FileList | File[], destination = "") => {
    try {
      const result = await uploadFiles(files, destination);
      toast({ title: "Uploaded", description: `${result.uploaded?.length || 0} file(s)` });
      qc.invalidateQueries({ queryKey: ["/api/sandbox/files"] });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    }
  }, [uploadFiles, toast, qc]);

  const handleDownload = useCallback((entry: FileEntry) => {
    if (entry.type === "dir") return;
    const base = (import.meta as any).env?.VITE_API_BASE || "";
    window.open(base + "/api/sandbox/files/" + encodePath(entry.path) + "/download");
  }, []);

  const handleDelete = useCallback((entry: FileEntry) => {
    if (!confirm(`Delete "${entry.name}"?`)) return;
    deleteMutation.mutate(entry.path);
  }, [deleteMutation]);

  // Drag-and-drop handlers
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);
  const onDragLeave = useCallback(() => setIsDragging(false), []);
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const dest = selectedEntry?.type === "dir" ? selectedEntry.path : uploadDest;
      handleUpload(files, dest);
    }
  }, [handleUpload, selectedEntry, uploadDest]);

  const tree = data ? buildTree(data.files) : [];
  const filteredTree = filter
    ? tree.filter(n => subtreeMatches(n, filter))
    : tree;

  const totalFiles = data?.files.filter(f => f.type === "file").length ?? 0;
  const totalDirs = data?.files.filter(f => f.type === "dir").length ?? 0;

  // Breadcrumb segments
  const breadcrumbs = selectedEntry
    ? ["sandbox", ...selectedEntry.path.split("/")]
    : ["sandbox"];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top toolbar */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-card shrink-0 flex-wrap">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1 text-sm text-muted-foreground flex-1 min-w-0" data-testid="breadcrumb">
          {breadcrumbs.map((seg, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="w-3 h-3 opacity-50 shrink-0" />}
              <span
                className={`truncate ${i === breadcrumbs.length - 1 ? "text-foreground font-medium" : ""}`}
              >
                {seg}
              </span>
            </span>
          ))}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            data-testid="button-refresh"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>

          {selectedEntry && selectedEntry.type === "file" && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDownload(selectedEntry)}
                data-testid="button-download"
                title="Download"
              >
                <Download className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDelete(selectedEntry)}
                disabled={deleteMutation.isPending}
                data-testid="button-delete"
                title="Delete"
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </>
          )}

          {selectedEntry && selectedEntry.type === "dir" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleDelete(selectedEntry)}
              disabled={deleteMutation.isPending}
              data-testid="button-delete-dir"
              title="Delete folder"
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Upload zone */}
      <div
        ref={dropZoneRef}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`mx-4 mt-3 mb-1 rounded-lg border-2 border-dashed transition-colors ${
          isDragging
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50"
        }`}
        data-testid="upload-dropzone"
      >
        <div className="flex items-center gap-3 px-4 py-2.5">
          <Upload className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="text-xs text-muted-foreground flex-1">
            {isDragging ? "Drop files to upload…" : "Drag & drop files here"}
          </span>
          <Input
            placeholder="Destination subfolder (optional)"
            value={uploadDest}
            onChange={e => setUploadDest(e.target.value)}
            className="h-7 text-xs w-44 shrink-0"
            data-testid="input-upload-destination"
          />
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs px-3 shrink-0"
            onClick={() => fileInputRef.current?.click()}
            data-testid="button-upload"
          >
            Browse
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            data-testid="input-file-upload"
            onChange={e => {
              if (e.target.files && e.target.files.length > 0) {
                handleUpload(e.target.files, uploadDest);
                e.target.value = "";
              }
            }}
          />
        </div>
      </div>

      {/* File metadata strip */}
      {selectedEntry && selectedEntry.type === "file" && (
        <div className="mx-4 mt-1 flex items-center gap-3 px-3 py-1.5 rounded bg-muted/50 text-xs text-muted-foreground" data-testid="file-metadata">
          <Badge variant="outline" className="text-xs">{selectedEntry.ext.toUpperCase() || "FILE"}</Badge>
          <span>{formatSize(selectedEntry.size)}</span>
          <Separator orientation="vertical" className="h-3" />
          <span>Modified {formatDate(selectedEntry.modified)}</span>
        </div>
      )}

      {/* Main split pane */}
      <div className="flex flex-1 overflow-hidden mt-2 mx-4 mb-4 rounded-lg border border-border">
        {/* Left: Tree */}
        <div className="w-64 shrink-0 border-r border-border flex flex-col">
          {/* Search */}
          <div className="p-2 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Filter files…"
                value={filter}
                onChange={e => setFilter(e.target.value)}
                className="pl-7 h-7 text-xs"
                data-testid="input-search"
              />
              {filter && (
                <button
                  onClick={() => setFilter("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  data-testid="button-clear-search"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="px-3 py-1.5 border-b border-border flex gap-2 text-xs text-muted-foreground">
            <span data-testid="stats-files">{totalFiles} file{totalFiles !== 1 ? "s" : ""}</span>
            <span>·</span>
            <span data-testid="stats-dirs">{totalDirs} folder{totalDirs !== 1 ? "s" : ""}</span>
          </div>

          {/* Tree */}
          <ScrollArea className="flex-1">
            <div className="p-1">
              {isLoading && (
                <div className="flex items-center gap-2 px-3 py-4 text-xs text-muted-foreground">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Loading…
                </div>
              )}
              {isError && (
                <div className="px-3 py-4 text-xs text-destructive">
                  Failed to load files
                </div>
              )}
              {!isLoading && !isError && filteredTree.length === 0 && !filter && (
                <div className="flex flex-col items-center justify-center py-12 px-4 gap-3 text-center" data-testid="empty-state">
                  <Folder className="w-10 h-10 text-muted-foreground opacity-40" />
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Sandbox is empty</p>
                    <p className="text-xs text-muted-foreground mt-1">Upload files above or run a task to generate artifacts</p>
                  </div>
                </div>
              )}
              {!isLoading && !isError && filteredTree.length === 0 && filter && (
                <div className="px-3 py-4 text-xs text-muted-foreground" data-testid="no-results">
                  No files match "{filter}"
                </div>
              )}
              {filteredTree.map(node => (
                <TreeItem
                  key={node.entry.path}
                  node={node}
                  depth={0}
                  selectedPath={selectedEntry?.path ?? null}
                  onSelect={setSelectedEntry}
                  filter={filter}
                />
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Right: Preview */}
        <div className="flex-1 overflow-hidden bg-background">
          {!selectedEntry ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3 p-8" data-testid="preview-empty">
              <Eye className="w-10 h-10 opacity-30" />
              <p className="text-sm">Select a file to preview</p>
              {totalFiles > 0 && (
                <p className="text-xs opacity-70">{totalFiles} file{totalFiles !== 1 ? "s" : ""} available</p>
              )}
            </div>
          ) : (
            <FilePreview entry={selectedEntry} />
          )}
        </div>
      </div>
    </div>
  );
}
