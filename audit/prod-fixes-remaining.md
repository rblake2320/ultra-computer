# Production Fixes — Remaining Files
**Date:** 2025-07-12  
**Engineer:** Senior Production Engineer (automated review)  
**Scope:** Files not covered in the initial prod-fixes round

---

## 1. server/a2aProtocol.ts

### 1.1 Max-size eviction on taskRegistry and agentRegistry
- **Issue:** Unbounded in-memory Maps could grow without limit, causing OOM.
- **Fix:** Added `evictIfNeeded<K,V>(map, maxSize)` helper that evicts the oldest (first-inserted) entry when Map exceeds `MAX_REGISTRY_SIZE = 10_000`. Called after every `taskRegistry.set()`, `agentRegistry.set()`, and `registerAgent()`.

### 1.2 Truncate userText before echoing back (max 500 chars)
- **Issue:** Fallback echo path could reflect arbitrary-length input back to the caller.
- **Fix:** `rawUserText.slice(0, 500)` before use; the fallback echo string also slices to 500.

### 1.3 Validate full A2A message schema
- **Issue:** `handleMessageSend` only checked `parts` was an array; `role` and `messageId` were not validated.
- **Fix:** Added validation: `message.role` must be `"user"` or `"agent"`, `message.messageId` must be a present string, and each part must have a `kind` field.

### 1.4 Fix baseUrl default to use process.env.BASE_URL
- **Issue:** `getAgentCard()` default was hardcoded `"http://localhost:5000"`.
- **Fix:** Changed to `process.env.BASE_URL ?? "http://localhost:5000"`.

### 1.5 Add timeout/AbortController around runOrchestrator promise
- **Issue:** Orchestrator could hang indefinitely, blocking the handler.
- **Fix:** Added `AbortController` with 30-second timeout. The `abort` event rejects the promise with a clear timeout error message.

---

## 2. server/mcpProtocol.ts

### 2.1 Stop logging bearer token
- **Issue:** `console.log` on line 35–36 printed the full bearer token to application logs, exposing credentials to log aggregators.
- **Fix:** Removed both `console.log` calls; replaced with a comment directing operators to use `getMCPBearerToken()` instead.

### 2.2 Wrap JSON.parse(model.capabilities) in try/catch
- **Issue:** `JSON.parse((model.capabilities as string) || "[]")` would throw on malformed JSON, crashing the `model://` resource handler.
- **Fix:** Wrapped in an IIFE with try/catch; falls back to `[]` on parse failure.

### 2.3 Validate params is an object before coercing in tools/call handler
- **Issue:** No check that `params` was a plain object; array inputs would bypass validation.
- **Fix:** Added `Array.isArray(params)` check; returns `INVALID_PARAMS` if params is not a plain object.

### 2.4 Validate params.arguments is a plain object
- **Issue:** `params.arguments` was cast to `Record<string, string>` without type checking.
- **Fix:** Added explicit check: if `params.arguments` is defined, it must be a non-null, non-array object.

---

## 3. server/cliToolEngine.ts

### 3.1 Validate tool names match /^[a-zA-Z0-9_\-\.]+$/ before shell interpolation
- **Issue:** PROBED_TOOLS names were interpolated into `which <name>` without validation.
- **Fix:** Added regex test at the top of the `getInstalledTools` probe loop; skips names that don't match.

### 3.2 Validate package names before pip/npm install
- **Issue:** Package names from code comment headers were passed directly to pip3/npm without sanitisation.
- **Fix:** Added `SAFE_PACKAGE_RE = /^[a-zA-Z0-9\-_.>=<!]+$/` filter on the packages array before constructing the install command.

### 3.3 Fix process.env leakage: curated subprocess env
- **Issue:** `executeCommand` passed the full `process.env` to subprocesses, potentially leaking API keys and secrets.
- **Fix:** Replaced with `buildSafeEnv()` function that only forwards `PATH`, `HOME`, `LANG`, `TERM`, `NODE_ENV`, plus any caller-supplied `opts.env` overrides.

### 3.4 Add 5-second timeout to version probe commands
- **Issue:** `execAsync` calls in `getInstalledTools` had no timeout, could hang on slow tools.
- **Fix:** Added `{ timeout: 5_000 }` to both `which` and version flag `execAsync` calls.

### 3.5 Validate width/height are positive integers in image-resize
- **Issue:** `options.width` and `options.height` were cast to `number` without validation; non-integers or negatives could produce invalid geometry strings.
- **Fix:** Used `Number.isInteger(rawWidth) && rawWidth > 0` guard; defaults to `800`/`0` when invalid. Geometry string only includes height component when `height > 0`.

---

## 4. server/protocolRoutes.ts

### 4.1 URL validation on discoverAgent (SSRF protection)
- **Issue:** Any URL (including `http://169.254.169.254/...` cloud metadata or `http://192.168.x.x/...` internal endpoints) could be passed to `discoverAgent`.
- **Fix:** Added `isValidPublicUrl()` helper that validates: protocol is http/https, hostname is not loopback (`127.*`, `localhost`, `::1`), not link-local (`169.254.*`), and not RFC-1918 private ranges (`10.*`, `172.16-31.*`, `192.168.*`).

### 4.2 SSRF protection on POST /api/protocols/a2a/agents/:id/send
- **Issue:** The `:id` parameter (expected to be an agent URL) was used directly without validating it was a registered agent.
- **Fix:** Added check that `a2aProtocol.getAgent(id)` returns a registered card before proceeding. Also runs `isValidPublicUrl()` on the id.

### 4.3 SSRF protection on POST /api/protocols/http/request
- **Issue:** The outbound HTTP request endpoint accepted any URL with no filtering.
- **Fix:** Runs `isValidPublicUrl()` on the `url` parameter; blocks private/loopback destinations.

### 4.4 Document webhookHandlers Map
- **Issue:** `webhookHandlers` Map was declared but was a stub with no connection to `cliToolEngine.webhookRegistry`.
- **Fix:** Added a JSDoc comment documenting it as a stub with TODO to wire it to `cliToolEngine.webhookRegistry.dispatch()`.

### 4.5 Always generate webhook IDs server-side
- **Issue:** The POST `/api/protocols/webhooks` handler used the caller-supplied `id` if present, allowing callers to force specific IDs.
- **Fix:** Removed `id` from destructuring; always calls `uuidv4()` for the webhook ID.

### 4.6 Fix language allowlist to match SupportedLanguage type
- **Issue:** The allowlist included `"sh"`, `"python"`, `"ruby"`, `"perl"` which are not valid `SupportedLanguage` values in `cliToolEngine.ts`, causing TypeScript type errors and potential runtime failures.
- **Fix:** Changed allowlist to match the `SupportedLanguage` type exactly: `["bash", "python3", "node", "typescript"]`.

### 4.7 Validate workDir is within sandbox for cli/execute
- **Issue:** Callers could pass arbitrary `workDir` paths (e.g., `/etc`) to execute commands outside the sandbox.
- **Fix:** Added `path.resolve(workDir).startsWith(sandboxBase)` check; rejects paths outside `/tmp/ultra-sandbox`.

---

## 5. server/messagingHub.ts

### 5.1 Cap inboundHistory with MAX_HISTORY
- **Issue:** `inboundHistory` array was capped at hardcoded `500` inline; inconsistent with the queue's `MAX_HISTORY`.
- **Fix:** Added `private readonly MAX_INBOUND_HISTORY = 500` class field; both `routeInbound` paths use it.

### 5.2 Validate content is non-empty string before enqueuing in sendMessage
- **Issue:** `sendMessage` accepted empty or non-string content, which would reach adapters and produce malformed payloads.
- **Fix:** Added guard: if `content` is falsy, not a string, or blank after trim, returns early with `{ ok: false, error: "content must be a non-empty string" }`.

### 5.3 Add URL validation for webhook URLs at channel registration time
- **Issue:** Webhook channels with private-IP webhook URLs could be registered and used for SSRF.
- **Fix:** Added `_validateWebhookUrl()` private method that checks protocol, loopback, and RFC-1918 ranges. Called in `registerChannel()` when `type === "webhook"` or config contains a URL.

### 5.4 Add _processQueue try/finally to always reset this.processing
- **Issue:** If `_processQueue` threw an unexpected exception, `this.processing` would remain `true` forever, deadlocking the queue.
- **Fix:** Wrapped the entire body in `try { ... } finally { if (!hasPending) this.processing = false; }`.

### 5.5 Document Slack/Gmail adapters as stubs
- **Issue:** `SlackAdapter.send()` and `GmailAdapter.send()` prepared payloads but did not deliver them; no indication this was stub behavior.
- **Fix:** Added `console.warn("[MessagingHub] SlackAdapter.send() is a stub...")` and same for Gmail, plus updated JSDoc to clearly state these are stubs pending connector wiring.

---

## 6. server/messagingRoutes.ts

### 6.1 Add req.body null guard on all POST endpoints
- **Issue:** Some handlers used `req.body` without `?? {}` guard, could throw on null body.
- **Fix:** `const body = req.body ?? {}` pattern applied; verified existing routes already had this for most handlers.

### 6.2 Document Slack webhook signature verification as TODO
- **Issue:** The Slack webhook endpoint accepted all requests without verifying the `X-Slack-Signature` HMAC-SHA256 header, making it forgeable.
- **Fix:** Added `console.warn("[messaging] Slack webhook signature verification is NOT implemented — TODO: add HMAC-SHA256 check")` and a JSDoc block explaining the requirement.

---

## 7. server/nipEngine.ts

### 7.1 Remove 'g' flag from all INJECTION_PATTERNS regex patterns
- **Issue:** All 36 patterns used the `g` flag (e.g., `/jailbreak/gi`). The `g` flag makes RegExp objects stateful — `lastIndex` is updated on each `.test()` call. Repeated calls on the same object flip between matching and not matching (the "sticky `g`" bug), causing injection detection to silently fail on every second call.
- **Fix:** Removed `g` flag from all patterns. `i` (case-insensitive) flag retained where appropriate. Added a code comment explaining why `g` must not be used with `.test()`.

### 7.2 Validate full AgentCapabilityProfile schema
- **Issue:** `createSession` accepted any objects as instructor/executor profiles without checking required string fields.
- **Fix:** Added loop over `["agentId", "agentName", "organizationId", "organizationName", "modelProvider", "modelId"]` checking each is a non-empty string.

### 7.3 Clamp maxDuration to 24 hours
- **Issue:** Callers could request sessions lasting years (or `Infinity`), pinning resources forever.
- **Fix:** `const MAX_DURATION_MS = 86_400_000; taskScope.maxDuration = Math.min(taskScope.maxDuration, MAX_DURATION_MS)`.

### 7.4 Sanitize profile strings before embedding in system messages
- **Issue:** `agentName` and `organizationName` were embedded directly into the welcome message and capability exchange messages, allowing injection of control characters or oversized strings.
- **Fix:** `sanitizeStr()` strips `\x00–\x1F` control characters and truncates to 100 chars. Applied to both profiles before any message generation.

### 7.5 Cap NIPSession.messages array at 1000 entries
- **Issue:** Sessions with very high `maxMessages` or long-running sessions could accumulate thousands of messages, consuming unbounded memory.
- **Fix:** In `_appendMessage`, if `session.messages.length >= 1000`, splice from the front to maintain the cap before pushing the new message.

---

## 8. server/nipRoutes.ts

### 8.1 Fix instructorProfile/executorProfile validation
- **Issue:** `typeof profile !== "object"` alone passes for arrays (`typeof [] === "object"`).
- **Fix:** Added `|| Array.isArray(instructorProfile)` and `|| Array.isArray(executorProfile)` to both checks.

### 8.2 Add req.body null guard
- **Issue:** `const { ... } = req.body` could throw if body was null.
- **Fix:** Changed to `const body = req.body ?? {}; const { ... } = body` for the sessions POST handler. Same applied to pause, terminate, and access/validate endpoints.

### 8.3 Validate reason is a string
- **Issue:** `reason` destructured from `req.body` on pause/terminate; no type check before passing to engine.
- **Fix:** Added `req.body ?? {}` null guard on both pause and terminate handlers (existing `requireString` validation then handles type checking).

---

## 9. server/identityEngine.ts + identityRoutes.ts

### 9.1 Add size cap on identity store (max 10,000 identities)
- **Issue:** `identityStore` was unbounded.
- **Fix:** Added `if (this.identityStore.size >= 10_000) throw new Error(...)` guard at the top of `registerIdentity()`.

### 9.2 Add size cap on audit entries per identity (max 1,000)
- **Issue:** Audit entries were added indefinitely per identity.
- **Fix:** After `auditStore.set()` in `_createAuditEntry`, evict oldest entries for that `cryptoId` when count exceeds 1,000.

### 9.3 Never expose keyMaterial in /api/identity/:cryptoId/full
- **Issue:** `GET /api/identity/:cryptoId/full` returned the raw `Identity` object including `crypto.keyMaterial` (128-char hex of raw entropy bytes), which must never leave the server.
- **Fix:** Destructured `keyMaterial` out before responding: `const { crypto: { keyMaterial: _km, ...cryptoSafe }, ...rest } = identity; res.json({ ...rest, crypto: cryptoSafe })`.

### 9.4 Strip HTML tags from displayName
- **Issue:** HTML tags in display names could cause XSS when rendered.
- **Fix:** Added `name.replace(/<[^>]*>/g, '')` in both `_validateDisplayName()` and at the top of `registerIdentity()` to clean the input before validation and storage.

---

## 10. server/cacheEngine.ts

### 10.1 Fix totalBytes accounting on LRU eviction
- **Issue:** When an LRU entry was evicted, the code subtracted the *new entry's* byte count instead of the evicted entry's byte count, causing systematic over-accounting (totalBytes grew without bound).
- **Fix:** Added `private readonly bytesPerKey = new Map<string, number>()` in both `ExactCache` and `SemanticCache`. On eviction, the correct byte count is looked up from this map and subtracted. `bytesPerKey` is updated on `set()`, `delete()`, and `clear()`.

### 10.2 Document semantic cache TF-IDF fallback as the production path
- **Issue:** `queryEmbedding` is always `null` in `CacheEngine.get()`, meaning vector cosine similarity is never used, but this was not documented.
- **Fix:** Added a block comment above `SemanticCache` explaining that embedding pass-through is aspirational and TF-IDF is the actual production path.

### 10.3 Fix resetStats to use direct property assignment
- **Issue:** `resetStats()` used `(this.exact as unknown as { hits: number }).hits = 0` — a double-cast workaround that TypeScript would only accept because `hits` was declared as `public`.
- **Fix:** Since `hits` and `misses` are already `public` class fields, direct assignment `this.exact.hits = 0` etc. works without any cast.

---

## 11. server/cacheRoutes.ts

### 11.1 Remove meaningless `enabled: ... || true`
- **Issue:** `exactCache: { enabled: stats.exact.entries > 0 || true }` is always `true` regardless of the condition, making the config endpoint useless.
- **Fix:** Changed to `stats.exact.entries > 0`, `stats.prefix.entries > 0`, `stats.semantic.entries > 0`.

### 11.2 Validate tier parameter in /api/cache/clear
- **Issue:** Any string was accepted as `tier` and passed to `cacheEngine.clear(tier)`, potentially causing silent no-ops or future issues.
- **Fix:** Added `ALLOWED_TIERS = ["exact", "prefix", "semantic"]` validation; returns 400 for invalid tier values.

### 11.3 Use stats.totalHits and stats.overallHitRate directly in dashboard
- **Issue:** Dashboard was re-computing `totalHits` and `overallHitRate` from raw tier counts, duplicating logic already in `getStats()` and potentially diverging.
- **Fix:** Use `stats.totalHits` and `stats.overallHitRate` directly from the stats object.

---

## 12. server/marketplaceRoutes.ts

### 12.1 Protect POST /api/marketplace/seed in production
- **Issue:** The seed endpoint had no environment guard; it could overwrite live data if accidentally called in production.
- **Fix:** Added `if (process.env.NODE_ENV === "production") return res.status(403).json(...)` at the top of the handler.

### 12.2 Validate email, repoUrl, and version semver on POST /api/marketplace/skills
- **Issue:** No format validation for these fields.
- **Fix:** Added `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` email check, `new URL(repoUrl)` URL check, and `/^\d+\.\d+\.\d+(-[\w.]+)?(\+[\w.]+)?$/` semver check.

### 12.3 Use Number(rating) instead of parseInt(rating)
- **Issue:** `parseInt("3.7")` returns `3` without error, silently accepting non-integer ratings.
- **Fix:** Changed to `Number(rating)` which correctly returns `NaN` for `"3.7"`, `"abc"`, etc.

### 12.4 Log scoring errors instead of swallowing silently
- **Issue:** All `try { scoreSkillById(...) } catch { /* non-fatal */ }` blocks suppressed errors completely.
- **Fix:** Changed to `catch (scoreErr) { console.error('[marketplace] Scoring error ...', scoreErr); }` in all locations.

---

## 13. server/marketplaceScoring.ts

### 13.1 Fix Bayesian rating formula — remove n > 0 guard
- **Issue:** The guard `n > 0 ? (C * m + sum) / (C + n) : 0` returned `0` for skills with no ratings instead of the prior mean `m = 3.0`. This caused unrated skills to rank below 1-star rated skills.
- **Fix:** Removed the guard. The formula `(C * m + sum) / (C + n)` naturally evaluates to `(C * m) / C = m = 3.0` when `n === 0`, which is the mathematically correct Bayesian prior.

---

## 14. server/autonomyRoutes.ts

### 14.1 Add try/catch to ALL route handlers
- **Issue:** Health, checkpoint list/get, cron list/get, learning stats, and dashboard handlers had no error handling — any exception would crash the request without a proper 500 response.
- **Fix:** Wrapped all handlers in `try { ... } catch (err: any) { res.status(500).json({ error: err.message ?? "..." }); }`.

### 14.2 Validate req.body fields in PATCH checkpoints and POST learning/log
- **Issue:** `updateCheckpoint(req.params.id, req.body)` passed raw body with no type checking. `logExecution(req.body)` passed potentially null body.
- **Fix:**
  - `PATCH /checkpoints/:id`: `const body = req.body ?? {}; if (typeof body !== "object" || Array.isArray(body)) return 400`.
  - `POST /learning/log`: Added `req.body ?? {}` guard + `taskType` string validation.

### 14.3 Fix parseInt("0") || undefined issue
- **Issue:** `const maxStaleMs = parseInt(req.body.maxStaleMs) || undefined` evaluates `0` to `undefined` due to `||` short-circuit, making `maxStaleMs=0` equivalent to no timeout.
- **Fix:** Changed to ternary: `const maxStaleMs = !isNaN(parsed) && parsed > 0 ? parsed : undefined`.

### 14.4 Validate reason is a string in rejectImprovement
- **Issue:** `req.body.reason` was passed directly to `rejectImprovement` without type checking.
- **Fix:** Added `typeof reason !== "string"` guard returning 400, plus `req.body ?? {}` null guard.

---

## Summary Statistics

| File | Issues Fixed |
|------|-------------|
| a2aProtocol.ts | 5 |
| mcpProtocol.ts | 4 |
| cliToolEngine.ts | 5 |
| protocolRoutes.ts | 7 |
| messagingHub.ts | 5 |
| messagingRoutes.ts | 2 |
| nipEngine.ts | 5 |
| nipRoutes.ts | 3 |
| identityEngine.ts + identityRoutes.ts | 4 |
| cacheEngine.ts | 3 |
| cacheRoutes.ts | 3 |
| marketplaceRoutes.ts | 4 |
| marketplaceScoring.ts | 1 |
| autonomyRoutes.ts | 4 |
| **Total** | **55** |
