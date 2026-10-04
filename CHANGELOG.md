# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased] - 2026-10-04

### Fixed
- Clear task/tool/agent activity on chat session changes so another session's
  results and token counts are not shown alongside a fresh health report.
- Run artifact verification through Windows junction/POSIX aliases and reject
  missing manifests in the explicit integrity-check command.
- Add governed read-only host diagnostics for CPU/RAM/GPU/disk/process/Ollama
  readings. Standalone health requests return measured snapshots without model
  calls; sandbox listings cannot satisfy a host-health receipt requirement.
- Give CI one owned Ollama process and retain model connection errors and browser
  failure context instead of accepting another daemon's health response.
- Keep name-only follow-ups on the brief answer path; make sandbox descriptions
  match the active engine and shell examples match the installed command policy.
- Build OpenShell's non-root workload from the same digest-pinned local stage
  as the Docker interpreter, removing a mutable parent-image reference.
- Use one worker for simple requests, omit tool schemas for plain answers,
  disable optional Ollama thinking on the wire, and remove hidden memory calls.
- Bound each turn to 16 provider attempts, 64,000 estimated input tokens and
  32,768 output tokens/reservations; cap automatic KB context at 2,048 tokens.
- Preserve recent session dialogue and require successful tool receipts for
  requested actions instead of accepting invented execution summaries.
- Connect dynamically discovered models through Quick Add; honor selected catalog
  credentials, fetch complete paginated lists, and hide unavailable static presets.
- Reject app-owner keys as provider keys and show actionable provider-auth failures
  without clearing owner login or echoing provider credential errors.
- Refresh OpenAI GPT-6, Claude 5.5/Fable 5.1, Gemini 3.8/3.5, OpenRouter and local
  Gemma 4/Qwen 3.8 suggestions, request parameters and guarded budget bounds.
- Preserve direct short questions with reply-format suffixes; deny occupied
  ports during installer verification and isolate restored listener ports.
- Add a private-owner installer with protected persistent keys, dedicated Redis,
  loopback listeners, cached Chromium validation and a built code image.
- Upgrade the published beta database additively, preserve existing rows and
  snapshot old state before adding model connection columns.
- Persist message admissions before dispatch, deduplicate queue delivery and
  require an explicit orchestrator completion receipt.
- Recover pre-execution interruptions; quarantine later interruptions without
  repeating unknown effects. Reject empty/truncated output and iteration
  exhaustion as success, and execute only the current message's tasks.
- Discover installed Ollama tool capability and simplify short-question prompts.
- Ship Python, Node, TypeScript and Bash in the sandbox. Scope cleanup by owner
  and remove the misleading host-fallback label.
- Add offline full-state backup/verified restore with live/undrained refusal.
- Resolve dependency advisories, migrate Tailwind to v4, bound offline SBOM
  generation and add private-install/crash checks to existing CI.

### Added
- Optional pinned NVIDIA OpenShell 0.1.2 bridge for Windows/WSL Ubuntu 24.04,
  with mTLS, offline policy, non-root workloads and bounded file transfer.
- Receiving acceptance for Windows input, sandbox output, timeout, real-model
  request counts, session context, explicit memory and failed actions.
- Managed private background operation, bounded logs, restart/health recovery,
  maintenance-stop controls and removable Windows login startup (ADR-0004).
- A real-model sustained workload gate and a distinct CI lifecycle regression;
  attested source/build/SBOM candidate artifacts and source integrity checks.
- Pinned Transformers.js 4.3 CPU inference, MCP client SDK 2.3 with modern/legacy
  negotiation, and OpenTelemetry 2.11 private bounded execution traces (ADR-0003).
- Provider-constrained task plans with deterministic DAG admission; isolate
  cached responses across models, formats, parameters and instructions.
- Optional isolated CPU Laya diagnostic classifier with pinned artifacts,
  structured input and an eight-case benchmark.
- WHY-0030, ADR-0002 and the dated private deployment evidence report.

## [Unreleased] - 2026-07-16

### Audited
- Added a complete UI-to-external-boundary wiring audit with evidence labels,
  exact live-test exclusions, symptom-to-root-cause traces and an ordered
  repair plan. The audit supersedes the unsupported claim that all visible
  platform wiring was production-proven and records a launch NO-GO.
- Added a standing project rule that wiring claims require UI-to-service
  boundary evidence and explicit labels for every unexercised dependency.

### Fixed
- Gave the isolated legacy-database startup safety test a 15-second
  cross-platform bound. Its child TypeScript process exceeded Vitest's generic
  five-second default once under Windows Node 24 coverage while completing in
  6.6 seconds; the assertion and failure behavior are unchanged.
- Extended the live production-container gate to create durable conversation,
  message and sandbox-file state, destroy the application container, recreate
  it with the same encryption key and named volumes, and assert that all state
  survives. The gate now reports the underlying exception on failure instead
  of discarding the diagnostic, without echoing secret-bearing process
  arguments.
- Routed OpenAI-compatible and Anthropic SDK traffic, including image
  generation, through the governed DNS-pinned egress boundary; disabled hidden
  SDK retries so one spend reservation cannot produce extra billable attempts.
  Custom Google base URLs now fail closed until its SDK transport can use the
  same boundary.
- Added bounded event IDs and cursor replay to conversation SSE, renewed stream
  authorization on reconnect, separated fallback attempts in the UI, and
  persisted the actual model used rather than the originally selected model.
- Accepted and validated provider base64 or URL image results, enforced content
  signatures and size/time/redirect bounds, wrote artifacts atomically, and
  fail when no returned image can be saved.
- Made OpenAI reasoning-capable models default to medium reasoning effort while
  preserving explicit internal overrides.
- Removed the startup `DROP TABLE IF EXISTS swarms` statement and added a real
  legacy-database fixture proving startup preserves the table and its data.
- Made owner access fail closed on HTTP errors or malformed success payloads;
  removed the visible Archive action that had no implementation.
- Disabled external A2A routes with an explicit current-version explanation
  instead of advertising obsolete 0.3 interoperability against the current
  1.0 specification.
- Made experimental surfaces truthful: Swarm failures propagate, unsupported
  cron types return 501, NIP no longer fabricates negotiation or wildcard
  trust, Skills copy rather than claim execution, and Marketplace is labeled
  local/unsigned with new instructions disabled for review.
- Made the durable run claim the admission gate for orchestrator side effects,
  so duplicate HTTP/BullMQ/inbound delivery cannot repeat a completed or
  already-running model/tool execution.
- Persisted messaging channels, encrypted configuration, subscriptions,
  histories, delivery records and retry state; restored pending delivery after
  restart, preserved redacted secrets during edits, and routed deduplicated
  inbound events into persisted conversations and orchestration.
- Added real messaging Connect/Disconnect controls and made connection tests
  fail unless the server explicitly returns `ok: true`; removed the selectable
  WebSocket channel because no adapter exists.
- Replaced the connector registry's nonstandard `/tools/{name}` request with a
  current MCP Streamable HTTP JSON-RPC handshake and `tools/call`, including
  negotiated session headers, response-envelope validation and cleanup.
- Made API-key connectors fail closed when no live validation exists or any
  provider returns a non-success response; non-MCP connector tool calls now
  report their unsupported status instead of simulating a generic operation.
- Repaired connector create/connect/OAuth/disconnect response handling,
  authenticated multipart uploads through the shared browser request boundary,
  sent multipart destination metadata before file parts, normalized public file
  paths across Windows/Linux,
  aligned experimental Identity review/block requests with registered server
  contracts, and made production OAuth redirect configuration explicit.
- Required successful connection state and live credentials for all model
  routing; made core-role changes transactional and reconciled roles after
  test failure, disable, disconnect or deletion; aligned chat readiness and
  manual setup copy with the same contract.
- Unified BullMQ on the authoritative `REDIS_URL` so Redis authentication, TLS
  and database selection reach every queue connection; readiness now follows
  connection loss and recovery, failed clients close cleanly, and Compose
  persists queue state with Redis AOF storage.
- Made provider setup explicit: entered API keys now show a visible
  **Save & connect** action on each model, explain encrypted persistence and
  connection testing, and can be used transiently for catalog synchronization
  before a model exists.
- Raised the connection probe output allowance from an invalid 10 tokens to a
  bounded 64 tokens, satisfying provider minimums without turning a health
  check into a material paid request.
- Made the shell policy accept Windows short-name temporary paths used by the
  approved Python interpreter, replaced provider catalog trailing-slash regexes
  with linear string handling, and kept untrusted MCP names out of log format
  strings after cross-platform CI and CodeQL found the gaps.

### Security
- Added a bounded `live-docker` GitHub job that runs the real production-image,
  queue, policy and container-recreation persistence proof on every pull
  request and protected-branch push. Its Redis dependency is digest-pinned,
  setup is covered by cleanup even on early failure, and `master` requires the
  resulting check.
- Overrode the vulnerable transitive `adm-zip <0.6.0` dependency used by the
  current Hugging Face/ONNX embedding stack to patched `0.6.0`. A clean install
  now audits with zero vulnerabilities, and the real MiniLM embedding runtime
  integration remains green.
- Removed host-shell fallback, shell-built search commands and dynamic
  JavaScript calculation; added a bounded arithmetic parser, literal
  in-process search, no-follow sandbox file descriptors, symlink-safe
  recursion and server-controlled isolated execution.
- Replaced regex HTML/tag parsing and URL substring checks with inert scanners
  and parsed protocol/hostname validation; replaced regex-generated MCP globs
  with a bounded dynamic-programming matcher.
- Validated checkpoint identifiers before filesystem use, bounded cron timers
  and swarm traversal, rejected non-scalar query parameters, removed tainted
  log format strings, and strengthened upload/wildcard basename boundaries.
- Pinned the Node 24 production image by digest, narrowed CodeQL token
  permissions to its analysis job, and protected `master` with required
  CI/security checks, resolved conversations, and force/deletion prevention.
- Allowed external OAuth and messaging callbacks through owner auth only when
  the destination route performs signed-state, provider-signature, shared-token
  or timestamped raw-body HMAC verification; restored rate limiting for public
  callback traffic and retired the duplicate registered OAuth flow.

### Documentation
- Removed the obsolete `ALLOW_HOST_SHELL` setup guidance and recorded the
  single-maintainer review, external CII registration and continuous-fuzzing
  gaps explicitly in `PARKED.md`.
- Corrected the Temporal readiness claim: the historical three-activity proof
  is an isolated sample, normal application messages do not dispatch through
  Temporal, and the sample stack now requires the `temporal-proof` profile.
- Added current protocol status and an approval-gated database migration/outbox
  plan, including historical upgrade, backup, rollback and crash-window proof.
- Encrypted complete connector credential configurations at rest, migrated
  legacy plaintext records on first use, sanitized model create/quick-add
  responses, and made internal default/orchestrator lookups decrypt credentials
  consistently without exposing them to clients.
- Contained file transforms to one canonical sandbox with symlink-aware path
  checks, input/output limits, temporary snapshots and atomic publication.
- Removed host package installation and host interpreter execution; submitted
  code now requires the network-isolated, resource-bounded Docker sandbox.
- Replaced every Docker host-shell command with argument-array process calls,
  validated sandbox configuration and mounts, and added a read-only root,
  output bounds and persistent cleanup without shell substitution.
- Redacted browser typing values before policy audits, SSE, IPC and SQLite;
  scrubbed later results, masked screenshots, disabled extraction after private
  input, and governed every browser request and subresource.
- Replaced user-controlled shell-string execution with a shell-free,
  executable-allowlisted command parser and a fixed process working directory;
  added regression coverage for operators, quoting, executable selection, and
  working-directory control.
- Added separator-aware sandbox path containment to block prefix-sibling escapes.
- Replaced long-lived API keys in EventSource URLs with short-lived,
  path-bound stream tokens.
- Sanitized rendered chat Markdown and added executable-markup regression tests.
- Hardened uploads with bounded sizes, allowlisted types, safe generated names,
  path containment, collision checks, and cleanup on failure.
- Added governed outbound HTTP with policy checks, DNS/private-address
  protection, redirect revalidation, production HTTPS enforcement, timeouts,
  response-size limits, and address-pinned connections that close the
  DNS-rebinding gap between validation and transport.
- Made production reject missing/placeholder secrets and host-shell fallback.
- Added CSP and related HTTP security headers.
- Kept the production script policy strict while allowing Vite's development
  React preamble, and aligned the font policy with the stylesheets the UI
  actually loads so local browser sessions render instead of failing blank.
- Applied API rate limiting before authentication so invalid-key attempts are
  bounded, and prevented live-gate failures from echoing secret-bearing errors.
- Normalized rate-limit client addresses with the library's IPv6-aware helper.
- Documented one fingerprint-scoped Gitleaks exception for a public example JWT
  in historical test data; no secret rule, commit, or path is broadly excluded.
- Redacted messaging credentials recursively from channel and delivery data.
- Cleared high/critical npm audit findings and upgraded vulnerable or
  unsupported runtime dependency paths.

### Added
- Added agent guidance, review rubric, security policy, contribution guide,
  proprietary license file, editor settings, code ownership, and CI workflow.
- Added WHY, parked-work, ADR, and pull-request records so consequential changes
  preserve their rationale, evidence, alternatives, and intentional deferrals.
- Added provider-native OpenAI Responses, Anthropic, and Google adapters plus
  explicit OpenAI-compatible adapters for compatible services.
- Added a persistent provider model catalog with discovery, lifecycle tracking,
  explicit connection probes, and a Models-page synchronization action.
- Added runtime readiness checks, bounded graceful shutdown, and a dedicated
  Temporal worker container.
- Added real Slack Web API and Gmail API delivery paths; unconfigured
  credentials now fail closed instead of returning simulated success.
- Added real local TCP/filesystem security tests, provider contract tests,
  model-catalog migration/parser tests, lifecycle tests, and stream-token tests.
- Added a multi-stage Node.js 24 container build and a production-shaped Compose
  stack with non-root/read-only services, internal Redis, loopback host ports,
  persistent application/Temporal data, and required secrets.
- Added `npm run doctor` for environment, database, dependency, and optional
  live-model diagnostics.
- Added an authenticated seven-test Playwright workflow gate using a real
  browser, real server, temporary SQLite database, real local Ollama inference,
  both `ULTRA_EXPERIMENTAL` states, and a real process restart.
- Added a bounded CI job that installs checksum-verified Ollama 0.32.0,
  `gemma3:270m`, and Chromium before running the same seven workflows.
- Installed the Playwright Chromium runtime and operating-system libraries in
  the production application image so browser tools are available there.
- Added a durable SQLite reservation/settlement ledger for paid text and image
  admission. The application limit defaults to and cannot exceed $20 per UTC
  month; unknown paid pricing fails closed.

### Fixed
- Fixed Windows production startup by disabling unsupported `reusePort` on Windows.
- Split frontend routes into lazy-loaded chunks to remove the oversized initial bundle warning.
- Made `/api/health` report actual required database, gRPC, queue, and worker
  state instead of optimistic startup state.
- Made shutdown idempotently drain HTTP, gRPC, browser, queue, and worker
  resources; fatal production startup and unhandled errors now terminate.
- Made the SQLite location honor `DATABASE_PATH`.
- Prevented ambiguous provider/model identifiers from silently selecting an
  incompatible adapter, and bypassed response caching for tools and probes.
- Migrated Google integration from the deprecated SDK to `@google/genai`.
- Updated CI action pins, Node.js 24 coverage, dependency audit, CodeQL,
  Scorecard, SBOM, and secret-scan gates.
- Removed fabricated marketplace download, rating, and verification values.
- Made Temporal worker health depend on an established Temporal connection,
  eliminating process-alive readiness false positives.
- Fixed multi-network Temporal connectivity by binding the server on all
  container interfaces and routing clients through an explicit frontend alias.
- Made the standalone production smoke explicitly opt out of the required
  Redis queue; real queue availability remains enforced by the service-stack
  integration gate.
- Updated the OpenAI fallback choices to GPT-5.6 Sol, Terra, and Luna, and made
  GPT-5.6 requests explicitly use medium reasoning unless a caller overrides
  the effort.
- Made the first successfully tested model Default and Orchestrator when those
  roles are empty, and made no-model chat persist actionable guidance.
- Added a session-only owner API-key gate so authenticated browser deployments
  can validate access without embedding credentials in the client bundle.
- Made A2A send/stream errors return failed tasks, protocol webhooks dispatch
  through registered handlers, and unsuccessful integration delivery report
  failure instead of simulated success.
- Made CLI execution select the Windows command shell on Windows while keeping
  work-directory containment enforcement.

### Changed
- Declared Node.js `>=22 <25`, npm 11, and Node.js 24 as the container/CI
  baseline.
- Updated compatible dependency ranges and migrated dependencies that were
  more than one major line behind, including TypeScript 7, React DayPicker 10,
  React Resizable Panels 4, Hook Form resolvers 5, and Zod Validation Error 5;
  also migrated the deprecated Recharts 2 line to Recharts 3.
- Removed the unused direct `node-fetch` dependency in favor of the supported
  Node runtime transport behind governed egress.
- Model discovery is additive: newly listed models are available for selection,
  but capabilities remain unverified until an explicit connection test.
- Live catalog synchronization remains credential-backed and authoritative;
  fallback choices keep setup usable but never impersonate a successful
  provider discovery response.
- Production Compose no longer exposes infrastructure services publicly or
  mounts the Docker daemon socket.
- Optional Swarm, NIP, Identity, Marketplace, and autonomy/self-improvement
  routes and navigation now require `ULTRA_EXPERIMENTAL=1`.

### Verification
- Local typecheck, unit suite, build, dependency audit, and Docker stack checks
  are recorded only at their actual evidence level.
- Provider adapter tests use real local HTTP/SSE transport but not paid provider
  accounts.
- A production-shaped Compose run completed a real Redis queue operation and a
  real three-activity Temporal workflow; Temporal history contained exactly
  three activity-completion events and the completed result was re-read
  idempotently.
- A clean Linux production image ran as the HTTP app target on an isolated
  Docker bridge network and passed authentication, sandbox upload/read,
  private-address policy denial, policy-audit persistence, BullMQ dispatch,
  missing-policy fail-closed, and audit-write-failure checks.
- OpenAI live catalog discovery was attempted and returned HTTP 401; OpenAI
  discovery is therefore **not verified live** in this session.
- Slack and Gmail code paths are implemented against their provider APIs, but
  no live Slack or Gmail account was exercised in this session.
- Current statement coverage is 34.40%. This passes the configured repository
  threshold but remains below the target for a broadly production-critical
  platform; coverage expansion is tracked in `PARKED.md`.
- The seven-test Playwright run is verified locally with real Ollama. It proves
  application process restart, not Docker container recreation, paid-provider
  behavior, or live third-party connector delivery.
- The $20 ledger is an application admission boundary, not absolute provider
  invoice control. Provider-side quota enforcement remains parked.
- No paid-provider inference success is claimed by this changelog.

## 0.1.0 - 2026-04-11

### Added
- Initial beta release of the Ultra Computer agent orchestration platform.
