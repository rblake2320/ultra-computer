import { spawn, execFileSync } from "node:child_process";
import { randomBytes, createHash } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import Database from "better-sqlite3";
import { Queue } from "bullmq";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
fs.mkdirSync(path.join(root, "data"), { recursive: true });
const state = fs.mkdtempSync(path.join(root, "data/private-acceptance-"));
const modelId = process.env.E2E_OLLAMA_MODEL || "gemma3:270m";
const key = randomBytes(32).toString("hex"), encryption = randomBytes(32).toString("hex");
const container = `ultra-acceptance-${randomBytes(5).toString("hex")}`;
const results = [];
let child, queue;
const freePort = () => new Promise((resolve, reject) => {
  const server = net.createServer(); server.on("error", reject);
  server.listen(0, "127.0.0.1", () => { const port = server.address().port; server.close(() => resolve(port)); });
});
const [port, grpcPort, redisPort] = await Promise.all([freePort(), freePort(), freePort()]);
const base = `http://127.0.0.1:${port}`;
function record(name, success, detail) {
  results.push({ name, status: success ? "Worked" : "Failed", detail });
  console.log(JSON.stringify(results.at(-1)));
  if (!success) throw new Error(`${name} failed`);
}
async function start(db, label) {
  const fd = fs.openSync(path.join(state, `${label}.log`), "a", 0o600);
  child = spawn(process.execPath, ["dist/index.cjs"], { cwd: root, windowsHide: true, stdio: ["ignore", fd, fd], env: {
    ...process.env, NODE_ENV: "production", HOST: "127.0.0.1", PORT: String(port), GRPC_PORT: String(grpcPort),
    ULTRA_API_KEY: key, ENCRYPTION_KEY: encryption, DATABASE_PATH: db, REDIS_URL: `redis://127.0.0.1:${redisPort}`,
    ULTRA_DURABLE_RUN_DIR: path.join(state, "durable"), ULTRA_POLICY_AUDIT_FILE: path.join(state, "policy.jsonl"),
    ULTRA_LOCAL_EGRESS_ALLOWLIST: "127.0.0.1", ULTRA_ALLOW_INSECURE_HTTP: "true", ALLOW_HOST_SHELL: "false", ULTRA_EXPERIMENTAL: "0",
  } }); fs.closeSync(fd);
  for (let i = 0; i < 120; i++) {
    if (child.exitCode !== null) throw new Error(`Built app exited ${child.exitCode}: ${label}`);
    try { if ((await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(500) })).ok) { await delay(1000); return; } } catch {}
    await delay(250);
  }
  throw new Error(`Built app startup timed out: ${label}`);
}
async function stop() {
  if (child?.exitCode === null) { child.kill("SIGKILL"); await new Promise(resolve => child.once("exit", resolve)); }
}
async function api(route, body) {
  const response = await fetch(`${base}${route}`, { method: body === undefined ? "GET" : "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(90000) });
  if (!response.ok) throw new Error(`${route} HTTP ${response.status}`);
  return response.json();
}
async function completion(conversationId, expected, timeout = 120000) {
  const begun = Date.now();
  while (Date.now() - begun < timeout) {
    const messages = await api(`/api/conversations/${conversationId}/messages`);
    const conv = await api(`/api/conversations/${conversationId}`);
    const answers = messages.filter(m => m.role === "assistant");
    if (conv.status === "error") throw new Error("Conversation failed instead of completing its arithmetic request");
    if (conv.status === "idle" && answers.length) {
      if (answers.length !== 1 || !new RegExp(`\\b${expected}\\b`).test(answers[0].content) || /failed|reached max|LLM Error/.test(answers[0].content)) throw new Error("Invalid arithmetic completion");
      return { messages: messages.length, assistantMessages: answers.length, answer: answers[0].content, recoveryMs: Date.now() - begun };
    }
    await delay(250);
  }
  throw new Error("Arithmetic completion timed out");
}
try {
  execFileSync("docker", ["run", "--detach", "--name", container, "--publish", `127.0.0.1:${redisPort}:6379`, "redis:7-alpine@sha256:6ab0b6e7381779332f97b8ca76193e45b0756f38d4c0dcda72dbb3c32061ab99"], { stdio: "pipe", windowsHide: true });
  const beta = path.join(state, "beta.db"), dbPath = path.join(state, "fresh.db");
  const old = new Database(beta); old.exec(fs.readFileSync(path.join(root, "tests/fixtures/v0.1.0-schema.sql"), "utf8"));
  old.prepare("INSERT INTO models (id,name,provider,model_id,created_at) VALUES (?,?,?,?,?)").run("beta-sentinel", "Published beta record", "ollama", modelId, Date.now()); old.close();
  await start(beta, "beta-upgrade");
  const upgraded = await api("/api/models");
  record("published-beta-upgrade", upgraded.some(m => m.id === "beta-sentinel" && m.name === "Published beta record"), { sentinelRetained: true });
  await stop(); await start(dbPath, "fresh");
  record("owner-access", (await fetch(`${base}/api/conversations`)).status === 401, { unauthenticatedStatus: 401 });
  const model = await api("/api/models", { name: "Local acceptance model", provider: "ollama", modelId, authMethod: "none", baseUrl: "http://127.0.0.1:11434/v1", capabilities: ["chat"] });
  await api(`/api/models/${model.id}/test`, {});
  record("real-local-model-connection", (await api("/api/models")).find(m => m.id === model.id)?.connectionStatus === "connected", { modelId });
  const conv = await api("/api/conversations", { title: "Crash before execution" });
  const message = await api(`/api/conversations/${conv.id}/messages`, { content: "What is 2 + 2?" });
  const runFile = path.join(state, "durable/runs", createHash("sha256").update(`uc-msg-${message.id}`).digest("hex") + ".json");
  let run;
  for (let i = 0; i < 15000; i++) {
    if (fs.existsSync(runFile)) { run = JSON.parse(fs.readFileSync(runFile, "utf8")); if (run.status === "running") break; }
    await delay(2);
  }
  if (!run || run.status !== "running") throw new Error("Could not observe the real active run");
  await stop(); await start(dbPath, "crash-restarted");
  const answered = await completion(conv.id, 4);
  const recovered = JSON.parse(fs.readFileSync(runFile, "utf8"));
  queue = new Queue("ultra-tasks", { connection: { host: "127.0.0.1", port: redisPort } });
  const jobId = `message-${createHash("sha256").update(message.id).digest("hex")}`;
  const job = await queue.getJob(jobId);
  for (let i = 0; i < 20 && await job?.getState() !== "completed"; i++) await delay(100);
  record("real-active-run-crash-recovery", recovered.status === "completed" && recovered.attempts === 2 && await job?.getState() === "completed", { ...answered, durableStatus: recovered.status, attempts: recovered.attempts, interruptedStep: run.currentStep });
  const handoff = await api("/api/conversations", { title: "Persisted admission before Redis dispatch" });
  await stop();
  // Deterministic fixture for the exact persisted boundary between acceptance
  // and Redis dispatch. The restart, queue, provider and result are real.
  const db = new Database(dbPath);
  db.prepare("INSERT INTO messages (id,conversation_id,role,content,created_at) VALUES (?,?,?,?,?)").run("handoff-fixture", handoff.id, "user", "What is 3 + 3?", Date.now());
  db.prepare("INSERT INTO execution_outbox (message_id,conversation_id,user_message,estimated_duration,created_at) VALUES (?,?,?,?,?)").run("handoff-fixture", handoff.id, "What is 3 + 3?", "short", Date.now()); db.close();
  await start(dbPath, "handoff-restarted");
  const delivered = await completion(handoff.id, 6);
  const reader = new Database(dbPath, { readonly: true }); const admission = reader.prepare("SELECT state FROM execution_outbox WHERE message_id=?").get("handoff-fixture"); reader.close();
  record("persisted-admission-recovery", admission.state === "completed", { ...delivered, fixture: "persisted admission before dispatch", admissionState: admission.state });
  record("private-diagnostics-owner-auth", (await fetch(`${base}/api/diagnostics/traces`)).status === 401, { unauthenticatedStatus: 401 });
  const diagnostics = await api("/api/diagnostics/traces");
  const workflow = diagnostics.spans.filter(s => s.name === "workflow.execute" && s.outcome === "worked");
  const childModel = diagnostics.spans.find(s => s.name.startsWith("model.") && s.outcome === "worked" && workflow.some(w => w.traceId === s.traceId && w.spanId === s.parentSpanId));
  const metadataOnly = !JSON.stringify(diagnostics).includes(key) && !JSON.stringify(diagnostics).includes("What is");
  record("real-queue-model-trace", Boolean(childModel) && !diagnostics.exportFailed && metadataOnly, { workflowSpans: workflow.length, receivingModelSpan: childModel?.name, metadataOnly });
} catch (error) { results.push({ name: "private-runtime-acceptance", status: "Failed", detail: { error: error.message } }); console.error(error.message); process.exitCode = 1; }
finally {
  await stop(); await queue?.close();
  try { execFileSync("docker", ["rm", "--force", container], { stdio: "pipe", windowsHide: true }); } catch {}
  fs.writeFileSync(path.join(state, "receipt.json"), JSON.stringify(results, null, 2), { mode: 0o600 });
  console.log(`Acceptance receipt: ${path.join(state, "receipt.json")}`);
}
