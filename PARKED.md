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
