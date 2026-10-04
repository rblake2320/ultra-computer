import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import Database from "better-sqlite3";
import { Queue } from "bullmq";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [mode, suppliedPath] = process.argv.slice(2);
const derivedData = new Set(["laya-venv", "laya-cache"]);
function digest(file) { return createHash("sha256").update(fs.readFileSync(file)).digest("hex"); }
function protect(directory) {
  if (process.platform === "win32") {
    const user = execFileSync("whoami", [], { encoding: "utf8", windowsHide: true }).trim();
    execFileSync("icacls", [directory, "/inheritance:r", "/grant:r", `${user}:(OI)(CI)F`], { stdio: "ignore", windowsHide: true });
  } else fs.chmodSync(directory, 0o700);
}
function files(directory, prefix = "") {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (path.basename(directory) === "data" && derivedData.has(entry.name)) return [];
    const relative = path.join(prefix, entry.name);
    const absolute = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Refusing symbolic link in state: ${relative}`);
    return entry.isDirectory() ? files(absolute, relative) : [relative];
  });
}
function inside(directory, relative) {
  const resolved = path.resolve(directory, relative);
  if (path.isAbsolute(relative) || path.relative(directory, resolved).startsWith("..")) throw new Error("Backup manifest path escapes its root");
  return resolved;
}
function checkoutContains(directory) {
  const relative = path.relative(root, directory);
  return !relative || (relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative));
}
function physicalDestination(directory) {
  let existing = directory;
  const missing = [];
  while (!fs.existsSync(existing)) {
    missing.unshift(path.basename(existing));
    const parent = path.dirname(existing);
    if (parent === existing) throw new Error("Backup destination has no accessible parent directory");
    existing = parent;
  }
  return path.resolve(fs.realpathSync(existing), ...missing);
}

try {
  if (!suppliedPath || !["backup", "restore"].includes(mode)) throw new Error("Usage: npm run state:backup -- <new-directory> OR npm run state:restore -- <backup-directory>. Restore requires an empty installation state.");
  const directory = path.resolve(suppliedPath);
  if (checkoutContains(directory) || checkoutContains(physicalDestination(directory))) throw new Error("Backup directory must be outside this checkout so private state cannot become source or public assets");
  if (mode === "backup") {
    if (fs.existsSync(directory)) throw new Error("Backup destination already exists; choose a new directory.");
    const config = JSON.parse(fs.readFileSync(path.join(root, "data/private-install.json"), "utf8"));
    const lock = new Database(path.join(root, "data/ultra_computer.db.ownership.db"));
    lock.pragma("busy_timeout = 100");
    let queue;
    try {
      lock.exec("BEGIN EXCLUSIVE");
      queue = new Queue("ultra-tasks", { connection: { host: "127.0.0.1", port: config.redisPort, connectTimeout: 3000, maxRetriesPerRequest: 1 } });
      const counts = await queue.getJobCounts("active", "waiting", "delayed", "prioritized", "waiting-children");
      if (Object.values(counts).some(count => count > 0)) throw new Error("Queue has unfinished work. Drain or explicitly cancel it before taking a full-state backup.");
      const live = new Database(path.join(root, "data/ultra_computer.db"), { readonly: true });
      try {
        if ((live.prepare("SELECT COUNT(*) AS count FROM execution_outbox WHERE state IN ('pending','queued')").get()).count) throw new Error("Message outbox has unfinished work. Start the app and drain it before backup.");
      } finally { live.close(); }
      fs.mkdirSync(directory, { mode: 0o700 }); protect(directory);
      for (const name of ["data", "ipc", "sandbox"]) {
        const source = path.join(root, name);
        if (fs.existsSync(source)) {
          files(source); // Reject links instead of silently producing an incomplete backup.
          fs.cpSync(source, path.join(directory, name), { recursive: true, dereference: false,
            filter: sourcePath => !sourcePath.includes(".ownership.db") &&
              !(name === "data" && derivedData.has(path.relative(source, sourcePath).split(path.sep)[0])) });
        }
      }
      const db = new Database(path.join(directory, "data/ultra_computer.db"));
      if (db.pragma("integrity_check", { simple: true }) !== "ok") throw new Error("Backup database integrity failed");
      db.pragma("wal_checkpoint(TRUNCATE)"); db.close();
      const manifest = { version: 1, createdAt: new Date().toISOString(), queueUnfinished: 0, excludedDerivedState: ["data/laya-venv", "data/laya-cache"],
        files: files(directory).map(relative => ({ path: relative, sha256: digest(path.join(directory, relative)) })) };
      fs.writeFileSync(path.join(directory, "manifest.json"), JSON.stringify(manifest, null, 2), { flag: "wx", mode: 0o600 });
      console.log(`Worked: full-state backup at ${directory} (${manifest.files.length} files; SQLite integrity ok; queue drained).`);
    } finally { await queue?.close(); lock.close(); }
  } else {
    for (const name of ["data", "ipc", "sandbox"]) if (fs.existsSync(path.join(root, name)) && fs.readdirSync(path.join(root, name)).length) throw new Error("Restore requires a new checkout with empty data, ipc and sandbox; existing state will never be overwritten.");
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, "manifest.json"), "utf8"));
    if (manifest.version !== 1 || manifest.queueUnfinished !== 0 || !Array.isArray(manifest.files) || !manifest.files.length) throw new Error("Invalid or unsupported backup manifest");
    for (const file of manifest.files) {
      if (!/^(data|ipc|sandbox)[/\\]/.test(file.path)) throw new Error("Unexpected state path in manifest");
      const source = inside(directory, file.path);
      let parent = path.dirname(source);
      while (parent !== directory) {
        if (fs.lstatSync(parent).isSymbolicLink()) throw new Error("Backup contains a linked directory");
        parent = path.dirname(parent);
      }
      if (!fs.lstatSync(source).isFile() || fs.lstatSync(source).isSymbolicLink() || digest(source) !== file.sha256) throw new Error(`Backup integrity failed: ${file.path}`);
    }
    // Only verified manifest files are copied. Queue history is diagnostic; no
    // unfinished queue work is replayed into a new installation.
    for (const file of manifest.files) {
      const destination = inside(root, file.path);
      fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
      fs.copyFileSync(inside(directory, file.path), destination, fs.constants.COPYFILE_EXCL);
    }
    protect(path.join(root, "data"));
    const configFile = path.join(root, "data/private-install.json");
    const config = JSON.parse(fs.readFileSync(configFile, "utf8"));
    config.projectName = `ultra-private-${randomBytes(5).toString("hex")}`;
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2), { mode: 0o600 });
    console.log("Worked: verified state restored into this new checkout. Run npm run setup:private to install dependencies, start a new drained queue and verify the restored app.");
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
