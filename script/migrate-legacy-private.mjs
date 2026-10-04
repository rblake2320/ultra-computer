import fs from "node:fs";
import path from "node:path";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import Database from "better-sqlite3";
import { root, data, loadConfig } from "./private-runtime.mjs";

// Explicit, offline import. No models/providers/connectors are called.
const source = process.argv[2] && path.resolve(process.argv[2]);
const destination = path.join(data, "ultra_computer.db");
let lease, sourceDb;
try {
  if (!source || source === destination || !fs.existsSync(source) || fs.lstatSync(source).isSymbolicLink()) throw new Error("Supply an existing offline legacy SQLite database in a different location");
  const config = loadConfig();
  const flag = process.argv[3];
  const previous = flag === "--legacy-development-key" ? Buffer.from("ultra-computer-dev-key-not-secure".padEnd(32, "0").slice(0, 32))
    : flag === "--previous-key-file" && process.argv[4] ? Buffer.from(fs.readFileSync(process.argv[4], "utf8").trim(), "hex") : null;
  if (!previous || previous.length !== 32) throw new Error("Specify --previous-key-file <private file> or explicitly select --legacy-development-key");
  const next = Buffer.from(config.encryptionKey, "hex");
  function rekey(value) {
    if (!value) return value;
    let plain = value;
    if (value.startsWith("enc:")) {
      const bytes = Buffer.from(value.slice(4), "base64");
      const decipher = createDecipheriv("aes-256-gcm", previous, bytes.subarray(0, 12)); decipher.setAuthTag(bytes.subarray(12, 28));
      plain = decipher.update(bytes.subarray(28), undefined, "utf8") + decipher.final("utf8");
    }
    const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", next, iv);
    const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    return "enc:" + Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
  }
  lease = new Database(destination + ".ownership.db"); lease.pragma("busy_timeout = 100"); lease.exec("BEGIN EXCLUSIVE");
  const target = new Database(destination);
  try {
    if (target.prepare("SELECT COUNT(*) AS n FROM conversations").get().n || target.prepare("SELECT COUNT(*) AS n FROM models").get().n) throw new Error("Legacy import requires an empty target installation; existing owner state is never overwritten");
    target.pragma("wal_checkpoint(TRUNCATE)");
  } finally { target.close(); }
  const temporary = path.join(data, `legacy-import-${randomBytes(6).toString("hex")}.db`);
  sourceDb = new Database(source, { readonly: true }); await sourceDb.backup(temporary); sourceDb.close(); sourceDb = null;
  const imported = new Database(temporary); const counts = {}; let interruptedConversations = 0;
  try {
    imported.transaction(() => {
      for (const [table, columns] of [["models", ["api_key", "oauth_tokens"]], ["connectors", ["config"]]]) {
        const available = new Set(imported.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name));
        for (const column of columns.filter(c => available.has(c))) {
          const rows = imported.prepare(`SELECT id, ${column} AS value FROM ${table} WHERE ${column} IS NOT NULL AND ${column} <> ''`).all();
          const update = imported.prepare(`UPDATE ${table} SET ${column}=? WHERE id=?`);
          for (const row of rows) update.run(rekey(row.value), row.id);
        }
      }
      const modelColumns = new Set(imported.prepare("PRAGMA table_info(models)").all().map(c => c.name));
      if (modelColumns.has("connection_status")) imported.exec("UPDATE models SET connection_status='disconnected'");
      imported.exec("UPDATE models SET is_default=0,is_orchestrator=0");
      const unfinished = imported.prepare("SELECT id FROM conversations WHERE status NOT IN ('idle','error')").all();
      const now = Date.now();
      for (const conversation of unfinished) {
        imported.prepare("UPDATE conversations SET status='error',updated_at=? WHERE id=?").run(now, conversation.id);
        imported.prepare("INSERT INTO messages (id,conversation_id,role,content,metadata,created_at) VALUES (?,?,?,?,?,?)").run(`legacy-interruption-${randomBytes(12).toString("hex")}`, conversation.id, "assistant",
          "The previous installation stopped before this request finished. Inspect the retained history and archived artifacts before submitting a new request.", JSON.stringify({ reason: "legacy-installation-interruption" }), now);
      }
      interruptedConversations = unfinished.length;
    })();
    if (imported.pragma("integrity_check", { simple: true }) !== "ok") throw new Error("Imported SQLite integrity failed");
    for (const table of ["conversations", "messages", "tasks", "models", "connectors", "memory", "skills"]) counts[table] = imported.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
    imported.pragma("wal_checkpoint(TRUNCATE)");
  } finally { imported.close(); }
  const before = path.join(data, `before-legacy-import-${randomBytes(6).toString("hex")}.db`);
  fs.copyFileSync(destination, before, fs.constants.COPYFILE_EXCL);
  const backupFd = fs.openSync(before, "r+"); try { fs.fsyncSync(backupFd); } finally { fs.closeSync(backupFd); }
  // One atomic replacement keeps a canonical database present even if the
  // importer is killed. The original empty target also remains recoverable.
  fs.renameSync(temporary, destination);
  const receipt = { status: "Worked", checkedAt: new Date().toISOString(), retainedRows: counts, interruptedConversations, credentialsReencrypted: true, connectionsRequireRetest: true, previousDatabasePreserved: true };
  fs.writeFileSync(path.join(data, "legacy-import-receipt.json"), JSON.stringify(receipt, null, 2), { mode: 0o600 });
  console.log(JSON.stringify(receipt));
} catch (error) { console.error(`Legacy import failed safely (${error.code || "import-error"}): ${String(error.message || "Unknown failure").slice(0, 500)}. Existing source and destination databases are retained.`); process.exitCode = 1; }
finally { sourceDb?.close(); lease?.close(); }
