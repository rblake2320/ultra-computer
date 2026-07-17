import { describe, expect, it } from "vitest";
import {
  renderMarkdownToHtml,
  renderSafeMarkdown,
  safeMarkdownUrl,
} from "../../client/src/lib/safeMarkdown";

describe("safe markdown rendering", () => {
  it("escapes quote-based link attribute injection", () => {
    const html = renderSafeMarkdown('[click](https://example.com/" autofocus onfocus="alert(1))');

    expect(html).toContain('href="#"');
    expect(html).not.toContain('href="https://example.com/" autofocus');
    expect(html).not.toMatch(/\sonfocus=/);
  });

  it.each([
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "//evil.example/payload",
    "/\\evil.example/payload",
    "java&#x73;cript:alert(1)",
    "java%73cript:alert(1)",
  ])("rejects unsafe or malformed URL %s", (url) => {
    expect(safeMarkdownUrl(url)).toBe("#");
  });

  it("renders raw and encoded HTML as inert text", () => {
    const html = renderSafeMarkdown(
      '<img src=x onerror=alert(1)><svg/onload=alert(2)> &#60;script&#62;alert(3)&#60;/script&#62;',
    );

    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).toContain("&lt;svg/onload=alert(2)&gt;");
    expect(html).toContain("&amp;#60;script&amp;#62;");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<svg");
    expect(html).not.toContain("<script");
  });

  it("escapes hostile content in headings, lists, emphasis, and code", () => {
    const html = renderMarkdownToHtml([
      "# <img src=x onerror=alert(1)>",
      "- **<script>alert(2)</script>**",
      "`<iframe srcdoc=x>`",
      "```html",
      '<button onclick="alert(3)">go</button>',
      "```",
    ].join("\n"));

    expect(html).not.toMatch(/<(?:img|script|iframe|button)\b/i);
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).toContain("&lt;script&gt;alert(2)&lt;/script&gt;");
    expect(html).toContain("&lt;iframe srcdoc=x&gt;");
    expect(html).toContain("&lt;button onclick=&quot;alert(3)&quot;&gt;");
  });

  it("preserves safe links, root-relative links, emphasis, and code blocks", () => {
    const html = renderSafeMarkdown([
      "# Result",
      "Visit [docs](https://example.com/a?x=1&y=2) or [local](/models).",
      "Use **care** and `const value = \"<safe>\";`.",
      "```ts",
      'const tag = "<not-html>";',
      "```",
    ].join("\n"));

    expect(html).toContain('<a href="https://example.com/a?x=1&amp;y=2" target="_blank" rel="noopener noreferrer">docs</a>');
    expect(html).toContain('<a href="/models" target="_blank" rel="noopener noreferrer">local</a>');
    expect(html).toContain("<strong>care</strong>");
    expect(html).toContain("<code>const value = &quot;&lt;safe&gt;&quot;;</code>");
    expect(html).toContain('<pre><code class="language-ts">const tag = &quot;&lt;not-html&gt;&quot;;</code></pre>');
  });
});
