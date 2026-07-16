# Parked Work

This ledger records intentional deferrals. Parked work is not silently
discarded: each item has a reason, owner, reactivation condition, and decision
link so future contributors can tell whether the constraint still applies.

## Rules

- Add an item whenever known work is deferred from a consequential change.
- State the present risk; parking an item does not make the risk disappear.
- Give a concrete reactivation trigger and a next decision, not “later.”
- Close an item by linking the implementing pull request and decision record.
- Review open items during every production-readiness or release-candidate pass.

## Status values

- **Parked:** intentionally deferred pending a trigger or decision.
- **Ready:** trigger met; work should be scheduled.
- **In progress:** implementation has started.
- **Closed:** completed or explicitly rejected, with evidence.

## Items

### PARK-0001: Multi-user identity, RBAC, and tenant isolation

- **Status:** Parked
- **Owner:** Product and security
- **Parked on:** 2026-07-16
- **Reason:** Replacing the single-owner API-key boundary changes public APIs,
  persistence, migration behavior, and the operating model. It requires an
  explicit product decision rather than an incidental security refactor.
- **Current risk:** A public or shared deployment cannot claim operation-scoped,
  user-scoped, or tenant-scoped authorization.
- **Reactivate when:** Ultra Computer is approved for shared or public multi-user
  deployment, or before any route is exposed to identities with different
  privileges.
- **Next decision:** Select the identity provider, tenant model, authorization
  semantics, migration path, and recovery/admin controls.
- **Related:** WHY-0001 and WHY-0003 in `WHY.md`.

### PARK-0002: Billable automatic model compatibility probes

- **Status:** Parked
- **Owner:** Model platform
- **Parked on:** 2026-07-16
- **Reason:** Automatic inference probes can create unexpected cost, transmit
  data to providers, and consume quotas. Discovery can proceed without silently
  authorizing billable traffic.
- **Current risk:** Models that lack a free metadata or validation endpoint may
  remain unverified until a user explicitly tests them.
- **Reactivate when:** A cost ceiling, consent model, probe payload policy, audit
  trail, and provider-specific rate limits are approved.
- **Next decision:** Define who may authorize probes and how cost and data
  handling are disclosed.
- **Related:** WHY-0002 in `WHY.md`.

### PARK-0003: Automatic replacement of pinned or default models

- **Status:** Parked
- **Owner:** Product and model platform
- **Parked on:** 2026-07-16
- **Reason:** A newer model can change quality, latency, safety behavior, cost,
  context limits, and tool semantics. Release recency alone is not sufficient
  evidence to change user-selected behavior.
- **Current risk:** Administrators must approve migrations from retired or
  superseded pinned models.
- **Reactivate when:** Versioned routing policies, compatibility evidence,
  rollback, cost guardrails, and administrator approval UX exist.
- **Next decision:** Define rolling aliases and the conditions under which an
  opt-in deployment may follow them automatically.
- **Related:** WHY-0002 in `WHY.md`.

### PARK-0004: Immutable multi-architecture container image digests

- **Status:** Parked
- **Owner:** Release engineering and security
- **Parked on:** 2026-07-16
- **Reason:** The deployment currently names versioned upstream images, but
  immutable digests must be obtained and verified for every supported
  architecture by the release pipeline. A guessed, stale, or single-platform
  digest would break deployment while creating false supply-chain assurance.
- **Current risk:** Upstream maintainers can move a version tag, so an otherwise
  identical deployment may resolve to different image content.
- **Reactivate when:** CI can resolve the release manifest list, verify image
  provenance/signatures, record the selected digests, and test the pinned stack
  on every supported architecture.
- **Next decision:** Select the supported architecture matrix and image
  provenance policy, then automate digest refreshes through reviewed pull
  requests.
- **Related:** WHY-0003 in `WHY.md`.

### PARK-0005: Managed multi-node persistence

- **Status:** Parked
- **Owner:** Platform and data engineering
- **Parked on:** 2026-07-16
- **Reason:** The current SQLite application database is appropriate for a
  single writable node, while a managed multi-node store requires schema,
  migration, concurrency, backup, and recovery design.
- **Current risk:** The application tier cannot safely scale to multiple
  concurrent writers or claim managed regional durability.
- **Reactivate when:** A shared/public deployment requires horizontal scaling,
  formal recovery objectives, or managed database operations.
- **Next decision:** Select the production database, migration path, backup
  policy, restore test, and rollout/rollback procedure.
- **Related:** WHY-0001 and `docs/PRODUCTION_RUNBOOK.md`.

### PARK-0006: Production observability and SLOs

- **Status:** Parked
- **Owner:** Platform operations
- **Parked on:** 2026-07-16
- **Reason:** Health, structured logs, policy audit, and watchdog signals exist,
  but a production telemetry backend and service objectives depend on the
  deployment platform and operating commitments.
- **Current risk:** High-volume/public operation lacks agreed latency,
  availability, cost, tracing, dashboard, alerting, and incident thresholds.
- **Reactivate when:** A production hosting platform and launch SLOs are chosen.
- **Next decision:** Define SLIs/SLOs, telemetry retention and privacy, alert
  ownership, dashboards, and incident response integration.
- **Related:** WHY-0001 and `docs/PRODUCTION_RUNBOOK.md`.

### PARK-0007: Live third-party messaging verification

- **Status:** Parked
- **Owner:** Product operations and security
- **Parked on:** 2026-07-16
- **Reason:** This session had no approved Slack workspace, Gmail mailbox, or
  disposable provider credentials. Exercising those accounts would create real
  external messages and requires an explicit destination and reviewer.
- **Current risk:** Slack and Gmail provider code is tested for local
  fail-closed behavior but is not verified live against a real account.
- **Reactivate when:** A disposable test workspace/mailbox, least-privilege
  credentials, approved recipients, and cleanup procedure are provided.
- **Next decision:** Run one delivery and one provider-rejection case per
  integration, capture provider IDs without secrets, then record the evidence
  in the changelog and pull request.
- **Related:** WHY-0006 in `WHY.md`.

### PARK-0008: Temporal worker-termination recovery proof

- **Status:** Parked
- **Owner:** Runtime engineering
- **Parked on:** 2026-07-16
- **Reason:** The current live gate proves real workflow/activity execution,
  durable history, and idempotent result retrieval, but does not terminate a
  worker during an in-flight activity.
- **Current risk:** Crash-resume behavior is provided by Temporal's execution
  model but is not independently chaos-tested by this repository.
- **Reactivate when:** CI can isolate a dedicated proof worker and terminate it
  deterministically after a recorded activity checkpoint.
- **Next decision:** Add an in-flight worker termination/replacement test and
  assert that completed activities are not repeated.
- **Related:** WHY-0007 and `docs/DURABLE_EXECUTION_GATE.md`.

### PARK-0009: Remaining one-major framework migrations

- **Status:** Parked
- **Owner:** Frontend and platform engineering
- **Parked on:** 2026-07-16
- **Reason:** Registry verification shows the remaining outdated direct
  dependencies are no more than one major release behind, or intentionally
  match the supported Node 24 and React 18 runtime lines. Migrating React,
  Tailwind, GraphQL, and related types together has a larger UI and
  public-behavior blast radius than the production-readiness fixes in this pass.
- **Current risk:** The project does not yet consume every newest framework
  major, although the installed tree has no known audit vulnerability.
- **Reactivate when:** Visual regression coverage and a dedicated framework
  migration release are approved, or a security/deprecation advisory requires
  an earlier move.
- **Next decision:** Migrate React, Tailwind, GraphQL, and related framework
  families one at a time with rendered UI,
  accessibility, typecheck, unit, and production-build evidence.
- **Related:** WHY-0001 and the 2026-07-16 dependency changelog.

### PARK-0010: Upstream transitive deprecation cleanup

- **Status:** Parked
- **Owner:** Dependency maintenance
- **Parked on:** 2026-07-16
- **Reason:** Clean installation still reports deprecated transitive packages
  beneath current direct releases: `prebuild-install` under
  `better-sqlite3`, `boolean` under the current Transformers/ONNX runtime, and
  legacy `glob`/`inflight` under the current protobuf and SBOM CLIs. There is no
  newer direct release in the registry that removes these paths.
- **Current risk:** The packages are unmaintained, although the installed tree
  currently has zero npm audit findings.
- **Reactivate when:** An upstream release removes the deprecated dependency, a
  maintained compatible replacement exists, or an advisory affects the path.
- **Next decision:** Prefer an upstream upgrade; replace the direct library only
  with equivalent runtime, native-build, schema-generation, and SBOM evidence.
- **Related:** WHY-0001 and the 2026-07-16 dependency changelog.
