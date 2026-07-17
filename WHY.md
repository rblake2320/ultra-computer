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
  explicit user pins; do not silently replace a selected default. Keep a small
  current fallback list for first-run setup, presently GPT-5.6 Sol, Terra, and
  Luna for OpenAI, while treating authenticated provider discovery as the
  authoritative catalog.
- **Why:** This allows current models to become available quickly without
  pretending that every provider implements the same API or risking an
  unexpected behavioral or cost change.
- **Alternatives:** Maintain model names manually, or send every model through a
  generic OpenAI-compatible adapter. Rejected because both approaches fail as
  provider APIs and model capabilities evolve.
- **Evidence:** Provider contract tests, discovery and retirement fixtures,
  native streaming/tool/vision tests, capability-aware routing tests, and live
  opt-in probes where they are safe and non-billable.
- **Reasoning default:** GPT-5.6 requests use medium reasoning unless the caller
  explicitly selects another supported effort.
- **Related:** `docs/decisions/0001-model-discovery-and-capability-evidence.md`;
  `PARKED.md` items PARK-0002 and PARK-0003.

### WHY-0003: Production capability boundaries fail closed

- **Status:** Accepted
- **Date:** 2026-07-16
- **Problem:** Development credentials, host-shell fallback, permissive network
  behavior, or unavailable isolation can turn a configuration mistake into
  unauthorized execution or data exposure.
- **Decision:** Production startup and sensitive capabilities must fail closed
  when required secrets, isolation, transport security, or policy enforcement
  are unavailable. Outbound connections use the address that passed DNS and
  network validation, authentication is rate-limited before key verification,
  and diagnostic failures do not echo secret-bearing error objects. Secret-scan
  exceptions must identify a reviewed finding fingerprint rather than disable a
  detector or exclude a directory. Development-only CSP allowances may support
  the local build toolchain, but production script policy remains strict.
  Development conveniences must be explicit and visibly non-production.
- **Why:** Ultra Computer executes tools and communicates with external systems;
  safe failure is more important than silently preserving degraded behavior.
- **Alternatives:** Warn and continue with defaults or host fallbacks. Rejected
  because warnings do not contain compromise and are often missed in automated
  deployments.
- **Evidence:** Negative startup tests, unavailable-sandbox tests, policy and
  injection tests, network-boundary tests, and production container smoke.
- **Related:** `docs/OPERATIONAL_READINESS_GATE.md`, `PARKED.md`.

### WHY-0004: Discovery and compatibility evidence are separate states

- **Status:** Accepted
- **Date:** 2026-07-16
- **Problem:** A provider returning a model identifier does not prove that the
  model supports chat, streaming, tools, images, structured output, or the same
  request parameters as another provider.
- **Decision:** Catalog synchronization records provider availability and
  lifecycle. Capabilities remain unverified until an explicit provider probe
  succeeds, and ambiguous provider/model identifiers fail instead of guessing.
- **Why:** Current-release models become visible quickly without turning
  metadata discovery into a false compatibility or production-readiness claim.
- **Alternatives:** Trust presets indefinitely or infer capabilities from model
  names. Rejected because both become stale and can route incompatible traffic.
- **Evidence:** Catalog parser/migration tests, native adapter contract tests,
  capability-aware router tests, and an explicit live connection test per
  deployed provider/model pair.
- **Related:** WHY-0002,
  `docs/decisions/0001-model-discovery-and-capability-evidence.md`, PARK-0002,
  and PARK-0003.

### WHY-0005: Streaming authentication uses scoped ephemeral credentials

- **Status:** Accepted
- **Date:** 2026-07-16
- **Problem:** Browser EventSource cannot set an Authorization header, while a
  long-lived API key in the URL can leak through history, logs, referrers, and
  monitoring systems.
- **Decision:** Authenticated clients exchange the bearer key for a short-lived,
  path-bound HMAC stream token and use only that token in the stream URL.
- **Why:** Compromise of a stream URL is bounded by route and time and does not
  disclose the deployment-wide credential.
- **Alternatives:** Continue URL API keys or make streams unauthenticated.
  Rejected because both materially weaken the production boundary.
- **Evidence:** Token signature, expiry, path-binding, tamper, and middleware
  tests plus authenticated browser stream verification.
- **Related:** WHY-0003 and the 2026-07-16 security changelog.

### WHY-0006: Integrations report provider truth, not simulated success

- **Status:** Accepted
- **Date:** 2026-07-16
- **Problem:** Messaging and marketplace surfaces returned successful-looking
  delivery and reputation data without provider or user evidence.
- **Decision:** Slack and Gmail use their real provider APIs and fail closed
  when credentials or required targets are absent. Sensitive configuration is
  recursively redacted, and marketplace metrics are shown only when backed by
  stored events.
- **Why:** Operators must be able to distinguish implemented capability from a
  verified delivery. Fabricated success corrupts audit trails and can hide
  failed business operations.
- **Alternatives:** Preserve demo responses or label them as estimates.
  Rejected because production routes and persisted history must represent
  actual provider outcomes.
- **Evidence:** Missing-credential tests, recursive-redaction tests, governed
  HTTP enforcement, and explicit live-provider verification before any Slack
  or Gmail delivery claim.
- **Related:** WHY-0001, WHY-0003, and PARK-0007.

### WHY-0007: Readiness means dependency connectivity, not process existence

- **Status:** Accepted
- **Date:** 2026-07-16
- **Problem:** A running Temporal worker process could be marked healthy while
  it was still unable to connect to Temporal.
- **Decision:** The worker writes its readiness marker only after establishing
  the Temporal connection; Compose and CI wait on that marker. The Temporal
  server binds all container interfaces so multi-network DNS cannot resolve a
  healthy name to an interface where the service is not listening.
- **Why:** Traffic and integration tests must not start while a required
  dependency is unavailable.
- **Alternatives:** Increase fixed startup sleeps or test only the process ID.
  Rejected because both are timing-dependent and produce false readiness.
- **Evidence:** A production-shaped Compose gate that waits for worker health,
  executes a three-activity workflow, inspects event history, and re-reads the
  completed result. The gate first exposed connection refusal on the backend
  interface and passed only after the bind behavior was corrected.
- **Related:** WHY-0001 and the 2026-07-16 verification changelog.

### WHY-0008: Core workflows require authenticated end-to-end evidence

- **Status:** Accepted
- **Date:** 2026-07-17
- **Problem:** Unit and transport tests did not prove that a private browser
  session could configure a model, receive real local inference, handle an
  absent model, execute a contained command, retain state across restart, or
  enforce both experimental-feature states.
- **Decision:** Maintain a seven-test Playwright gate against a real server,
  Chromium, SQLite, bearer authentication, and local Ollama. Keep optional
  surfaces disabled unless `ULTRA_EXPERIMENTAL=1`.
- **Why:** The gate tests the user-visible core without converting optional or
  externally credentialed capabilities into unsupported readiness claims.
- **Alternatives:** Mock model responses or enable every surface by default.
  Rejected because neither proves the actual supported operating path.
- **Evidence:** `npm run test:e2e`; the restart assertion is process-level and
  does not prove Docker volume restoration.
- **Related:** PARK-0011, PARK-0012, and PARK-0014.

### WHY-0009: Spending protection fails closed at application admission

- **Status:** Accepted
- **Date:** 2026-07-17
- **Problem:** Recording usage after dispatch cannot prevent concurrent calls
  from crossing an operator budget, while guessing a new model's price creates
  a false ceiling.
- **Decision:** Reserve conservatively before dispatch, settle durably in
  SQLite, cap the configurable application limit at $20 per UTC month, and
  reject paid models/images without verified pricing rules.
- **Why:** Transactional reservations bound traffic admitted by this
  application and make restarts auditable without claiming control over the
  provider's billing system.
- **Alternatives:** Post-call accounting only, unlimited user-configured caps,
  or family-name price guesses. Rejected because each can understate exposure.
- **Evidence:** Spend-guard concurrency, restart, settlement, local-exemption,
  image, invalid-input, and unknown-price tests.
- **Related:** PARK-0013, PARK-0015, and PARK-0005.

### WHY-0010: Private browser access uses a session-only owner key

- **Status:** Accepted
- **Date:** 2026-07-17
- **Problem:** Production requires `ULTRA_API_KEY`, but the browser previously
  depended on an out-of-band `window.__ULTRA_API_KEY__` injection. A normal
  owner opening the private UI could see failed requests with no sign-in path.
- **Decision:** Probe a protected local route, prompt only when authentication
  is required, validate the owner key server-side, and retain it in
  `sessionStorage` for the current tab session only.
- **Why:** The secured deployment becomes usable without putting a credential
  in the bundle, URL, persistent browser storage, or application database.
- **Alternatives:** Disable authentication on loopback or inject the server key
  into HTML. Rejected because same-host processes can still make requests and
  HTML injection discloses the deployment credential to every page visitor.
- **Evidence:** The first authenticated E2E workflow proves rejection of an
  invalid key followed by a successful owner unlock and rendered application.
- **Related:** WHY-0003 and the 2026-07-16 security changelog.

### WHY-0011: CLI execution is structured and shell-free

- **Status:** Accepted
- **Date:** 2026-07-17
- **Problem:** An authenticated request could supply both a shell command
  string and process working directory. Policy blocklists reduced common abuse
  but did not remove command injection or tainted-path boundaries.
- **Decision:** Parse exactly one command, allow only fixed executable names,
  pass arguments as an array with `shell: false`, use one fixed sandbox root,
  and reject shell operators, substitutions, redirections, compound commands,
  executable paths, and caller-selected working directories.
- **Why:** A denylist cannot make arbitrary shell interpretation safe. Removing
  the shell makes argument boundaries explicit and auditable while retaining
  common local inspection, build, and transformation commands.
- **Alternatives:** Dismiss the CodeQL alerts as intentional or expand the
  shell blocklist. Rejected because both preserve the vulnerable data flow.
- **Evidence:** CLI parser/execution unit tests, authenticated E2E execution,
  full verification, and the GitHub Advanced Security CodeQL rerun.
- **Related:** WHY-0003 and the 2026-07-16 security changelog.

### WHY-0012: Provider credentials are saved only with an explicit model action

- **Status:** Accepted
- **Date:** 2026-07-17
- **Problem:** The provider form accepted an API key but exposed no visible
  save control. Model cards implicitly performed persistence, while catalog
  sync ignored the credential still present in the form.
- **Decision:** Label each model action **Save & connect**, explain that the key
  is encrypted and stored with that model, and allow catalog sync to use the
  entered credential transiently without persisting it.
- **Why:** Credential persistence must be intentional and understandable. A
  provider-level credential table would add schema and lifecycle complexity
  when the existing encrypted per-model storage is sufficient.
- **Alternatives:** Persist immediately on input, or add a provider credential
  schema. Rejected because implicit secret writes are unsafe and the additive
  schema is unnecessary for this launch blocker.
- **Evidence:** Browser reproduction, unit no-credential coverage, explicit UI
  E2E coverage, and the release verification gate.
