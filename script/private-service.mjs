import { spawn, execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import Database from "better-sqlite3";
import { root, data, loadConfig, envFor, startQueueAsync, ensureAppPortsFree } from "./private-runtime.mjs";

const mode = process.argv[2] || "status";
const stateFile = path.join(data, "private-service.json");
const stopFile = path.join(data, "private-service-stop.json");
const logFile = path.join(data, "private-service.log");
let logFailed = false;
const readState = () => { try { return JSON.parse(fs.readFileSync(stateFile, "utf8")); } catch { return null; } };
const fresh = state => state && Date.now() - Date.parse(state.updatedAt) < 10000 && state.state !== "stopped";
function writeState(state) {
  const tmp = stateFile + ".tmp";
  const fd = fs.openSync(tmp, "w", 0o600);
  try { fs.writeFileSync(fd, JSON.stringify({ ...state, updatedAt: new Date().toISOString() }, null, 2)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(tmp, stateFile);
}
function appendLog(chunk) {
  try {
  if (fs.existsSync(logFile) && fs.statSync(logFile).size + chunk.length > 262144) {
    fs.rmSync(logFile + ".3", { force: true });
    for (let i = 2; i >= 0; i--) { const source = logFile + (i ? `.${i}` : ""); if (fs.existsSync(source)) fs.renameSync(source, logFile + `.${i + 1}`); }
  }
  fs.appendFileSync(logFile, chunk, { mode: 0o600 });
  } catch { logFailed = true; }
}
async function healthy(config) {
  try { const response = await fetch(`http://127.0.0.1:${config.httpPort}/api/health`, { signal: AbortSignal.timeout(2000) }); const body = await response.json(); return response.ok && body.status === "ok"; } catch { return false; }
}
async function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise(resolve => child.once("exit", resolve));
  child.kill("SIGTERM");
  await Promise.race([exited, delay(12000)]);
  if (child.exitCode === null && child.signalCode === null) { child.kill("SIGKILL"); await exited; }
}
async function supervise(config) {
  const lease = new Database(path.join(data, "private-service.ownership.db"));
  lease.pragma("busy_timeout = 100");
  try { lease.exec("BEGIN EXCLUSIVE"); } catch { lease.close(); throw new Error("Private supervisor is already running."); }
  const status = { version: 1, instance: randomBytes(16).toString("hex"), supervisorPid: process.pid, appPid: null,
    state: "starting", startedAt: new Date().toISOString(), restarts: 0, lastExitCode: null };
  let stopping = false, child, failures = 0, unhealthySince = 0, healthySince = 0, restartAt = 0;
  const requestStop = () => { stopping = true; };
  process.once("SIGINT", requestStop); process.once("SIGTERM", requestStop);
  // Heartbeat continues while asynchronous Docker startup waits for readiness.
  writeState(status);
  const heartbeat = setInterval(() => {
    try { writeState(status); } catch { logFailed = true; }
    try { if (JSON.parse(fs.readFileSync(stopFile, "utf8")).instance === status.instance) stopping = true; } catch {}
  }, 1000);
  try {
    while (!stopping) {
      if (logFailed) throw new Error("Private service log is unavailable; stopping the managed app.");
      try { if (JSON.parse(fs.readFileSync(stopFile, "utf8")).instance === status.instance) { stopping = true; break; } } catch {}
      if (!child && Date.now() >= restartAt) {
        try {
          await ensureAppPortsFree(config); await startQueueAsync(config);
          if (!fs.existsSync(path.join(root, "dist/index.cjs"))) throw new Error("Built app is missing; run setup:private.");
          if (stopping) break;
          child = spawn(process.execPath, ["dist/index.cjs"], { cwd: root, env: { ...envFor(config), ULTRA_PRIVATE_SUPERVISED: "1" }, windowsHide: true, stdio: ["ignore", "pipe", "pipe", "ipc"] });
          status.appPid = child.pid; status.state = "starting"; unhealthySince = Date.now(); healthySince = 0;
          child.stdout.on("data", appendLog); child.stderr.on("data", appendLog);
          child.once("error", () => { appendLog(Buffer.from("Supervisor: application spawn failed\n")); });
          child.once("exit", code => { status.lastExitCode = code; });
        } catch {
          status.state = "dependency-unavailable";
          appendLog(Buffer.from("Supervisor: startup dependency unavailable; retrying\n"));
          restartAt = Date.now() + Math.min(30000, 1000 * 2 ** Math.min(++failures, 5));
        }
      }
      if (child) {
        const exited = child.exitCode !== null || child.signalCode !== null;
        const ready = !exited && await healthy(config);
        if (ready) {
          status.state = "ready"; unhealthySince = 0; healthySince ||= Date.now();
          if (Date.now() - healthySince >= 60000) failures = 0;
        } else { status.state = "recovering"; unhealthySince ||= Date.now(); healthySince = 0; }
        if (exited || (unhealthySince && Date.now() - unhealthySince >= 30000)) {
          await stopChild(child); child = undefined; status.appPid = null; status.restarts++;
          restartAt = Date.now() + Math.min(30000, 1000 * 2 ** Math.min(failures++, 5));
          appendLog(Buffer.from("Supervisor: application restart scheduled\n"));
        }
      }
      writeState(status); await delay(1000);
    }
  } finally {
    clearInterval(heartbeat);
    await stopChild(child); status.appPid = null; status.state = "stopped"; writeState(status);
    lease.close();
  }
}
async function main() {
  const config = loadConfig();
  if (mode === "run") await supervise(config);
  else if (mode === "start") {
    let lastLaunch = 0;
    for (let i = 0; i < 120; i++) {
      const status = readState();
      if (fresh(status) && status.state === "ready" && await healthy(config)) { console.log(`Worked: private service ready at http://127.0.0.1:${config.httpPort}`); return; }
      if (!fresh(status) && Date.now() - lastLaunch >= 15000) {
        // No PID from disk is killed; the exclusive lease arbitrates starts.
        const child = spawn(process.execPath, [path.join(root, "script/private-service.mjs"), "run"], { cwd: root, detached: true, windowsHide: true, stdio: "ignore" });
        child.unref(); lastLaunch = Date.now();
      }
      await delay(1000);
    }
    throw new Error("Service did not become ready; inspect data/private-service.log and run service:status.");
  } else if (mode === "stop") {
    const prior = readState();
    if (!fresh(prior)) throw new Error("No current supervisor heartbeat; no process was killed.");
    const reader = new Database(path.join(data, "ultra_computer.db"), { readonly: true });
    try {
      if (reader.prepare("SELECT COUNT(*) AS n FROM execution_outbox WHERE state IN ('pending','queued')").get().n > 0) throw new Error("Work is unfinished. Drain or cancel it before maintenance stop.");
    } finally { reader.close(); }
    fs.writeFileSync(stopFile, JSON.stringify({ instance: prior.instance }), { mode: 0o600 });
    for (let i = 0; i < 80; i++) { const status = readState(); if (status?.instance === prior.instance && status.state === "stopped") { console.log("Worked: private service stopped."); return; } await delay(500); }
    throw new Error("Stop was requested but not confirmed; inspect service:status before backup.");
  } else if (mode === "status") {
    const state = readState(); const ready = fresh(state) && state.state === "ready" && await healthy(config);
    console.log(JSON.stringify({ ...state, currentHeartbeat: Boolean(fresh(state)), ready, url: `http://127.0.0.1:${config.httpPort}` }, null, 2));
    if (!ready) process.exitCode = 1;
  } else if (["install", "uninstall"].includes(mode)) {
    if (process.platform !== "win32") throw new Error("Login autostart is Windows-only; use service:run under your OS supervisor on other platforms.");
    const registry = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";
    const name = `UltraComputer-${config.projectName}`;
    if (mode === "install") {
      const launcher = path.join(root, "script/start-private-service.ps1");
      if (launcher.includes('"')) throw new Error("Unsupported quote in installation path");
      const command = `powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "${launcher}"`;
      execFileSync("reg.exe", ["add", registry, "/v", name, "/t", "REG_SZ", "/d", command, "/f"], { stdio: "ignore", windowsHide: true });
      console.log("Worked: private service autostart registered for this user's Windows login.");
    } else { execFileSync("reg.exe", ["delete", registry, "/v", name, "/f"], { stdio: "ignore", windowsHide: true }); console.log("Worked: this installation's login autostart removed."); }
  } else throw new Error(`Unknown service operation: ${mode}`);
}
try { await main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
