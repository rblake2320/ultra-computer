# Ultra Computer Complete Wiring Audit

**Date:** 2026-07-17

**Repository inspected:** `D:\ultra-computer-pr`

**Branch inspected:** `fix/openai-key-save`

**Verdict:** **[CONFIRMED] NO-GO for launch**

## Answer

The earlier statement that all wiring had been inspected was incorrect. The
core local chat path has real browser proof, but a full boundary-by-boundary
inspection found launch blockers in model routing, credential handling,
connectors, OAuth/webhooks, messaging, protocols, file and Docker execution,
durability, migrations, and several experimental surfaces.

This report is the trace record. It distinguishes working proof from static
code presence and explicitly lists everything not exercised live and why.
Passing unit tests are not treated as proof that an external integration works.

## Remediation Log

- **2026-07-17 — Runtime queue health closed locally:** BullMQ now honors the
  full `REDIS_URL`, tracks connection loss/recovery, closes failed clients, and
  uses persistent Redis AOF storage in Compose. Evidence: 230 unit tests,
  Compose validation, real Docker queue dispatch, live HTTP 200 health, and a
  real Chrome render without application-origin errors. Temporal remains
  truthfully disabled and the overall launch verdict remains NO-GO until the
  remaining blockers are repaired.
- **2026-07-17 — Execution containment closed locally:** File transforms are
  sandbox-contained and atomically published; submitted code requires Docker;
  Docker host calls are shell-free and resource validated; browser typing is
  removed from audits/events/persistence and all browser requests are governed.
  Evidence: focused unit tests, real Chromium secret/subresource proof and a
  real Docker isolation/host-injection proof. Overall launch verdict remains
  NO-GO pending the remaining model, credential, connector and durability work.
- **2026-07-17 — Credential persistence/response boundary closed locally:**
  Connector configurations now use authenticated encryption at rest with
  automatic legacy-plaintext migration; model create and quick-add responses
  are sanitized centrally; default/orchestrator reads decrypt only for server
  callers. Evidence: focused raw-SQL persistence and response tests plus the
  TypeScript gate. Overall launch verdict remains NO-GO pending model routing,
  connector/auth, protocol, durability and false-success repairs.

## Evidence Collected

| Check | Result | Evidence classification |
|---|---:|---|
| `npm run test:e2e` | 8/8 pass | **VERIFIED LOCALLY** — real Chromium, SQLite, process restart and local Ollama |
| `npm run test:integration` | 11 pass, 8 skip | **VERIFIED LOCALLY** for passed local boundaries; skipped items remain unverified |
| `npm run live:docker` | pass | **VERIFIED LOCALLY** — isolated production container, auth, files, policy and Redis/BullMQ dispatch |
| Unit suite with coverage | 223/223 pass | **UNIT-LEVEL ONLY** for covered contracts |
| Statement coverage | 34.49% | **CONFIRMED**; many integration-heavy modules have little or no coverage |
| `npm run doctor` | 13/14 pass, Temporal warning | **VERIFIED LOCALLY**, but not reliable proof of the active container's health |
| Active app `/api/health` | HTTP 503 | **VERIFIED LIVE** on loopback: database ready; queue and gRPC unavailable; Temporal disabled |
| Active container logs | repeated Redis refusal | **VERIFIED LIVE**: Redis points to `127.0.0.1:63999`; gRPC is disabled |

No credential was read, printed or used. No paid model call was made.

## Wiring Trace Matrix

| Surface | Trace | Status | Evidence / failure |
|---|---|---|---|
| App shell and local UI | Browser -> React -> REST | Partial | **VERIFIED LOCALLY** in real Chromium. Active launch container is **NOT HEALTHY** because `/api/health` returns 503. |
| Model credential UI | Models page -> model API -> encrypted model key storage | Partial | Explicit **Save & connect** and the 64-token probe fix are **VERIFIED LOCALLY**. A fresh OpenAI credential and permitted model are still required for live proof. |
| Model routing | Chat -> router -> selected model | Broken | Enabled models are considered routable even when disconnected, failed or credentialless. Disconnect does not clear enabled/default/orchestrator roles. |
| Role assignment | Models UI/API -> default/orchestrator role | Broken | A failed role mutation can clear a valid role before the target is proven to exist; deletion does not reliably reassign it. |
| Model API secrecy | Create/quick-add -> response | Broken | Creation paths can return storage objects containing decrypted provider credentials. |
| Provider catalog | Credential -> provider list -> discovered models | Partial | Catalog discovery exists. Failed probes are not durably recorded/downgraded; discovered models lack reliable capability metadata. “New models just work” is not proven. |
| Provider execution | Router -> adapters -> provider SDK | Partial | OpenAI contracts are unit-tested; Ollama text chat is **VERIFIED LOCALLY**. Most external providers are **NOT VERIFIED**. |
| Provider spend guard | Paid call -> reserve -> settle | Partial | Admission and concurrency behavior are unit/local verified. Thirteen advertised paid providers lack pricing and therefore fail closed before use. Provider invoice reconciliation is not verified. |
| Provider network policy | Adapter SDK -> configured base URL | Broken | SDK calls bypass the governed HTTP layer and its URL/TLS/DNS checks, allowing unsafe user-configured egress boundaries. |
| Multimodal chat | Upload -> message -> router -> adapter content | Broken | Images become text data URLs, audio bytes are omitted, and adapter structured content is not reached. |
| Reasoning level | UI/session -> router -> provider parameter | Partial | Native OpenAI has partial support; no complete user/session control and inconsistent mapping across providers. |
| Chat streaming | Orchestrator -> SSE -> UI | Partial | Basic streaming works, but event IDs, cursor/replay and loss recovery are absent. Reconnect can lose output. |
| Fallback telemetry | Failed model -> fallback -> response/log/UI | Broken | The actual fallback model is not consistently returned or recorded; UI and logs can attribute output to the wrong model. |
| Chat readiness | UI -> configured-model check | Broken | UI counts enabled records, not connected and routable models, producing “configured” states that cannot run. |
| Connector create/connect UI | React -> shared API helper -> connector route | Broken | The helper already returns parsed JSON, but the page calls `res.json()` and checks `res.ok`; success paths throw and OAuth popup flow becomes unreachable. |
| Connector operations | Stored connector -> agent tool -> provider | Mostly absent | Most API/OAuth connectors store credentials/status but have no provider-native tool adapter. The generic call path assumes a nonstandard `/tools/{name}` endpoint rather than MCP JSON-RPC. |
| Connector validation | Credentials -> provider test | Misleading | Telegram, Jira, Confluence, PostgreSQL, Supabase and Snowflake accept credentials without contacting their providers. |
| Connector secret storage | UI/API -> SQLite | Broken/security | Connector keys, client secrets and OAuth tokens are stored as plaintext JSON; only model keys use encrypted persistence. |
| OAuth callbacks | Provider redirect -> callback -> token storage | Broken | Global owner auth blocks external callback requests. Two conflicting OAuth implementations exist, one in-memory/orphaned. |
| Gmail push | Google -> push callback -> token verifier | Broken | Owner auth rejects the request before Gmail's own query-token verification can run. |
| Generic webhook ingress | External sender -> webhook -> messaging | Broken/security | The generic route has no scoped signature/shared-secret verification; auth handling is inconsistent. |
| Messaging channel lifecycle | UI -> connect/disconnect -> adapter | Broken | UI does not invoke channel connect/disconnect. WebSocket is selectable but no adapter is registered. |
| Messaging connection test | UI -> test API -> result | Broken/misleading | Server may return HTTP 200 with `ok:false`; UI ignores `ok` and shows “Connection test passed.” |
| Messaging persistence | Config/history/queue -> storage | Broken | State is in memory and disappears on process restart. Editing a redacted config can overwrite its saved secret. |
| Inbound message orchestration | Slack/Gmail/GitHub -> history -> conversation/agent | Broken | Events enter in-memory history but do not create a durable conversation or invoke the orchestrator. |
| File browser | UI -> upload API -> contained storage | Partial | Server containment is locally tested, but the UI upload request omits the owner Authorization header and fails when auth is enabled. |
| File transforms | Protocol route -> CLI engine -> input/output path | Broken/security | Arbitrary absolute paths are accepted without workspace containment, allowing server-privileged reads/writes. |
| CLI execution | Agent -> allowlisted process | Partial | Allowlisted execution and traversal rejection are **VERIFIED LOCALLY**. The code interpreter can still install caller-selected npm/pip packages on the host. |
| Docker sandbox | API -> Docker command construction | Broken/security | CPU and memory inputs are interpolated into command strings without strict validation, creating an injection boundary. |
| Browser tool | Agent -> browser -> network | Partial/security | Top-level URL checks exist, but DNS/subresource governance is incomplete and typed secrets can be returned in action results. |
| Image generation | Provider -> URL/base64 -> download -> file | Broken | Base64 results are ignored, downloads are insufficiently governed/bounded, and the tool can report success when every download failed. |
| Skills | UI Run -> orchestration | Misleading | “Run” copies text and increments usage; it does not execute the skill. Usage can increment before a model run succeeds. |
| A2A | UI -> protocol API -> peer | Broken | Request/response shapes, message format and URL handling disagree; advertised streaming has no working SSE route. |
| MCP | Connector -> MCP session/tools | Broken/incomplete | Auth headers are discarded; tokens are restart-dependent and lack operator setup; SSE/session negotiation is incomplete. |
| GraphQL | React hook -> Yoga HTTP/subscription | Orphaned | Hooks are unused; no WebSocket server/auth wiring exists for subscriptions. |
| gRPC | React hook/bridge -> gRPC server | Orphaned/partial | UI hooks are unused; browser path is a JSON bridge, not real gRPC. Native server uses insecure transport and shared bearer auth. |
| Redis/BullMQ | Chat/message -> task queue -> worker | Partial/broken | Isolated live test passes, but runtime config ignores `REDIS_URL` auth/TLS, failed clients emit unhandled errors, availability becomes stale, and compose has no Redis persistence volume. |
| Temporal | Chat ingress -> workflow -> worker | Not wired | Normal message creation calls BullMQ/direct orchestration, never Temporal. CI proves a separate sample workflow, not the application path. |
| Durable run idempotency | Request -> ledger -> side effects | Broken | Duplicate detection reports an existing run but orchestration continues, so side effects can repeat. |
| Database evolution | Startup -> schema upgrade | Broken | `CREATE TABLE IF NOT EXISTS` cannot add columns to existing databases; there is no versioned migration executor, and a legacy swarm table is dropped on startup. |
| Authentication | Owner key -> REST/SSE | Partial | Timing-safe owner gate and path-bound SSE token are sound. A single bearer has every privilege; AuthGate treats non-401/403 server failures as authenticated. |
| Identity | UI -> identity API -> in-memory engine | Broken | Approve/reject omits required reviewer data; block route/body/response shapes disagree; state is in memory and “tamper-proof” records lack ownership signature verification. |
| NIP | UI -> negotiation engine -> peer/agent | Misleading | Arbitrary organizations receive wildcard scopes; trust is credited early; messages are canned rather than agent executions. |
| Swarm | Prompt -> swarm engine -> tasks | Broken | Errors become text recorded as completed tasks; prompt activation can bypass the experimental gate. |
| Autonomy/cron | Schedule -> script/HTTP/agent execution | False success | Jobs report successful execution without running the requested script, HTTP call or agent prompt. |
| Marketplace | Publish/install -> external marketplace | Misleading/local only | Publication is local DB insertion; caller controls author/rating; installed instructions lack signing/review. |
| Deployment | Compose -> app/Redis/Temporal/tunnel | Partial | Loopback, non-root, read-only and required-secret basics are good. Active container is 503; public Cloudflare/TLS/DNS/access policy is not live-proven. |
| Observability | Request/job/provider -> telemetry/alerts | Insufficient | No coherent metrics, tracing, request IDs, alerting or log rotation; mixed console/Pino output. |
| CI | Push -> checks -> release claim | Partial | Core tests are green, but CI misses connector UI, OAuth, Gmail, upload auth, real app Temporal dispatch, migrations, Redis crash and public tunnel behavior. |
| Documentation | README/reports -> runtime truth | Stale/contradictory | Existing readiness reports overstate Temporal/durability and include superseded findings without a verified-current marker. |

## Why the Reported Failures Occur

| User-visible symptom | Traceable cause | Proof |
|---|---|---|
| “Catalog sync failed: no configured credentials” | The old UI had no explicit save action and catalog sync did not use the unsaved field. The local fix adds **Save & connect** and transient sync credentials. | **VERIFIED LOCALLY** in the current branch. |
| “Invalid `max_output_tokens`, expected >=16, got 10” | Connection probe hard-coded 10 before the provider adapter serialized the request. It is now bounded at 64. | **VERIFIED LOCALLY** by an HTTP boundary test. |
| “No model configured” despite a visible model | Readiness and routing rely on enabled/default records instead of connected, credentialed and routable state; failed/disconnected records can retain roles. | **CONFIRMED** static contract inspection plus existing no-model E2E behavior. |
| Connector save/connect does not complete | Connector page treats already-parsed JSON as a `Response` object and calls `res.json()`. | **CONFIRMED** static UI/helper contract inspection. |
| OAuth/provider callback cannot finish | Owner middleware requires a bearer token external redirect requests do not have. | **CONFIRMED** route/middleware ordering inspection. |
| Messaging says test passed when it failed | API returns HTTP 200 with `ok:false`; UI checks only request completion. | **CONFIRMED** server/client contract inspection. |
| Connection to server lost / service unhealthy | Active container points Redis at unused port 63999 and disables gRPC; `/api/health` returns 503. | **VERIFIED LIVE** on `127.0.0.1:5000`. |
| Features appear available but do nothing | Several visible surfaces are local records, in-memory state, placeholders or orphan client APIs: skills Run, autonomy jobs, connector operations, A2A, GraphQL/gRPC hooks and marketplace. | **CONFIRMED** static boundary inspection. |

## Not Live-Inspected — Exact Reasons

These are not omissions hidden behind “passed.” They remain explicit gaps:

- **OpenAI/GPT-5.6 Sol:** **BLOCKED**. The exposed key was revoked; no fresh
  credential was used. The earlier project returned HTTP 403 for Sol model
  permission. No paid call was authorized for this audit.
- **Anthropic, Google and other paid providers:** **NOT VERIFIED**. No approved
  provider credentials or paid calls were available; several providers also
  fail closed because pricing is absent.
- **Slack, Gmail, GitHub and other SaaS connectors:** **NOT VERIFIED**. No test
  accounts/credentials were used. The GitHub integration test calls a
  nonexistent endpoint, so it cannot establish proof even when credentials
  exist.
- **External A2A and MCP interoperability:** **NOT VERIFIED**. No controlled
  peer/server was supplied, and static inspection already found protocol
  contract defects.
- **Generic outbound webhook delivery:** **NOT VERIFIED**. No approved receiver
  endpoint was supplied.
- **Public Cloudflare tunnel, DNS, TLS and access policy:** **NOT VERIFIED**.
  This requires external account/domain state and would change deployment.
- **Production Redis failure/recovery and Temporal worker termination:**
  **NOT VERIFIED**. The existing checks prove an isolated happy path, not
  crash recovery or normal app-to-Temporal dispatch.
- **Database upgrade from every historical schema:** **NOT VERIFIED**. No
  versioned migration framework or fixture matrix exists.
- **Docker recreation with retained state:** **NOT VERIFIED**. Existing live
  Docker proof does not recreate the user deployment volume end to end.
- **Marketplace, Identity, NIP and Autonomy external behavior:** **NOT
  VERIFIED** because no external implementation exists; current behavior is
  local, in-memory, heuristic or non-executing.
- **All 200+ individual REST mutations:** **STATIC ONLY** unless named above.
  Destructive, credentialed and external-side-effect routes were not invoked
  merely to inflate a test count.

## Existing Documentation Reused

- `CHANGELOG.md`, `WHY.md`, `PARKED.md`, ADRs and the prior closeout report were
  used as history, not as automatic proof of present behavior.
- `reports/policy-control-plane-readiness.md` and
  `reports/durable-execution-readiness.md` are **STALE** for launch decisions:
  they contain superseded findings and overstate Temporal/app durability.
- The current `PARKED.md` accurately identifies several residual items, but a
  parked label does not make a visible or security-sensitive path launch-safe.

## Required Repair Order

1. Restore a healthy launch runtime and make health checks reflect live Redis,
   gRPC and Temporal state.
2. Contain file transforms, remove Docker shell construction, govern package
   installation and close webhook authentication gaps.
3. Encrypt connector secrets and sanitize every model/connector response.
4. Repair connector UI response handling, file upload auth and Identity API
   contracts with browser tests.
5. Make model routability and role changes atomic; hide or support providers
   missing prices/capabilities; expose truthful actual-model telemetry.
6. Consolidate OAuth into one externally callable, signed, stateful flow; wire
   inbound messaging to durable conversations and orchestration.
7. Wire normal application work to Temporal or remove the production claim;
   unify Redis configuration, persistence, outage handling and idempotency.
8. Implement real versioned database migrations with upgrade/rollback fixtures.
9. Complete or remove orphan GraphQL/gRPC/MCP/A2A surfaces rather than showing
   capabilities that are not operational.
10. Wire real multimodal content, reasoning controls, SSE replay and catalog
    capability evidence.
11. Remove false-success behavior from Skills, Autonomy, Swarm, Messaging, NIP
    and Marketplace; keep incomplete surfaces behind the experimental gate.
12. Add targeted integration/browser/chaos tests and production telemetry for
    every repaired boundary, then repeat the full audit before a launch GO.

## Release Decision

**[CONFIRMED] NO-GO.** Core local Ollama chat and several security controls are
real, but Ultra Computer cannot truthfully be called platform-wide
production-ready until the critical broken/security paths above are repaired
and their real boundaries are tested. The immediate priority is correctness
and containment, not adding more visible features.
