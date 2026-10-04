import fs from "node:fs";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import Database from "better-sqlite3";
import { root, data, loadConfig } from "./private-runtime.mjs";

// Intentionally runs the installed build and supervisor. Use a fresh private
// installation: synthetic volume fixtures must never be inserted into owner data.
const duration = Number(process.env.ULTRA_SOAK_SECONDS || 600);
if (!Number.isInteger(duration) || duration < 60 || duration > 7200) throw new Error("ULTRA_SOAK_SECONDS must be 60..7200; release evidence requires >=600.");
const config = loadConfig();
const smoke = duration < 600;
const base = `http://127.0.0.1:${config.httpPort}`;
const receipt = { startedAt: new Date().toISOString(), platform: process.platform, node: process.version,
  workload: { owners: 1, concurrentReadConnections: 5, activeQueueWorkers: 1, readRequestsPerSecond: 3, burstRequestsPerSecond: 5, burstSeconds: 10,
    seededConversations: 1000, seededMessages: 10000, model: process.env.E2E_OLLAMA_MODEL || "gemma3:latest", durationSeconds: duration,
    scenario: smoke ? "short managed-service regression; repeated 2+2" : "declared production workload; varied arithmetic with format suffix" },
  targets: { apiP95Ms: 250, apiP99Ms: 1000, unexpectedErrors: 0, jobP95Ms: 30000, jobP99Ms: 60000, appRecoveryMs: 60000,
    redisRecoveryMs: 30000, rssGrowthBytes: 100663296, maxRssBytes: 1073741824, controlledAvailabilityPercent: 99 }, results: [] };
const record = (name, ok, detail) => { const item = { name, status: ok ? "Worked" : "Failed", detail }; receipt.results.push(item); console.log(JSON.stringify(item)); if (!ok) throw new Error(`${name} failed`); };
function service(operation) { execFileSync(process.execPath, ["script/private-service.mjs", operation], { cwd: root, stdio: "pipe", windowsHide: true, timeout: 140000 }); }
const status = () => JSON.parse(fs.readFileSync(path.join(data, "private-service.json"), "utf8"));
const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(values.length * p) - 1)] || 0;
async function request(route, body, method) {
  const response = await fetch(base + route, { method: method || (body === undefined ? "GET" : "POST"),
    headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000) });
  return { status: response.status, value: await response.json() };
}
async function api(route, body, method) { const result = await request(route, body, method); if (result.status < 200 || result.status >= 300) throw new Error(`HTTP ${result.status}: ${route}`); return result.value; }
async function waitReady(deadline = 60000) { const begun = Date.now(); while (Date.now() - begun < deadline) { try { if ((await request("/api/health")).status === 200 && status().state === "ready") return Date.now() - begun; } catch {} await delay(250); } throw new Error("Managed service recovery deadline exceeded"); }
async function job(number, queued = false) {
  // Explicitly disable response caching through the supported owner policy API.
  // Unique arithmetic questions and trace counters verify real receiving calls.
  const conversation = await api("/api/conversations", { title: `Production acceptance ${number}` });
  const begun = Date.now();
  const a = smoke ? 2 : 1 + number % 7, b = smoke ? 2 : 1 + Math.floor(number / 7) % 5, expected = a + b;
  const message = await api(`/api/conversations/${conversation.id}/messages`, { content: `What is ${a} + ${b}?${smoke ? "" : " Reply with only the number."}` });
  while (Date.now() - begun < 120000) {
    const conv = await api(`/api/conversations/${conversation.id}`);
    if (conv.status === "error") throw new Error(`Real job ${number} failed`);
    const messages = await api(`/api/conversations/${conversation.id}/messages`);
    const answers = messages.filter(m => m.role === "assistant");
    if (conv.status === "idle" && answers.length) {
      const reader = new Database(path.join(data, "ultra_computer.db"), { readonly: true });
      let admission; try { admission = reader.prepare("SELECT state FROM execution_outbox WHERE message_id=?").get(message.id)?.state; } finally { reader.close(); }
      if (admission !== "completed") { await delay(250); continue; }
      if (answers.length !== 1 || !new RegExp(`\\b${expected}\\b`).test(answers[0].content) || /failed|LLM Error|reached max/.test(answers[0].content)) throw new Error(`Real arithmetic job ${number} returned an incorrect or duplicate answer`);
      return { number, expected, assistantMessages: answers.length, admission, elapsedMs: Date.now() - begun, queued };
    }
    await delay(500);
  }
  throw new Error(`Real arithmetic job ${number} deadline exceeded`);
}
let supervisor, monitor = false, started = false;
try {
  // Reject populated installs rather than accidentally testing against private state.
  const db = new Database(path.join(data, "ultra_computer.db"));
  try {
    if (db.prepare("SELECT COUNT(*) AS n FROM conversations").get().n || db.prepare("SELECT COUNT(*) AS n FROM models").get().n) throw new Error("Use a fresh installation with no owner conversations/models for this acceptance.");
    db.transaction(() => {
      const conv = db.prepare("INSERT INTO conversations (id,title,status,created_at,updated_at) VALUES (?,?,?,?,?)");
      const msg = db.prepare("INSERT INTO messages (id,conversation_id,role,content,created_at) VALUES (?,?,?,?,?)");
      for (let n = 0; n < 1000; n++) { const id = `volume-${n}`; conv.run(id, `Synthetic retained history ${n}`, "idle", Date.now(), Date.now()); for (let m = 0; m < 10; m++) msg.run(`volume-${n}-${m}`, id, m % 2 ? "assistant" : "user", "Synthetic volume fixture. ".repeat(20), Date.now()); }
    })();
  } finally { db.close(); }
  supervisor = spawn(process.execPath, ["script/private-service.mjs", "run"], { cwd: root, windowsHide: true, stdio: "ignore" });
  started = true;
  await waitReady();
  const receivingProcess = await api("/api/diagnostics/runtime");
  record("managed-start", receivingProcess.pid === status().appPid && receivingProcess.parentPid === supervisor.pid, { supervisorPid: supervisor.pid, appPid: receivingProcess.pid });
  const duplicate = spawn(process.execPath, ["script/private-service.mjs", "run"], { cwd: root, windowsHide: true, stdio: "ignore" });
  const duplicateExit = await new Promise(resolve => duplicate.once("exit", resolve));
  record("duplicate-supervisor-denied", duplicateExit === 1, { exitCode: duplicateExit });
  let duplicateVerifyExit = 0;
  try { execFileSync(process.execPath, ["script/private-install.mjs", "verify"], { cwd: root, stdio: "pipe", windowsHide: true, timeout: 30000 }); } catch (error) { duplicateVerifyExit = error.status; }
  record("occupied-port-verification-denied", duplicateVerifyExit === 1 && supervisor.exitCode === null, { exitCode: duplicateVerifyExit, managedAppPreserved: true });
  record("owner-auth", (await fetch(base + "/api/conversations")).status === 401, { unauthenticatedStatus: 401 });
  record("runtime-diagnostics-auth", (await fetch(base + "/api/diagnostics/runtime")).status === 401, { unauthenticatedStatus: 401 });
  const model = await api("/api/models", { name: "Production acceptance local model", provider: "ollama", modelId: receipt.workload.model, authMethod: "none", baseUrl: "http://127.0.0.1:11434/v1", capabilities: ["chat"] });
  await api(`/api/models/${model.id}/test`, {});
  await api("/api/cache/policy", { route: "chat/general", policy: { enabled: false } });
  await api("/api/cache/clear", {});
  // Warm up before measuring heap growth and service response latency.
  const jobs = [await job(0)];
  const metrics = await api("/api/diagnostics/runtime");
  receipt.memoryMetricShape = Object.keys(metrics);
  const latencies = [], memorySamples = [], failures = [], healthSamples = [];
  monitor = true;
  const begun = Date.now();
  const reads = (async () => {
    const routes = ["/api/models", "/api/conversations/volume-500/messages", "/api/queue/status", "/api/diagnostics/runtime", "/api/conversations/volume-999"];
    let n = 0, maxConcurrent = 0;
    while (monitor && Date.now() - begun < duration * 1000) {
      const batchAt = Date.now(); let concurrent = 0;
      await Promise.all(routes.map(async () => { const at = Date.now(); concurrent++; maxConcurrent = Math.max(maxConcurrent, concurrent); try {
        const route = routes[n++ % routes.length]; const reply = await request(route);
        latencies.push(Date.now() - at);
        if (reply.status !== 200) failures.push({ route, status: reply.status });
        if (route === "/api/diagnostics/runtime" && reply.status === 200) memorySamples.push(reply.value.memory);
      } catch (error) { failures.push({ error: error.message }); } finally { concurrent--; } }));
      await delay(Math.max(0, (Date.now() - begun < 10000 ? 1000 : 1667) - (Date.now() - batchAt)));
    }
    receipt.maxConcurrentReads = maxConcurrent;
  })();
  const health = (async () => { while (monitor && Date.now() - begun < duration * 1000) { try { healthSamples.push((await request("/api/health")).status === 200); } catch { healthSamples.push(false); } await delay(1000); } })();
  let number = 1;
  while (Date.now() - begun < duration * 1000) {
    jobs.push(await job(number++));
    if (number === 4) { const burst = await Promise.all([job(number++, true), job(number++, true), job(number++, true)]); jobs.push(...burst); }
    console.log(JSON.stringify({ progress: "real-inference-soak", completedJobs: jobs.length, elapsedSeconds: Math.floor((Date.now() - begun) / 1000) }));
    await delay(20000);
  }
  monitor = false; await Promise.all([reads, health]);
  receipt.api = { requests: latencies.length, p50Ms: percentile(latencies, .5), p95Ms: percentile(latencies, .95), p99Ms: percentile(latencies, .99), unexpectedErrors: failures.length, failures: failures.slice(0, 10) };
  receipt.jobs = { completed: jobs.length, p50Ms: percentile(jobs.map(j => j.elapsedMs), .5), p95Ms: percentile(jobs.map(j => j.elapsedMs), .95), p99Ms: percentile(jobs.map(j => j.elapsedMs), .99), receipts: jobs };
  receipt.availability = { samples: healthSamples.length, percent: healthSamples.filter(Boolean).length / healthSamples.length * 100, excludesPlannedFaultInjection: true };
  receipt.memory = { warmRssBytes: metrics.memory.rss, lastRssBytes: memorySamples.at(-1)?.rss,
    maxRssBytes: Math.max(...memorySamples.map(m => m.rss)), growthBytes: (memorySamples.at(-1)?.rss || 0) - metrics.memory.rss, samples: memorySamples.length };
  record("bounded-process-memory", receipt.memory.samples > 0 && receipt.memory.maxRssBytes < receipt.targets.maxRssBytes && receipt.memory.growthBytes < receipt.targets.rssGrowthBytes, receipt.memory);
  record("sustained-authenticated-reads", failures.length === 0 && receipt.api.p95Ms < 250 && receipt.api.p99Ms < 1000 && receipt.maxConcurrentReads === 5 && latencies.length >= duration * 3 * .95, { ...receipt.api, maxConcurrentReads: receipt.maxConcurrentReads });
  record("real-inference-and-three-job-burst", jobs.length >= Math.max(5, Math.floor(duration / 30)) && receipt.jobs.p95Ms < 30000 && receipt.jobs.p99Ms < 60000, { completed: jobs.length, p95Ms: receipt.jobs.p95Ms, p99Ms: receipt.jobs.p99Ms });
  record("controlled-availability", receipt.availability.percent >= 99, receipt.availability);
  // Redis interruption must reject new work without accepting a ghost message.
  const container = `${config.projectName}-redis-1`;
  const faultConversation = await api("/api/conversations", { title: "Redis outage denial" });
  execFileSync("docker", ["stop", container], { windowsHide: true, stdio: "pipe", timeout: 30000 });
  await delay(2000);
  const unhealthy = await request("/api/health");
  const denied = await request(`/api/conversations/${faultConversation.id}/messages`, { content: "What is 2 + 2?" });
  const noGhost = (await api(`/api/conversations/${faultConversation.id}/messages`)).length === 0;
  execFileSync("docker", ["start", container], { windowsHide: true, stdio: "pipe", timeout: 30000 });
  const redisRecoveryMs = await waitReady(30000);
  record("redis-outage-denial-and-recovery", unhealthy.status === 503 && denied.status === 503 && noGhost && redisRecoveryMs < 30000, { healthHTTP: unhealthy.status, admissionHTTP: denied.status, noGhost, recoveryMs: redisRecoveryMs });
  const postRedis = await job(number++); record("real-job-after-redis-recovery", true, postRedis);
  // Kill only the directly discovered child's process under our supervisor.
  const beforeKill = status(); const killBegun = Date.now();
  const identity = await api("/api/diagnostics/runtime");
  if (identity.pid !== beforeKill.appPid || identity.parentPid !== supervisor.pid) throw new Error("App PID ownership changed; crash injection refused");
  if (process.platform === "win32") execFileSync("taskkill", ["/PID", String(beforeKill.appPid), "/F"], { stdio: "pipe", windowsHide: true });
  else process.kill(beforeKill.appPid, "SIGKILL");
  const appRecoveryMs = await waitReady(60000);
  const recovered = status();
  record("managed-app-crash-recovery", recovered.appPid !== beforeKill.appPid && recovered.restarts > beforeKill.restarts && appRecoveryMs < 60000, { previousPid: beforeKill.appPid, receivingPid: recovered.appPid, recoveryMs: Date.now() - killBegun });
  record("real-job-after-app-recovery", true, await job(number++));
  // The IPC lifetime guard stops the app if its supervisor is killed, so a
  // stale heartbeat cannot leave an orphan that blocks the next startup.
  const beforeSupervisorKill = status();
  supervisor.kill("SIGKILL");
  await new Promise(resolve => supervisor.once("exit", resolve));
  let orphanGone = false;
  for (let i = 0; i < 80; i++) { try { await request("/api/health"); } catch { orphanGone = true; break; } await delay(250); }
  const supervisorRecoveryBegun = Date.now(); service("start");
  const afterSupervisorRestart = status();
  record("supervisor-crash-orphan-cleanup-and-relaunch", orphanGone && afterSupervisorRestart.instance !== beforeSupervisorKill.instance && afterSupervisorRestart.appPid !== beforeSupervisorKill.appPid && Date.now() - supervisorRecoveryBegun < 60000,
    { orphanGone, recoveryMs: Date.now() - supervisorRecoveryBegun, newInstance: afterSupervisorRestart.instance });
  record("real-job-after-supervisor-relaunch", true, await job(number++));
  const reader = new Database(path.join(data, "ultra_computer.db"), { readonly: true });
  try { record("sqlite-integrity-and-drained-outbox", reader.pragma("integrity_check", { simple: true }) === "ok" && reader.prepare("SELECT COUNT(*) AS n FROM execution_outbox WHERE state IN ('pending','queued')").get().n === 0, { integrity: "ok", unfinishedAdmissions: 0, databaseBytes: fs.statSync(path.join(data, "ultra_computer.db")).size }); } finally { reader.close(); }
  const diagnostics = await api("/api/diagnostics/traces");
  const receiving = diagnostics.spans.filter(s => s.name === "model.stream" && s.outcome === "worked");
  record("real-model-trace-receipts", receiving.length >= Math.min(jobs.length, 30) && !diagnostics.exportFailed, { workedModelStreamSpans: receiving.length });
  service("stop"); started = false;
  record("confirmed-maintenance-stop", status().state === "stopped", { state: status().state });
} catch (error) { receipt.error = error.message; process.exitCode = 1; console.error(error.message); }
finally {
  monitor = false;
  if (started) { try { service("stop"); } catch { supervisor?.kill("SIGTERM"); } }
  receipt.finishedAt = new Date().toISOString(); receipt.status = receipt.error ? "Failed" : "Worked";
  fs.writeFileSync(path.join(data, "private-production-receipt.json"), JSON.stringify(receipt, null, 2), { mode: 0o600 });
  console.log(`Production acceptance receipt: ${path.join(data, "private-production-receipt.json")}`);
}
