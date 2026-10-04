import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { migrateSchema, assertSchemaReady } from "../../server/schemaMigrations.js";

describe("published database upgrades", () => {
  it("preserves old models and upgrades once even when the legacy marker exists", () => {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE models (id TEXT PRIMARY KEY, name TEXT); INSERT INTO models VALUES ('old', 'My model'); CREATE TABLE schema_migrations (id TEXT PRIMARY KEY, applied_at INTEGER); INSERT INTO schema_migrations VALUES ('20260716_model_catalog_v1', 1)");
    expect(() => assertSchemaReady(db)).toThrow();
    migrateSchema(db);
    migrateSchema(db);
    assertSchemaReady(db);
    expect(db.prepare("SELECT id, name, connection_status FROM models").get()).toEqual({ id: "old", name: "My model", connection_status: "unconfigured" });
    expect(db.prepare("SELECT COUNT(*) AS count FROM schema_migrations").get()).toEqual({ count: 2 });
    db.close();
  });
});
