import fs from "node:fs";
import path from "node:path";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import Database from "better-sqlite3";
import { expect, it } from "vitest";

it("preserves legacy history and reencrypts credentials before disconnecting old models", () => {
  const directory = fs.mkdtempSync(path.resolve("data/legacy-import-unit-"));
  const state = path.join(directory, "data"), scripts = path.join(directory, "script");
  fs.mkdirSync(state); fs.mkdirSync(scripts);
  for (const name of ["private-runtime.mjs", "migrate-legacy-private.mjs"]) fs.copyFileSync(path.resolve("script", name), path.join(scripts, name));
  const oldKey = Buffer.from("ultra-computer-dev-key-not-secure".padEnd(32, "0").slice(0, 32)), nextKey = randomBytes(32);
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", oldKey, iv);
  const encrypted = Buffer.concat([cipher.update("synthetic-only-credential"), cipher.final()]);
  const oldCredential = "enc:" + Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
  fs.writeFileSync(path.join(state, "private-install.json"), JSON.stringify({ version: 1, projectName: "ultra-private-aaaaaaaaaa", apiKey: randomBytes(32).toString("hex"), encryptionKey: nextKey.toString("hex"), httpPort: 5000, grpcPort: 50051, redisPort: 6386 }));
  const source = path.join(directory, "legacy.db"), target = path.join(state, "ultra_computer.db");
  const schema = fs.readFileSync(path.resolve("tests/fixtures/v0.1.0-schema.sql"), "utf8");
  for (const file of [source, target]) { const db = new Database(file); db.exec(schema); db.close(); }
  const original = new Database(source);
  original.exec("ALTER TABLE models ADD COLUMN connection_status TEXT DEFAULT 'connected'");
  original.prepare("INSERT INTO settings (key,value,updated_at) VALUES (?,?,?)").run("sandbox_config", JSON.stringify({ enabled: false, image: "retired-image", networkEnabled: true }), Date.now());
  original.prepare("INSERT INTO models (id,name,provider,model_id,api_key,created_at,is_default,is_orchestrator) VALUES (?,?,?,?,?,?,?,?)").run("model", "Legacy", "openai", "unprobed", oldCredential, Date.now(), 1, 1);
  original.prepare("INSERT INTO conversations (id,title,status,created_at,updated_at) VALUES (?,?,?,?,?)").run("history", "Retain me", "planning", Date.now(), Date.now()); original.close();
  execFileSync(process.execPath, [path.join(scripts, "migrate-legacy-private.mjs"), source, "--legacy-development-key"], { stdio: "pipe", windowsHide: true, timeout: 15000 });
  const restored = new Database(target);
  try {
    expect(restored.prepare("SELECT title FROM conversations WHERE id='history'").get()).toEqual({ title: "Retain me" });
    expect(restored.prepare("SELECT status FROM conversations WHERE id='history'").get()).toEqual({ status: "error" });
    expect(restored.prepare("SELECT value FROM settings WHERE key='sandbox_config'").get()).toBeUndefined();
    expect(restored.prepare("SELECT count(*) AS n FROM messages WHERE conversation_id='history'").get()).toEqual({ n: 1 });
    const model = restored.prepare("SELECT api_key,connection_status,is_default,is_orchestrator FROM models WHERE id='model'").get() as any;
    expect(model.connection_status).toBe("disconnected"); expect(model.is_default).toBe(0); expect(model.is_orchestrator).toBe(0);
    expect(model.api_key).not.toBe(oldCredential);
    const bytes = Buffer.from(model.api_key.slice(4), "base64"), decrypt = createDecipheriv("aes-256-gcm", nextKey, bytes.subarray(0, 12)); decrypt.setAuthTag(bytes.subarray(12, 28));
    expect(Buffer.concat([decrypt.update(bytes.subarray(28)), decrypt.final()]).toString()).toBe("synthetic-only-credential");
  } finally { restored.close(); }
  const refused = spawnSync(process.execPath, [path.join(scripts, "migrate-legacy-private.mjs"), source, "--legacy-development-key"], { stdio: "pipe", windowsHide: true, timeout: 15000 });
  expect(refused.status).toBe(1);
});
