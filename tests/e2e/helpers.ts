import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const E2E_PORT = 5199;
export const BASE = `http://127.0.0.1:${E2E_PORT}`;
export const API_KEY = "ultra-e2e-private-key";
export const OLLAMA = "http://127.0.0.1:11434";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const TSX = path.join(ROOT, "node_modules", "tsx", "dist", "cli.mjs");

export function tempDbPath(): string {
  return path.join(mkdtempSync(path.join(tmpdir(), "ultra-e2e-")), "e2e.db");
}

async function healthy(): Promise<boolean> {
  try {
    const response = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(1500) });
    return response.ok;
  } catch {
    return false;
  }
}

export async function startServer(databasePath: string, experimental = false): Promise<ChildProcess> {
  if (!existsSync(TSX)) throw new Error(`tsx not found at ${TSX}; run npm ci`);
  const child = spawn(process.execPath, [TSX, "server/index.ts"], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: "development",
      PORT: String(E2E_PORT),
      GRPC_PORT: "5299",
      DATABASE_PATH: databasePath,
      ENCRYPTION_KEY: "a".repeat(64),
      ULTRA_API_KEY: API_KEY,
      ULTRA_EXPERIMENTAL: experimental ? "1" : "0",
      ULTRA_LOCAL_EGRESS_ALLOWLIST: "127.0.0.1",
    },
    stdio: "pipe",
    windowsHide: true,
  });
  const logs: string[] = [];
  child.stdout?.on("data", (chunk) => logs.push(chunk.toString()));
  child.stderr?.on("data", (chunk) => logs.push(chunk.toString()));
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`server exited ${child.exitCode}:\n${logs.join("").slice(-3000)}`);
    if (await healthy()) return child;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`server did not become healthy:\n${logs.join("").slice(-3000)}`);
}

export async function stopServer(child?: ChildProcess): Promise<void> {
  if (!child || child.exitCode !== null) return;
  if (process.platform === "win32") {
    try { execFileSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" }); } catch {}
  } else {
    child.kill("SIGTERM");
  }
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (!(await healthy())) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("server still responding after shutdown");
}

export async function api<T = unknown>(pathname: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${BASE}${pathname}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) throw new Error(`${init.method ?? "GET"} ${pathname} -> ${response.status}: ${await response.text()}`);
  return response.json() as Promise<T>;
}

export async function ollamaModel(): Promise<string | null> {
  try {
    const response = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(2500) });
    const body = await response.json() as { models?: Array<{ name: string }> };
    const requested = process.env.E2E_OLLAMA_MODEL;
    if (requested) return body.models?.find((model) => model.name === requested)?.name ?? null;
    return body.models?.find((model) => model.name === "gemma3:latest")?.name ?? body.models?.[0]?.name ?? null;
  } catch {
    return null;
  }
}
