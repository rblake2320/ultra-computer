import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";

it("refuses private startup before creating canonical state when backup holds its lease", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ultra-private-lease-"));
  const database = path.join(directory, "state.db");
  const lease = new Database(database + ".ownership.db");
  lease.exec("BEGIN EXCLUSIVE");
  try {
    const child = spawnSync(process.execPath, ["--import", "tsx", "server/index.ts"], {
      cwd: process.cwd(), timeout: 15000, stdio: "ignore", windowsHide: true,
      env: { ...process.env, NODE_ENV: "production", ULTRA_PRIVATE_INSTALL: "1", DATABASE_PATH: database,
        ULTRA_API_KEY: randomBytes(32).toString("hex"), ENCRYPTION_KEY: randomBytes(32).toString("hex"), HF_HUB_OFFLINE: "1" },
    });
    expect(child.status).toBe(1);
    expect(fs.existsSync(database)).toBe(false);
  } finally {
    lease.close();
    for (const file of fs.readdirSync(directory)) fs.unlinkSync(path.join(directory, file));
    fs.rmdirSync(directory);
  }
}, 20000);
