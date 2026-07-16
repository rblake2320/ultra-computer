import type { Express, Request } from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import { pipeline, Transform } from "stream";
import { randomUUID } from "crypto";
import { resolveInside } from "./pathSafety.js";
import { evaluatePolicy, writePolicyAudit } from "./policyEngine.js";

const SANDBOX_DIR = path.join(process.cwd(), "sandbox");
const MAX_FILE_SIZE = 100 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;
const MAX_UPLOAD_FILES = 8;
const MAX_UPLOAD_FIELDS = 4;
const MAX_UPLOAD_PARTS = MAX_UPLOAD_FILES + MAX_UPLOAD_FIELDS;
const MAX_DIRECTORY_ENTRIES = 10_000;

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
  return resolveInside(SANDBOX_DIR, relativePath);
}

function isFilesystemAllowed(action: "filesystem:read" | "filesystem:write" | "filesystem:list", filePath: string, metadata?: Record<string, unknown>): { ok: boolean; reason?: string } {
  const context = { domain: "filesystem" as const, action, tool: "sandbox.files", path: filePath, metadata };
  const decision = evaluatePolicy(context);
  writePolicyAudit(context, decision);
  return decision.allowed ? { ok: true } : { ok: false, reason: decision.reason };
}

interface FileEntry {
  path: string;
  name: string;
  type: "file" | "dir";
  size: number;
  modified: string;
  ext: string;
}

interface StagedUpload extends Express.Multer.File {
  finalPath: string;
}

interface WalkState {
  entries: FileEntry[];
  truncated: boolean;
}

function walkDir(
  dir: string,
  baseDir: string,
  state: WalkState,
  depth = 0,
  maxDepth = 10,
): void {
  if (depth > maxDepth || state.truncated) return;
  let items: fs.Dirent[];
  try {
    items = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const item of items) {
    if (state.entries.length >= MAX_DIRECTORY_ENTRIES) {
      state.truncated = true;
      return;
    }
    const fullPath = path.join(dir, item.name);
    const relativePath = path.relative(baseDir, fullPath);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(fullPath);
    } catch {
      continue;
    }

    if (item.isDirectory()) {
      state.entries.push({
        path: relativePath,
        name: item.name,
        type: "dir",
        size: 0,
        modified: stat.mtime.toISOString(),
        ext: "",
      });
      walkDir(fullPath, baseDir, state, depth + 1, maxDepth);
    } else if (item.isFile()) {
      state.entries.push({
        path: relativePath,
        name: item.name,
        type: "file",
        size: stat.size,
        modified: stat.mtime.toISOString(),
        ext: path.extname(item.name).toLowerCase().slice(1),
      });
    }
  }
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

export interface FileRouteOptions {
  maxUploadBytes?: number;
}

export function registerFileRoutes(app: Express, options: FileRouteOptions = {}) {
  ensureSandboxDir();
  const maxUploadBytes = options.maxUploadBytes ?? MAX_UPLOAD_BYTES;
  if (!Number.isSafeInteger(maxUploadBytes) || maxUploadBytes <= 0) {
    throw new Error("maxUploadBytes must be a positive safe integer");
  }

  const uploadBytes = new WeakMap<Request, number>();
  const storage: multer.StorageEngine = {
    _handleFile: (req, file, cb) => {
      ensureSandboxDir();
      const dest = (req.body?.destination as string) || "";
      let targetDir = SANDBOX_DIR;
      if (dest) {
        const resolved = resolveSafe(dest);
        if (!resolved) return cb(new Error("Invalid destination path"));
        targetDir = resolved;
      }
      const allowed = isFilesystemAllowed("filesystem:write", targetDir, { destination: dest || "." });
      if (!allowed.ok) return cb(new Error(`Policy denied: ${allowed.reason}`));
      fs.mkdirSync(targetDir, { recursive: true });
      const safe = path.basename(file.originalname).replace(/[^a-zA-Z0-9._\-]/g, '_');
      const finalPath = path.join(targetDir, safe);
      const stagedPath = path.join(targetDir, `.ultra-upload-${randomUUID()}.part`);
      const output = fs.createWriteStream(stagedPath, { flags: "wx" });
      file.path = stagedPath;
      (file as StagedUpload).finalPath = finalPath;

      const aggregateLimit = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          const nextTotal = (uploadBytes.get(req) ?? 0) + chunk.length;
          uploadBytes.set(req, nextTotal);
          if (nextTotal > maxUploadBytes) {
            callback(new Error(`Upload exceeds ${maxUploadBytes} byte aggregate limit`));
            return;
          }
          callback(null, chunk);
        },
      });

      pipeline(file.stream, aggregateLimit, output, (error) => {
        if (error) {
          fs.rm(stagedPath, { force: true }, () => cb(error));
          return;
        }
        cb(null, {
          destination: targetDir,
          filename: safe,
          path: stagedPath,
          size: output.bytesWritten,
          finalPath,
        } as Partial<StagedUpload>);
      });
    },
    _removeFile: (_req, file, cb) => {
      const filePath = file.path;
      if (!filePath) {
        cb(null);
        return;
      }
      fs.rm(filePath, { force: true }, cb);
    },
  };

  // Block executable and server-side script extensions that should never be uploaded
  const BLOCKED_EXTENSIONS = new Set([
    ".exe", ".dll", ".so", ".dylib",
    ".sh", ".bash", ".zsh", ".fish",
    ".bat", ".cmd", ".ps1", ".psm1",
    ".php", ".php3", ".php4", ".php5", ".phtml",
    ".jsp", ".jspx", ".asp", ".aspx",
    ".cgi", ".pl", ".py", ".rb",          // scripts with exec permission risk
    ".jar", ".war", ".ear",
    ".msi", ".deb", ".rpm",
  ]);

  const upload = multer({
    storage,
    limits: {
      fieldNameSize: 100,
      fieldSize: 4 * 1024,
      fields: MAX_UPLOAD_FIELDS,
      fileSize: MAX_FILE_SIZE,
      files: MAX_UPLOAD_FILES,
      parts: MAX_UPLOAD_PARTS,
      headerPairs: 32,
      // Multer 2.2 blocks deeply nested field names before append-field parses
      // them. The current DefinitelyTyped declaration has not added this yet.
      fieldNestingDepth: 2,
    } as NonNullable<multer.Options["limits"]> & { fieldNestingDepth: number },
    fileFilter: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      if (BLOCKED_EXTENSIONS.has(ext)) {
        return cb(new Error(`File type '${ext}' is not allowed for upload`));
      }
      cb(null, true);
    },
  });

  // ─── GET /api/sandbox/files ────────────────────────────────────────────────
  app.get("/api/sandbox/files", (_req, res) => {
    ensureSandboxDir();
    const allowed = isFilesystemAllowed("filesystem:list", SANDBOX_DIR);
    if (!allowed.ok) return res.status(403).json({ error: `Policy denied: ${allowed.reason}` });
    const state: WalkState = { entries: [], truncated: false };
    walkDir(SANDBOX_DIR, SANDBOX_DIR, state);
    res.json({ files: state.entries, sandboxDir: SANDBOX_DIR, truncated: state.truncated });
  });

  // ─── POST /api/sandbox/files/upload ───────────────────────────────────────
  // Must be registered BEFORE wildcard routes to avoid collision
  app.post("/api/sandbox/files/upload", (req, res, next) => {
    upload.array("files")(req, res, (err) => {
      if (err) {
        const message = err.message || "Upload rejected";
        const tooLarge = err.code === "LIMIT_FILE_SIZE"
          || message.includes("aggregate limit");
        return res.status(tooLarge ? 413 : 400).json({
          error: message,
          ...(err.code ? { code: err.code } : {}),
        });
      }
      next();
    });
  }, (req, res) => {
    const files = ((req.files as StagedUpload[]) || []);
    const finalPaths = files.map((file) => file.finalPath);
    const duplicateTarget = finalPaths.find((filePath, index) => finalPaths.indexOf(filePath) !== index);
    const existingTarget = finalPaths.find((filePath) => fs.existsSync(filePath));
    if (duplicateTarget || existingTarget) {
      for (const file of files) fs.rmSync(file.path, { force: true });
      return res.status(409).json({
        error: duplicateTarget
          ? `Duplicate upload target '${path.basename(duplicateTarget)}'`
          : `File '${path.basename(existingTarget!)}' already exists`,
      });
    }

    const promoted: string[] = [];
    try {
      for (const file of files) {
        // Hard-link promotion is atomic and fails if a concurrent request
        // created the target after the preflight existence check.
        fs.linkSync(file.path, file.finalPath);
        fs.unlinkSync(file.path);
        promoted.push(file.finalPath);
      }
    } catch (error) {
      for (const filePath of promoted) fs.rmSync(filePath, { force: true });
      for (const file of files) fs.rmSync(file.path, { force: true });
      const message = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ error: `Upload commit failed: ${message}` });
    }

    const uploaded = promoted.map((filePath) => path.relative(SANDBOX_DIR, filePath));
    res.json({ ok: true, uploaded });
  });

  // ─── GET /api/sandbox/files/:filePath*/download ───────────────────────────
  // Express 5: wildcard param is an array; filePath captures segments before /download
  app.get("/api/sandbox/files/*filePath/download", (req, res) => {
    const rawParam = (req.params as any).filePath;
    const relativePath = paramToPath(rawParam);
    const resolved = resolveSafe(relativePath);
    if (!resolved) return res.status(400).json({ error: "Invalid path" });
    const allowed = isFilesystemAllowed("filesystem:read", resolved, { relativePath, download: true });
    if (!allowed.ok) return res.status(403).json({ error: `Policy denied: ${allowed.reason}` });
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
    const allowed = isFilesystemAllowed("filesystem:read", resolved, { relativePath });
    if (!allowed.ok) return res.status(403).json({ error: `Policy denied: ${allowed.reason}` });
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
    const allowed = isFilesystemAllowed("filesystem:write", resolved, { relativePath, delete: true });
    if (!allowed.ok) return res.status(403).json({ error: `Policy denied: ${allowed.reason}` });
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
