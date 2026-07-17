import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("browser security boundary — real Chromium", () => {
  let server: Server;
  let port = 0;
  let privateRequests = 0;
  const previousAllowlist = process.env.ULTRA_LOCAL_EGRESS_ALLOWLIST;

  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url === "/private") {
        privateRequests += 1;
        res.end("private content");
        return;
      }
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.end(`<!doctype html><title>Browser security</title>
        <input id="secret" aria-label="Secret value">
        <img src="http://localhost:${port}/private" alt="blocked private resource">
        <main>public test page</main>`);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No test port");
    port = address.port;
    process.env.ULTRA_LOCAL_EGRESS_ALLOWLIST = "127.0.0.1";
  });

  afterAll(async () => {
    const { shutdownBrowser } = await import("../../server/browserTool.js");
    await shutdownBrowser();
    if (previousAllowlist === undefined) delete process.env.ULTRA_LOCAL_EGRESS_ALLOWLIST;
    else process.env.ULTRA_LOCAL_EGRESS_ALLOWLIST = previousAllowlist;
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  it("blocks private subresources and prevents typed input from later exposure", async () => {
    const { executeBrowserTool } = await import("../../server/browserTool.js");
    const session = `browser-security-${Date.now()}`;
    const navigated = await executeBrowserTool("browse_url", {
      url: `http://127.0.0.1:${port}/`,
      extract_text: "true",
      session,
    });
    expect(navigated.success, JSON.stringify(navigated)).toBe(true);
    expect(navigated.output).toContain("public test page");

    const secret = "owner-private-value-7391";
    const typed = await executeBrowserTool("browser_action", {
      action: "type",
      selector: "#secret",
      value: secret,
      session,
    });
    expect(typed.success).toBe(true);
    expect(JSON.stringify(typed)).not.toContain(secret);

    const evaluated = await executeBrowserTool("browser_evaluate", {
      script: "document.querySelector('#secret').value",
      session,
    });
    expect(evaluated.success).toBe(false);
    expect(JSON.stringify(evaluated)).not.toContain(secret);
    expect(evaluated.error).toMatch(/disabled after private input/i);
    expect(privateRequests).toBe(0);

    await executeBrowserTool("browser_close", { session });
  }, 30_000);
});
