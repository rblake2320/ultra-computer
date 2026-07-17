import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function setup(): void {
  // SQLite remains open until the Vitest worker exits on Windows. Remove stale
  // directories from prior, now-dead workers at the next run instead of
  // producing a false teardown error while the current database is locked.
  for (const entry of fs.readdirSync(os.tmpdir(), { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith("ultra-unit-")) continue;
    try {
      fs.rmSync(path.join(os.tmpdir(), entry.name), { recursive: true, force: true });
    } catch {
      // A live concurrent worker owns this directory; it is not ours to remove.
    }
  }
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ultra-unit-"));
  process.env.DATABASE_PATH = path.join(directory, "unit.db");
  process.env.ENCRYPTION_KEY = "0".repeat(64);
}
