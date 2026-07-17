import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function setup(): () => void {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ultra-unit-"));
  process.env.DATABASE_PATH = path.join(directory, "unit.db");
  process.env.ENCRYPTION_KEY = "0".repeat(64);
  return () => fs.rmSync(directory, { recursive: true, force: true });
}
