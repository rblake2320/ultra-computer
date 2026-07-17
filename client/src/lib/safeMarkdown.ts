import DOMPurify, { type Config } from "dompurify";

const SANITIZE_CONFIG: Config = {
  ALLOWED_TAGS: [
    "a",
    "code",
    "em",
    "h1",
    "h2",
    "h3",
    "li",
    "ol",
    "p",
    "pre",
    "strong",
    "ul",
  ],
  ALLOWED_ATTR: ["class", "href", "rel", "target"],
  ALLOW_DATA_ATTR: false,
  ALLOW_UNKNOWN_PROTOCOLS: false,
};

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Accept only explicit web/mail schemes, same-page fragments, and root-relative paths.
 * Protocol-relative and backslash-prefixed URLs are rejected because browsers can
 * interpret them as cross-origin navigation.
 */
export function safeMarkdownUrl(value: string): string {
  const candidate = value.trim();
  if (!candidate) return "#";
  if (/[\u0000-\u0020"'<>`\\]/.test(candidate)) return "#";

  if (candidate.startsWith("#")) return candidate;
  if (candidate.startsWith("/") && !candidate.startsWith("//")) {
    return candidate;
  }

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol === "http:" || parsed.protocol === "https:" || parsed.protocol === "mailto:") {
      return candidate;
    }
  } catch {
    // Invalid and relative URLs are rejected unless handled explicitly above.
  }

  return "#";
}

const INLINE_MARKDOWN = /(`[^`\n]+`|\[[^\]\n]+\]\([^)\n]*\)|\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g;

function renderInline(value: string): string {
  let result = "";
  let cursor = 0;

  for (const match of value.matchAll(INLINE_MARKDOWN)) {
    const token = match[0];
    const index = match.index ?? 0;
    result += escapeHtml(value.slice(cursor, index));

    if (token.startsWith("`")) {
      result += `<code>${escapeHtml(token.slice(1, -1))}</code>`;
    } else if (token.startsWith("[")) {
      const separator = token.indexOf("](");
      const label = token.slice(1, separator);
      const url = token.slice(separator + 2, -1);
      result += `<a href="${escapeHtml(safeMarkdownUrl(url))}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
    } else if (token.startsWith("**")) {
      result += `<strong>${escapeHtml(token.slice(2, -2))}</strong>`;
    } else {
      result += `<em>${escapeHtml(token.slice(1, -1))}</em>`;
    }

    cursor = index + token.length;
  }

  return result + escapeHtml(value.slice(cursor));
}

/**
 * Convert the deliberately small chat-markdown subset into HTML.
 *
 * All message-controlled values are escaped at the point they enter an HTML text
 * or attribute context. Raw HTML is displayed as text, never interpreted.
 */
export function renderMarkdownToHtml(raw: string): string {
  const lines = raw.replace(/\r\n?/g, "\n").split("\n");
  const html: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let codeLanguage: string | null = null;
  let codeLines: string[] = [];

  const closeList = () => {
    if (listType) {
      html.push(`</${listType}>`);
      listType = null;
    }
  };

  const closeCodeBlock = () => {
    const language = codeLanguage || "text";
    html.push(`<pre><code class="language-${escapeHtml(language)}">${escapeHtml(codeLines.join("\n"))}</code></pre>`);
    codeLanguage = null;
    codeLines = [];
  };

  for (const line of lines) {
    if (codeLanguage !== null) {
      if (/^\s*```\s*$/.test(line)) {
        closeCodeBlock();
      } else {
        codeLines.push(line);
      }
      continue;
    }

    const fence = line.match(/^\s*```([A-Za-z0-9_+-]{0,32})\s*$/);
    if (fence) {
      closeList();
      codeLanguage = fence[1] || "text";
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) {
      closeList();
      continue;
    }

    const header = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (header) {
      closeList();
      const level = header[1].length;
      html.push(`<h${level}>${renderInline(header[2])}</h${level}>`);
      continue;
    }

    const unorderedItem = trimmed.match(/^[-*]\s+(.+)$/);
    if (unorderedItem) {
      if (listType !== "ul") {
        closeList();
        html.push("<ul>");
        listType = "ul";
      }
      html.push(`<li>${renderInline(unorderedItem[1])}</li>`);
      continue;
    }

    const orderedItem = trimmed.match(/^\d+\.\s+(.+)$/);
    if (orderedItem) {
      if (listType !== "ol") {
        closeList();
        html.push("<ol>");
        listType = "ol";
      }
      html.push(`<li>${renderInline(orderedItem[1])}</li>`);
      continue;
    }

    closeList();
    html.push(`<p>${renderInline(trimmed)}</p>`);
  }

  closeList();
  if (codeLanguage !== null) closeCodeBlock();
  return html.join("\n");
}

export function renderSafeMarkdown(raw: string): string {
  const generatedHtml = renderMarkdownToHtml(raw);

  // This renderer is client-only. The fallback keeps pure Node unit tests useful
  // while the browser path always receives DOMPurify's final allowlist pass.
  if (!DOMPurify.isSupported) return generatedHtml;
  return DOMPurify.sanitize(generatedHtml, SANITIZE_CONFIG);
}
