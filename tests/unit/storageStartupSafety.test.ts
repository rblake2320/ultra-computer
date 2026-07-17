import { afterEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const created: string[] = [];

afterEach(() => {
  for (const directory of created.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("storage startup safety", () => {
  it("preserves a legacy swarms table and its data", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "ultra-storage-upgrade-"));
    created.push(directory);
    const databasePath = path.join(directory, "legacy.db");
    const legacy = new Database(databasePath);
    legacy.exec("CREATE TABLE swarms (id TEXT PRIMARY KEY, name TEXT NOT NULL)");
    legacy.prepare("INSERT INTO swarms (id, name) VALUES (?, ?)").run("legacy-1", "Preserve me");
    legacy.close();

    const tsx = path.resolve("node_modules/tsx/dist/cli.mjs");
    execFileSync(process.execPath, [
      tsx,
      "-e",
      "import('./server/storage.ts').then(() => process.exit(0), (error) => { console.error(error); process.exit(1); })",
    ], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: "test",
        DATABASE_PATH: databasePath,
        ENCRYPTION_KEY: "ab".repeat(32),
      },
      stdio: "pipe",
    });

    const reopened = new Database(databasePath, { readonly: true });
    try {
      expect(reopened.prepare("SELECT name FROM swarms WHERE id = ?").get("legacy-1"))
        .toEqual({ name: "Preserve me" });
    } finally {
      reopened.close();
    }
  }, 15_000); // Windows coverage instrumentation can make the isolated TSX startup exceed Vitest's 5s default.
});
