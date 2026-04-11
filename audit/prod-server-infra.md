# Production Server Infrastructure Audit

Audited: 18 files in `/home/user/workspace/ultra-computer/server/`

---

## fileRoutes.ts

### CRITICAL (will crash in production)
- **Line 155–163 (download route):** `fs.createReadStream(resolved).pipe(res)` has no error handler on the stream. If the file is deleted between the `existsSync` check and the stream open, or the client disconnects mid-transfer, the unhandled `'error'` event on the ReadStream will throw and crash the process (Node.js emits an uncaught exception for unhanded stream errors unless `processWatchdog` catches it).
  - **Fix:** `const stream = fs.createReadStream(resolved); stream.on('error', (err) => { if (!res.headersSent) res.status(500).json({ error: 'Read error' }); }); stream.pipe(res);`

- **Line 121–123 (multer filename):** `file.originalname` is written directly to disk with no sanitization. A client can upload a file named `../../etc/cron.d/evil` and, even though `resolveSafe` guards the destination directory, the filename itself is never validated. Combined with any future path-join bug this is a path traversal sink.
  - **Fix:** Sanitize with `path.basename(file.originalname).replace(/[^a-zA-Z0-9._\-]/g, '_')` before using as a filename.

### HIGH (incorrect behavior)
- **Line 198–202 (large file read):** `fs.openSync` / `fs.readSync` / `fs.closeSync` are called but the `fd` is never closed in a `finally` block. If an exception occurs between `openSync` and `closeSync` the file descriptor leaks indefinitely.
  - **Fix:** Wrap in `try/finally`: `const fd = fs.openSync(resolved, 'r'); try { fs.readSync(...); } finally { fs.closeSync(fd); }`

- **Line 219–226 (delete route):** `fs.statSync` and then `fs.rmSync`/`fs.unlinkSync` are not wrapped in try/catch. A race condition (file deleted between stat and unlink by another request) throws synchronously and returns a 500 with a raw Node stack trace instead of a structured error.
  - **Fix:** Wrap lines 219–226 in try/catch and return `res.status(500).json({ error: err.message })`.

### MEDIUM (code quality)
- **Line 27:** `resolveSafe` uses `replace(/\.\.\//g, '')` to strip traversal sequences *before* calling `path.resolve`. The real safety net is the `startsWith(SANDBOX_DIR)` check on line 30; the regex strip is redundant and gives false confidence it handles all traversal variants (e.g., `..%2F`, encoded after decode). The `decodeURIComponent` on line 27 combined with the regex is fine, but the comment should be removed and the defense should be documented as being the `path.resolve` + prefix check only.
  - **Fix:** Remove the two `.replace(...)` calls; `path.resolve` + the sandbox prefix check is the only reliable guard.

- **Line 132–135 (GET /api/sandbox/files):** `walkDir` is called synchronously and has no depth limit. A deeply nested directory tree or a symlink loop could block the event loop for seconds or cause a stack overflow.
  - **Fix:** Add a `maxDepth` parameter to `walkDir` (default 10) and break recursion when exceeded.

---

## oauthFlow.ts

### CRITICAL (will crash in production)
- **Line 85:** `new URL(authUrl)` throws a `TypeError` if `authUrl` is not a valid URL (e.g., the stored config has a typo like `"htps://..."`) and there is no try/catch wrapping it. The synchronous handler would propagate the exception, sending a 500 with a raw stack trace and potentially crashing any uncaught-exception handler.
  - **Fix:** Wrap in try/catch: `let url: URL; try { url = new URL(authUrl); } catch { return res.status(400).json({ error: 'Connector auth_url is not a valid URL' }); }`

### HIGH (incorrect behavior)
- **Line 7 (`pendingStates`):** This is module-level in-memory state. In a multi-process or clustered deployment (e.g., pm2 cluster mode) each worker has its own `pendingStates` map. A `/authorize` request handled by worker A creates a state token; the `/callback` may arrive at worker B which has no record of it, causing every OAuth flow to fail with "Invalid or expired OAuth state."
  - **Fix:** Store OAuth state in the database (via `storage`) or a shared cache (Redis), not in module memory.

- **Line 82 / 159 (`redirectUri` construction):** Both the authorize and callback handlers reconstruct `redirectUri` using `x-forwarded-host`. If the server is behind a load balancer that does not forward these headers, or if a misconfigured proxy injects a wrong value, the redirect_uri sent to the provider and the one sent during token exchange will differ, breaking the flow silently (provider rejects with `redirect_uri_mismatch`).
  - **Fix:** Introduce a `OAUTH_REDIRECT_BASE_URL` environment variable as the canonical redirect URI and fall back to the reconstructed one only when it is not set.

- **Line 106:** `req.query` is cast to `Record<string, string>` without validation. Query parameters can be arrays (e.g., `?code=a&code=b`), which Express parses as `string[]`. Using `code` as a string when it's actually an array will produce `[object Object]` or similar corruption in the token exchange body.
  - **Fix:** Extract each field individually: `const code = typeof req.query.code === 'string' ? req.query.code : undefined;` and return 400 if not a plain string.

### MEDIUM (code quality)
- **Line 7 (`pendingStates` purge):** `purgeExpiredStates` iterates over `Array.from(pendingStates.entries())` on every authorize and callback request. This is O(n) for each request. For a high-traffic system with slow cleanup this is fine at low scale, but the array copy is unnecessary — iterating the Map directly is sufficient.
  - **Fix:** `for (const [key, val] of pendingStates) { ... }` (direct Map iteration, no copy needed).

---

## exportSession.ts

### CRITICAL (will crash in production)
- **Lines 146–148:** `storage.getMessages(id)`, `storage.getTasks(id)`, and `storage.getAgentRuns(id)` are all synchronous DB calls with no try/catch around them. If the storage layer throws (e.g., DB locked, schema mismatch), the exception propagates unhandled through the synchronous route handler, resulting in an unhandled crash or at minimum a 500 with a raw stack trace.
  - **Fix:** Wrap lines 146–148 in try/catch and return `res.status(500).json({ error: 'Failed to retrieve session data' })`.

### HIGH (incorrect behavior)
- **Line 87:** `msg.content` is interpolated raw into the markdown document. If message content contains the string `---`, it will silently close the markdown section separator, corrupting the export structure. More critically, if content is `null` or `undefined` (which can happen if the DB row has a NULL column), `msg.content` access on line 87 will produce the string `"undefined"` or throw depending on the TypeScript runtime shape.
  - **Fix:** Null-guard: `const content = msg.content ?? '';` before use, and document that `---` sequences in content are escaped or that the section divider uses a distinct pattern.

- **Line 197:** `res.send(doc)` sends the markdown with no size cap. A conversation with thousands of very long messages could produce a multi-hundred-MB response, exhausting memory.
  - **Fix:** Add a size cap (e.g., 50 MB) before sending and return 413 if exceeded.

### MEDIUM (code quality)
- **Line 189–192 (filename sanitization):** The regex `[^a-z0-9\-_ ]` replaces characters case-insensitively via the `i` flag but the character class includes lowercase literals only. The resulting filename is therefore always lowercase regardless of the original title. This is not a bug but is surprising and undocumented.
  - **Fix:** Either remove the `gi` flags and use `[^a-zA-Z0-9\-_ ]` to preserve case, or document the intentional lowercasing.

---

## taskQueue.ts

### CRITICAL (will crash in production)
- **Line 74 (`processTask`):** The stub processor is the *only* worker implementation. It logs and returns immediately without doing any real work. Any job submitted in production will complete as `stub_complete` silently, with no error surfaced. This is a placeholder that **must not ship to production** as-is.
  - **Fix:** Replace the stub or throw `new Error('Worker not implemented')` to fail loudly until the real implementation is wired in.

- **Lines 150–155 (workerRedis), 179–184 (eventsRedis):** Both secondary Redis connections are created with no `connectTimeout`, no `lazyConnect`, and no error/close event listeners. If Redis becomes unavailable after initialization, ioredis will silently retry forever and emit `'error'` events. Without an `error` listener on these connections, Node.js will throw an `UnhandledPromiseRejection` or uncaught `'error'` event and crash.
  - **Fix:** Add `.on('error', (err) => console.error('[TaskQueue] Redis error:', err))` on `workerRedis` and `eventsRedis`, and set `connectTimeout: 3000`.

### HIGH (incorrect behavior)
- **Lines 122–128 (Redis host/port hardcoded):** Redis is hardcoded to `localhost:6379`. In any containerized or cloud deployment (Railway, Render, Fly, etc.) this will never connect. 
  - **Fix:** Use environment variables: `host: process.env.REDIS_HOST ?? 'localhost'`, `port: parseInt(process.env.REDIS_PORT ?? '6379', 10)`, and optionally `password: process.env.REDIS_PASSWORD`.

- **Line 239 (`job.id!`):** Non-null assertion on `job.id`. BullMQ job IDs are technically optional when `removeOnComplete` prunes them. In degraded states this will be `undefined`, and spreading a synthetic ID fallback is already handled for the `unavailable` case but not for a successfully enqueued job with no ID.
  - **Fix:** `return job.id ?? `enqueued:${task.taskId}:${Date.now()}`;`

- **Line 323 (`job.moveToFailed(new Error('Cancelled by user'), '0')`):** The second argument to `moveToFailed` is the worker token. Passing `'0'` (a dummy token) may cause BullMQ to reject the call in newer versions that validate token ownership, silently failing the cancellation.
  - **Fix:** Check BullMQ docs for the correct approach; for worker-external cancellation, `job.discard()` or a cancellation flag in job data is more reliable.

### MEDIUM (code quality)
- **Line 239:** The non-null assertion `job.id!` suppresses a legitimate TypeScript type safety check. This is a type assertion hiding a potential undefined at runtime.

---

## browserTool.ts

### CRITICAL (will crash in production)
- **Lines 29–30 (`_browser`, `_pages` as module-level globals):** The shared browser instance and pages map are module-level singletons with no mutex or lock. If two concurrent requests call `getPage('default')` simultaneously, both pass the `if (existing)` check on line 61 as `false`, both call `getBrowser()` and `context.newPage()`, and only the second result is stored (line 79), leaking the first page/context forever. Under load this creates a browser context/page leak.
  - **Fix:** Use a per-session-key lock (e.g., a Map of in-flight Promises) to serialize concurrent `getPage` calls for the same session key.

- **Line 573 (`page.evaluate(script)`):** `script` is a raw string passed directly to `page.evaluate`. This accepts arbitrary JavaScript from the request body (via `browserRoutes.ts` line 75) with no sandboxing, allowing SSRF to internal metadata services, filesystem reads via `fetch('file:///etc/passwd')`, or exfiltration of environment secrets. This is a **remote code execution** vector.
  - **Fix:** Either remove the `browser_evaluate` endpoint from the REST API entirely (keep it only as an internal tool), or apply strict allow-listing of what scripts can be executed via the HTTP layer.

### HIGH (incorrect behavior)
- **Line 600 (`args.filename`):** The `filename` parameter in `executeBrowserPdf` is accepted from the caller without sanitization. A caller can pass `../../../etc/cron.d/evil.pdf` as the filename, and `path.join(SANDBOX_DIR, filename)` on line 614 would resolve outside the sandbox (the `.endsWith('.pdf')` check does not prevent traversal).
  - **Fix:** Apply `path.basename(filename)` before joining: `const safeFilename = path.basename(filename.endsWith('.pdf') ? filename : filename + '.pdf');`

- **Lines 59–81 (`getPage`):** Every call to `getPage` creates a new `browser.newContext()` (line 73) but **never stores or closes the context**. The context handle is discarded after `newPage()`, making it impossible to close the context cleanly (only the page is closed in `closePage`). Over many sessions, browser contexts accumulate, leaking memory.
  - **Fix:** Store the context alongside the page: `_pages.set(sessionKey, { page, context })`. In `closePage`, call `context.close()` instead of `page.context().close()`.

- **Line 328–329 (URL scheme not validated):** `browse_url` validates the URL parses as a `URL` object (line 328) but does not restrict the scheme. A caller can pass `file:///etc/passwd` or `javascript:alert(1)`, which Playwright will happily navigate to, reading local files or executing JS in a privileged context.
  - **Fix:** `if (!['http:', 'https:'].includes(new URL(url).protocol)) return { success: false, error: 'Only http/https URLs are supported' };`

### MEDIUM (code quality)
- **Lines 168–267 (`ADVANCED_BROWSER_SCHEMAS` defined then immediately pushed):** `ADVANCED_BROWSER_SCHEMAS` is declared as a `const` but is used only once (line 270) to mutate `BROWSER_TOOL_SCHEMAS`. The intermediate variable serves no purpose; inline the spread or define all schemas in one array.
- **Line 65 (`existing.url()` — synchronous in Playwright):** `page.url()` is synchronous in Playwright and does not throw for closed pages in all versions; a better liveness check is `!page.isClosed()`. Using a try/catch around a no-op call is fragile.

---

## imageGenTool.ts

### HIGH (incorrect behavior)
- **Line 273 (redirect loop in `downloadFile`):** The function calls itself recursively on redirects with no hop counter. A redirect loop (A → B → A) will recurse indefinitely, eventually causing a stack overflow. The comment says "up to 5 hops" but the code enforces no limit.
  - **Fix:** Add a `hopCount` parameter defaulting to 0 and throw if `hopCount >= 5`.

- **Line 179 (`size as OpenAI.Images.ImageGenerateParams["size"]`):** The `size` value is passed from user input with a cast assertion and no runtime validation against the allowed enum values. An invalid size (e.g., `"100x100"`) is forwarded directly to the OpenAI API, which returns a 400 error. The error is caught, but the user receives a generic "API call failed" message with no indication the size was invalid.
  - **Fix:** Validate `size` against the allowed set before calling the API: `const VALID_SIZES = ['256x256','512x512','1024x1024','1024x1792','1792x1024']; if (!VALID_SIZES.includes(size)) return { success: false, error: \`Invalid size '${size}'\` };`

- **Lines 213–229 (download loop without concurrency control):** Up to 4 images (`n` is clamped to 1–4) are downloaded sequentially in a `for` loop. Each download has a 60-second timeout. With n=4, total download time could reach 240 seconds, blocking the calling context.
  - **Fix:** Use `Promise.all` for parallel downloads.

### MEDIUM (code quality)
- **Line 99:** `parseInt(args.n || '1', 10)` — if `args.n` is the string `"abc"`, `parseInt` returns `NaN`, and `Math.max(1, NaN)` returns `NaN` (not `1`). The subsequent `Math.min(4, NaN)` also returns `NaN`, which is passed as `n` to the API.
  - **Fix:** `const n = Math.min(4, Math.max(1, parseInt(args.n || '1', 10) || 1));`

---

## contextCompactor.ts

### HIGH (incorrect behavior)
- **Line 34–37 (`estimateMessageTokens`):** `msg.content` is accessed with no null guard. If any message has a `null` or `undefined` content (possible with tool messages or partial DB rows), `msg.content.length` on line 31 inside `estimateTokens` throws `TypeError: Cannot read properties of null`.
  - **Fix:** `return Math.ceil((msg.content ?? '').length / 4) + 4;`

- **Line 82–87 (transcript for summarization):** `m.content.length` is accessed directly in `summarizeOldMessages`. Same null hazard as above for messages with null content.
  - **Fix:** `const excerpt = (m.content ?? '').length > 2000 ? ...`

### MEDIUM (code quality)
- **Line 174 (`hardDropToSkeleton`):** Calls `splitMessages(messages, 4)` and then takes `tailMessages.slice(-4)`. Since `splitMessages` already keeps the last 4 as `tailMessages`, the second `.slice(-4)` is always a no-op (it can't shrink an array already of max length 4). This is dead/confusing code.
  - **Fix:** Remove the redundant `.slice(-4)` and just use `tailMessages` directly.

- **Lines 104–129:** The `summarizeOldMessages` function swallows all errors from the LLM call in a bare `catch {}` and falls back to a truncated transcript. The error is never logged. Production debugging becomes very difficult when the compactor silently degrades.
  - **Fix:** `catch (err) { console.warn('[contextCompactor] Summarization failed, using fallback:', err); ... }`

---

## skillChaining.ts

### HIGH (incorrect behavior)
- **Line 237 (`stepIdToTaskId.get(step.stepId)!`):** Non-null assertion on a Map lookup. If a `SkillChain` is constructed externally (via API or future code) with a `stepId` that was not registered in the map, this is `undefined!` and crashes when used as a task ID.
  - **Fix:** `const taskId = stepIdToTaskId.get(step.stepId); if (!taskId) throw new Error(\`Chain step '${step.stepId}' has no mapped task ID\`);`

- **Line 243 (`[stepIdToTaskId.get(step.inputFrom)!].filter(Boolean)`):** The non-null assertion is applied before the `.filter(Boolean)`. If `step.inputFrom` is not a valid stepId (e.g., a typo in a custom chain), `get()` returns `undefined`, the `!` suppresses the type error, and the resulting `dependsOn: [undefined]` array is filtered to `[]` — silently ignoring the invalid dependency reference instead of failing.
  - **Fix:** Validate `step.inputFrom` against the stepId map before building `dependsOn`, and throw on invalid references.

### MEDIUM (code quality)
- **Line 202 (`availableSkills: Skill[]` parameter):** The `availableSkills` parameter in `detectChain` is declared but never used (confirmed by line 203 which only uses `userMessage`). This is dead parameter / unused import.
  - **Fix:** Remove the parameter or add the `_` prefix convention: `_availableSkills: Skill[]`.

---

## memoryUpgrades.ts

### HIGH (incorrect behavior)
- **Lines 79–81 (`termFrequency`):** Division by `tokens.length` — if `tokens` is empty, this divides by zero, producing `NaN` TF values. This cascades into `tfidfScore` becoming `NaN`, which then causes `Math.min(NaN, 1.0)` to return `NaN`, and the `blended > 0` check on line 167 to be `false` (NaN comparisons are always false), silently dropping all results when a query or document tokenizes to nothing.
  - **Fix:** Guard at entry: `if (tokens.length === 0) return new Map();`

- **Lines 339–353 (`deduplicateMemories` — `a.importance > b.importance`):** `a.importance` and `b.importance` may be `null`, `undefined`, or non-numeric depending on the DB schema. A direct `>` comparison with `null` or `undefined` produces `false`, causing the tiebreak to fall through to the `createdAt` comparison, which silently picks the wrong entry to keep.
  - **Fix:** Normalize: `const aImp = a.importance ?? 0; const bImp = b.importance ?? 0;` before comparing.

### MEDIUM (code quality)
- **Lines 222–224 (`extractEntities`):** Each regex in `ENTITY_PATTERNS` has the `g` flag. Line 224 resets `lastIndex = 0` before calling `.match()` (not `.exec()`). `String.prototype.match` with a global regex returns all matches at once and does not use `lastIndex`, so the reset is a no-op. However, if someone later changes `.match()` to `.exec()` in a loop, the missing reset would cause skipped matches.
  - **Fix:** Comment explaining `.match()` does not use `lastIndex`, or switch to `regex.exec()` in a loop for clarity.

---

## errorRecovery.ts

### HIGH (incorrect behavior)
- **Lines 173–208 (retry loop):** The `currentDelay` starts at `cfg.backoffMs` (1000 ms by default) and is multiplied after every attempt. For rate-limit errors the wait is `currentDelay * 3`. With `maxRetries: 3` and `backoffMultiplier: 2`: attempt 1 waits 3000ms, attempt 2 waits 6000ms, attempt 3 waits 12000ms (but skipped per line 202). The total blocking time before fallback is ~9 seconds. This is reasonable, but there is **no jitter**, which means all concurrent workers retrying simultaneously will hammer the API at the same time (thundering herd).
  - **Fix:** Add jitter: `const waitMs = (errClass === 'rate_limit' ? currentDelay * 3 : currentDelay) * (0.75 + Math.random() * 0.5);`

- **Lines 211–244 (fallback):** The fallback model is tried only **once** with no retry. If the fallback model is also temporarily rate-limited, the call fails immediately without any back-off.
  - **Fix:** Wrap the fallback attempt in its own retry loop (or recursively call `withRetryAndFallback` with `fallbackToNextModel: false`).

### MEDIUM (code quality)
- **Line 46–48:** `classifyError` concatenates `error.message` and `error.stack` into `combined`. The stack trace contains the message as its first line, so message keywords are checked twice. This is harmless but wasteful.
  - **Fix:** Check `msg` first; only fall through to stack if needed, or just check `msg` alone since `stack` rarely adds new signal for these patterns.

---

## modelSpeedRouter.ts

### HIGH (incorrect behavior)
- **Lines 268–272 (`routeToOptimalModel`):** Throws a raw `Error` when no enabled models are available. Callers that do not wrap the call in try/catch will crash. The orchestrator calling this during planning would take down the whole task with an unhandled exception.
  - **Fix:** Return a typed failure result rather than throwing: `return { modelId: '', reason: 'No enabled models', estimatedLatencyMs: 0, costTier: 'low' }` or add a `| null` return type and handle null at call sites.

### MEDIUM (code quality)
- **Lines 31–94 (keyword arrays as module-level `const`):** These arrays are allocated once at module load, which is fine. However, `CREATIVITY_KEYWORDS` contains `"write"` and `"create"` which are extremely common words in any prompt, making `requiresCreativity: true` for a large fraction of all tasks. This dilutes the scoring signal.
  - **Fix:** Review keyword specificity — consider requiring multi-word phrases like `"write a story"` or context markers to reduce false positives.

- **Line 107:** `tokenEstimate` multiplies the character count by 3 for "expected output". This produces a very large estimate for long task descriptions and will over-prefer powerful models. The multiplier is undocumented and hardcoded.
  - **Fix:** Move `3` to a named constant `OUTPUT_TOKEN_MULTIPLIER = 3` and document the rationale.

---

## browserRoutes.ts

### CRITICAL (will crash in production)
- **Line 16 (`info.url`, `info.title`, `info.viewport`):** `getBrowserSessionInfo` returns `null` when the session is not found or the page is closed (line 793 in browserTool.ts). On line 16–19 here, `info.url`, `info.title`, and `info.viewport` are accessed unconditionally with no null check. If any session in `keys` is stale (closed between `listBrowserSessions` and `getBrowserSessionInfo`), this throws `TypeError: Cannot read properties of null (reading 'url')` which propagates to the outer `catch` on line 23 and returns a 500.
  - **Fix:** Filter out null: `return { key, url: info?.url ?? '', title: info?.title ?? '', viewport: info?.viewport ?? { width: 1280, height: 800 } };`

### HIGH (incorrect behavior)
- **Line 73 (POST /api/browser/evaluate — no auth / authorization):** The evaluate endpoint executes arbitrary JavaScript in the browser context. There is no authentication middleware shown on any of these routes. Any unauthenticated caller with network access to the server can use this to perform SSRF, read local files, or exfiltrate secrets. This is an **unauthenticated RCE** endpoint in any deployment without a network-level firewall.
  - **Fix:** Add authentication middleware to all `/api/browser/*` routes, and consider removing the evaluate endpoint from the REST layer entirely (see also browserTool.ts finding).

- **Line 32–39 (POST /api/browser/navigate — url not validated):** `url` from the request body is passed as `String(url)` but not validated as a safe HTTP/HTTPS URL before being forwarded to `executeBrowserTool`. The same scheme-validation bypass noted in browserTool.ts applies here.
  - **Fix:** Validate URL scheme before constructing `args`: `if (!/^https?:\/\//i.test(String(url))) return res.status(400).json({ error: 'Only http/https URLs are allowed' });`

### MEDIUM (code quality)
- **All routes (lines 8–129):** No input length/type validation beyond `if (!url)` and `if (!action)`. Fields like `session`, `selector`, `value`, and `script` accept arbitrary-length strings. A caller can send a 100 MB `script` string, allocating a huge string in memory before it ever reaches Playwright.
  - **Fix:** Add length caps: `if (String(script).length > 100_000) return res.status(400).json({ error: 'Script too long' });`

---

## processWatchdog.ts

### HIGH (incorrect behavior)
- **Line 308 (`incrementRestartCount` called in `initWatchdog`):** `initWatchdog` calls `incrementRestartCount` unconditionally on every startup — including the very first, clean boot. The state file will show `restartCount: 1` immediately after a fresh deployment even if the server has never crashed. The comment says "On first boot, increment crash counter (represents a (re)start)" but this conflates intentional restarts with crashes, making the crash counter unreliable as a production health signal.
  - **Fix:** Only increment on crash paths (`handleFatalError`). On clean first boot, call `loadRestartCount()` to populate `_restartCount` without incrementing.

- **Line 367–382 (`getHealthStatus`):** The returned object includes `uptimeMs` and `pid` fields that are not declared in the `HealthStatus` interface (lines 69–83). TypeScript will allow this at runtime via structural typing but the contract is wrong — callers relying on the type won't know these fields exist.
  - **Fix:** Add `uptimeMs: number; pid: number; eventLoopLagMs: number;` to the `HealthStatus` interface.

### MEDIUM (code quality)
- **Line 126–129 (`scheduleLagMeasure`):** The lag measurement timer (`_lagMeasureTimer`) is created with `setTimeout(0)` and immediately chains itself. This creates a chain of `setTimeout(0)` calls that fires continuously. While each is unref'd, this may interfere with other `setTimeout(0)` work in the event loop and produces a measurement that includes macro-task queue latency rather than pure event-loop lag.
  - **Fix:** Use a longer interval (e.g., 500 ms) for lag measurement to reduce interference: `_lagMeasureTimer = setTimeout(scheduleLagMeasure, 500);`

- **Lines 260–261 (fatal handler timer cleanup):** `_heartbeatTimer` and `_lagMeasureTimer` are cleared in `handleFatalError` but the references are not nulled. If somehow `handleFatalError` is called twice (despite the `_isShuttingDown` guard), `clearInterval`/`clearTimeout` would be called on already-cleared timer IDs, which is harmless but indicates state could be stale.

---

## taskCheckpointing.ts

### CRITICAL (will crash in production)
- **Line 16 (hardcoded absolute path):** `CHECKPOINT_DIR` is hardcoded to `/home/user/workspace/ultra-computer/data/checkpoints`. This path is specific to the development environment and will fail in any other deployment (Docker, cloud, CI). The directory creation on line 23 (`fs.mkdirSync`) will silently succeed if the path exists but throw with `ENOENT` if the parent directories do not exist in a different environment, crashing the module at import time.
  - **Fix:** Use `path.resolve(process.cwd(), 'data/checkpoints')` or `path.resolve(__dirname, '../../data/checkpoints')`, and document the `DATA_DIR` environment variable override.

- **Line 74 (`writeCheckpoint`):** `fs.writeFileSync` has no try/catch. A disk-full condition, permissions error, or I/O failure throws synchronously and propagates uncaught through `updateCheckpoint`, `advanceStep`, `completeTask`, and `failTask` — crashing any task that tries to update its state. The caller has no way to distinguish a "checkpoint not found" error from a disk write failure.
  - **Fix:** Wrap in try/catch and either rethrow with a descriptive error or log and degrade gracefully.

### HIGH (incorrect behavior)
- **Lines 62–69 (`readCheckpoint`):** Returns `null` silently on any read error, including corrupted JSON (e.g., from a partial write during a prior crash). A corrupted checkpoint file is indistinguishable from a "not found" case, causing `updateCheckpoint` / `advanceStep` to throw "Checkpoint not found" and discard recovery data.
  - **Fix:** Distinguish `ENOENT` (truly not found → return `null`) from parse errors (corrupted → log a critical error and return `null`, but also back up the corrupted file for investigation).

- **Line 248 (`taskId = path.basename(file, '.json')`):** In `getAllCheckpoints`, the taskId is derived from the filename. If a non-checkpoint `.json` file is placed in the checkpoint directory (e.g., a config file), it will be parsed as a checkpoint. If parsing succeeds but the object doesn't match `TaskCheckpoint`, downstream code will access undefined fields and crash.
  - **Fix:** Add a schema validation step: skip any entry where `cp.taskId !== taskId` (file name vs. content mismatch).

### MEDIUM (code quality)
- **Lines 383–404 (`startCheckpointHeartbeats`):** The heartbeat loop calls `getAllCheckpoints('running')` on every tick, which reads all `.json` files from disk. With thousands of checkpoints this is an O(n) disk scan every 30 seconds. There is no in-memory cache.
  - **Fix:** Maintain an in-memory set of active task IDs and only fall back to a full disk scan at startup.

---

## cronScheduler.ts

### CRITICAL (will crash in production)
- **Line 80–81 (hardcoded absolute path):** `DATA_DIR` and `STORE_PATH` are hardcoded to `/home/user/workspace/ultra-computer/data`. Same portability issue as `taskCheckpointing.ts` — will crash in any deployment where this path doesn't exist.
  - **Fix:** Use `path.resolve(process.cwd(), 'data')`.

- **Line 106 (`_jobs = loadStore()`):** `_jobs` is populated at module load time. `loadStore` calls `ensureDataDir` and `fs.readFileSync`. If the filesystem is not ready at import time (e.g., a read-only filesystem in a container before volume mounts), this throws synchronously and prevents the module from loading, crashing the entire server.
  - **Fix:** Defer the initial load to an explicit `initScheduler()` function called during app startup, after verifying the data directory is writable.

### HIGH (incorrect behavior)
- **Line 100–103 (`saveStore`):** `saveStore` writes the entire `_jobs` array with `fs.writeFileSync` directly (no atomic write). If the process crashes mid-write, the `cron-jobs.json` file will be truncated/corrupted, and `loadStore` will silently return `[]` on next startup (line 95–97), losing all job definitions.
  - **Fix:** Write to a `.tmp` file and `fs.renameSync` (atomic on POSIX), as done in `selfLearning.ts`.

- **Lines 562–634 (`tick` function):** The `tick` is fired with `setInterval(() => void tick(), 30_000)` (line 649). If a tick takes longer than 30 seconds (e.g., a slow `parseCron` on many jobs), the next tick fires while the previous is still running, potentially double-firing jobs that were already picked up. The `firedMinutes` deduplication only helps within the same `epochMinute`, not across overlapping tick executions.
  - **Fix:** Use `setTimeout` recursively (schedule next tick only after current tick completes) instead of `setInterval`.

- **Line 117–120 (`generateId`):** Uses `Math.random()` for ID generation. Math.random is not cryptographically random and produces only 2^53 distinct values, giving a collision probability of ~1% after 10^7 IDs (birthday paradox at scale). In a system that auto-creates many cron jobs this is a realistic concern.
  - **Fix:** Use `crypto.randomUUID()` or `crypto.randomBytes(8).toString('hex')`.

### MEDIUM (code quality)
- **Line 186–199 (parser `parseSingleField`):** The range parser splits on `-` using `rangeToken.split('-')` without limiting splits. A value like `10-20-30` would produce a 3-element array; `[s, e]` destructuring would silently drop the third element. The subsequent `isNaN` check won't catch this.
  - **Fix:** Use a strict regex: `if (!/^\d+-\d+$/.test(rangeToken)) throw new Error(...)`.

---

## circuitBreaker.ts

### HIGH (incorrect behavior)
- **Lines 240–254 (`_executeClosed`) and 257–287 (`_executeHalfOpen`):** Both methods mutate shared instance state (`_totalCalls`, `failureTimestamps`, `halfOpenInflight`, etc.) via callbacks in `.then()`. In a concurrent Node.js environment with many in-flight requests, these mutations are not atomic. For example, two concurrent failures in `_executeClosed` can both read `failureTimestamps.length < threshold` before either has pushed, allowing the circuit to be tripped twice simultaneously (two `_transitionToOpen` calls), doubling `_openCount`.
  - **Fix:** Since Node.js is single-threaded, standard `.then()` callbacks are safe from true data races. However, the issue is that `_executeClosed` increments `_totalCalls` synchronously but the failure recording happens asynchronously in the rejection handler — if `fn()` is synchronous-throwing rather than promise-rejecting, the count is still incremented but the throw path may bypass `.then/.catch` in some edge cases. Add a test for synchronous throws inside `fn()`.

- **Line 249:** `this.failureTimestamps.length >= this.config.failureThreshold` — this compares the **pruned** failure timestamps array length against the threshold. However, `_pruneOldFailures` is only called inside `_recordFailure` (line 336) and `getStats` (line 193). If many failures happen rapidly, old timestamps outside the window are not pruned until the next failure arrives, potentially causing the circuit to open based on stale counts.
  - **Fix:** Call `_pruneOldFailures()` at the start of the threshold check: before line 249, call `this._pruneOldFailures()`.

### MEDIUM (code quality)
- **Line 374–382 (`getBreaker`):** If a breaker already exists, the `config` overrides passed to `getBreaker` are **silently ignored**. This is documented in the comment, but it can cause subtle bugs if different parts of the codebase try to configure the same breaker with different thresholds — only the first one wins. There is no warning.
  - **Fix:** Log a warning if a breaker already exists and `config` overrides were passed: `if (this.breakers.has(name) && config) console.warn('[CircuitBreaker] getBreaker: config overrides ignored for existing breaker:', name);`

---

## selfLearning.ts

### CRITICAL (will crash in production)
- **Lines 19–21 (hardcoded absolute path):** `DATA_DIR` is hardcoded to `/home/user/workspace/ultra-computer/data/learning`. Same portability issue as other files.
  - **Fix:** `path.resolve(process.cwd(), 'data/learning')`.

### HIGH (incorrect behavior)
- **Lines 212–215 (`logExecution`):** `loadLog()` reads the entire execution log JSON on every single `logExecution` call, appends an entry, and rewrites the full file. With a busy system logging hundreds of executions per hour, this is O(n) disk I/O per log entry. Over days the log grows to MB and each write becomes progressively slower, eventually blocking the event loop.
  - **Fix:** Keep a write-through in-memory log array; batch flushes to disk (e.g., every 10 entries or every 60 seconds via a timer), similar to the buffer pattern in `skillAutoImprove.ts`.

- **Lines 175–177 (`writeJson`):** Uses `fs.writeFileSync(tmp, ...)` then `fs.renameSync(tmp, filePath)`. This is the correct atomic write pattern. However, if `fs.writeFileSync` to the `.tmp` file throws (e.g., disk full), the original `filePath` is left intact (good), but `tmp` is left as a partial file on disk. On the next run, `readJson` won't read the `.tmp` file so it won't corrupt, but the orphaned temp file is never cleaned up.
  - **Fix:** Wrap in try/catch and clean up the temp file: `try { ... } catch(e) { try { fs.unlinkSync(tmp); } catch {} throw e; }`

- **Lines 285–336 (`getLearningStats`):** Calls `loadLog()` and `loadRules()` (two full file reads) synchronously for every stats request. If this is called frequently (e.g., on every health check), it creates unnecessary I/O pressure.
  - **Fix:** Cache the stats with a 60-second TTL, invalidating on `logExecution`.

### MEDIUM (code quality)
- **Line 324 (`Math.max(...rules.map(...))`):** Uses spread operator with `Math.max`. If `rules` is very large (thousands of entries), this can cause a "Maximum call stack size exceeded" error because JavaScript engines have argument count limits for spread.
  - **Fix:** `rules.reduce((max, r) => Math.max(max, r.lastValidatedAt), 0)`.

---

## skillAutoImprove.ts

### CRITICAL (will crash in production)
- **Lines 17–19 (hardcoded absolute path):** `DATA_DIR` is hardcoded to `/home/user/workspace/ultra-computer/data/learning`. Same portability issue.
  - **Fix:** `path.resolve(process.cwd(), 'data/learning')`.

### HIGH (incorrect behavior)
- **Lines 113–114 (`writePerformanceRecords`):** Writes directly with `fs.writeFileSync` (no atomic rename). A crash mid-write corrupts the performance records file. Compare with `selfLearning.ts` which uses the tmp+rename pattern correctly.
  - **Fix:** Use the same atomic write pattern as `selfLearning.ts`: write to `.tmp` then `fs.renameSync`.

- **Lines 128–135 (`writeSuggestions`):** Same issue — non-atomic write. A crash during this write corrupts the suggestions file, and on the next run `readSuggestions` returns `[]`, losing all pending suggestions.
  - **Fix:** Same atomic write fix.

- **Lines 319–324 (`recordSkillExecution` — eager disk read/write on hot path):** Every call to `recordSkillExecution` calls `readPerformanceRecords()` and potentially `writePerformanceRecords()` synchronously to update the skill name. This is a synchronous disk read + write on what could be a very hot path (called after every skill execution). With large performance files this blocks the event loop.
  - **Fix:** Cache the performance records in memory with a dirty flag; only flush when `analyzeSkillPerformance` is called.

- **Lines 730–733 (`applyAddTriggerKeywords`):** The `proposedChange` string is parsed with `JSON.parse(match[0])` where `match[0]` is the first regex match of `\[.*\]`. A maliciously crafted `proposedChange` (e.g., from the DB) could contain `[1,2,__proto__]` or other prototype pollution payloads in older Node.js versions.
  - **Fix:** Validate that the parsed result is `string[]` before use: `if (!Array.isArray(newKeywords) || !newKeywords.every(k => typeof k === 'string')) return false;`

### MEDIUM (code quality)
- **Line 97 (`executionBuffer` module-level Map):** The in-memory `executionBuffer` accumulates `ExecutionSample` objects indefinitely until `analyzeSkillPerformance` or `analyzeAllSkills` is called. If those analysis functions are never called (e.g., the auto-improve loop is not started), the buffer grows without bound, leaking memory.
  - **Fix:** Cap the buffer per skill at a maximum of 1,000 samples, dropping oldest when exceeded. Add a startup warning if the auto-improve loop is not running within 60 seconds.

- **Line 393 (`coActivationLog` module-level Map):** The co-activation log grows indefinitely with no eviction policy. Over a long uptime with many skill combinations this leaks memory.
  - **Fix:** Limit the inner Map to the top-N (e.g., 100) most frequent partners per skill, evicting the least frequent when the limit is reached.

---

## Summary

| Severity | Count |
|----------|-------|
| **CRITICAL** (will crash in production) | **18** |
| **HIGH** (incorrect behavior) | **34** |
| **MEDIUM** (code quality) | **26** |
| **Total** | **78** |

### Critical Issues by File

| File | Critical |
|------|---------|
| fileRoutes.ts | 2 |
| oauthFlow.ts | 1 |
| exportSession.ts | 1 |
| taskQueue.ts | 2 |
| browserTool.ts | 2 |
| contextCompactor.ts | 0 |
| skillChaining.ts | 0 |
| memoryUpgrades.ts | 0 |
| errorRecovery.ts | 0 |
| modelSpeedRouter.ts | 0 |
| browserRoutes.ts | 1 |
| processWatchdog.ts | 0 |
| taskCheckpointing.ts | 2 |
| cronScheduler.ts | 2 |
| circuitBreaker.ts | 0 |
| selfLearning.ts | 1 |
| skillAutoImprove.ts | 2 |
| imageGenTool.ts | 0 |

### Top Priority Fixes Before Production

1. **`browserTool.ts` / `browserRoutes.ts`:** Unauthenticated `browser_evaluate` endpoint is an RCE vector. Must be gated or removed before any public deployment.
2. **`taskCheckpointing.ts` / `cronScheduler.ts` / `selfLearning.ts` / `skillAutoImprove.ts`:** All four files hardcode `/home/user/workspace/...` absolute paths, making them non-portable. Every production deployment will either fail to start or write to the wrong location.
3. **`taskQueue.ts`:** Redis host is hardcoded to `localhost:6379` and the worker is a stub. Queue is non-functional as shipped.
4. **`oauthFlow.ts`:** In-memory state store breaks OAuth in any multi-process deployment.
5. **`fileRoutes.ts`:** Unsanitized `originalname` in multer storage allows filename-based path attacks. Unhandled stream errors crash the process.
