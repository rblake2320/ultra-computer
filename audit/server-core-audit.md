# Ultra Computer — Server Core Audit
**Auditor:** Automated production-readiness review  
**Scope:** 12 core server files  
**Purpose:** Determine whether the codebase would survive real users — not whether it looks polished.

---

## Summary Table

| File | Rating | One-liner |
|------|--------|-----------|
| modelRouter.ts | **FUNCTIONAL** | Real multi-provider routing, works but has silent failure modes |
| modelConnections.ts | **FUNCTIONAL** | Real OAuth + credential wiring; circular import and no token refresh |
| orchestrator.ts | **FUNCTIONAL** | Legitimate agent/DAG engine; DAG deadlock and IPC file accumulation are production landmines |
| tools.ts | **FUNCTIONAL** | Real tool execution with real SSRF protection; `currentSessionId` global is a concurrency disaster |
| storage.ts | **FUNCTIONAL** | Genuine SQLite/Drizzle implementation; sync reads in hot paths, no WAL mode, marketplace counters are race-prone |
| memoryManager.ts | **FUNCTIONAL** | Real LLM-driven extraction; dedup runs O(n²) per insert, silences all errors |
| memoryUpgrades.ts | **FUNCTIONAL** | Solid pure-function TF-IDF/Jaccard math; "semantic" matchType is reserved/unimplemented |
| skillSystem.ts | **FUNCTIONAL** | Works but skill matching is naive keyword bag-of-words, IDs generated with Math.random() |
| skillChaining.ts | **FUNCTIONAL** | Clean pipeline wiring; chain detection is rigid phrase matching, chains bypass quality checks |
| contextCompactor.ts | **FUNCTIONAL** | Three-phase compression is real; Phase 3 (skeleton) can destroy task context in long agent runs |
| errorRecovery.ts | **FUNCTIONAL** | Solid retry + fallback; fallback fires only once, no jitter, rate-limit waits are fixed |
| modelSpeedRouter.ts | **FUNCTIONAL** | Pure scoring logic is correct; keyword list is simplistic, latency estimates are fabricated |

**Overall verdict: FUNCTIONAL — not PRODUCTION.**  
Every file does real work. None are stubs or fakes. But collectively they have about 25–30 specific issues that will cause data loss, race conditions, or silent failures under real concurrent load.

---

## File-by-File Findings

---

### 1. `modelRouter.ts`
**Rating: FUNCTIONAL**

**What it does:** Routes chat requests to OpenAI, Anthropic, Google Gemini, or any OpenAI-compat endpoint. Dispatches to the right SDK. Streaming and non-streaming variants are both real.

**Real issues:**

1. **Empty API key is silently passed.** `makeAnthropicClient` does `apiKey: creds.apiKey || ""`. An empty string will get a 401 from Anthropic. There is no guard before the call — the error surfaces as an unhandled API exception. Same for `makeOpenAIClient`: `apiKey: creds.apiKey || (model.provider === "ollama" ? "ollama" : "none")`. `"none"` is passed as a literal API key to non-Ollama providers.

2. **No retry or rate-limit handling at this layer.** `chatOpenAICompat` and `chatAnthropic` are bare `await` calls. A single transient 503 explodes the entire agent run. `errorRecovery.ts` wraps calls at the orchestrator level, but the router itself offers zero resilience.

3. **`selectModelForTask` picks `withCap[0]` — whatever comes first in DB order.** There is no staleness check (is the model's connection healthy?), no latency preference, and no round-robin. All traffic concentrates on a single model until the user manually reorders.

4. **Google streaming:** `streamGoogle` creates a new `GoogleGenerativeAI` instance on every token stream. Dynamic `import("@google/generative-ai")` on every call has a cold-start cost. No instance caching.

5. **`testModelConnection` sends a live API call on every connection test.** If called in a UI polling loop, this generates real API costs. No debouncing, no caching of recent test results.

6. **`messages` parameter has no length or content validation.** An empty array passed to `chatAnthropic` will produce a 400 from Anthropic's API (requires at least one message). The error will propagate as an unhandled exception.

---

### 2. `modelConnections.ts`
**Rating: FUNCTIONAL**

**What it does:** Manages credential resolution for 15+ providers, handles OAuth flows, 1-click model setup, and env var discovery.

**Real issues:**

1. **Circular import with modelRouter.ts.** `testConnection()` (line 613) does `await import("./modelRouter.js")` at runtime to avoid a circular dependency at module load time. This is a code smell masking a design problem. Dynamic imports in hot paths add latency and can cause difficult-to-debug initialization ordering issues.

2. **OAuth access token is never refreshed.** `resolveCredentials` returns the stored `access_token` and flags `isValid: false` if expired — but there is no refresh logic anywhere in this file. If the token has expired, the model simply appears unconfigured. Users have no automated path to re-authenticate.

3. **`connectModel` updates credentials in DB before testing.** If the user enters a wrong API key, the bad key is written to the database first (line 562), then the test fires. If the process crashes between those two operations, bad credentials are persisted. The update should be conditional on the test passing.

4. **`pendingModelOAuthStates` is an in-memory Map.** On server restart (or any process bounce), all in-flight OAuth state tokens are lost. Any user mid-OAuth-flow gets an "Invalid or expired OAuth state" error with no recovery path.

5. **`discoverEnvVars` leaks the first 6 and last 4 characters of every API key** in the response body. For a `sk-ant-api03-XXXXXXXXXXXXXXXXXXXX` key, that is enough to fingerprint the key family and narrow an attack. In a single-user local tool this is acceptable; in any multi-tenant or shared deployment it is a security issue.

6. **`createFromPreset` casts the entire model object with `as any`** on line 681. Type safety is completely bypassed at the create-model boundary.

---

### 3. `orchestrator.ts`
**Rating: FUNCTIONAL**

**What it does:** Full orchestration engine — parses user intent into a DAG, spawns worker agents, executes tools in a loop, synthesizes results, writes to memory. This is the most complex file and the most real.

**Real issues:**

1. **DAG deadlock: the scheduler busy-waits with 200ms polling.** Lines 308–313: if `pending.size > 0` and `ready.length === 0` and `running.size > 0`, it `setTimeout(200ms)` and loops. If all running tasks depend on each other (circular DAG from a bad LLM plan), this loops 20 times (4 seconds of CPU spin) and then silently breaks — leaving tasks in `pending` forever. There is no deadlock detection, no user-facing error, no DB cleanup.

2. **`taskMap` dependency resolution has a silent bug.** Line 141: `const resolvedDeps = pt.dependsOn.map(d => taskMap.get(d) || d).filter(Boolean)`. If the LLM returns a `dependsOn` referencing a task ID that hasn't been created yet (because tasks are created in order), `taskMap.get(d)` returns `undefined` and `|| d` falls back to the raw plan ID — not the DB UUID. The task will be stored with a non-existent dependency, causing the DAG executor to treat it as having no unmet deps, breaking execution order.

3. **IPC files are never cleaned up.** Every agent run writes to `ipc/<agentRunId>.json`. There is no cleanup job anywhere. A long-running server will accumulate unbounded IPC files. With 10 users, each having 10 conversations with 5 tasks, that is 500 files — not critical. At scale, it becomes a disk-leak.

4. **`currentSessionId` in tools.ts is a module-level global mutated by `setCurrentSession`.** In the orchestrator loop, line 509 calls `setCurrentSession(agentRunId)` before `executeTool`. But if two agent runs execute tools concurrently (which they do — `Promise.all` spawns parallel tasks), each `setCurrentSession` call will overwrite the global for all concurrent agents. A tool called in agent run A can end up executing inside agent run B's Docker container. This is a genuine race condition with security implications.

5. **`synthesizeResults` is skipped when there is exactly 1 result** (line 729). For single-task requests, the raw worker output is returned verbatim with no formatting, no memory context injection, and no skill application. This is inconsistent with multi-task behavior.

6. **Empty `catch {}` at line 150** swallows all `modelSpeedRouter` failures without logging the error. The fallback (`selectModelForTask`) runs silently. Users get zero visibility into routing failures.

7. **`buildWorkerSystemPrompt` serializes the full tool schemas for every single LLM call.** For 10+ tools with detailed schemas, this adds ~2,000 characters (500 tokens) to every worker system prompt. At scale, this is 500 wasted tokens × every LLM iteration × every task — measurable cost.

---

### 4. `tools.ts`
**Rating: FUNCTIONAL**

**What it does:** Implements bash, file I/O, HTTP fetch, calculator, web search, and delegates to browser/image tools. Has real SSRF protection, path-traversal prevention, and Docker isolation fallback.

**Real issues:**

1. **`currentSessionId` is a module-level mutable global.** `setCurrentSession(agentRunId)` sets a single string that is immediately overwritten by concurrent tasks (see orchestrator.ts issue #4). Two parallel agent runs call `setCurrentSession` nanoseconds apart; both read the same container session ID. The Docker sandbox isolation that the file promises in its docstring **does not work under concurrent load**.

2. **`executeBashHost` sets `HOME: SANDBOX_DIR` but otherwise runs with the full server process's environment** (`env: { ...process.env, ... }`). This means agent bash commands can read `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, and every other secret in the server's env. If Docker is unavailable (the fallback), there is essentially no credential isolation.

3. **`executeCalculator` uses `new Function(...)` to eval expressions.** The sanitization is a character-level regex — not an AST parser. The sanitization logic: strip `Math.*` names, then check if any `[a-zA-Z_$]` remain. A crafted input like `${7*7}` or a Unicode look-alike may bypass the regex. `"use strict"` inside the function helps, but this is not a hardened evaluator.

4. **`executeSearchWeb` parses DuckDuckGo HTML with regex** — specifically line 495: `/<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g`. DuckDuckGo has changed their HTML structure several times. Any markup change silently returns 0 results with `success: true`. Users see "No results found" with no indication that parsing failed.

5. **`read_file` returns `success: true` for files > 512KB** with a truncation notice. The tool schema says it "returns the file text." The actual return is `"[File too large: X KB. Showing first 10,000 chars]\n\n..."`. The LLM processing this response has no standardized way to know the file was truncated unless it reads the notice text.

6. **`executeWriteFile` calls `fs.writeFileSync`** — synchronous disk I/O in a Node.js server. Under concurrent agent runs each writing large files, this blocks the event loop.

---

### 5. `storage.ts`
**Rating: FUNCTIONAL**

**What it does:** SQLite via Drizzle ORM with better-sqlite3. All tables created inline at startup. Full CRUD for models, conversations, messages, tasks, agent runs, skills, memory, scripts, marketplace.

**Real issues:**

1. **SQLite is opened with zero configuration.** No WAL mode, no `PRAGMA journal_mode = WAL`, no `PRAGMA synchronous = NORMAL`, no `PRAGMA cache_size`. Default journal mode is DELETE, which is write-serialized and slower. Under multi-task concurrent writes from parallel agent runs, this becomes a bottleneck. better-sqlite3 is synchronous — every DB call blocks the Node.js thread.

2. **`incrementSkillUsage`, `incrementSkillScriptUsage`, `incrementMarketplaceInstallCount`, `incrementMarketplaceForkCount`, `updateMarketplaceRating` all do read-then-write in two separate statements with no transaction.** Under concurrent requests, two agents incrementing the same counter simultaneously will produce a lost update. Example: both read `usageCount = 5`, both write `usageCount = 6` — one increment is lost. SQLite `UPDATE ... SET count = count + 1` would be atomic; the current pattern is not.

3. **`searchMemories` and `searchSkillScripts` fetch ALL records into memory then filter in JavaScript** (lines 413, 440–447). With 200 memories (the hard cap is 200 anyway) this is fine. But the marketplace search (`getMarketplaceSkills`) also fetches all rows then filters and sorts in JS. If the marketplace grows to thousands of skills, this is a full-table scan on every search.

4. **`deleteConversation` has no cascade.** Messages, tasks, and agent runs associated with a deleted conversation are orphaned in the DB. No foreign keys are defined, no delete cascade. This is SQLite-specific: the schema creates tables with no FK constraints. Orphaned rows accumulate indefinitely.

5. **The entire schema is created inline in the module body** with `sqlite.exec(...)` at import time. If the schema SQL is invalid (typo, syntax error), the entire server process crashes at startup with no graceful error message.

6. **API keys are stored in plaintext in the `models` table.** `api_key TEXT`. No encryption at rest. Anyone with read access to `ultra_computer.db` gets all configured credentials.

---

### 6. `memoryManager.ts`
**Rating: FUNCTIONAL**

**What it does:** Uses an LLM to extract durable facts from each conversation turn, scores them for importance, runs deduplication, and provides TF-IDF recall for future turns.

**Real issues:**

1. **Entire `extractAndStore` is wrapped in a bare `catch {}` that silences everything** (line 110). Memory extraction failing for any reason — LLM error, JSON parse error, DB error — is completely invisible. There is no logging, no metric, no alert. Memory will silently stop working and nobody will know.

2. **Deduplication runs O(n²) on every single memory insert** (lines 102–107). After inserting each fact, it fetches all 200 memories, runs pairwise Jaccard comparison (up to 200×200 = 40,000 comparisons), then deletes duplicates. In a busy session this is called multiple times per conversation turn. With 200 memories, this is ~40,000 set operations per insert.

3. **`compact()` is defined but never called anywhere in the codebase.** It is a dead method. Memory will accumulate to the 200-record limit and stay there — the compaction that the docstring describes never fires.

4. **The LLM is called with `maxTokens: 500` for memory extraction** but the prompt can be up to ~1,250 characters (userMessage + first 1,000 chars of response). For complex tool outputs, the extraction will regularly exceed 500 tokens and produce truncated JSON.

5. **`extractAndStore` slices `assistantResponse.slice(0, 1000)`.** If the assistant produced a 5,000-word report (common for research tasks), the memory system only sees the first 1,000 characters. Important facts in the body of long responses are never remembered.

---

### 7. `memoryUpgrades.ts`
**Rating: FUNCTIONAL**

**What it does:** Pure-function library providing TF-IDF/Jaccard memory search, entity extraction, importance scoring, and deduplication. No side effects.

**Real issues:**

1. **`matchType: "semantic"` is listed in the public type but never returned.** Comments say it is "reserved for future embedding-based scoring." Any consumer checking `result.matchType === "semantic"` will never receive it. The interface promises a capability that doesn't exist.

2. **`extractEntities` reuses compiled RegExp objects** with the `g` flag (global) across calls. The `ENTITY_PATTERNS` array is module-level. The function correctly calls `regex.lastIndex = 0` before each use via `.match()`, but `.match()` resets `lastIndex` anyway — the reset is technically redundant. However, if any future code ever calls `regex.exec()` on these patterns without a reset, the stateful `lastIndex` will produce subtly wrong results.

3. **TF-IDF normalization is incorrect.** Line 164: `const normTfidf = Math.min(tfidfScore, 1.0)`. TF-IDF scores are unbounded. Clamping to 1.0 means any document with a higher TF-IDF score than 1.0 gets treated as equally relevant to one with a score of exactly 1.0. The 70%/30% blend with Jaccard then produces artificially uniform scores for good matches, collapsing ranking quality.

4. **`deduplicateMemories` is O(n²) and this is acknowledged in the docstring** as "acceptable for < 1,000 items." The hard cap in `getMemories` is 200, so today this is fine. But the comment suggests the design is being left as-is intentionally for a dataset size that could change.

---

### 8. `skillSystem.ts`
**Rating: FUNCTIONAL**

**What it does:** Keyword-based skill matcher that selects the top-3 skills for a user message. Provides built-in skill definitions and a seeding function.

**Real issues:**

1. **Skill ID generation uses `Math.random()`** (line 179): `Math.random().toString(36).slice(2) + Date.now().toString(36)`. `Math.random()` is not cryptographically random. For IDs used as primary keys in a DB, this risks collision under rapid sequential calls (same `Date.now()` millisecond, similar random prefix). `crypto.randomUUID()` is available and already used elsewhere.

2. **`seedBuiltInSkills` has a fragile check:** `if (existing.length >= BUILT_IN_SKILLS.length) return`. If the user deletes one built-in skill, the count drops below the threshold and all built-ins get re-seeded on the next restart. Skills the user modified (changed description, added keywords) get overwritten unless the exact name matches — and name matching is exact string comparison with no normalization.

3. **Skill matching is pure bag-of-words** with no semantic understanding. A message "I need to debug my TypeScript function" matches "Code Generation" only if the exact words "code", "function", or "typescript" appear. Paraphrases fail silently. The `embeddings` column exists in the schema (it's in `storage.ts`) but is always set to `null` — the embedding-based matching the schema anticipates is never used.

4. **`matchSkills` is called on every message** with `storage.getSkills()` — a full DB query. For a system with 50+ skills, this is a full table scan per message. No caching.

---

### 9. `skillChaining.ts`
**Rating: FUNCTIONAL**

**What it does:** Detects compound requests ("research and write a report") and maps them to pre-wired multi-step pipelines, bypassing LLM-based DAG decomposition.

**Real issues:**

1. **Chain detection uses hard-coded phrase matching.** "Write a report on climate change" matches the `research-and-report` chain. "Write a comprehensive analysis and document it" does not match anything, despite being semantically identical. The phrase list is a maintenance burden with unpredictable coverage gaps.

2. **Chains unconditionally bypass the LLM planner.** If the user says "write tests for my existing function without changing it," the phrase "write test" triggers the `code-and-test` chain, which adds a code-generation step before the test step — the opposite of what was requested. There is no validation that the detected chain is actually appropriate for the specific message.

3. **`buildChainPlan` assigns fresh UUIDs to step IDs** but then passes them back to the orchestrator's `taskMap`. However, the orchestrator at line 141 does `taskMap.set(pt.id, dbId)` — it assigns its own DB UUID. The chain's pre-generated step UUIDs in `dependsOn` are the ones the orchestrator tries to resolve. The chain step `dependsOn` uses the chain-generated UUID, but `taskMap` is keyed on the plan task `pt.id` which is also the chain UUID — this should actually work, but the indirection is fragile and one refactoring step away from a silent dependency resolution bug.

4. **`skillIdToLabel` has no fallback for unknown skill IDs** beyond `capitalize(skillId.replace(/-/g, " "))`. Any skill chain step using a non-built-in skill ID produces a label like "My Custom Skill" regardless of the actual skill content — no error, no warning.

---

### 10. `contextCompactor.ts`
**Rating: FUNCTIONAL**

**What it does:** Three-phase context compression: LLM summarization of old messages, truncation of tool results, and hard skeleton reduction. Real, not simulated.

**Real issues:**

1. **Phase 3 "hard-drop to skeleton" can destroy agent task context entirely.** `hardDropToSkeleton` keeps only system messages + 4 most recent messages. In a long tool-calling agent run with 20+ messages, the task description, upstream dependency context, and previous tool results are completely dropped. The agent's next LLM call will have no memory of what it was doing. This causes agents to restart tasks from scratch or produce incoherent outputs — silently, with no error raised.

2. **The token estimator (`estimateTokens`) uses chars/4** everywhere. This is a rough heuristic that breaks badly for code-heavy content (code has higher token density than prose) and non-English text (CJK characters are ~1 token each but 3 bytes). Miscalibration causes premature compaction (wasting context budget) or missed compaction (overflowing context).

3. **`summarizeOldMessages` calls the LLM with `maxTokens: 800`** but builds the transcript by truncating each message to 2,000 chars. With 10 messages × 2,000 chars each, the input to the summarizer is 20,000 chars (~5,000 tokens). This greatly exceeds typical fast-model context expectations and can produce a 429 or truncated summary from the LLM — which then falls back to the minimal text-concatenation fallback, not a real summary.

4. **The LLM used for compaction is the worker's primary model.** Under heavy tool-call loops, the compaction call competes with the agent's main calls on the same model. There is no separate lightweight model designated for compaction. This adds latency and cost on the critical path of every long agent run.

---

### 11. `errorRecovery.ts`
**Rating: FUNCTIONAL**

**What it does:** Wraps LLM calls with up to 3 retries, exponential backoff, error classification, and one-shot model fallback. Clean, well-structured code.

**Real issues:**

1. **Fallback fires only once, with no retry.** Lines 220–231: the fallback model gets exactly one attempt. If the fallback model is also experiencing a transient error (e.g., a regional API outage), it fails immediately and the error is surfaced. A production implementation would retry the fallback model as well.

2. **No jitter in backoff timing.** `currentDelay` starts at 1,000ms and doubles per retry. When many concurrent agent runs all hit a rate limit simultaneously (common under burst load), they all retry at the same intervals — creating synchronized thundering herd behavior. Standard practice is to add `Math.random() * currentDelay` to desynchronize retries.

3. **Rate-limit backoff is `currentDelay * 3`** — hard-coded multiplier with no relationship to the `Retry-After` header. OpenAI and Anthropic both include `Retry-After` in 429 responses with the actual wait time. Ignoring it means either waiting too long (wasted time) or retrying too soon (guaranteed another 429).

4. **Error classification uses string matching on `error.message.toLowerCase()`.** A 401 response from a provider that formats its error body differently (e.g., `"Unauthorized"` instead of `"unauthorized"`) may fall through to `"unknown"` and get retried instead of immediately falling back. This is fragile.

5. **`getFallbackModel` picks `sameTier[0]`** — the first model in whatever order the DB returns. There is no health check (is this model's connection status "connected"?), no latency preference, and no recent-failure tracking. The fallback could route to a model that is also broken.

---

### 12. `modelSpeedRouter.ts`
**Rating: FUNCTIONAL**

**What it does:** Scores enabled models against a task's complexity profile (token estimate, requires reasoning/code/creativity, time sensitivity) and picks the best one. Pure functions, no I/O.

**Real issues:**

1. **Latency estimates are fully fabricated constants.** Lines 154–163: `fast → 2ms/token`, `medium → 5ms/token`, `powerful → 10ms/token`. These numbers have no relationship to real provider latencies. Groq `llama-3.3-70b` at 2ms/token is reasonable; Claude Opus at 10ms/token is orders of magnitude too fast (typical real latency is 30–50ms/token for long outputs). The `estimatedLatencyMs` field in `RoutingDecision` is logged and potentially used downstream — it is systematically wrong.

2. **Keyword detection is a flat substring scan** with high false-positive rates. `"create"`, `"design"`, `"generate"` are in `CREATIVITY_KEYWORDS` — but `"create a SQL query"` or `"generate a bash script"` would fire the creativity signal and route toward medium/powerful models instead of the code-capable fast models the user actually wants.

3. **`CODE_KEYWORDS` includes `"fix"` and `"debug"`** — which also appear in non-code contexts. "Fix my calendar event" or "debug the process" would trigger code routing. No context weighting.

4. **`routeToOptimalModel` throws** if no enabled models exist. The orchestrator catches this with an empty `catch {}` block (line 150) and falls back to `selectModelForTask`. But `selectModelForTask` will also throw if there are no models. The second throw is unhandled and will crash the agent run.

5. **`tokenEstimate` at line 107** is `Math.ceil(taskDescription.length / 4) * 3`. The `* 3` multiplier for "expected output" is applied to the input tokens, not the output token budget. This inflates the estimate by 3×, making all tasks look larger than they are — systematically over-routing to powerful models.

---

## Cross-Cutting Issues

These issues span multiple files:

### Race Condition: `currentSessionId` global (tools.ts + orchestrator.ts)
The most serious single issue. `currentSessionId` is a module-level `let` string. The orchestrator calls `setCurrentSession(agentRunId)` just before each `executeTool`. Multiple parallel tasks call `setCurrentSession` concurrently. Any tool running in "Agent A's" turn may actually execute in Agent B's Docker container. Under parallel task execution (which is the entire point of the DAG executor), Docker isolation is broken.

**Fix required:** Pass `sessionId` as a parameter to `executeTool` instead of using a global.

### Silent Failure Cascade
`memoryManager.ts` silences all errors. `orchestrator.ts` silences model routing errors. `contextCompactor.ts` silences compaction failures. `modelRouter.ts` passes empty strings as API keys. When something goes wrong, users see degraded behavior (missing memory, suboptimal routing, truncated context) with no indication of what failed. There is no centralized error telemetry, no structured logging, and no health-check endpoint that would surface these failures.

### No Input Validation on Public API Boundaries
`orchestrator.ts/runOrchestrator` receives `userMessage: string` with no length limit, no content type check, and no sanitization before it is stuffed into LLM prompts and DB records. A 500,000-character user message will be written to the DB, injected into all agent context windows, and used as the base for memory extraction — causing cascading token overflows.

### API Key Plaintext Storage
`modelConnections.ts` stores API keys as plaintext in SQLite via `storage.ts`. The entire `modelConnections.ts` credential resolution path (env vars, OAuth tokens, API keys) writes sensitive values to the DB with no encryption. This is fine for a local single-user tool; it is a hard blocker for any multi-user or cloud deployment.

### No Concurrency Primitives
SQLite better-sqlite3 is synchronous. Multiple simultaneous agent runs all execute synchronous DB reads/writes on the Node.js main thread. There are no mutexes, no connection pools, and no queue for write operations. Under 5+ simultaneous agent runs, the event loop will stall.

---

## What Would Need to Change for Production

**Must fix before real users:**
1. Replace `currentSessionId` global with a parameter — this is a correctness bug, not a quality issue.
2. Add input length validation at `runOrchestrator` entry point.
3. Enable SQLite WAL mode and switch increment operations to atomic SQL.
4. Add `Retry-After` header parsing to error recovery.
5. Fix DAG deadlock: detect cycles before execution and surface an error.
6. Add jitter to retry backoff.

**Should fix before scale:**
1. Encrypt API keys at rest.
2. Clean up IPC files (cron or TTL-based).
3. Fix TF-IDF normalization in memoryUpgrades.
4. Add cascade deletes to storage schema.
5. Switch skill IDs to `crypto.randomUUID()`.
6. Add structured error logging throughout (at minimum the silent catches in memoryManager and orchestrator).
7. Add a `/health` endpoint that surfaces model connection status and DB health.

**Nice to have:**
- Implement embedding-based memory search (the schema is ready, the column exists).
- Implement OAuth token refresh.
- Calibrate latency estimates in modelSpeedRouter against real provider measurements.
- Cache skill/model queries in hot paths.
