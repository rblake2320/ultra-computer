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

### PARK-0007: Live third-party connector and messaging verification

- **Status:** Parked
- **Owner:** Product operations and security
- **Parked on:** 2026-07-16
- **Reason:** This session had no approved disposable Slack workspace, Gmail
  mailbox, GitHub/MCP account, remote A2A peer, or equivalent connector
  credentials. Exercising those systems can create real external state and
  requires an explicit destination and reviewer.
- **Current risk:** Connector and messaging code has local contract and
  fail-closed evidence but is not verified live for each external account.
- **Reactivate when:** Disposable accounts/peers, least-privilege credentials,
  approved mutations/recipients, and cleanup procedures are provided.
- **Next decision:** Run one success and one provider-rejection case per
  supported connector, capture external IDs without secrets, and record the
  exact evidence level in the changelog and pull request.
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

### PARK-0011: CI end-to-end service gate

- **Status:** Closed
- **Owner:** Release engineering
- **Parked on:** 2026-07-17
- **Reason:** Implemented in the 2026-07-17 reliability pass. CI now installs a
  checksum-verified Ollama 0.32.0 release, pulls `gemma3:270m`, installs real
  Chromium, and runs all seven authenticated workflows with a 20-minute bound.
- **Current risk:** The first remote run remains to be observed after the
  branch can be pushed; local execution of the same model and suite is green.
- **Reactivate when:** The job becomes flaky, the pinned release/model is
  retired, or runner resource use exceeds the bound.
- **Next decision:** Require the green `core-e2e` job before merge and update
  its pinned versions through reviewed pull requests.
- **Related:** WHY-0008.

### PARK-0012: Automated container-recreation persistence proof

- **Status:** Parked
- **Owner:** Runtime engineering
- **Parked on:** 2026-07-17
- **Reason:** Playwright proves state across a real application process restart;
  configured Docker volumes have not been exercised through force recreation.
- **Current risk:** Volume wiring or ownership can regress without the local
  process-restart gate detecting it.
- **Reactivate when:** A clean Docker runner can seed state, recreate the app
  and worker containers, and inspect the same persisted records.
- **Next decision:** Add Compose seed/recreate/assert coverage without reusing
  host database files.
- **Related:** WHY-0008 and PARK-0005.

### PARK-0013: Provider-enforced hard spending quota

- **Status:** Parked
- **Owner:** Product operations and billing security
- **Parked on:** 2026-07-17
- **Reason:** The SQLite ledger controls requests admitted by this application
  but cannot control provider-side pricing changes, taxes, delayed usage,
  external API clients, or final invoices.
- **Current risk:** The application ceiling is not an absolute account-level
  or invoice-level limit.
- **Reactivate when:** Each paid provider offers an enforceable project/account
  quota API or an approved billing-control integration.
- **Next decision:** Configure provider quotas at or below the application
  ceiling, test rejection, and reconcile provider usage against the ledger.
- **Related:** WHY-0009 and PARK-0002.

### PARK-0014: Raise production-path coverage

- **Status:** Parked
- **Owner:** Engineering
- **Parked on:** 2026-07-17
- **Reason:** Statement coverage is 34.40%. It passes the configured threshold
  but leaves important orchestration, connector, and failure paths thinly
  exercised.
- **Current risk:** Regressions outside the seven supported E2E workflows may
  reach review without a targeted test failure.
- **Reactivate when:** The reliability pass is merged or before expanding the
  supported production surface.
- **Next decision:** Add risk-ranked tests first, then raise thresholds only to
  levels already sustained by the suite.
- **Related:** WHY-0001 and WHY-0008.

### PARK-0015: Provider-backed reconciliation of unresolved spend reservations

- **Status:** Parked
- **Owner:** Billing security and model platform
- **Parked on:** 2026-07-17
- **Reason:** A process can terminate after a paid provider accepts a request
  but before Ultra Computer records terminal usage. Releasing that durable
  reservation automatically could admit more than the configured ceiling, so
  unresolved reservations remain committed for their admission month.
- **Current risk:** A crash after a large reservation can reduce or exhaust the
  remaining application allowance until the next UTC month, even when the
  provider ultimately charged less.
- **Reactivate when:** Provider usage APIs expose request-level, authoritative
  charge state and an authenticated reconciliation operation can be audited.
- **Next decision:** Reconcile each reservation to exact provider usage or a
  proven zero charge; never release it based only on age or process state.
- **Related:** WHY-0009 and PARK-0013.

### PARK-0016: Platform-wide wiring remediation

- **Status:** Active backlog — launch blocking, not accepted risk
- **Owner:** Engineering and security
- **Parked on:** 2026-07-17
- **Reason:** The complete wiring audit found boundaries that are broken,
  misleading, unsafe, orphaned or not live-proven. They cannot be repaired
  honestly as part of a read-only inspection.
- **Current risk:** The audit-time container health failure is closed by
  WHY-0014. The file-transform, Docker host-shell, host-interpreter and browser
  typed-input/egress boundaries are closed by WHY-0015. Visible model,
  connector, messaging, protocol, durability and experimental surfaces can
  still fail, report false success or expose secrets.
- **Reactivate when:** Immediately, before public launch.
- **Next decision:** Execute the ordered twelve-step repair plan in
  `reports/wiring-audit-2026-07-17.md`, with a passing real-boundary test for
  each repaired seam.
- **Related:** WHY-0013. This item must not be interpreted as approval to
  launch while work is deferred.
