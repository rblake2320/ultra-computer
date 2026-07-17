# Database Migration Plan

**Status:** Human review required before implementation
**Date:** 2026-07-17

Ultra Computer currently creates its latest SQLite tables at module import.
`CREATE TABLE IF NOT EXISTS` can initialize a new database but cannot upgrade an
older table when a later release adds or changes columns, indexes, constraints,
or data representation. The existing `schema_migrations` row is therefore a
marker, not a migration executor.

## Confirmed startup risk

- Existing databases may retain an older shape while application code assumes
  the latest shape.
- There is no ordered, transactional migration runner or checksum validation.
- There are no fixtures proving upgrades from each shipped schema.
- A legacy `swarms` table was previously dropped at every startup. That
  destructive statement has been removed and is covered by a preservation
  test; no data conversion is attempted without approval.
- Messaging is restart-persistent in an encrypted settings envelope, but exact
  outbound delivery needs transactional outbox tables and provider idempotency
  support. A crash after a provider accepts a message and before local status
  commit remains ambiguous.

## Proposed implementation

1. Move schema initialization out of `storage.ts` into a small migration
   runner that opens SQLite before Drizzle storage is constructed.
2. Store ordered immutable migration IDs and SHA-256 checksums in
   `schema_migrations`.
3. Acquire an exclusive migration lock and apply every pending migration in a
   transaction. Refuse startup on checksum drift, unsupported future versions,
   or any failed statement.
4. Establish a baseline migration for a brand-new database and explicit
   forward migrations for every historical schema fixture. Never infer a
   column's presence from application version alone; inspect SQLite metadata.
5. Back up the database file and WAL/SHM state before an operator-triggered
   production upgrade, then run `PRAGMA integrity_check` and foreign-key checks
   after migration.
6. Add dedicated messaging channel, subscription, inbound-event, outbound
   delivery, and delivery-attempt tables. Use
   `UNIQUE(channel_id, external_message_id)` for inbound admission and an
   atomic lease/status transition for outbound work.
7. Carry provider idempotency keys where the provider supports them. Where it
   does not, report delivery as `unknown` after the crash window rather than
   automatically resending and claiming exactly-once behavior.
8. Add upgrade fixtures for every released schema plus rollback-by-restore
   evidence. Migrations themselves remain forward-only; rollback restores the
   verified pre-upgrade backup.

## Approval gate

Implementation changes database startup, schema, backup and recovery behavior.
It must not begin until the owner approves this plan and the following are
agreed:

- supported historical release/database versions;
- backup location, retention and disk-space failure behavior;
- acceptable maintenance/downtime window;
- whether the messaging outbox ships in the same release;
- rollback acceptance criteria and operator confirmation flow.

## Required verification

- New empty database reaches the exact expected schema.
- Every historical fixture upgrades with all records preserved.
- Re-running migrations is a no-op.
- A forced mid-migration failure rolls back fully.
- Checksum drift and a future unknown migration fail startup clearly.
- Backup restore returns byte-valid data and passes integrity/foreign-key
  checks.
- Inbound duplicate events create one durable message and one dispatch.
- Outbound crash points before send, after provider acceptance, and after local
  commit have explicit, tested states without false success.
