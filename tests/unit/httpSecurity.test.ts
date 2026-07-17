import express from "express";
import fs from "fs";
import path from "path";
import { createServer, type Server } from "http";
import { afterEach, describe, expect, it } from "vitest";
import { registerFileRoutes } from "../../server/fileRoutes.js";
import { createSecurityHeaders } from "../../server/securityHeaders.js";

const sandboxDir = path.join(process.cwd(), "sandbox");
const cleanupPaths = new Set<string>();
const servers = new Set<Server>();

async function listen(app: express.Express): Promise<string> {
  const server = createServer(app);
  servers.add(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind a TCP port");
  return `http://127.0.0.1:${address.port}`;
}

function track(relativePath: string): string {
  const fullPath = path.join(sandboxDir, relativePath);
  cleanupPaths.add(fullPath);
  return fullPath;
}

afterEach(async () => {
  await Promise.all([...servers].map((server) => new Promise<void>((resolve) => {
    server.close(() => resolve());
  })));
  servers.clear();

  for (const target of cleanupPaths) {
    fs.rmSync(target, { recursive: true, force: true });
  }
  cleanupPaths.clear();
});

describe("HTTP security headers", () => {
  it("enforces a production CSP without unsafe script execution", async () => {
    const app = express();
    app.use(createSecurityHeaders("production"));
    app.get("/", (_req, res) => res.send("ok"));

    const response = await fetch(await listen(app));
    const csp = response.headers.get("content-security-policy");

    expect(response.status).toBe(200);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).toContain("script-src-attr 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("connect-src 'self' wss:");
    expect(csp).not.toContain("connect-src 'self' ws:");
    expect(csp).toContain("upgrade-insecure-requests");
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).toContain("style-src 'self' 'unsafe-inline' https://fonts.googleapis.com");
    expect(csp).toContain("font-src 'self' data: https://fonts.gstatic.com");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("permits the Vite React preamble, WebSockets, and eval without upgrading localhost HTTP", async () => {
    const app = express();
    app.use(createSecurityHeaders("development"));
    app.get("/", (_req, res) => res.send("ok"));

    const response = await fetch(await listen(app));
    const csp = response.headers.get("content-security-policy");

    expect(csp).toContain("connect-src 'self' ws: wss:");
    expect(csp).toContain("script-src 'self' 'unsafe-eval' 'unsafe-inline'");
    expect(csp).not.toContain("upgrade-insecure-requests");
  });
});

describe("sandbox upload limits", () => {
  it("rejects traversal and symlink escapes before filesystem access", async () => {
    const outside = path.join(process.cwd(), `sandbox-outside-${crypto.randomUUID()}`);
    const linkName = `upload-link-${crypto.randomUUID()}`;
    const linkPath = track(linkName);
    cleanupPaths.add(outside);
    fs.mkdirSync(outside, { recursive: true });
    fs.writeFileSync(path.join(outside, "secret.txt"), "outside");
    fs.symlinkSync(outside, linkPath, process.platform === "win32" ? "junction" : "dir");

    const app = express();
    registerFileRoutes(app);
    const baseUrl = await listen(app);

    const traversal = await fetch(`${baseUrl}/api/sandbox/files/%2E%2E%2Fsecret.txt`);
    const symlink = await fetch(`${baseUrl}/api/sandbox/files/${linkName}/secret.txt`);

    expect(traversal.status).toBe(400);
    expect(symlink.status).toBe(400);
    expect(fs.readFileSync(path.join(outside, "secret.txt"), "utf8")).toBe("outside");
  });

  it("stores valid files and reports their real paths", async () => {
    const destination = `upload-test-${crypto.randomUUID()}`;
    track(destination);
    const app = express();
    registerFileRoutes(app);
    const form = new FormData();
    form.append("destination", destination);
    form.append("files", new Blob(["first"]), "first.txt");
    form.append("files", new Blob(["second"]), "second.md");

    const response = await fetch(`${await listen(app)}/api/sandbox/files/upload`, {
      method: "POST",
      body: form,
    });
    const body = await response.json() as { ok: boolean; uploaded: string[] };

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      uploaded: [
        `${destination}/first.txt`,
        `${destination}/second.md`,
      ],
    });
    expect(fs.readFileSync(path.join(sandboxDir, destination, "first.txt"), "utf8")).toBe("first");
    expect(fs.readFileSync(path.join(sandboxDir, destination, "second.md"), "utf8")).toBe("second");
  });

  it("rejects more than eight files and removes files already written", async () => {
    const destination = `upload-test-${crypto.randomUUID()}`;
    const target = track(destination);
    const app = express();
    registerFileRoutes(app);
    const form = new FormData();
    form.append("destination", destination);
    for (let index = 0; index < 9; index += 1) {
      form.append("files", new Blob([String(index)]), `${index}.txt`);
    }

    const response = await fetch(`${await listen(app)}/api/sandbox/files/upload`, {
      method: "POST",
      body: form,
    });
    const body = await response.json() as { error: string; code: string };

    expect(response.status).toBe(400);
    expect(body.code).toBe("LIMIT_FILE_COUNT");
    expect(fs.existsSync(target) ? fs.readdirSync(target) : []).toEqual([]);
  });

  it("enforces the aggregate byte limit for streamed multipart bodies", async () => {
    const destination = `upload-test-${crypto.randomUUID()}`;
    const target = track(destination);
    const app = express();
    registerFileRoutes(app, { maxUploadBytes: 10 });
    const form = new FormData();
    form.append("destination", destination);
    form.append("files", new Blob(["123456"]), "first.txt");
    form.append("files", new Blob(["abcdef"]), "second.txt");

    const response = await fetch(`${await listen(app)}/api/sandbox/files/upload`, {
      method: "POST",
      body: form,
    });
    const body = await response.json() as { error: string };

    expect(response.status).toBe(413);
    expect(body.error).toContain("10 byte aggregate limit");
    expect(fs.existsSync(target) ? fs.readdirSync(target) : []).toEqual([]);
  });

  it("rejects deeply nested fields before writing an uploaded file", async () => {
    const destination = `upload-test-${crypto.randomUUID()}`;
    const target = track(destination);
    const app = express();
    registerFileRoutes(app);
    const form = new FormData();
    form.append("destination", destination);
    form.append("metadata[a][b][c]", "value");
    form.append("files", new Blob(["content"]), "safe.txt");

    const response = await fetch(`${await listen(app)}/api/sandbox/files/upload`, {
      method: "POST",
      body: form,
    });
    const body = await response.json() as { error: string; code: string };

    expect(response.status).toBe(400);
    expect(body.code).toBe("LIMIT_FIELD_NESTING");
    expect(fs.existsSync(target) ? fs.readdirSync(target) : []).toEqual([]);
  });

  it("rejects executable extensions and removes earlier files in the request", async () => {
    const destination = `upload-test-${crypto.randomUUID()}`;
    const target = track(destination);
    const app = express();
    registerFileRoutes(app);
    const form = new FormData();
    form.append("destination", destination);
    form.append("files", new Blob(["safe"]), "safe.txt");
    form.append("files", new Blob(["echo unsafe"]), "unsafe.sh");

    const response = await fetch(`${await listen(app)}/api/sandbox/files/upload`, {
      method: "POST",
      body: form,
    });
    const body = await response.json() as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toContain("'.sh' is not allowed");
    expect(fs.existsSync(target) ? fs.readdirSync(target) : []).toEqual([]);
  });

  it("does not overwrite an existing file when a batch is rejected", async () => {
    const destination = `upload-test-${crypto.randomUUID()}`;
    const target = track(destination);
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(target, "existing.txt"), "original");
    const app = express();
    registerFileRoutes(app);
    const form = new FormData();
    form.append("destination", destination);
    form.append("files", new Blob(["replacement"]), "existing.txt");
    form.append("files", new Blob(["new"]), "new.txt");

    const response = await fetch(`${await listen(app)}/api/sandbox/files/upload`, {
      method: "POST",
      body: form,
    });
    const body = await response.json() as { error: string };

    expect(response.status).toBe(409);
    expect(body.error).toContain("already exists");
    expect(fs.readFileSync(path.join(target, "existing.txt"), "utf8")).toBe("original");
    expect(fs.existsSync(path.join(target, "new.txt"))).toBe(false);
    expect(fs.readdirSync(target)).toEqual(["existing.txt"]);
  });
});
