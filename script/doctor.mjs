import { execFileSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import Database from "better-sqlite3";

const results = [];
const add = (name, required, ok, detail) => results.push({ name, required, ok, detail });
const probeTcp = (host, port, timeout = 800) => new Promise((resolve) => {
  const socket = net.createConnection({ host, port });
  const finish = (ok) => { socket.destroy(); resolve(ok); };
  socket.setTimeout(timeout, () => finish(false));
  socket.once("connect", () => finish(true));
  socket.once("error", () => finish(false));
});

const nodeMajor = Number(process.versions.node.split(".")[0]);
add("Node.js 22-24", true, nodeMajor >= 22 && nodeMajor < 25, `v${process.versions.node}`);

const production = process.env.NODE_ENV === "production";
for (const key of ["ENCRYPTION_KEY", "ULTRA_API_KEY"]) {
  const set = Boolean(process.env[key]);
  add(key, production, set || !production, set ? "set" : production ? "required in production" : "unset (development only)");
}

const dbPath = process.env.DATABASE_PATH
  ?? (production ? path.join(process.cwd(), "data", "ultra_computer.db") : path.join(process.cwd(), "ultra_computer.db"));
add("DATABASE_PATH", true, Boolean(dbPath), dbPath);

if (fs.existsSync(dbPath)) {
  try {
    const db = new Database(dbPath, { readonly: true, fileMustExist: true });
    const integrity = db.pragma("integrity_check", { simple: true });
    add("SQLite integrity", true, integrity === "ok", String(integrity));
    const models = db.prepare("SELECT COUNT(*) AS count FROM models").get().count;
    const conversations = db.prepare("SELECT COUNT(*) AS count FROM conversations").get().count;
    const messages = db.prepare("SELECT COUNT(*) AS count FROM messages").get().count;
    add("Core tables", true, true, `${models} models, ${conversations} conversations, ${messages} messages`);
    const defaultModel = db.prepare("SELECT name FROM models WHERE enabled = 1 AND is_default = 1 LIMIT 1").get();
    const orchestrator = db.prepare("SELECT name FROM models WHERE enabled = 1 AND is_orchestrator = 1 LIMIT 1").get();
    add("Default model", false, Boolean(defaultModel), defaultModel?.name ?? "not assigned");
    add("Orchestrator model", false, Boolean(orchestrator), orchestrator?.name ?? "not assigned");
    const plaintext = db.prepare("SELECT COUNT(*) AS count FROM models WHERE api_key IS NOT NULL AND api_key != '' AND api_key NOT LIKE 'enc:%'").get().count;
    add("Credentials encrypted", true, plaintext === 0, plaintext === 0 ? "all stored keys encrypted" : `${plaintext} plaintext key(s)`);
    db.close();
  } catch (error) {
    add("SQLite", true, false, error instanceof Error ? error.message : String(error));
  }
} else {
  add("SQLite database", false, false, "not created yet");
}

const redisUrl = new URL(process.env.REDIS_URL || "redis://127.0.0.1:6379");
add("Redis", false, await probeTcp(redisUrl.hostname, Number(redisUrl.port || 6379)), redisUrl.host);
const temporal = process.env.TEMPORAL_ADDRESS || "127.0.0.1:7233";
const [temporalHost, temporalPort] = temporal.split(":");
add("Temporal", false, await probeTcp(temporalHost, Number(temporalPort || 7233)), temporal);
add("Ollama", false, await probeTcp("127.0.0.1", 11434), "127.0.0.1:11434");
try {
  execFileSync("docker", ["info"], { stdio: "ignore", timeout: 3000 });
  add("Docker", false, true, "daemon reachable");
} catch {
  add("Docker", false, false, "daemon unavailable");
}

try {
  const response = await fetch("http://127.0.0.1:5000/health", { signal: AbortSignal.timeout(1500) });
  add("App server", false, response.ok, `HTTP ${response.status}`);
} catch {
  add("App server", false, false, "not running on 127.0.0.1:5000");
}

console.log("\nultra doctor\n============");
for (const result of results) {
  const icon = result.ok ? "✓" : result.required ? "✗" : "⚠";
  console.log(`${icon} ${result.name}: ${result.detail}`);
}
const failures = results.filter((result) => result.required && !result.ok);
const warnings = results.filter((result) => !result.required && !result.ok);
console.log(`\nChecks: ${results.length} | Passed: ${results.filter((result) => result.ok).length} | Warnings: ${warnings.length} | Failures: ${failures.length}`);
process.exitCode = failures.length === 0 ? 0 : 1;
