# Why Ledger

This ledger records why consequential changes exist. It complements the
changelog, which records what changed, and the ADRs in `docs/decisions/`, which
hold detailed decisions that affect architecture or long-lived behavior.

## Rules

- Add or update an entry in the same pull request as a consequential change.
- Explain the problem, the chosen direction, alternatives considered, and the
  evidence that will prove the decision correct.
- Link an ADR when the decision affects architecture, public APIs, data
  persistence, authentication, authorization, model routing, or deployment.
- Link deferred work to `PARKED.md`; do not hide known gaps in prose or TODOs.
- Preserve historical entries. If a decision changes, mark it superseded and
  link the replacement instead of rewriting history.

## Entry format

### WHY-NNNN: Short decision title

- **Status:** Proposed | Accepted | Superseded
- **Date:** YYYY-MM-DD
- **Problem:** What risk, limitation, or user need requires a decision?
- **Decision:** What direction was chosen?
- **Why:** Why is this preferable for Ultra Computer?
- **Alternatives:** What credible alternatives were considered, and why were
  they not chosen?
- **Evidence:** What tests, measurements, audit output, or live verification
  demonstrates that the decision works?
- **Related:** Pull request, ADR, changelog entry, issue, or parked item.

## Decisions

### WHY-0001: Production readiness is an evidence-backed program

- **Status:** Accepted
- **Date:** 2026-07-16
- **Problem:** Feature breadth has outpaced the evidence needed to claim that
  the system is secure, durable, current, and safe for production operation.
- **Decision:** Treat production readiness as a gated program covering secure
  defaults, dependency hygiene, truthful tests, durable execution, deployment,
  documentation, and live operational evidence.
- **Why:** Passing isolated unit tests or adding more features cannot establish
  production safety. A single release gate and durable evidence trail make
  readiness claims reviewable and reproducible.
- **Alternatives:** Continue addressing findings opportunistically. Rejected
  because recurring security and TypeScript regressions show that disconnected
  fixes do not protect the whole release.
- **Evidence:** Clean installation, typecheck, full tests, coverage, build,
  dependency audit, secret scan, production smoke, container gate, and any
  capability-specific live evidence required by `docs/VERIFICATION_POLICY.md`.
- **Related:** `CHANGELOG.md`, `docs/OPERATIONAL_READINESS_GATE.md`,
  `docs/DURABLE_EXECUTION_GATE.md`.

### WHY-0002: New models require discovery plus capability verification

- **Status:** Accepted
- **Date:** 2026-07-16
- **Problem:** A hard-coded model catalog becomes stale as providers release,
  rename, supersede, or retire models. A newly discovered identifier alone does
  not prove endpoint, tool, vision, reasoning, streaming, or parameter support.
- **Decision:** Move toward provider-backed discovery, normalized capability
  contracts, lifecycle tracking, and compatibility verification. Preserve
  explicit user pins; do not silently replace a selected default.
- **Why:** This allows current models to become available quickly without
  pretending that every provider implements the same API or risking an
  unexpected behavioral or cost change.
- **Alternatives:** Maintain model names manually, or send every model through a
  generic OpenAI-compatible adapter. Rejected because both approaches fail as
  provider APIs and model capabilities evolve.
- **Evidence:** Provider contract tests, discovery and retirement fixtures,
  native streaming/tool/vision tests, capability-aware routing tests, and live
  opt-in probes where they are safe and non-billable.
- **Related:** `PARKED.md` items PARK-0002 and PARK-0003.

### WHY-0003: Production capability boundaries fail closed

- **Status:** Accepted
- **Date:** 2026-07-16
- **Problem:** Development credentials, host-shell fallback, permissive network
  behavior, or unavailable isolation can turn a configuration mistake into
  unauthorized execution or data exposure.
- **Decision:** Production startup and sensitive capabilities must fail closed
  when required secrets, isolation, transport security, or policy enforcement
  are unavailable. Development conveniences must be explicit and visibly
  non-production.
- **Why:** Ultra Computer executes tools and communicates with external systems;
  safe failure is more important than silently preserving degraded behavior.
- **Alternatives:** Warn and continue with defaults or host fallbacks. Rejected
  because warnings do not contain compromise and are often missed in automated
  deployments.
- **Evidence:** Negative startup tests, unavailable-sandbox tests, policy and
  injection tests, network-boundary tests, and production container smoke.
- **Related:** `docs/OPERATIONAL_READINESS_GATE.md`, `PARKED.md`.
