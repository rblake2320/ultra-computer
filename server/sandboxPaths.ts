import fs from "fs";
import path from "path";
import { resolveInside } from "./pathSafety.js";

/** One canonical host directory for files exposed to tools and sandboxes. */
export const SANDBOX_DIR = path.resolve(
  process.env.ULTRA_SANDBOX_DIR ?? path.join(process.cwd(), "sandbox"),
);

export function ensureSandboxDir(): string {
  fs.mkdirSync(SANDBOX_DIR, { recursive: true });
  return SANDBOX_DIR;
}

export function resolveSandboxPath(candidate: string): string | null {
  ensureSandboxDir();
  return resolveInside(SANDBOX_DIR, candidate);
}
