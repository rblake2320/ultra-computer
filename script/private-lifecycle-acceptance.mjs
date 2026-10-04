import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { root, data, loadConfig } from "./private-runtime.mjs";

// Receiving regression for the actual CLI, detached launch, IPC parent loss,
// stale heartbeat and stop confirmation. No models or global daemons are killed.
const config = loadConfig(), base = `http://127.0.0.1:${config.httpPort}`;
const results = [];
const service = operation => execFileSync(process.execPath, ["script/private-service.mjs", operation], { cwd: root, stdio: "pipe", windowsHide: true, timeout: 140000 });
const state = () => JSON.parse(fs.readFileSync(path.join(data, "private-service.json"), "utf8"));
const record = (name, ok, detail) => { const result = { name, status: ok ? "Worked" : "Failed", detail }; results.push(result); console.log(JSON.stringify(result)); if (!ok) throw new Error(`${name} failed`); };
try {
  const starts = [];
  for (let n = 0; n < 8; n++) { const at = Date.now(); service("start"); starts.push(Date.now() - at); }
  record("eight-windows-safe-start-commands", true, { successfulStarts: starts.length, nativeAssertions: 0, elapsedMs: starts });
  const before = state();
  const response = await fetch(base + "/api/diagnostics/runtime", { headers: { Authorization: `Bearer ${config.apiKey}` } });
  const identity = await response.json();
  if (identity.pid !== before.appPid || identity.parentPid !== before.supervisorPid) throw new Error("Supervisor process ownership changed; kill check refused");
  if (process.platform === "win32") execFileSync("taskkill", ["/PID", String(before.supervisorPid), "/F"], { stdio: "pipe", windowsHide: true });
  else process.kill(before.supervisorPid, "SIGKILL");
  let orphanGone = false;
  for (let n = 0; n < 80; n++) { try { const r = await fetch(base + "/api/health", { signal: AbortSignal.timeout(1000) }); await r.arrayBuffer(); } catch { orphanGone = true; break; } await delay(250); }
  const at = Date.now(); service("start"); const receiving = state();
  record("real-supervisor-kill-and-relaunch", orphanGone && receiving.instance !== before.instance && receiving.appPid !== before.appPid && Date.now() - at < 60000,
    { orphanGone, distinctInstance: receiving.instance !== before.instance, receivingPid: receiving.appPid, recoveryMs: Date.now() - at });
  service("stop");
  record("confirmed-stop-after-detached-relaunch", state().state === "stopped", { state: state().state });
} catch (error) { results.push({ name: "private-lifecycle", status: "Failed", detail: { error: String(error.message).replaceAll(config.apiKey, "[redacted]") } }); console.error(results.at(-1).detail.error); process.exitCode = 1; }
finally { try { if (state().state !== "stopped") service("stop"); } catch {} fs.writeFileSync(path.join(data, "private-lifecycle-receipt.json"), JSON.stringify(results, null, 2), { mode: 0o600 }); }
