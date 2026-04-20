import type { Express } from "express";
import path from "path";
import fs from "fs";
import multer from "multer";

const SANDBOX_DIR = path.join(process.cwd(), "sandbox");

function ensureSandboxDir() {
  if (!fs.existsSync(SANDBOX_DIR)) {
    fs.mkdirSync(SANDBOX_DIR, { recursive: true });
  }
}

/**
 * In Express 5, wildcard params are returned as arrays.
 * Join them to get the full relative path.
 */
function paramToPath(param: unknown): string {
  if (Array.isArray(param)) return param.join("/");
  if (typeof param === "string") return param;
  return "";
}

/**
 * Resolve a user-supplied relative path inside the sandbox, returning null if
 * traversal is detected.
 *
 * The authoritative check is path.resolve(base, userInput) + startsWith(base):
 * no regex-stripping of "../" is performed beforehand.  Pre-stripping is
 * unnecessary (path.resolve normalises everything) and can be bypassed with
 * double-encoded sequences such as "..%2F" that survive a naive replace but
 * are decoded by the filesystem layer.
 */
function resolveSafe(relativePath: string): string | null {
  ensureSandboxDir();
  const base = path.resolve(SANDBOX_DIR);
  const resolved = path.resolve(base, relativePath);
  if (!resolved.startsWith(base)) return null;
  return resolved;
}

interface FileEntry {
  path: string;
  name: string;
  type: "file" | "dir";
  size: number;
  modified: string;
  ext: string;
}

function walkDir(dir: string, baseDir: string, depth = 0, maxDepth = 10): FileEntry[] {
  const entries: FileEntry[] = [];
  if (depth > maxDepth) return entries;
  let items: fs.Dirent[];
  try {
    items = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return entries;
  }

  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    const relativePath = path.relative(baseDir, fullPath);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(fullPath);
    } catch {
      continue;
    }

    if (item.isDirectory()) {
      entries.push({
        path: relativePath,
        name: item.name,
        type: "dir",
        size: 0,
        modified: stat.mtime.toISOString(),
        ext: "",
      });
      entries.push(...walkDir(fullPath, baseDir, depth + 1, maxDepth));
    } else if (item.isFile()) {
      entries.push({
        path: relativePath,
        name: item.name,
        type: "file",
        size: stat.size,
        modified: stat.mtime.toISOString(),
        ext: path.extname(item.name).toLowerCase().slice(1),
      });
    }
  }
  return entries;
}

const TEXT_EXTS = new Set([
  "txt", "md", "json", "js", "ts", "tsx", "jsx", "py", "sh", "bash",
  "html", "htm", "css", "scss", "sass", "less", "xml", "yaml", "yml",
  "toml", "ini", "cfg", "conf", "env", "gitignore", "dockerignore",
  "makefile", "sql", "csv", "tsv", "log", "r", "rb", "go", "rs",
  "java", "c", "cpp", "h", "hpp", "cs", "php", "swift", "kt",
  "diff", "patch", "rst", "tex", "tf", "hcl", "prisma",
  "graphql", "gql", "vue", "svelte", "astro", "mdx", "lock",
]);

function isTextFile(ext: string, filename: string): boolean {
  const lowerName = filename.toLowerCase();
  if (["dockerfile", "makefile", "gemfile", "rakefile", "procfile"].includes(lowerName)) return true;
  return TEXT_EXTS.has(ext.toLowerCase());
}

export function registerFileRoutes(app: Express) {
  ensureSandboxDir();

  // Dynamic multer storage: respect `destination` field in multipart
  const storage = multer.diskStorage({
    destination: (req, _file, cb) => {
      ensureSandboxDir();
      const dest = (req.body?.destination as string) || "";
      let targetDir = SANDBOX_DIR;
      if (dest) {
        const resolved = resolveSafe(dest);
        if (!resolved) return cb(new Error("Invalid destination path"), "");
        targetDir = resolved;
      }
      fs.mkdirSync(targetDir, { recursive: true });
      cb(null, targetDir);
    },
    filename: (_req, file, cb) => {
      const safe = path.basename(file.originalname).replace(/[^a-zA-Z0-9._\-]/g, '_');
      cb(null, safe);
    },
  });

  const upload = multer({
    storage,
    limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
  });

  // ─── GET /api/sandbox/files ────────────────────────────────────────────────
  app.get("/api/sandbox/files", (_req, res) => {
    ensureSandboxDir();
    const entries = walkDir(SANDBOX_DIR, SANDBOX_DIR);
    res.json({ files: entries, sandboxDir: SANDBOX_DIR });
  });

  // ─── POST /api/sandbox/files/upload ───────────────────────────────────────
  // Must be registered BEFORE wildcard routes to avoid collision
  app.post("/api/sandbox/files/upload", upload.array("files"), (req, res) => {
    const files = (req.files as Express.Multer.File[]) || [];
    const uploaded = files.map(f => path.relative(SANDBOX_DIR, f.path));
    res.json({ ok: true, uploaded });
  });

  // ─── GET /api/sandbox/files/:filePath*/download ───────────────────────────
  // Express 5: wildcard param is an array; filePath captures segments before /download
  app.get("/api/sandbox/files/*filePath/download", (req, res) => {
    const rawParam = (req.params as any).filePath;
    const relativePath = paramToPath(rawParam);
    const resolved = resolveSafe(relativePath);
    if (!resolved) return res.status(400).json({ error: "Invalid path" });
    if (!fs.existsSync(resolved)) return res.status(404).json({ error: "File not found" });

    const stat = fs.statSync(resolved);
    if (stat.isDirectory()) return res.status(400).json({ error: "Cannot download a directory" });

    const MAX_DOWNLOAD_SIZE = 500 * 1024 * 1024; // 500 MB
    if (stat.size > MAX_DOWNLOAD_SIZE) {
      return res.status(413).json({ error: "File too large for download" });
    }

    const filename = path.basename(resolved);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", stat.size);
    res.setHeader("Content-Type", "application/octet-stream");
    const stream = fs.createReadStream(resolved);
    stream.on('error', (err) => { if (!res.headersSent) res.status(500).json({ error: 'Read error' }); });
    stream.pipe(res);
  });

  // ─── GET /api/sandbox/files/:filePath* ────────────────────────────────────
  app.get("/api/sandbox/files/*filePath", (req, res) => {
    const rawParam = (req.params as any).filePath;
    const relativePath = paramToPath(rawParam);
    const resolved = resolveSafe(relativePath);
    if (!resolved) return res.status(400).json({ error: "Invalid path" });
    if (!fs.existsSync(resolved)) return res.status(404).json({ error: "File not found" });

    const stat = fs.statSync(resolved);

    if (stat.isDirectory()) {
      const entries = fs.readdirSync(resolved, { withFileTypes: true }).map(item => {
        const itemFull = path.join(resolved, item.name);
        let s: fs.Stats | null = null;
        try { s = fs.statSync(itemFull); } catch { /* ignore */ }
        return {
          path: path.relative(SANDBOX_DIR, itemFull),
          name: item.name,
          type: item.isDirectory() ? "dir" : "file",
          size: s?.size || 0,
          modified: s?.mtime.toISOString() || "",
          ext: item.isDirectory() ? "" : path.extname(item.name).toLowerCase().slice(1),
        };
      });
      return res.json({ type: "dir", entries });
    }

    const ext = path.extname(resolved).toLowerCase().slice(1);
    const filename = path.basename(resolved);

    if (isTextFile(ext, filename)) {
      const MAX_TEXT = 2 * 1024 * 1024; // 2 MB cap
      if (stat.size > MAX_TEXT) {
        let buf: Buffer;
        const fd = fs.openSync(resolved, "r");
        try {
          buf = Buffer.alloc(MAX_TEXT);
          fs.readSync(fd, buf, 0, MAX_TEXT, 0);
        } finally {
          fs.closeSync(fd);
        }
        return res.json({ content: buf.toString("utf-8"), size: stat.size, type: "text", ext, truncated: true });
      }
      const content = fs.readFileSync(resolved, "utf-8");
      return res.json({ content, size: stat.size, type: "text", ext, truncated: false });
    }

    return res.json({ binary: true, size: stat.size, type: "binary", ext });
  });

  // ─── DELETE /api/sandbox/files/:filePath* ─────────────────────────────────
  app.delete("/api/sandbox/files/*filePath", (req, res) => {
    const rawParam = (req.params as any).filePath;
    const relativePath = paramToPath(rawParam);
    const resolved = resolveSafe(relativePath);
    if (!resolved) return res.status(400).json({ error: "Invalid path" });
    if (!fs.existsSync(resolved)) return res.status(404).json({ error: "File not found" });

    let stat: fs.Stats;
    try {
      stat = fs.statSync(resolved);
    } catch (err: any) {
      return res.status(404).json({ error: "File not found" });
    }
    try {
      if (stat.isDirectory()) {
        fs.rmSync(resolved, { recursive: true, force: true });
      } else {
        fs.unlinkSync(resolved);
      }
    } catch (err: any) {
      return res.status(500).json({ error: `Delete failed: ${err.message}` });
    }

    res.json({ ok: true, deleted: relativePath });
  });
}
