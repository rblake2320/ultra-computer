import { execFileSync, execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { fileURLToPath } from "node:url";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const data = path.join(root, "data");
export async function chooseInstallPorts(preferred) {
  const probes = [], ports = {};
  try {
    for (const [name, value] of Object.entries(preferred)) {
      const open = port => new Promise((resolve, reject) => { const server = net.createServer(); server.once("error", reject); server.listen(port, "127.0.0.1", () => resolve(server)); });
      let server;
      try { server = await open(value); } catch { server = await open(0); }
      probes.push(server); ports[name] = server.address().port;
    }
    return ports;
  } finally { await Promise.all(probes.map(server => new Promise(resolve => server.close(resolve)))); }
}
export async function ensureAppPortsFree(config) {
  for (const [name, port] of [["HTTP", config.httpPort], ["gRPC", config.grpcPort]]) {
    await new Promise((resolve, reject) => {
      const probe = net.createServer();
      probe.once("error", () => reject(new Error(`Configured ${name} port ${port} is already in use. Stop its owning application before starting this installation.`)));
      probe.listen(port, "127.0.0.1", () => probe.close(resolve));
    });
  }
}
export function loadConfig() {
  const filename = path.join(data, "private-install.json");
  if (!fs.existsSync(filename)) throw new Error("Run npm run setup:private first.");
  const config = JSON.parse(fs.readFileSync(filename, "utf8"));
  if (config.version !== 1 || !/^[a-f0-9]{64}$/.test(config.apiKey) || !/^[a-f0-9]{64}$/.test(config.encryptionKey)) throw new Error("Invalid private installation configuration");
  if (!/^ultra-private-[a-f0-9]{10}$/.test(config.projectName)) throw new Error("Invalid private queue project");
  for (const port of [config.httpPort, config.grpcPort, config.redisPort]) if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid configured port");
  if (new Set([config.httpPort, config.grpcPort, config.redisPort]).size !== 3) throw new Error("Private ports must be distinct");
  return config;
}
export function envFor(config) {
  return { ...process.env, NODE_ENV: "production", HOST: "127.0.0.1", PORT: String(config.httpPort), GRPC_PORT: String(config.grpcPort),
    ULTRA_PRIVATE_REDIS_PORT: String(config.redisPort), REDIS_URL: `redis://127.0.0.1:${config.redisPort}`,
    DATABASE_PATH: path.join(data, "ultra_computer.db"), ULTRA_DURABLE_RUN_DIR: path.join(data, "durable-runs"),
    ULTRA_API_KEY: config.apiKey, ENCRYPTION_KEY: config.encryptionKey, ALLOW_HOST_SHELL: "false",
    ULTRA_LOCAL_EGRESS_ALLOWLIST: "127.0.0.1", ULTRA_ALLOW_INSECURE_HTTP: "true", ALLOWED_ORIGIN: `http://127.0.0.1:${config.httpPort}`,
    ULTRA_SANDBOX_IMAGE: "ultra-computer-sandbox:local", ULTRA_EXPERIMENTAL: "0", ULTRA_PRIVATE_INSTALL: "1" };
}
export function startQueue(config, stdio = "inherit") {
  execFileSync("docker", ["compose", "--project-name", config.projectName, "--file", "docker-compose.private.yml", "up", "--detach", "--wait", "redis"],
    { cwd: root, env: envFor(config), stdio, windowsHide: true, timeout: 90000 });
}
export function startQueueAsync(config) {
  return new Promise((resolve, reject) => execFile("docker", ["compose", "--project-name", config.projectName, "--file", "docker-compose.private.yml", "up", "--detach", "--wait", "redis"],
    { cwd: root, env: envFor(config), windowsHide: true, timeout: 15000 }, error => error ? reject(new Error("Private queue startup failed")) : resolve()));
}
