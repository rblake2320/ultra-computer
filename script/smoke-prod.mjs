import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

const port = process.env.SMOKE_PORT ?? process.env.PORT ?? "5099";
const grpcPort = process.env.SMOKE_GRPC_PORT ?? process.env.GRPC_PORT ?? "5100";
const apiKey = process.env.ULTRA_API_KEY ?? `smoke-${randomBytes(24).toString("hex")}`;
const env = {
  ...process.env,
  NODE_ENV: "production",
  PORT: port,
  GRPC_PORT: grpcPort,
  ULTRA_API_KEY: apiKey,
  SLACK_SIGNING_SECRET: process.env.SLACK_SIGNING_SECRET ?? "test-slack-secret",
  GITHUB_WEBHOOK_SECRET: process.env.GITHUB_WEBHOOK_SECRET ?? "test-github-secret",
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY ?? randomBytes(32).toString("hex"),
};

const child = spawn(process.execPath, ["dist/index.cjs"], {
  env,
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});

const output = [];
child.stdout.on("data", (chunk) => output.push(chunk.toString()));
child.stderr.on("data", (chunk) => output.push(chunk.toString()));

let stopped = false;
const stop = async () => {
  if (stopped) return;
  stopped = true;
  child.kill("SIGTERM");
  await delay(500);
  if (child.exitCode === null) child.kill("SIGKILL");
};

try {
  const deadline = Date.now() + 15_000;
  let lastError = "";

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`production server exited early with ${child.exitCode}`);
    }

    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) {
        const body = await response.json();
        console.log(`production smoke passed on port ${port}: ${body.status ?? response.status}`);
        await stop();
        process.exit(0);
      }
      lastError = `health returned ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await delay(500);
  }

  throw new Error(`production health check timed out: ${lastError}`);
} catch (error) {
  await stop();
  console.error(error instanceof Error ? error.message : error);
  const tail = output.join("").split(/\r?\n/).slice(-40).join("\n");
  if (tail.trim()) console.error(tail);
  process.exit(1);
}
