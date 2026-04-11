# Production Infrastructure Fixes — Audit Log

**Date:** 2025-01-20  
**Engineer:** Production infra automated fix pass  
**Scope:** 18 server infrastructure files

---

## 1. `server/fileRoutes.ts`

| # | Fix | Detail |
|---|-----|--------|
| 1 | **ReadStream error handler** | Added `stream.on('error', ...)` before `stream.pipe(res)` in the `/download` route to prevent unhandled stream errors crashing the process. |
| 2 | **Multer filename sanitization** | `filename` callback now uses `path.basename(file.originalname).replace(/[^a-zA-Z0-9._\-]/g, '_')` instead of passing `originalname` raw — prevents directory-traversal via crafted filenames. |
| 3 | **fd leak prevention** | Wrapped `fs.openSync` / `fs.readSync` in a `try/finally` that calls `fs.closeSync(fd)` — the fd was previously leaked if `readSync` threw. |
| 4 | **Delete route try/catch** | Wrapped `fs.statSync`, `fs.rmSync`, and `fs.unlinkSync` in try/catch; returns 500 with message on failure instead of crashing the request. |
| 5 | **walkDir maxDepth** | Added `depth` counter and `maxDepth = 10` parameter to `walkDir` to prevent infinite recursion on symlink cycles. |

---

## 2. `server/oauthFlow.ts`

| # | Fix | Detail |
|---|-----|--------|
| 1 | **`new URL(authUrl)` try/catch** | The `/authorize` handler now wraps `new URL(authUrl)` in a try/catch and returns HTTP 400 on invalid URLs instead of throwing. |
| 2 | **Array query param guards** | Callback handler now extracts `code`, `state`, `error`, and `error_description` with `typeof req.query.X === 'string'` checks instead of casting the whole query — prevents array injection from `?code[]=a&code[]=b`. |
| 3 | **`OAUTH_REDIRECT_BASE_URL` env var** | Both `/authorize` and `/callback` handlers now check `process.env.OAUTH_REDIRECT_BASE_URL` first when constructing `redirectUri`, enabling stable redirect URIs behind reverse proxies. |

---

## 3. `server/exportSession.ts`

| # | Fix | Detail |
|---|-----|--------|
| 1 | **Storage call try/catch** | `getConversation`, `getMessages`, `getTasks`, and `getAgentRuns` are now wrapped in a single try/catch; returns HTTP 500 with error message on storage failures. |
| 2 | **Null-guard `msg.content`** | `buildConversationSection` now uses `const content = msg.content ?? ''` before accessing `.length` or appending — prevents TypeError on null content. |
| 3 | **Response size cap (50 MB)** | Added `MAX_RESPONSE_BYTES = 50 * 1024 * 1024` check before sending; returns HTTP 413 if the generated markdown exceeds the limit. |

---

## 4. `server/taskQueue.ts`

| # | Fix | Detail |
|---|-----|--------|
| 1 | **Redis env vars** | All three IORedis constructors (`redis`, `workerRedis`, `eventsRedis`) now use `process.env.REDIS_HOST ?? 'localhost'` and `parseInt(process.env.REDIS_PORT ?? '6379')` instead of hardcoded values. |
| 2 | **`.on('error')` handlers** | Added `workerRedis.on('error', ...)` and `eventsRedis.on('error', ...)` to prevent unhandled `error` events from crashing the process when Redis drops connections. |
| 3 | **Non-null assertion fix** | `return job.id!` replaced with `return job.id ?? \`enqueued:${task.taskId}:${Date.now()}\`` — safe fallback when BullMQ doesn't return an id (edge case). |

---

## 5. `server/browserTool.ts`

| # | Fix | Detail |
|---|-----|--------|
| 1 | **URL scheme validation** | `executeBrowseUrl` now rejects any URL whose `protocol` is not `http:` or `https:` with a descriptive error. |
| 2 | **Concurrent `getPage` race fix** | Added `_pendingPages: Map<string, Promise<any>>` to serialize concurrent `getPage` calls for the same `sessionKey` — a second call now awaits the in-flight creation instead of spawning a duplicate page. |
| 3 | **Context stored alongside page** | Added `_contexts: Map<string, any>` and `_contexts.set(sessionKey, context)` at creation time; `closePage` now calls `context.close()` from the stored reference instead of `page.context().close()` — more reliable cleanup. |
| 4 | **PDF filename sanitization** | `executeBrowserPdf` now applies `path.basename(args.filename || ...)` to strip any path components from caller-supplied filenames. |

---

## 6. `server/browserRoutes.ts`

| # | Fix | Detail |
|---|-----|--------|
| 1 | **Null-check `getBrowserSessionInfo`** | Session list maps now filter out `null` entries (sessions that were valid keys but already closed). |
| 2 | **URL scheme validation on navigate** | `POST /api/browser/navigate` rejects non-http/https schemes with HTTP 400 before calling `executeBrowserTool`. |
| 3 | **Input length caps** | Added `url.length > 2000` check on navigate (returns 400); `script.length > 100000` check on evaluate (returns 400). |

---

## 7. `server/imageGenTool.ts`

| # | Fix | Detail |
|---|-----|--------|
| 1 | **Redirect hop counter** | `downloadFile` now accepts a `hopCount` parameter and throws `'Too many redirects (max 5)'` when `hopCount >= 5`, preventing infinite redirect loops. |
| 2 | **Size enum validation** | `ALLOWED_SIZES` array is checked before passing `size` to the API; defaults to `"512x512"` for unrecognised values. |
| 3 | **`parseInt` NaN fix** | `parseInt(args.n || '1', 10) || 1` — the trailing `|| 1` ensures `NaN` from non-numeric input falls back to 1 before `Math.min/max` clamping. |

---

## 8. `server/contextCompactor.ts`

| # | Fix | Detail |
|---|-----|--------|
| 1 | **Null-guard `msg.content`** | `estimateMessageTokens`, `summarizeOldMessages` transcript builder, and the `catch` fallback all now use `msg.content ?? ''` to prevent TypeError on null content. |
| 2 | **Log errors in `catch`** | `summarizeOldMessages` catch block now calls `console.error('[contextCompactor] summarizeOldMessages failed:', err)` instead of silently swallowing the exception. |

---

## 9. `server/skillChaining.ts`

| # | Fix | Detail |
|---|-----|--------|
| 1 | **Non-null assertions replaced** | `stepIdToTaskId.get(step.stepId)!` replaced with a null check that throws a descriptive `Error`; upstream dependency lookup replaced with a safe conditional instead of `!`. |
| 2 | **Removed unused `availableSkills` parameter** | `detectChain(userMessage: string, availableSkills: Skill[])` signature simplified to `detectChain(userMessage: string)` — the parameter was unused dead code. |

---

## 10. `server/memoryUpgrades.ts`

| # | Fix | Detail |
|---|-----|--------|
| 1 | **Guard `termFrequency` against empty tokens** | Added `if (tokens.length === 0) return new Map();` guard — prevents a `0 / 0 = NaN` division in the normalisation loop. |
| 2 | **Normalize `importance` values** | `deduplicateMemories` comparison now uses `const aImp = a.importance ?? 0; const bImp = b.importance ?? 0` — safe when the `importance` column is null/undefined in older DB rows. |

---

## 11. `server/errorRecovery.ts`

| # | Fix | Detail |
|---|-----|--------|
| 1 | **Jitter on retry delays** | `waitMs` is now `Math.round(baseWaitMs * (0.75 + Math.random() * 0.5))` — multiplies by a uniform random factor in [0.75, 1.25] to avoid thundering herd when multiple workers retry at the same time. |

---

## 12. `server/modelSpeedRouter.ts`

| # | Fix | Detail |
|---|-----|--------|
| 1 | **Typed failure result** | `routeToOptimalModel` no longer throws when `enabledModels.length === 0`; instead it returns a `RoutingDecision` with `modelId: ""` and an error message in `reason`. Added exported `RoutingResult` union type for callers that want to distinguish the failure case. |

---

## 13. `server/processWatchdog.ts`

| # | Fix | Detail |
|---|-----|--------|
| 1 | **Restart count only on crash** | `initWatchdog` previously called `incrementRestartCount()` on every clean boot. Changed to `loadRestartCount()` — the counter increments only in `handleFatalError` (the crash path). |
| 2 | **`HealthStatus` interface extended** | Added `uptimeMs: number`, `pid: number`, and `eventLoopLagMs: number` fields to the interface — these were already present in `getHealthStatus()` return value but missing from the type declaration, causing TypeScript errors in callers. |

---

## 14. `server/taskCheckpointing.ts`

| # | Fix | Detail |
|---|-----|--------|
| 1 | **Hardcoded path removed** | `CHECKPOINT_DIR` changed from `path.resolve('/home/user/workspace/ultra-computer/data/checkpoints')` to `path.resolve(process.cwd(), 'data/checkpoints')`. |
| 2 | **`writeCheckpoint` try/catch** | `fs.writeFileSync` now wrapped; logs the error and re-throws so callers can react rather than silently failing. |
| 3 | **ENOENT vs parse error distinction** | `readCheckpoint` now uses two separate try/catch blocks: the first catches `ENOENT` (file missing → return null silently), the second catches JSON parse errors (logs the file path and error message). |

---

## 15. `server/cronScheduler.ts`

| # | Fix | Detail |
|---|-----|--------|
| 1 | **Hardcoded path removed** | `DATA_DIR` changed from `path.resolve("/home/user/workspace/ultra-computer/data")` to `path.resolve(process.cwd(), "data")`. |
| 2 | **Atomic write in `saveStore`** | `saveStore` now writes to `STORE_PATH + '.tmp'` and calls `fs.renameSync` for atomicity. On failure, the `.tmp` file is cleaned up before re-throwing. |
| 3 | **`setTimeout` recursion instead of `setInterval`** | `startScheduler` now uses a self-rescheduling `setTimeout` chain (`scheduleTick`) so a slow tick does not stack with the next interval. |
| 4 | **`crypto.randomUUID()` for IDs** | `generateId` now uses `crypto.randomUUID()` instead of `Math.random()` — eliminates the ~1-in-3-trillion collision risk from the previous 8-character base-36 suffix. Added `import crypto from 'crypto'` at top of file. |

---

## 16. `server/selfLearning.ts`

| # | Fix | Detail |
|---|-----|--------|
| 1 | **Hardcoded path removed** | `DATA_DIR` changed from `path.resolve("/home/user/workspace/ultra-computer/data/learning")` to `path.resolve(process.cwd(), "data/learning")`. |
| 2 | **Orphaned `.tmp` cleanup in `writeJson`** | The existing atomic-write pattern now wraps in try/catch; on failure it deletes the `.tmp` file before re-throwing. |
| 3 | **`Math.max` spread fix** | `Math.max(...rules.map(...))` replaced with `rules.reduce((max, r) => Math.max(max, r.lastValidatedAt), 0)` to prevent stack overflow on large rule arrays (V8 spread limit ~65k args). |

---

## 17. `server/skillAutoImprove.ts`

| # | Fix | Detail |
|---|-----|--------|
| 1 | **Hardcoded path removed** | `DATA_DIR` changed from `path.resolve("/home/user/workspace/ultra-computer/data/learning")` to `path.resolve(process.cwd(), "data/learning")`. |
| 2 | **Atomic write for `writePerformanceRecords`** | Direct `fs.writeFileSync` replaced with tmp-file + `renameSync` pattern with cleanup on failure. |
| 3 | **Atomic write for `writeSuggestions`** | Same atomic pattern applied. |
| 4 | **Validated `applyAddTriggerKeywords` JSON** | JSON.parse result is now checked with `Array.isArray(parsed)` and filtered for string elements — guards against malformed proposedChange strings. |
| 5 | **Buffer cap per skill (1000 samples)** | `recordSkillExecution` now only pushes to `executionBuffer` when `buf.length < 1000` — prevents unbounded memory growth in long-running servers. |

---

## 18. `server/skillSystem.ts`

| # | Fix | Detail |
|---|-----|--------|
| 1 | **`JSON.parse(triggerKeywords)` try/catch** | `SkillMatcher.matchSkills` now wraps the parse in try/catch with `Array.isArray` guard and falls back to `[]` on error, preventing one malformed skill from crashing all skill matching. |
| 2 | **`uuidv4()` for skill IDs** | `seedBuiltInSkills` now uses `uuidv4()` (imported from `uuid`) instead of `Math.random().toString(36).slice(2) + Date.now().toString(36)` — eliminates collision risk. |
| 3 | **`seedBuiltInSkills` guard by name** | Guard changed from `if (existing.length >= BUILT_IN_SKILLS.length) return` (count-based, breaks on deletions) to per-skill `existing.find(e => e.name === skill.name)` check — idempotent and correct when built-in skills are partially deleted. |

---

## Summary

| Category | Count |
|----------|-------|
| Files modified | 18 |
| Security fixes (path traversal, scheme validation, input caps) | 6 |
| Resource leak fixes (fd, stream, Redis connections) | 4 |
| Crash prevention (null guards, non-null assertions, parse errors) | 12 |
| Correctness fixes (atomic writes, hardcoded paths, NaN, Math.max spread) | 10 |
| Production reliability (jitter, env vars, retry logic) | 5 |
| **Total individual fixes** | **~37** |
