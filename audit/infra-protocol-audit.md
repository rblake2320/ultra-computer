# Infrastructure & Protocol Audit — Ultra Computer
**Date:** April 11, 2026  
**Audited by:** Automated deep-read analysis of 18 server files  
**Scope:** `/home/user/workspace/ultra-computer/server/*.ts`

---

## Executive Summary

**The direct answer to your question: This is NOT production grade. It is a sophisticated, well-architected prototype.**

The infrastructure skeleton is genuinely impressive — the code is clean, the patterns are professional, the type definitions are thorough, and several components (circuit breaker, cron scheduler, identity engine, NIP engine) are of legitimately high quality. But critical gaps throughout prevent production deployment:

1. The task queue worker is an explicit stub — it processes nothing
2. Self-learning and skill auto-improvement engines are wired to nothing — they collect zero data
3. A2A protocol has a runtime crash bug (ESM/CJS import mixing)
4. MCP server has zero authentication — any caller can execute any registered tool
5. Every stateful component (A2A tasks, MCP connections, NIP sessions, messaging channels, identity records) is in-memory and lost on every restart — there is no persistence layer for protocol state
6. OAuth/connector integration is metadata only — no actual auth flows implemented
7. CLI tool safety blocklist is bypassable
8. Docker sandbox has incomplete shell injection protection

Think of it as a very good technical proof-of-concept: someone who understands the domain designed this carefully. But it has not been hardened, integrated end-to-end, or prepared for actual operational conditions.

---

## Rating Scale

| Rating | Meaning |
|--------|---------|
| **PRODUCTION** | Ready to deploy under real load |
| **FUNCTIONAL** | Works correctly but needs hardening before production |
| **STUB** | Looks real but is mostly or critically fake |
| **DEAD** | Cannot function as intended |

---

## File-by-File Analysis

---

### 1. `dockerSandbox.ts` — FUNCTIONAL

**What it does:** Manages Docker container sandboxes for code execution. Falls back to host execution if Docker is unavailable.

**Is it real or simulated?**  
Real. Uses `child_process.exec` and `execSync` for actual Docker commands. The availability check (`docker info`) is a real system call, and results are cached.

**Graceful degradation:**  
YES. `isDockerAvailable()` caches a `false` result and all subsequent calls skip Docker entirely, using the host process instead. This is well done.

**Memory leaks:**  
No significant leak. The idle container reaper is a `setInterval` registered only when Docker is confirmed available. `clearInterval` is called on SIGTERM/SIGINT. The `exit` handler uses `execSync` (blocking) for cleanup — acceptable for process exit but could hang.

**Security issues:**
- Command escaping is `command.replace(/'/g, "'\\''")` — this is the standard single-quote escape for POSIX shells but it only protects against single-quote injection. If the command contains shell metacharacters outside of single-quoted context, there is exposure. The image name is validated by regex before `docker pull`, which is correct.
- Capability dropping is done well: `--cap-drop=ALL --cap-add=NET_BIND_SERVICE --pids-limit=256 --security-opt=no-new-privileges`.

**Issues:**
- The `exit` handler calls `execSync` to stop containers — this will block the event loop at process exit and could timeout silently.
- Container image names accepted from caller context should be more strictly validated (registry prefix allowlist).

**Verdict: FUNCTIONAL** — Real Docker integration, real security hardening, graceful degradation. Not production because of the shell escaping gap and blocking exit handler.

---

### 2. `browserTool.ts` — FUNCTIONAL

**What it does:** Manages Playwright browser sessions for web automation.

**Is it real or simulated?**  
Real. Uses dynamic `import("playwright")` for actual browser control. Availability is cached after first check.

**Graceful degradation:**  
YES. Returns a clear error message if Playwright is not installed.

**Memory leaks:**  
**YES — significant.** Pages are tracked per session key in a Map but are never automatically cleaned up. There is no TTL, no reaper, no maximum page count. A long-running server accumulates orphaned page handles indefinitely. Each page holds browser resources. This will eventually exhaust browser memory or OS file descriptor limits.

**Security issues:**  
`browser_evaluate` passes arbitrary JavaScript strings directly to `page.evaluate()`. This is acceptable if the caller is trusted (same process), but if routes expose this endpoint publicly without authentication, it is remote code execution. The audit of `browserRoutes.ts` confirms it's exposed as a REST endpoint — whether it's auth-gated depends on the global middleware not visible in these files.

**Issues:**
- No page TTL/reaper (memory leak)
- No maximum concurrent sessions limit
- No URL scheme allowlist (can navigate to `file://`, `javascript:`, etc. — Playwright may block some but not all)

**Verdict: FUNCTIONAL** — Real browser automation, but the page leak is a material operational risk.

---

### 3. `browserRoutes.ts` — FUNCTIONAL

**What it does:** REST API wrapper for browser tool operations.

**Is it real or simulated?**  
Real routing code. Proper request validation.

**Issues:**  
Line 17 (approximately): `getBrowserSessionInfo` can return `null` but the route calls `info.url` without a null check. This is a potential crash on the happy path if a session ID is provided that exists in the Map but whose page was closed externally.

**Verdict: FUNCTIONAL** — Clean wrapper with a minor null-dereference risk.

---

### 4. `imageGenTool.ts` — FUNCTIONAL

**What it does:** Calls OpenAI image generation API and downloads generated images.

**Is it real or simulated?**  
Real. Makes actual `openai.images.generate()` calls. Downloads images via native Node.js `http`/`https`.

**Issues:**
- Redirect handling has no maximum hop limit. A malicious redirect chain (A → B → A) causes infinite recursion until the call stack overflows. Should cap redirects at 5-10.
- No API key hardcoded (correct — reads from environment).

**Verdict: FUNCTIONAL** — Real image generation with a redirect recursion bug.

---

### 5. `connectorRegistry.ts` — STUB for OAuth

**What it does:** Advertises "10+ built-in connectors" (Gmail, Slack, GitHub, etc.) and provides connection management.

**Is it real or simulated?**  
**Partially a stub.** The `BUILT_IN_CONNECTORS` array is metadata only — client IDs, scopes, OAuth URLs. None of the OAuth flow is implemented here. There is no:
- Redirect URI handling
- Authorization code exchange
- Token refresh logic
- Token storage/retrieval for OAuth tokens

`connectWithApiKey()` is real — it writes the key to storage. `callMCPTool()` makes a real `fetch` to an MCP server URL. But the high-value integrations (Gmail, Slack, GitHub, etc.) all require OAuth and none of that is in this file. The claim that you can "connect Gmail" means you can register a connector record, not that email will actually flow.

**Verdict: STUB** — API key connectors work; OAuth connectors are metadata only.

---

### 6. `cronScheduler.ts` — FUNCTIONAL

**What it does:** Full cron expression parser and job scheduler with persistence.

**Is it real or simulated?**  
Real, from scratch. Supports wildcards, ranges, steps, lists. Handles Sunday as both 0 and 7. Misses-run detection on startup. Auto-disables after configurable consecutive failures.

**Memory leaks:**  
None. The `firedMinutes` Map is pruned each tick (entries older than the current minute are removed).

**Graceful degradation:**  
N/A — no external dependencies.

**Issues:**
- No maximum concurrent job execution limit. If many jobs are scheduled at the same minute and each takes longer than the 30-second tick interval, jobs will queue up. The `_runningJobs` Set prevents re-entry for the same job, but does not limit total concurrent jobs.
- Persistence to `data/cron-jobs.json` is a single-file write. No atomic write (tmp+rename), so a crash during write corrupts the schedule.

**Verdict: FUNCTIONAL** — Solid scheduler. Non-atomic persistence and no concurrency cap are the gaps.

---

### 7. `taskQueue.ts` — STUB (worker is a placeholder)

**What it does:** Declares a BullMQ-based task queue for background job processing.

**Is it real or simulated?**  
**The queue infrastructure is real. The worker is an explicit stub.** The BullMQ setup is genuine — queue, worker, and events connections are all initialized correctly. Redis graceful degradation is implemented (sets `available = false` if Redis is unreachable, returns synthetic task IDs).

**Critical flaw:**  
`processTask()` — the function that actually processes jobs — explicitly logs `"Real orchestrator integration pending"` and returns `{ status: "stub_complete" }`. Every job enqueued is immediately "completed" with fake data. The retry/delay/priority infrastructure is all wired up and does nothing useful.

**Memory:**  
Three Redis connections (queue, worker, events) are properly closed on shutdown — no leak.

**Verdict: STUB** — This is the most critical stub in the codebase. Any background task processing feature built on top of this queue does nothing.

---

### 8. `taskCheckpointing.ts` — FUNCTIONAL

**What it does:** Saves and resumes task execution state to the filesystem.

**Is it real or simulated?**  
Real. Pure filesystem operations on `data/checkpoints/{taskId}.json`.

**Memory leaks:**  
None. `startCheckpointHeartbeats()` returns a timer correctly `.unref()`'d.

**Security issues:**  
`taskId` is used directly in a file path without sanitization. A `taskId` containing `../` sequences can escape the checkpoint directory. Example: `taskId = "../../etc/cron.d/evil"` would write a file to `/etc/cron.d/evil` if the server runs as root. At minimum, the taskId should be validated to be alphanumeric + hyphens only.

**Verdict: FUNCTIONAL** — Works correctly. The path traversal risk is real but requires a malformed task ID to reach.

---

### 9. `processWatchdog.ts` — FUNCTIONAL

**What it does:** Monitors process health — event loop lag, memory, heartbeat, crash recovery.

**Is it real or simulated?**  
Real. Uses recursive `setTimeout(0)` for lag measurement, writes state to `data/watchdog-state.json`, handles `uncaughtException` and `unhandledRejection`.

**Memory leaks:**  
None. The recursive `setTimeout` chain is correct. Both timers are properly `.unref()`'d. There is one edge case: if the watchdog's own lag measurement fires after `shutdown()` has been called, it schedules one more measurement before detecting the shutdown flag. This is harmless.

**Issues:**
- `process.exit(1)` on `unhandledRejection` is aggressive — in production, unhandled rejections should log and optionally restart, not always hard-exit. This can cause unexpected process deaths on transient promise errors elsewhere in the codebase.
- Restart count tracking resets only on explicit `resetRestartCount()` call. If the process crashes and restarts via an external supervisor (PM2, systemd), the count correctly persists in the JSON file. This is actually well-thought-out.

**Verdict: FUNCTIONAL** — Good watchdog. The aggressive `process.exit` on unhandled rejections is a policy choice worth revisiting.

---

### 10. `circuitBreaker.ts` — PRODUCTION

**What it does:** Three-state circuit breaker (CLOSED/OPEN/HALF_OPEN) for external service calls.

**Is it real or simulated?**  
Real. Textbook implementation with sliding window failure tracking, ring buffer event log, concurrency gate in HALF_OPEN, manual trip/reset. Pre-configured for openai, anthropic, ollama, google, webhook.

**Memory leaks:**  
None. `failureTimestamps` array is pruned by `_pruneOldFailures()` on each call, bounded by the time window. The ring buffer has a fixed max size.

**Security issues:**  
None relevant to this component.

**Issues:**  
None significant. The half-open concurrency gate is correct. The sliding window is correctly scoped by time, not count. This is genuinely production-quality code.

**Verdict: PRODUCTION** — The one file in the codebase that is unambiguously ready for production.

---

### 11. `selfLearning.ts` — FUNCTIONAL (but disconnected)

**What it does:** Analyzes agent execution history to derive performance rules and model selection guidance.

**Is it real or simulated?**  
The analytics logic is real — it reads execution logs, computes model performance scores, clusters failure types, derives rules. Atomic file writes (tmp + rename) prevent corruption.

**Critical gap:**  
`logExecution()` — the method that feeds data into this engine — is **never called anywhere in the codebase**. The engine will always operate on empty or stale data. It runs on a timer, fires, and produces default/empty analytics because nothing has ever logged to it.

**Memory leaks:**  
None. Timer is `.unref()`'d.

**Verdict: FUNCTIONAL (disconnected)** — The code works, but it is effectively disabled because no other component calls into it. Fix: add `logExecution()` calls in the orchestrator after each tool/model invocation.

---

### 12. `skillAutoImprove.ts` — FUNCTIONAL (but disconnected)

**What it does:** Tracks skill execution to generate improvement suggestions and auto-apply optimizations.

**Is it real or simulated?**  
The analysis logic is real. Generates 6 types of suggestions. Auto-applies `add_trigger_keywords` and `optimize_context` suggestions.

**Critical gap:**  
Same as selfLearning — `recordSkillExecution()` is never called from the orchestrator. The engine runs in a vacuum.

**Memory leak:**  
`coActivationLog` is a `Map<string, string[]>` that grows unboundedly. Every unique skill-pair combination adds an entry that never expires. On a long-running server with many skill combinations, this will grow until process memory is exhausted. The fix is a max-size eviction policy or TTL.

**Verdict: FUNCTIONAL (disconnected)** — Same diagnosis as selfLearning. The unbounded coActivationLog is an additional production risk.

---

### 13. `a2aProtocol.ts` — FUNCTIONAL with a runtime crash bug

**What it does:** Implements the Agent-to-Agent (A2A) v0.3.0 protocol — agent card publication, message send/stream, task management.

**Is it real or simulated?**  
Real implementation. Full SSE streaming via a promise-queue pattern, real task lifecycle management, proper agent discovery.

**Runtime crash bug:**  
`handleMessageSend` uses `require("./orchestrator.js")` inside an async function in what appears to be an ESM module (imports at top use `import` syntax). Mixing `require()` inside an ESM module at runtime will throw `ReferenceError: require is not defined` in Node.js ESM mode, crashing the handler on every inbound A2A message. This is a critical bug that makes the entire A2A server inoperable when deployed with `"type": "module"` in `package.json`.

**Persistence:**  
None. `taskRegistry` and `agentRegistry` are in-memory Maps. All tasks and registered agents are lost on restart. An A2A client cannot resume a task after a server restart.

**Streaming:**  
The promise-queue pattern for SSE could deadlock if the completion event fires before a consumer has called `next()` on the async generator. In practice this is unlikely but not impossible under load.

**Verdict: FUNCTIONAL** — Protocol implementation is real but the ESM/CJS mixing bug will crash message handling at runtime. This must be fixed before deployment.

---

### 14. `mcpProtocol.ts` — FUNCTIONAL (no auth)

**What it does:** Full MCP 2025-06-18 server and client — tools, resources, prompts.

**Is it real or simulated?**  
Real. Full MCP handshake, capabilities negotiation, tool execution, resource reading (5 URI schemes), prompt retrieval. The client includes proper 30-second timeouts with AbortController.

**Security issues:**  
**There is zero authentication on the MCP server.** Any client that can reach the server's HTTP endpoint can call `tools/call` and execute any registered tool. Since registered tools include `read_file`, `write_file`, `execute_command`, and others, this is an unauthenticated remote code execution surface. This is the most severe security issue in the codebase.

**Persistence:**  
`serverRegistry` (connected MCP servers) is in-memory — connections lost on restart.

**File system access:**  
`resources/read` with `file://` scheme calls `executeTool("read_file")` which enforces sandbox restrictions. This is correct.

**Verdict: FUNCTIONAL** — The protocol implementation is solid, but the absence of any authentication is a production blocker.

---

### 15. `cliToolEngine.ts` — FUNCTIONAL (security gaps)

**What it does:** Executes CLI commands, scripts, pipelines, code interpreter sessions, file transforms, and manages webhook receivers.

**Is it real or simulated?**  
Real. Uses `spawn` with timeout+SIGKILL. Actually installs pip/npm packages from comment headers. Actually executes scripts. File transforms try primary tool then fallback (pandoc → python-markdown, convert → ffmpeg, etc.).

**Security issues:**
- The blocklist (`rm -rf /`, `:(){ :|:& };:`, etc.) has 11 patterns but is bypassable. Example: `rm -rf /tmp/../../../../etc` — path traversal through the `/` check. `sudo` is blocked but `su` is not. `eval` is not blocked. The correct model for a system like this is an allowlist, not a blocklist. Without an explicit allowlist of permitted commands/interpreters, any creative variation of a dangerous command may slip through.
- `executeCodeInterpreter` auto-installs packages from comment headers (`# requires: requests`). An attacker who controls script content can install arbitrary PyPI packages.

**Memory leaks:**  
`runningProcesses` Map is cleaned up on process close and error events. Webhook history is capped at 100 per webhook. No significant leaks.

**Verdict: FUNCTIONAL** — Real command execution engine. The blocklist-only safety model is insufficient for production; requires an allowlist approach.

---

### 16. `messagingHub.ts` — FUNCTIONAL (delivery is two-phase/incomplete)

**What it does:** Omni-channel messaging engine — Slack, Gmail, webhook channels with subscription management, retry logic, and notification formatting.

**Is it real or simulated?**  
**Partially real — there is a critical architectural gap.**

The Slack and Gmail adapters produce correctly-formatted payloads (Slack Block Kit, HTML email). The webhook adapter makes **real HTTP POST calls** with proper timeout handling (10s) and retry logic (exponential backoff). But for Slack and Gmail, `send()` only populates `payload.metadata.slackPayload` and `payload.metadata.gmailPayload` — it does **not** make the actual API call. The docstring says "Actual HTTP delivery is handled by the routes layer via the Slack/Gmail connector." This means the `messagingHub` as a standalone component cannot deliver Slack or Gmail messages. It depends on routes that consume the metadata and then call the connector registry — which, as noted above, has no OAuth implementation.

So the real delivery chain is: `messagingHub.send()` → message formatted → metadata stored → delivery record says "sent" with a `slack-pending-{uuid}` ID → **routes layer expected to pick this up and call an actual API** → but that routes layer is not confirmed to exist and the connectors have no OAuth tokens.

**Webhook delivery is real end-to-end.** Slack and Gmail are formatted-but-not-delivered.

**Architecture quality:**  
The internal design is excellent. MessageQueue with exponential backoff retry, SubscriptionManager with dual-index Maps, EventEmitter bridge for SSE — all well-implemented. The inbound history is capped at 500. The delivery record Map grows unboundedly (DeliveryRecords are never evicted even after `sent` or `failed`), which is a slow memory leak on high-volume messaging.

**Verdict: FUNCTIONAL** — Webhook delivery works end-to-end. Slack/Gmail are formatted correctly but rely on a connector layer that has no OAuth implementation, so they cannot actually deliver messages.

---

### 17. `nipEngine.ts` — FUNCTIONAL

**What it does:** NLP Instruction Protocol (NIP) engine — bidirectional AI-to-AI session protocol with inline security monitoring.

**Is it real or simulated?**  
Real. Full session lifecycle (negotiating → active → paused → completed/terminated/locked). Capability exchange generates real natural language messages. The inline monitor agent is real code (not a stub) running 35+ regex injection patterns, scope drift checks, and rate limiting.

**Injection detection quality:**  
The 35+ regex patterns cover real threat categories — role override, persona hijacking, system prompt injection, data exfiltration, encoding tricks, jailbreak patterns, HTML injection. The rate limit sliding window correctly prunes old timestamps. Scope drift check does both keyword blocklist and soft keyword overlap analysis. This is genuine security infrastructure.

**Issues:**
- All state is in-memory. Sessions, reports, trusted parties, alerts — all lost on restart.
- `trustedPartyStore` is queried by iterating all values with `Array.from(...).find()` — O(n) per lookup. Fine for small registries, not production-scale.
- The `rateLimitWindows` Map grows with each session and is never cleaned up after session termination. On a high-volume server running thousands of sessions, these accumulate indefinitely.
- Capability negotiation generates pre-scripted messages rather than actual LLM calls. This is appropriate for a protocol layer (deterministic behavior is correct here), but it means the "AI to AI conversation" in the negotiation phase is templated text, not actual model outputs.
- No persistence of trusted party registry — on every restart, all registered organizations must be re-registered.

**Verdict: FUNCTIONAL** — The protocol engine is real and well-designed. The same in-memory-only pattern persists from the other protocol files.

---

### 18. `identityEngine.ts` — FUNCTIONAL

**What it does:** Cryptographic identity management — SHA-256 identity generation, trust scoring, verification tiers, block lists, moderation, audit trail.

**Is it real or simulated?**  
Real cryptography. Uses Node.js `crypto.randomBytes(64)` + `Date.now()` + `process.hrtime.bigint()` + `uuid` + `process.pid` combined into a SHA-256 hash. The fingerprint is a second-pass SHA-256 of the cryptoId, truncated to 16 hex characters. This is genuine non-forgeable identity generation.

**Trust scoring:**  
Real formula with tier base, age bonus, completion bonus, alert penalty, report penalty, community bonus. All clamped 0-100.

**Verification workflow:**  
The request/approve/reject workflow is real. But the actual verification (checking an email, validating a domain, verifying a government ID) is not implemented — `requestVerification()` accepts any string as evidence and creates a pending request. A human admin must manually approve it via `approveVerification()`. There is no automated verification logic.

**Issues:**
- All state is in-memory. Every identity, block record, verification request, and audit entry is lost on restart. On a 1,000-identity deployment, a process crash loses all identity data permanently with no recovery path.
- `_isDisplayNameTaken()` iterates the entire identity store — O(n). For a large directory this is slow.
- `getBlockList()` also iterates the entire block store — O(n). No secondary index on `blockerId`.
- `auditStore` grows unboundedly — there is no TTL, archival, or size limit on audit entries. Every action on every identity adds an entry forever.
- The `setMaxListeners(500)` in the constructor is a hardcoded limit. With many SSE subscribers, this may still generate MaxListenersExceeded warnings.
- `keyMaterial` (the raw 128-character hex of the entropy bytes) is stored in the identity record. The docstring says "never exposed externally" — but `getIdentity()` returns the full internal record including `keyMaterial`. Any code path that calls `getIdentity()` and forwards the result to an API response leaks the key material. Should be stripped at the data access layer, not just at `getPublicView()`.

**Verdict: FUNCTIONAL** — The cryptographic foundation is solid. The in-memory-only pattern, O(n) lookups, unbounded audit store, and keyMaterial exposure risk are production blockers.

---

## Cross-Cutting Issues

### 1. No Persistence Layer for Protocol State
Every stateful subsystem (A2A, MCP, NIP, identity, messaging channels, NIP trusted parties) stores state in in-memory Maps. A process restart — from a crash, deploy, or OOM kill — destroys:
- All active A2A agent registrations and tasks
- All MCP server connections
- All NIP sessions, trusted parties, reports, and alerts
- All registered messaging channels and subscriptions
- All cryptographic identities, block records, verification requests, and audit entries

The `storage.ts` and `taskCheckpointing.ts` files exist and write to disk, but none of the protocol engines use them for their own state. This is not a small gap — it means the system cannot survive a restart without losing everything.

### 2. The Task Queue Processes Nothing
`taskQueue.ts` worker is an explicit stub. Any feature that enqueues background work (long-running agent tasks, scheduled jobs executed via the queue, retry workflows) silently completes with fake success. This is the most operationally dangerous issue — failures will appear as successes.

### 3. Learning Engines Are Islands
`selfLearning.ts` and `skillAutoImprove.ts` both have real analytics logic but are never called from the orchestrator. Two non-trivial files produce no value as deployed.

### 4. Authentication Surface
- MCP server: no authentication
- NIP sessions require organization registration but no cryptographic proof of identity is validated on the wire (only checked against the in-memory store)
- CLI tool execution is controlled by a bypassable blocklist
- Browser automation endpoints accessible to anyone who can reach the routes

### 5. Memory Accumulation
Multiple Maps grow without bounds:
- `messagingHub`: delivery records (never evicted after settling)
- `nipEngine`: `rateLimitWindows` (never cleaned after session termination)
- `identityEngine`: `auditStore` (grows forever)
- `skillAutoImprove`: `coActivationLog` (grows forever)
- `browserTool`: page Map (no TTL)

On a long-running server, these will collectively cause OOM conditions.

---

## Remediation Priority

### P0 — Must fix before any real workload

| Issue | File | Fix |
|-------|------|-----|
| Task queue worker is a stub | `taskQueue.ts` | Implement `processTask()` with real orchestrator call |
| A2A ESM/CJS import crash | `a2aProtocol.ts` | Replace `require("./orchestrator.js")` with `await import("./orchestrator.js")` |
| MCP server has no authentication | `mcpProtocol.ts` | Add bearer token or API key validation to all incoming requests |
| No persistence for protocol state | all protocol files | Wire sessionStore/identityStore etc. to storage backend |

### P1 — Fix before production traffic

| Issue | File | Fix |
|-------|------|-----|
| selfLearning never receives data | `selfLearning.ts` | Call `logExecution()` from orchestrator after each run |
| skillAutoImprove never receives data | `skillAutoImprove.ts` | Call `recordSkillExecution()` from skill dispatcher |
| coActivationLog unbounded growth | `skillAutoImprove.ts` | Add max-size eviction (e.g. LRU with cap of 10,000 entries) |
| auditStore unbounded growth | `identityEngine.ts` | Add rolling archive (keep 90 days, write older entries to disk) |
| rateLimitWindows leak | `nipEngine.ts` | Clean up on session termination |
| Browser page leak | `browserTool.ts` | Add page TTL reaper (idle > 30 min → close) |
| keyMaterial in `getIdentity()` return | `identityEngine.ts` | Strip from internal accessor or add explicit warning |
| Path traversal in taskId | `taskCheckpointing.ts` | Sanitize taskId with `/^[a-zA-Z0-9_-]+$/` check |

### P2 — Hardening before scale

| Issue | File | Fix |
|-------|------|-----|
| CLI blocklist bypassable | `cliToolEngine.ts` | Replace with allowlist of permitted interpreters |
| Redirect recursion in image download | `imageGenTool.ts` | Cap at 10 hops |
| Docker shell injection incomplete | `dockerSandbox.ts` | Use array-based spawn instead of shell string |
| Cron persistence non-atomic | `cronScheduler.ts` | Add tmp+rename atomic write |
| OAuth connectors unimplemented | `connectorRegistry.ts` | Implement OAuth flow or clearly document as not available |
| O(n) identity lookups | `identityEngine.ts` | Add secondary index Map for displayName, fingerprint, blockerId |

---

## Honest Bottom Line

| Component | Verdict | Reason |
|-----------|---------|--------|
| Circuit Breaker | **PRODUCTION** | Textbook implementation, no gaps |
| Cron Scheduler | **FUNCTIONAL** | Real and solid; non-atomic write is the main gap |
| Task Checkpointing | **FUNCTIONAL** | Works; path traversal risk |
| Process Watchdog | **FUNCTIONAL** | Real health monitoring; aggressive exit policy |
| Docker Sandbox | **FUNCTIONAL** | Real Docker integration; incomplete shell escaping |
| Browser Tool | **FUNCTIONAL** | Real Playwright; page leak is serious |
| Image Gen Tool | **FUNCTIONAL** | Real API calls; redirect recursion bug |
| CLI Tool Engine | **FUNCTIONAL** | Real execution; blocklist-only security is weak |
| NIP Engine | **FUNCTIONAL** | Genuine protocol; in-memory-only state |
| Identity Engine | **FUNCTIONAL** | Real cryptography; in-memory-only state |
| Messaging Hub | **FUNCTIONAL** | Webhook real; Slack/Gmail formatted-not-delivered |
| A2A Protocol | **FUNCTIONAL** | Real protocol; ESM/CJS crash bug |
| MCP Protocol | **FUNCTIONAL** | Real protocol; zero auth is critical gap |
| Self-Learning | **FUNCTIONAL (disconnected)** | Works but receives no data |
| Skill Auto-Improve | **FUNCTIONAL (disconnected)** | Works but receives no data |
| Task Queue | **STUB** | Worker explicitly does nothing |
| Connector Registry | **STUB** | OAuth connectors are metadata only |

**Is this production-grade?**  
No. It is a well-designed prototype that demonstrates the right architecture — the decisions about what to build are good, the interfaces are clean, the code style is professional. But a production system needs the worker to actually work, the state to survive restarts, the auth to be real, and the security model to be hardened. Right now, you have the shape of a production system without the substance.

The fastest path to production viability:
1. Fix the A2A import crash (30 minutes)
2. Implement the task queue worker (connects to the real orchestrator)
3. Add auth to the MCP server
4. Choose a persistence store (Redis or PostgreSQL) and wire the protocol engines to it
5. Plug selfLearning and skillAutoImprove into the orchestrator

Everything else can be hardened incrementally.
