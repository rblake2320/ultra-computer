import type Database from "better-sqlite3";
import fs from "node:fs";

const migrations = [
  {
    id: "20261004_models_connection_state_v2",
    table: "models",
    columns: [
      "auth_method TEXT NOT NULL DEFAULT 'api_key'",
      "oauth_tokens TEXT",
      "env_var_name TEXT",
      "connection_status TEXT NOT NULL DEFAULT 'unconfigured'",
      "connection_error TEXT",
      "last_tested_at INTEGER",
      "last_test_latency INTEGER",
    ],
  },
] as const;

/** Additive, transactional upgrade from the published v0.1.0 database. */
export function migrateSchema(sqlite: Database.Database): void {
  const columns = new Set((sqlite.pragma("table_info(models)") as { name: string }[]).map(c => c.name));
  if (columns.size && !columns.has("auth_method") && sqlite.name !== ":memory:") {
    const backup = `${sqlite.name}.pre-20261004.db`;
    // VACUUM INTO includes committed WAL pages; never copy only the main DB file.
    if (!fs.existsSync(backup)) {
      sqlite.prepare("VACUUM INTO ?").run(backup);
      fs.chmodSync(backup, 0o600);
    }
  }
  sqlite.transaction(() => {
    sqlite.exec("CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)");
    for (const migration of migrations) {
      const columns = new Set((sqlite.pragma(`table_info(${migration.table})`) as { name: string }[]).map(c => c.name));
      // Fresh installs get their tables from the canonical DDL below.
      if (!columns.size) continue;
      for (const definition of migration.columns) {
        const name = definition.split(" ")[0];
        if (!columns.has(name)) sqlite.exec(`ALTER TABLE ${migration.table} ADD COLUMN ${definition}`);
      }
      sqlite.prepare("INSERT OR IGNORE INTO schema_migrations (id, applied_at) VALUES (?, ?)")
        .run(migration.id, Date.now());
    }
  }).immediate();
}

/** Refuse readiness for unsupported/incomplete schemas, even if SELECT 1 works. */
export function assertSchemaReady(sqlite: Database.Database): void {
  sqlite.prepare("SELECT auth_method, oauth_tokens, env_var_name, connection_status, connection_error, last_tested_at, last_test_latency FROM models LIMIT 0").all();
  const result = sqlite.pragma("quick_check", { simple: true });
  if (result !== "ok") throw new Error("SQLite integrity check failed");
}
