import { randomBytes } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const data = path.join(root, "data");
const configFile = path.join(data, "private-install.json");
const mode = process.argv[2] || "setup";
const npmCli = process.env.npm_execpath || path.join(path.dirname(process.execPath), "node_modules/npm/bin/npm-cli.js");
function run(file, args, env = process.env, timeout = 600000) {
  execFileSync(file, args, { cwd: root, env, stdio: "inherit", windowsHide: true, timeout });
}
function npm(args) { run(process.execPath, [npmCli, ...args]); }
function protect(file, directory = false) {
  if (process.platform === "win32") {
    const user = execFileSync("whoami", [], { encoding: "utf8", windowsHide: true }).trim();
    execFileSync("icacls", [file, "/inheritance:r", "/grant:r", `${user}:${directory ? "(OI)(CI)" : ""}F`], { stdio: "ignore", windowsHide: true });
  } else fs.chmodSync(file, directory ? 0o700 : 0o600);
}
async function freePort(preferred) {
  const available = port => new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => { const chosen = server.address().port; server.close(() => resolve(chosen)); });
  });
  try { return await available(preferred); } catch { return available(0); }
}
function loadConfig() {
  if (!fs.existsSync(configFile)) throw new Error("Private installation is missing. Run npm run setup:private.");
  const config = JSON.parse(fs.readFileSync(configFile, "utf8"));
  if (config.version !== 1 || !/^[a-f0-9]{64}$/.test(config.apiKey) || !/^[a-f0-9]{64}$/.test(config.encryptionKey)) throw new Error("Invalid private installation configuration");
  if (!/^ultra-private-[a-f0-9]{10}$/.test(config.projectName)) throw new Error("Invalid private queue project");
  for (const port of [config.httpPort, config.grpcPort, config.redisPort]) if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid configured port");
  return config;
}
function envFor(config) {
  return { ...process.env, NODE_ENV: "production", HOST: "127.0.0.1", PORT: String(config.httpPort), GRPC_PORT: String(config.grpcPort),
    ULTRA_PRIVATE_REDIS_PORT: String(config.redisPort), REDIS_URL: `redis://127.0.0.1:${config.redisPort}`,
    DATABASE_PATH: path.join(data, "ultra_computer.db"), ULTRA_DURABLE_RUN_DIR: path.join(data, "durable-runs"),
    ULTRA_API_KEY: config.apiKey, ENCRYPTION_KEY: config.encryptionKey, ALLOW_HOST_SHELL: "false",
    ULTRA_LOCAL_EGRESS_ALLOWLIST: "127.0.0.1", ULTRA_ALLOW_INSECURE_HTTP: "true", ALLOWED_ORIGIN: `http://127.0.0.1:${config.httpPort}`,
    ULTRA_SANDBOX_IMAGE: "ultra-computer-sandbox:local", ULTRA_EXPERIMENTAL: "0", ULTRA_PRIVATE_INSTALL: "1" };
}
function startQueue(config) {
  run("docker", ["compose", "--project-name", config.projectName, "--file", "docker-compose.private.yml", "up", "--detach", "--wait", "redis"], envFor(config));
}
async function verify(config) {
  const fd = fs.openSync(path.join(data, "install-verification.log"), "a", 0o600);
  const child = spawn(process.execPath, ["dist/index.cjs"], { cwd: root, env: envFor(config), stdio: ["ignore", fd, fd], windowsHide: true });
  fs.closeSync(fd);
  try {
    let ready = false;
    for (let attempt = 0; attempt < 90; attempt++) {
      if (child.exitCode !== null) throw new Error(`Built application exited ${child.exitCode}; see data/install-verification.log`);
      try { const r = await fetch(`http://127.0.0.1:${config.httpPort}/api/health`, { signal: AbortSignal.timeout(1000) }); if (r.ok) { ready = true; break; } } catch {}
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    if (!ready) throw new Error("Built application did not become ready; see data/install-verification.log");
    const request = async (route, body) => {
      const r = await fetch(`http://127.0.0.1:${config.httpPort}${route}`, { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      if (!r.ok) throw new Error(`Installation acceptance ${route} returned HTTP ${r.status}`);
      return r.json();
    };
    const unauthorized = await fetch(`http://127.0.0.1:${config.httpPort}/api/conversations`);
    if (unauthorized.status !== 401) throw new Error("Owner authentication failed its installation check");
    await request("/api/models");
    const sandbox = await request("/api/sandbox/status");
    if (!sandbox.dockerAvailable || !sandbox.enabled) throw new Error("Docker sandbox unavailable");
    await request("/api/sandbox/pull-image", {});
    const languages = { python3: "print(2 + 2)", node: "console.log(2 + 2)", typescript: "const result: number = 2 + 2; console.log(result)", bash: "echo $((2 + 2))" };
    const interpreterResults = {};
    for (const [language, code] of Object.entries(languages)) {
      const interpreted = await request("/api/protocols/code/interpret", { code, language });
      if (interpreted.exitCode !== 0 || interpreted.stdout.trim() !== "4") throw new Error(`${language} interpreter failed its installation check (exit ${interpreted.exitCode}; ${String(interpreted.stderr || "unexpected stdout").trim().slice(0, 500)})`);
      interpreterResults[language] = { status: "Worked", output: interpreted.stdout.trim() };
    }
    fs.writeFileSync(path.join(data, "install-receipt.json"), JSON.stringify({ checkedAt: new Date().toISOString(), node: process.version, health: "Worked", auth: "Worked", models: "Worked", interpreters: interpreterResults }, null, 2), { mode: 0o600 });
    console.log("Worked: built app, database, owner authentication, Redis and isolated Python, Node, TypeScript and Bash execution.");
  } finally {
    child.kill("SIGTERM");
    await Promise.race([new Promise(resolve => child.once("exit", resolve)), new Promise(resolve => setTimeout(resolve, 12000))]);
    if (child.exitCode === null) child.kill("SIGKILL");
  }
}

try {
  if (![22, 24].includes(Number(process.versions.node.split(".")[0]))) throw new Error("Use Node.js 22 or 24 (24 recommended).");
  run("docker", ["info", "--format", "{{.ServerVersion}}"]);
  if (mode === "setup") {
    if (!fs.existsSync(npmCli)) throw new Error("npm CLI is missing; reinstall Node.js with npm.");
    npm(["ci"]);
    npm(["run", "audit"]);
    // A working cached browser needs no download. This also avoids waiting on
    // an unrelated Playwright installer's shared cache lock on Windows.
    try {
      execFileSync(process.execPath, ["--input-type=module", "-e", "import { chromium } from 'playwright'; const browser=await chromium.launch(); await browser.close();"], { cwd: root, stdio: "ignore", windowsHide: true, timeout: 30000 });
      console.log("Worked: existing Chromium runtime.");
    } catch {
      run(process.execPath, ["node_modules/playwright/cli.js", "install", "chromium"], process.env, 180000);
    }
    npm(["run", "build"]);
    run("docker", ["build", "--file", "Dockerfile.sandbox", "--tag", "ultra-computer-sandbox:local", "."]);
    fs.mkdirSync(data, { recursive: true, mode: 0o700 });
    protect(data, true);
    if (!fs.existsSync(configFile)) {
      const config = { version: 1, projectName: `ultra-private-${randomBytes(5).toString("hex")}`, apiKey: randomBytes(32).toString("hex"), encryptionKey: randomBytes(32).toString("hex"),
        httpPort: await freePort(5000), grpcPort: await freePort(50051), redisPort: await freePort(6386) };
      fs.writeFileSync(configFile, JSON.stringify(config, null, 2), { flag: "wx", mode: 0o600 });
      fs.writeFileSync(path.join(data, "owner-access.key"), config.apiKey, { flag: "wx", mode: 0o600 });
      protect(configFile); protect(path.join(data, "owner-access.key"));
    }
    const config = loadConfig();
    startQueue(config);
    await verify(config);
    console.log(`Installed. Start with npm run start:private, open http://127.0.0.1:${config.httpPort}, and unlock using data/owner-access.key. Keep data/private-install.json with your backups.`);
  } else if (mode === "verify") {
    const config = loadConfig(); startQueue(config); await verify(config);
  } else if (mode === "start") {
    const config = loadConfig(); startQueue(config);
    console.log(`Ultra Computer: http://127.0.0.1:${config.httpPort}`);
    const child = spawn(process.execPath, ["dist/index.cjs"], { cwd: root, env: envFor(config), stdio: "inherit", windowsHide: true });
    process.once("SIGINT", () => child.kill("SIGINT"));
    process.once("SIGTERM", () => child.kill("SIGTERM"));
    child.once("exit", code => { process.exitCode = code || 0; });
  } else throw new Error(`Unknown private installation operation: ${mode}`);
} catch (error) { console.error(error.message); process.exitCode = 1; }
