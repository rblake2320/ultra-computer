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
  E2E coverage, a bounded connection-probe minimum regression, and the release
  verification gate.

### WHY-0013: Wiring claims require boundary proof and explicit exclusions

- **Status:** Accepted
- **Date:** 2026-07-17
- **Problem:** Green core tests and the presence of routes/adapters were
  previously summarized as if every visible capability had been wired and
  inspected. Contract tracing later found broken and orphaned boundaries.
- **Decision:** A wiring claim must trace the user action through its real
  client, API, service, persistence and external boundary. Evidence is labeled
  live, local, unit-only, static-only, not verified or blocked. Every excluded
  live check records why it was excluded.
- **Why:** This makes a failure traceable and prevents unit mocks, static code
  presence or unrelated sample workflows from becoming launch proof.
- **Alternatives:** Report only passing test totals or maintain separate
  component notes. Rejected because neither exposes missing seams or explains
  why a feature that appears configured cannot operate.
- **Evidence:** `reports/wiring-audit-2026-07-17.md`.
- **Related:** PARK-0014 and the 2026-07-17 documentation changelog.

### WHY-0014: BullMQ uses one observable, persistent Redis contract

- **Status:** Accepted
- **Date:** 2026-07-17
- **Problem:** Cache code honored `REDIS_URL`, but BullMQ rebuilt unauthenticated
  host/port connections, retained stale availability after outages, leaked
  failed clients, and Compose explicitly disabled Redis persistence.
- **Decision:** Resolve one validated `redis://` or `rediss://` target for all
  BullMQ clients, track each live connection in readiness, close partial
  initialization, and persist Redis with append-only storage.
- **Why:** Queue readiness must describe the service actually handling work,
  while authentication, TLS, database selection and restart durability must not
  depend on which subsystem opens the connection.
- **Alternatives:** Keep duplicate host/port variables or treat Redis as an
  optional in-memory accelerator. Rejected because production requires the
  queue and accepted work must survive ordinary container recreation.
- **Evidence:** 230 unit tests, validated Compose config, real Docker BullMQ
  dispatch, HTTP 200 live health, and real Chrome render without app errors.
- **Related:** WHY-0013 and PARK-0012.

### WHY-0015: Untrusted execution never crosses the host boundary

- **Status:** Accepted
- **Date:** 2026-07-17
- **Problem:** File transforms accepted host paths, the interpreter ran
  submitted code and package managers on the host, Docker arguments were
  reconstructed as shell strings, and browser typing values entered durable
  logs while subresources bypassed the top-level URL check.
- **Decision:** Use one canonical sandbox path, temporary transform snapshots,
  Docker-only code execution, shell-free Docker argv, validated immutable
  container limits, per-request browser egress governance and unconditional
  typed-input redaction before any observable or durable record.
- **Why:** Validation cannot make arbitrary host execution safe. Removing the
  host shell and host interpreter, constraining filesystem publication, and
  minimizing secret lifetime make the boundary enforceable and testable.
- **Alternatives:** Expand blocklists, validate package names, or redact only
  known token patterns. Rejected because ordinary private text and valid-looking
  paths/arguments can still cross those boundaries.
- **Evidence:** Focused unit tests, real Chromium private-subresource and secret
  tests, and a real Docker isolation/host-injection test.
- **Related:** WHY-0011, WHY-0013 and PARK-0016.

### WHY-0016: Credentials are plaintext only inside the owning server process

- **Status:** Accepted
- **Date:** 2026-07-17
- **Problem:** Model credentials were encrypted in SQLite but could escape in
  create and quick-add responses, while connector keys, OAuth client secrets
  and tokens were durable plaintext JSON. Default-model reads also returned
  ciphertext to internal adapters instead of usable credentials.
- **Decision:** Encrypt each connector configuration as one authenticated
  AES-256-GCM envelope, migrate legacy plaintext on its first server-side read,
  decrypt role lookups consistently, and sanitize model objects in the service
  that owns every REST/gRPC response path.
- **Why:** Secret handling is safest when persistence and response boundaries
  are centralized. Encrypting the existing text value avoids a schema change
  while protecting all present and future connector credential fields.
- **Alternatives:** Redact individual routes or encrypt only known JSON keys.
  Rejected because new call sites or provider-specific fields would recreate
  the leak, and partial JSON encryption leaves secret classification brittle.
- **Evidence:** Raw-SQL persistence tests prove ciphertext at rest, legacy
  migration, server-only decryption and sanitized create/quick-add responses.
- **Related:** WHY-0012, WHY-0013 and PARK-0016.

### WHY-0017: Visible configuration is not model readiness

- **Status:** Accepted
- **Date:** 2026-07-17
- **Problem:** Routers and the chat UI treated any enabled database record as a
  usable model. Failed, disconnected, untested or credentialless records could
  retain core roles and then produce “No model configured” or provider errors.
  Role endpoints also cleared the working role before validating the target.
- **Decision:** Define routability once as enabled plus connected plus currently
  credential-ready; apply it to every text, worker, memory, speed and image
  selection path. Change roles transactionally and reconcile them after test
  failure, disable, disconnect or deletion.
- **Why:** A model card proves configuration, not availability. Routing only to
  a live-proven candidate makes readiness and the user-visible state agree,
  while atomic mutation preserves the last working configuration on failure.
- **Alternatives:** Retry failed records during chat or trust the enabled flag.
  Rejected because chat would become an implicit paid probe and both options
  preserve misleading readiness.
- **Evidence:** 256 unit tests and eight real Playwright workflows, including a
  visible but unverified model that is correctly treated as no ready model.
- **Related:** WHY-0012, WHY-0013 and PARK-0016.

### WHY-0018: Client and callback boundaries have one explicit contract

- **Status:** Accepted
- **Date:** 2026-07-17
- **Problem:** Connector code treated already-parsed API results as Fetch
  responses, multipart uploads bypassed owner authentication, Identity actions
  disagreed with their registered route shapes, and external OAuth/Gmail
  callbacks were blocked by owner auth. Generic webhooks had no scoped proof.
- **Decision:** Centralize authenticated browser Fetch, consume typed parsed
  JSON once, share Identity request-shape builders, expose only callbacks that
  perform their own verification, and require timestamped raw-body HMAC for
  generic inbound webhooks. Use one signed connector OAuth flow and require an
  explicit HTTPS redirect base in production.
- **Why:** Authentication and serialization are boundary properties. Encoding
  them once prevents individual screens from silently omitting the owner key or
  inventing incompatible response semantics, while route-local callback proof
  allows external providers in without opening owner operations.
- **Alternatives:** Exempt all callback-looking paths or let every page build
  its own headers and response parsing. Rejected because both make future
  bypass and contract drift likely.
- **Evidence:** 268 unit tests plus nine real Playwright workflows, including
  authenticated connector creation and a destination-aware multipart upload;
  real Express Identity flows, callback owner-gate tests and webhook HMAC/replay
  tests cover the remaining local contracts.
- **Related:** WHY-0013, WHY-0016 and PARK-0016.

### WHY-0019: A durable claim is the side-effect admission boundary

- **Status:** Accepted
- **Date:** 2026-07-17
- **Problem:** Duplicate delivery returned an existing durable run record but
  continued into model, tool and persistence side effects. Separately, a
  standalone Temporal sample was documented as if normal application messages
  used it, although no ingress started that workflow.
- **Decision:** Return before all orchestrator side effects when the durable
  run claim already exists. Keep the Temporal server, worker and database
  behind an explicit `temporal-proof` profile until application work is
  decomposed into idempotent, resumable activities and actually dispatched by
  ingress.
- **Why:** A ledger is useful only if its atomic claim controls execution.
  Retrying the entire orchestrator as one activity after a partial failure can
  duplicate external actions; isolating the sample is more truthful and safer
  than advertising unearned crash-resume.
- **Alternatives:** Treat the ledger as telemetry, or route messages through
  the existing whole-orchestrator Temporal activity. Rejected because the
  former repeats work and the latter creates false recovery semantics around
  non-idempotent side effects.
- **Evidence:** A duplicate-run unit test proves no status, message, provider
  or tool path is entered; Compose config proves Temporal is absent by default
  and present only with `--profile temporal-proof`.
- **Related:** WHY-0007, PARK-0008 and PARK-0016.

### WHY-0020: A connector is connected only after its real boundary responds

- **Status:** Accepted
- **Date:** 2026-07-17
- **Problem:** Several connectors accepted credentials without contacting the
  provider, and the generic tool path invented a `/tools/{name}` endpoint that
  is not MCP. Messaging could also show success after an `ok: false` result and
  lost all channel state on restart.
- **Decision:** Fail closed where provider-native validation or operations are
  not implemented; use MCP Streamable HTTP initialization and JSON-RPC
  `tools/call` for MCP connectors; require explicit `ok: true` in the UI; and
  persist encrypted messaging state plus deduplicated inbound dispatch.
- **Why:** Configuration storage is not connectivity, and an HTTP 200 envelope
  is not operational success. The product must distinguish implemented
  provider behavior from saved metadata.
- **Alternatives:** Keep optimistic status and add warnings, or preserve the
  generic REST convention. Rejected because both still produce false success
  at the exact boundary operators depend on.
- **Evidence:** Focused connector/MCP/messaging tests, complete TypeScript and
  unit gates, plus restart restoration and duplicate-inbound contract tests.
- **Related:** WHY-0016, WHY-0018, PARK-0007 and PARK-0016.

### WHY-0021: Provider SDKs do not own egress or hidden retry policy

- **Status:** Accepted
- **Date:** 2026-07-17
- **Problem:** SDK calls could resolve and connect to caller-configured base
  URLs outside the governed DNS/TLS/policy boundary. Default SDK retries could
  also issue more paid requests than the spend guard reserved.
- **Decision:** Inject the governed, DNS-pinned fetch implementation into
  OpenAI-compatible and Anthropic SDK clients, including image generation, and
  set SDK retries to zero. Reject custom Google base URLs until that client can
  use the same transport.
- **Why:** Network validation and cost admission must wrap the actual socket and
  every attempt, not a URL string checked before an independent SDK request.
- **Alternatives:** Pre-validate the hostname or trust HTTPS. Rejected because
  both retain DNS-rebinding, redirect and hidden-retry gaps.
- **Evidence:** Provider contract tests traverse a real local HTTP boundary
  only when explicitly allowlisted; blocked-local, body preservation, image
  materialization, TypeScript and complete unit gates pass.
- **Related:** WHY-0009, WHY-0015 and PARK-0013.

### WHY-0022: Experimental means guarded and truthful, never simulated

- **Status:** Accepted
- **Date:** 2026-07-17
- **Problem:** Experimental Swarm, cron, NIP, Skills and Marketplace operations
  could report completion after errors, canned exchanges, metadata writes or a
  copy-only action.
- **Decision:** Propagate execution failures; return 501 for missing adapters;
  reject fabricated negotiation/wildcard trust; label copy-only and local-only
  operations; and keep unsigned installed instructions disabled for review.
- **Why:** An experimental gate limits exposure but does not make false success
  acceptable. The status must still describe the work actually performed.
- **Alternatives:** Preserve optimistic flows with warning text. Rejected
  because automation and operators act on status fields, not disclaimers.
- **Evidence:** Focused truth tests exercise six real failure/label boundaries;
  the full unit suite and experimental-route browser gate pass.
- **Related:** WHY-0013 and PARK-0016.

### WHY-0023: Unsupported current protocols fail closed

- **Status:** Accepted
- **Date:** 2026-07-17
- **Problem:** The retained A2A code models the legacy 0.3 JSON-RPC contract,
  while the current released specification is 1.0. Local conformance tests
  against 0.3 would still produce a false interoperability claim.
- **Decision:** Return HTTP 501 from all external A2A routes and advertise the
  exact version gap. Keep MCP on the current stable 2025-11-25 contract.
- **Why:** Explicit unavailability is safer than protocol drift that appears to
  connect and then corrupts tasks, authentication or message semantics.
- **Alternatives:** Ship the legacy contract or depend on the stable JavaScript
  SDK, which currently targets 0.3. Rejected because neither implements current
  A2A 1.0.
- **Evidence:** Official protocol sources are linked in
  `docs/PROTOCOL_STATUS.md`; route tests prove every external A2A path fails
  before discovery or dispatch, and the UI displays the reason.
- **Related:** PARK-0018 and PARK-0016.

### WHY-0024: Cross-platform and security gates are release behavior

- **Status:** Accepted
- **Date:** 2026-07-17
- **Problem:** Windows CI denied an approved Python transform because runner
  temporary paths can use the `RUNNER~1` short-name form. CodeQL separately
  identified polynomial trailing-slash regexes and tainted log format strings.
- **Decision:** Permit the tilde only inside the already constrained local
  interpreter path grammar, test that exact Windows form, replace the regexes
  with bounded linear string operations, and use constant log messages with
  untrusted values passed as structured fields.
- **Why:** Linux success does not prove Windows policy portability, and
  syntactically small string operations still belong inside security gates.
  The fixes preserve fail-closed execution while removing platform ambiguity.
- **Alternatives:** Loosen the entire command policy or waive remote checks.
  Rejected because either would weaken the production boundary to hide a CI
  defect.
- **Evidence:** Focused CLI/policy/catalog/MCP tests and TypeScript pass. Final
  evidence is the rerun GitHub Windows matrix and CodeQL PR gate.
- **Related:** WHY-0005, WHY-0016 and WHY-0020.

### WHY-0025: Security boundaries use structured operations, not sanitization shortcuts

- **Status:** Accepted
- **Date:** 2026-07-17
- **Problem:** Repository-wide CodeQL found inherited paths where request data
  reached filesystem, command, dynamic-code, regex, timer, traversal and log
  operations. Several paths had containment checks, but shortcuts such as
  shell-built grep, `new Function`, regex tag stripping and substring URL
  validation made the boundary unnecessarily fragile.
- **Decision:** Remove host-shell and dynamic-code execution; use structured
  in-process operations, parsed URLs, bounded scanners/parsers, canonical
  no-follow filesystem handles, validated identifiers and fixed log formats.
  Pin the runtime image and require the full check set on protected `master`.
- **Why:** Escaping attacker-controlled strings is weaker than eliminating the
  interpreter or ambiguous parser. Defense-in-depth also makes the safety
  contract testable on Windows and Linux instead of depending on CodeQL to
  understand a custom sanitizer.
- **Alternatives:** Dismiss all path/sanitization alerts as static-analysis
  limitations. Rejected because manual tracing confirmed genuine checkpoint,
  command, code-execution, regex and resource-bound defects among the false
  positives.
- **Evidence:** 325 unit tests, 9 real browser E2E workflows, 12 integration
  checks, clean production Docker boundary proof, zero npm vulnerabilities and
  the follow-up GitHub CodeQL gate.
- **Related:** WHY-0015, WHY-0024 and PARK-0020.

### WHY-0026: Persistence claims cross the container-recreation boundary

- **Status:** Accepted
- **Date:** 2026-07-17
- **Problem:** Process-restart tests and declared Docker volumes did not prove
  that application data survives deleting and recreating the production app
  container. The live Docker gate also generated a new encryption key on each
  start and discarded its root exception, making recreation failures both
  likely and difficult to diagnose.
- **Decision:** Give one gate run a stable encryption key and isolated named
  data/sandbox volumes. Seed a real conversation, queued message and uploaded
  file; force-remove and recreate the app container; then retrieve and assert
  all three artifacts before cleaning up the test volumes. Preserve the actual
  command failure and stderr in the gate output without logging its
  secret-bearing argument list.
- **Why:** Durable deployment behavior is a boundary property. It must be
  exercised across container identity loss, not inferred from in-process
  restart behavior or Compose declarations.
- **Alternatives:** Inspect volume configuration or reuse a host database file.
  Rejected because neither proves Docker volume ownership, mount wiring and
  application reopening together.
- **Evidence:** `npm run live:docker` passes after the app container is removed
  and recreated; the persisted conversation ID, exact message content and
  sandbox file content remain readable.
- **Related:** WHY-0008, PARK-0012 and PARK-0005.

### WHY-0027: Patch a vulnerable transitive archive parser without downgrading the embedding stack

- **Status:** Accepted
- **Date:** 2026-07-17
- **Problem:** A fresh release audit reported GHSA-xcpc-8h2w-3j85 in
  `adm-zip <0.6.0`, reached through current `@huggingface/transformers 4.2.0`
  and its pinned `onnxruntime-node 1.24.3`. npm's automatic remediation proposed
  a breaking downgrade to Transformers 3.8.1.
- **Decision:** Keep the current direct embedding package and force the
  transitive archive parser to patched `adm-zip 0.6.0` with npm's lockfile-backed
  override.
- **Why:** The vulnerability is in the archive parser, while downgrading the
  direct runtime would discard current behavior and introduce a larger,
  unrelated compatibility change. The narrow override removes the affected
  version and can be independently exercised.
- **Alternatives:** Run `npm audit fix --force`, ignore the advisory, or remove
  semantic embeddings. Rejected because those options respectively introduce
  an unreviewed breaking change, ship a known high-severity denial-of-service
  path, or remove real product capability.
- **Evidence:** A clean `npm ci` resolves `adm-zip 0.6.0`; `npm audit` reports
  zero vulnerabilities; and the real MiniLM load, 384-dimensional embedding,
  similarity and serialization integration tests pass.
- **Related:** WHY-0024 and WHY-0025.
