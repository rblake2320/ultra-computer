# Production Readiness Audit — Server Protocol & Remaining Files

Audited files in `/home/user/workspace/ultra-computer/server/`:
`a2aProtocol.ts`, `mcpProtocol.ts`, `cliToolEngine.ts`, `protocolRoutes.ts`,
`messagingHub.ts`, `messagingRoutes.ts`, `nipEngine.ts`, `nipRoutes.ts`,
`identityEngine.ts`, `identityRoutes.ts`, `cacheEngine.ts`, `cacheRoutes.ts`,
`marketplaceRoutes.ts`, `marketplaceScoring.ts`, `autonomyRoutes.ts`

---

## a2aProtocol.ts

### CRITICAL (will crash in production)

- **Line 200/206**: `taskRegistry` and `agentRegistry` are plain in-memory `Map`s with no size cap. A sustained message/send flood creates unbounded tasks — the server will eventually OOM. **Fix:** Add a max-size LRU eviction policy or schedule periodic cleanup of completed/failed tasks older than N minutes.

- **Line 432**: Fallback string in the orchestrator error path includes the raw `userText` in a response echoed back to the external caller: `` `Received your message: "${userText}"` ``. If `userText` is multi-megabyte (no size limit is enforced on `message.parts`), this allocates a large string twice and can crash on serialisation. **Fix:** Validate and truncate `userText` before use; do not echo arbitrary content.

- **Line 383–387**: The validation of `message.parts` only checks `Array.isArray(message.parts)` — it does **not** check that `message.role` is one of `"user" | "agent"`, that `message.messageId` is present, or that each part object has a `kind` field. A malformed `A2AMessage` with `parts: [{}]` will silently produce `extractTextFromParts([{}]) → ""` and start an orchestrator run with an empty string. **Fix:** Validate the full A2A message schema before creating the task.

### HIGH (incorrect behavior)

- **Line 308**: `getAgentCard` defaults `baseUrl` to the hardcoded string `"http://localhost:5000"`. In production the base URL must come from an environment variable (e.g. `process.env.BASE_URL`). Any external A2A client that fetches the agent card and uses the `url` field to send follow-up messages will send them to `localhost`. **Fix:**
  ```ts
  export async function getAgentCard(
    baseUrl: string = process.env.BASE_URL ?? "http://localhost:5000"
  ): Promise<AgentCard>
  ```

- **Line 407–428**: The `handleMessageSend` inner Promise never sets a timeout. If `runOrchestrator` hangs indefinitely (network stall, deadlock), the RPC call never resolves and the Express request times out without cleaning up the subscription. `subscribeToConversation` is called but if the outer promise is abandoned due to HTTP timeout the callback reference leaks. **Fix:** Add an `AbortController` / `setTimeout` guard around the promise, and ensure `unsubscribeFromConversation` is always called in a `finally` block.

- **Line 520–525**: `runOrchestrator` promise rejection pushes to `eventQueue` and sets `done = true`, but the `while` loop condition `!done || eventQueue.length > 0` can re-enter the loop after `done` is set and process the error event, then attempt to use an already-unsubscribed callback. Race condition if `runOrchestrator` resolves synchronously. **Fix:** Break immediately after processing `error` event type and ensure `unsubscribeFromConversation` is idempotent.

- **Line 450–451**: On orchestrator failure in `handleMessageSend`, the catch block calls `transitionTask(task.taskId, "failed", ...)` then **returns `rpcSuccess`** (HTTP 200) wrapping the failed task. This is semantically wrong — a failed task should return `rpcSuccess` with the task object per A2A spec, but the `error` field on the task is only populated at the internal level; there is no RPC-level error code that would let clients distinguish success from execution failure without reading the task state. This is consistent with A2A spec but should be documented explicitly and the internal error should be sanitised to avoid leaking stack traces.

### MEDIUM (code quality)

- **Line 334**: Protocol version `"0.3.0"` is hardcoded. This should be a module constant (it already exists elsewhere in similar patterns). Low risk but creates a maintenance burden when the spec version changes.

- **Line 874–900**: The SSE `streamMessage` client function concatenates multi-line `data:` payloads by appending to `currentData` on each line, but the spec allows `data:` to span multiple lines and they should be joined with `\n`, not concatenated directly. **Fix:** Change `currentData += line.slice("data:".length).trim()` to `currentData += (currentData ? "\n" : "") + line.slice("data:".length).trim()`.

---

## mcpProtocol.ts

### CRITICAL (will crash in production)

- **Line 35**: `MCP_BEARER_TOKEN` is logged to stdout in plaintext at startup: `console.log(`[mcpProtocol] MCP server bearer token: ${MCP_BEARER_TOKEN}`)`. In any environment that ships logs to a logging service (Datadog, CloudWatch, Splunk), the secret token will be stored permanently in plaintext. **Fix:** Either never log the token, or log only the first 8 characters as a confirmation hint. The operator onboarding doc should describe how to retrieve it securely.

- **Line 321**: `handleResourceRead` calls `new URL(uri)` inside a `try` but this is inside the `resources/read` handler which already validates the URI at line 732–736. However, if the URI contains a custom scheme like `file://`, the parsed `url.hostname` will be empty for paths like `file:///etc/passwd`, meaning `id` becomes the path after stripping `/`. The `executeTool("read_file", { filename: id })` call on line 384 trusts that `executeTool` enforces sandbox restrictions — but there is **no path sanitisation in this layer**. If `executeTool` has a bypass, arbitrary file reads are possible. **Fix:** Add an explicit path sanitisation check before calling `executeTool`, rejecting paths starting with `/etc`, `/proc`, `/sys`, `..` traversals, etc.

- **Line 402**: `JSON.parse((model.capabilities as string) || "[]")` can throw if `model.capabilities` contains invalid JSON. This is inside `handleResourceRead` which itself is inside a `try/catch`, so it won't crash the process, but it will return a 500 error to the MCP client for what should be a valid model resource. **Fix:** Wrap in its own try/catch with a fallback of `[]`.

### HIGH (incorrect behavior)

- **Line 641**: `const params = (req.params || {}) as Record<string, unknown>` — `req.params` is always `{}` when there are no route params in Express and `undefined` is never returned. The cast to `Record<string, unknown>` discards type safety. When `tools/call` reads `params.name as string`, if the actual JSON-RPC `params` field is e.g. `null` (allowed by spec for notifications), this will throw a type error. **Fix:** Validate `req.params` is an object before coercing.

- **Line 680–681**: `tools/call` casts `params.arguments` directly to `Record<string, string>` without validation: `const toolArgs = (params.arguments || {}) as Record<string, string>`. If the arguments object contains non-string values (numbers, arrays, objects), the cast silently lies to TypeScript and the downstream tool may behave incorrectly or crash. **Fix:** Validate that `params.arguments` is a plain object if present.

- **Lines 996–1005**: In `connectToServer`, after a failed `initialize` handshake, the connection is left in `"error"` state and stored in the registry: `serverRegistry.set(id, conn)`. Subsequent calls to `listConnectedServers()` filter by `status === "connected"` so these won't surface, but the registry grows unboundedly with failed attempts. **Fix:** Remove the failed entry from the registry in the catch block, or at least document that callers must call `disconnectServer(id)` after a failed connect.

### MEDIUM (code quality)

- **Line 574 (hardcoded constant)**: `COST_PER_TOKEN_USD = 0.000_015` is a hardcoded GPT-4o pricing estimate. This will silently produce wrong cost savings estimates for other models. The value should come from a configuration file or the model record itself.

- **Line 402**: `model.capabilities` is cast `as string` then JSON-parsed. The schema type should be checked at the storage layer; the cast hides a potential type bug.

- **Line 1172**: The module exports `MCPServerConnection` and `MCPTool` as both named exports and re-exports from the `export {}` block at the bottom. This creates duplicate exports that TypeScript may warn about depending on tsconfig.

---

## cliToolEngine.ts

### CRITICAL (will crash in production)

- **Line 507**: `execAsync(\`which ${name} 2>/dev/null\`)` executes `which` with tool names sourced from `PROBED_TOOLS`. While `PROBED_TOOLS` is a static array defined in the module, the `name` field is unsanitised. If `addToBlocklist` is used to extend logic and a future code path passes a user-supplied tool name to `getInstalledTools`-equivalent, command injection is possible. Currently safe as `PROBED_TOOLS` is hardcoded, but the pattern establishes a dangerous convention. **Fix:** Validate that `name` matches `/^[a-zA-Z0-9_\-\.]+$/` before interpolating.

- **Line 853–875**: `executeCodeInterpreter` constructs pip/npm package names from comment headers in user-supplied code via `PIP_HEADER_RE` / `NPM_HEADER_RE`. These package names are injected into shell commands: `pip3 install --quiet ${packages.map((p) => JSON.stringify(p)).join(" ")}`. While `JSON.stringify` wraps in double quotes, a package name like `"; rm -rf /tmp"` (after parsing) would result in `pip3 install --quiet ""; rm -rf /tmp""` — the double-quote escaping relies on the shell not interpreting the inner string, which depends on `executeCommand` using `/bin/sh -c`. `JSON.stringify` adds double quotes but does **not** escape all shell metacharacters within the string content. **Fix:** Validate each extracted package name against `/^[a-zA-Z0-9\-_.>=<!]+$/` (a PEP 508/npm name pattern) before passing to the command.

- **Line 396–406**: `executeScript` writes the script to `os.tmpdir()` with permissions `0o700` and a random UUID filename, then runs it. If the process is running as root (common in Docker), `0o700` is not restrictive. More importantly, the script file is written and immediately executed — there is a TOCTOU window where another process on the same host could overwrite the file between write and execution. **Fix:** Use `fs.mkdtemp` to create a private temp directory, write the script there, and use the directory path directly.

### HIGH (incorrect behavior)

- **Line 237**: `const env = { ...process.env, ...(opts.env ?? {}) } as Record<string, string>`. Spreading `process.env` passes **all** server environment variables (including API keys, `DATABASE_URL`, `OPENAI_API_KEY`, etc.) to every spawned shell command. This is an information-disclosure risk: any script that calls `env` or `printenv` will dump all secrets. **Fix:** Only pass a curated allowlist of environment variables to subprocess execution, not the full `process.env`.

- **Line 534–558**: `BLOCKED_PATTERNS` uses simple regex matching against the raw command string. Several patterns are bypassable with trivial obfuscation: `rm -rf /` is blocked but `rm  -r  -f /` (extra spaces) is not matched by `/rm\s+-rf\s+\//`. Similarly, `$(echo rm) -rf /` or `eval 'rm -rf /'` bypass all patterns. The safety validation provides a false sense of security. **Fix:** Document clearly that `validateCommand` is a best-effort heuristic, not a security boundary. Consider process isolation (containers, namespaces) for true sandboxing.

- **Line 440**: `executePipeline` checks `result.exitCode !== 0` to decide if a step failed, but `exitCode` can be `null` (when the process was killed by a signal). `null !== 0` is `true`, so a signal-killed step triggers `failFast` correctly. But the downstream `success` check `results.every((r) => r.exitCode === 0)` will return `false` for a `null` exit code (correct), but the `failedStep` will not be set if `failFast = false` and the process was killed. Minor but can misattribute pipeline failures. **Fix:** Treat `exitCode === null` as a non-zero exit in the `success` check.

- **Lines 1032–1050 (image-resize)**: The `geometry` parameter is constructed from `options.width` and `options.height` which are cast with `as number | undefined` but not validated. A caller passing `options.width = "800; rm -rf /tmp"` would inject into the `convert` command via the `geometry` string. **Fix:** Validate that `width` and `height` are positive integers before constructing the geometry string.

### MEDIUM (code quality)

- **Line 27**: `DEFAULT_WORK_DIR = "/tmp/ultra-sandbox"` is hardcoded. Should be `process.env.ULTRA_WORK_DIR ?? "/tmp/ultra-sandbox"`.

- **Line 466**: `let toolCache: ToolCache | null = null` is module-level mutable state shared across all requests. Under concurrent calls to `getInstalledTools()`, two parallel requests could both find `toolCache === null` and run the full probe concurrently, defeating caching for the first few seconds. **Fix:** Use a pending-promise pattern to deduplicate concurrent cache refreshes.

- **Lines 511–514**: The version probe command `${toolPath} ${versionFlag} 2>&1` is executed with `execAsync` which has a default timeout of ~120 seconds and no explicit timeout override. A stuck tool (e.g. `ssh -V` if `ssh` is misconfigured) can hang the discovery for the full probe duration. **Fix:** Pass a `timeout` option to `execAsync`.

---

## protocolRoutes.ts

### CRITICAL (will crash in production)

- **Line 25**: `const webhookHandlers = new Map<string, (payload: any) => void>()` is declared but **never written to** anywhere in the file. The `webhookRegistry` stores metadata; the handler map is populated in `cliToolEngine.ts`'s `WebhookRegistryImpl` class — but `protocolRoutes.ts` uses its own separate `webhookRegistry` (line 24) and `webhookHandlers` Maps that are completely disconnected from `cliToolEngine.webhookRegistry`. The `POST /api/webhooks/:id` handler on line 466 looks up `webhookHandlers` — this will **always** be empty. Any registered webhook handler code will never be called. **Fix:** Import and use `webhookRegistry` from `cliToolEngine.ts` instead of maintaining a parallel in-memory store.

- **Line 97–108**: `discoverAgent(url)` passes the user-supplied `url` directly to `fetch(cardUrl)` inside `a2aProtocol.ts` with no URL validation. An attacker can supply `url = "http://169.254.169.254/latest/meta-data/"` (AWS metadata), `http://localhost:5432` (internal DB), or similar SSRF targets. The route has no authentication either. **Fix:** Validate that `url` starts with `https://` and passes a blocklist of private IP ranges; require auth on this endpoint.

- **Line 114–122**: `POST /api/protocols/a2a/agents/:id/send` passes `id` (a URL param from the agent registry, expected to be a base URL) directly to `a2aProtocol.sendMessage(id, ...)`. There is **no validation** that `id` is a registered agent URL or even a valid URL at all. This is another SSRF vector. **Fix:** Look up the agent in the registry first and only proceed if it exists; validate it is a registered agent.

### HIGH (incorrect behavior)

- **Line 305–315 (`cli/script`)**: The `language` allowlist on line 308 includes `"sh"`, `"python"`, `"ruby"`, `"perl"` — but `cliToolEngine.executeScript` only accepts `SupportedLanguage = "bash" | "python3" | "node" | "typescript"`. Passing `language = "ruby"` will result in `TypeScript` type assertion failure at runtime (the cast on line 313 uses `language` as `SupportedLanguage` implicitly). Ruby/perl scripts will silently fail or execute with the wrong interpreter. **Fix:** Align the `allowedLanguages` list with `SupportedLanguage`, or handle the mapping explicitly.

- **Line 280–293 (`cli/execute`)**: `command.length > 10_000` check happens in the route, but no validation of the `workDir` or `env` parameters is performed. A caller can pass `workDir = "/"` (execute from root filesystem) or inject environment variables. **Fix:** Validate `workDir` is within the sandbox directory; validate `env` values do not contain special characters.

- **Line 378–418 (`http/request`)**: The outbound HTTP request to `url` is user-controlled with no SSRF protection. The endpoint will happily proxy requests to `http://localhost:3000/admin`, `http://10.0.0.1`, or cloud metadata endpoints. This is a server-side request forgery vulnerability. **Fix:** Validate that `url` resolves to a public IP; block RFC1918, loopback, link-local, and metadata endpoint ranges.

- **Line 434–446**: Webhook `POST /api/protocols/webhooks` accepts a user-supplied `id` field: `const webhookId = (id && typeof id === "string") ? id : uuidv4()`. A caller can pre-specify any ID including an existing one, silently overwriting it. **Fix:** Always generate the ID server-side; ignore any caller-supplied `id`.

### MEDIUM (code quality)

- **Line 550**: `Promise.resolve(a2aProtocol.getAgentCard()).catch(...)` — `getAgentCard` is already `async` but is wrapped in `Promise.resolve()` unnecessarily. Cosmetic but confusing.

- **Line 313**: `cliToolEngine.executeScript(script, language, args ?? [])` — `language` is type `string` after the route's allowlist check, but `executeScript` expects `SupportedLanguage`. The TypeScript compiler will flag this unless it's suppressed by the cast. Either use proper typing or add an explicit cast.

---

## messagingHub.ts

### CRITICAL (will crash in production)

- **Line ~1163**: `private inboundHistory: Array<any> = []` grows without bound. The `outboundHistory` (`this.history`) has a `MAX_HISTORY` cap (line ~1075), but the inbound history array is never trimmed. Under sustained inbound webhook traffic, this will OOM. **Fix:** Apply the same `MAX_HISTORY` cap to `inboundHistory`.

- **Line ~1270–1295 (`sendMessage`)**: When `channelIdOrObj` is an object, `content` is assigned from `obj.content` which may be `undefined` (the field is optional in `OutboundMessage`). The resulting `OutboundMessage` on line ~1315 will have `content: undefined` and pass it to the adapter. `SlackAdapter.send` uses `payload.content` as the fallback text — sending an undefined `text` to the Slack API will produce a 400 error from Slack. **Fix:** Validate that `content` is a non-empty string before enqueuing.

- **Line ~740 (`WebhookAdapter.send`)**: The webhook URL is read from `payload.metadata?.webhookUrl ?? payload.metadata?.url`. This URL comes from the channel's `config` object, which is user-supplied at channel registration time. There is no URL validation or SSRF protection here either. A webhook channel configured with `url: "http://169.254.169.254"` will trigger SSRF on every outbound message. **Fix:** Validate webhook URLs against an allowlist/blocklist at channel registration time, not at send time.

### HIGH (incorrect behavior)

- **Line ~220**: `SlackAdapter.send` stores the payload on `payload.metadata.slackPayload = slackPayload` and returns `ok: true` with a `"slack-pending-*"` message ID. **The message is never actually sent to Slack** — this is a stub that builds the payload but never calls the Slack API. The delivery queue will mark these as "sent" based on `result.ok = true`. In production, all Slack messages silently disappear. **Fix:** Implement the actual Slack API call using the stored token, or document this as a stub requiring connector integration and surface the limitation clearly in the API response.

- **Line ~418**: `GmailAdapter.send` has the same stub problem — it constructs `gmailPayload` but stores it in `metadata` without ever sending. Again, delivery records show "sent" while no email is dispatched. **Fix:** Same as above.

- **Lines ~1085–1115 (`_processQueue`)**: The queue processing loop calls `await this._deliver(entry)` sequentially, meaning all messages in the queue are delivered one at a time. Under high throughput, a slow webhook (10 second timeout) will block all subsequent deliveries. **Fix:** Process queue entries in parallel (with a concurrency limit, e.g. `p-limit(10)`).

- **Line ~1116**: `_processQueue` is triggered by `setImmediate` (non-blocking) but `_deliver` is awaited sequentially. If `_deliver` throws an unhandled exception (which the outer try/catch handles), `this.processing` stays `true` and the queue stalls permanently if the finally/else never sets it to `false`. Inspect the logic — when `_deliver` throws, `this.processing` may never be reset to `false`. **Fix:** Wrap `_processQueue` body in try/finally to always reset `this.processing = false`.

### MEDIUM (code quality)

- **Lines ~30–40**: `InboundMessage` and `OutboundMessage` types use `metadata: Record<string, any>` throughout. This erases all type safety for message metadata. Consider defining typed metadata variants per channel type.

- **Line ~799**: `environment: process.env.NODE_ENV ?? "production"` in the webhook envelope — this leaks the server's deployment environment to all webhook recipients. Intentional but should be documented.

---

## messagingRoutes.ts

### CRITICAL (will crash in production)

- **Line 406–413 (Slack webhook)**: No signature verification is performed on inbound Slack events. The Slack Events API sends an `X-Slack-Signature` header that should be HMAC-verified before processing. Without this, any attacker who knows the webhook URL can forge Slack events, inject arbitrary messages, and potentially trigger agent actions. **Fix:** Implement Slack signature verification using `crypto.timingSafeEqual` against the `SLACK_SIGNING_SECRET` environment variable.

- **Line 480–523 (Gmail webhook)**: No Pub/Sub push authentication. Google Pub/Sub push subscriptions should be authenticated using OIDC tokens in the `Authorization` header. Without this check, any caller can forge Gmail push notifications. **Fix:** Verify the OIDC token from Google's public keys before processing.

### HIGH (incorrect behavior)

- **Line 649**: `const limit = Math.min(Number(req.query.limit ?? 50), 500)` — if `req.query.limit` is a string like `"abc"`, `Number("abc")` is `NaN`. `Math.min(NaN, 500)` returns `NaN`. Then the check `if (isNaN(limit) || limit < 1)` on line 654 returns a 400 error, which is correct — but the error message says "limit must be a positive integer" while it could be `NaN` from the parse. The logic is correct but convoluted. Fine as-is but note the order: the `isNaN` check should be first.

- **Line 530–568 (`/api/messaging/webhook/:channelId`)**: The generic webhook handler calls `messagingHub.parseInbound(channelId, body)` when available, but the `parseInbound` method in `MessagingHub` only checks if the channel has an adapter registered. For a `websocket`-type channel, there is no adapter, so `parseInbound` returns `null` and the handler silently does nothing (returns `{ ok: true }` with no `messageId`). **Fix:** Return a `404` or `400` when `parseInbound` returns null, or document this behavior.

### MEDIUM (code quality)

- **Line 33**: `res: any` in the `SseClient` interface erases the Express `Response` type. This prevents TypeScript from catching improper SSE header setting. **Fix:** Use `import type { Response } from "express"`.

- **Line 606–607**: `events.some((e: any) => typeof e !== "string")` uses `any` instead of the more specific `unknown`. Minor.

---

## nipEngine.ts

### CRITICAL (will crash in production)

- **Line ~550–560 (`createSession`)**: `validateAccess` is called with `instructorProfile.organizationId` which is a field from an unvalidated `AgentCapabilityProfile` object passed by the caller. The `nipRoutes.ts` validation only checks `typeof instructorProfile !== "object"` — it does **not** validate that `organizationId`, `agentName`, `agentId`, etc. are strings. If `organizationId` is `undefined`, `validateAccess` receives `undefined` and the `_getPartyByOrg` lookup will always return `undefined`, bypassing the concurrent session limit check. **Fix:** Validate the full `AgentCapabilityProfile` schema (required string fields) before calling `createSession`.

- **Line ~893**: The maximum duration check uses `session.taskScope.maxDuration` which comes from the user-supplied `taskScope` passed at session creation. While it's merged with `DEFAULT_TASK_SCOPE`, if the caller passes `taskScope.maxDuration = Number.MAX_SAFE_INTEGER`, sessions can run forever. The `nipRoutes.ts` does not validate this field at all. **Fix:** Clamp `maxDuration` to a configurable server-side maximum (e.g. 24 hours).

### HIGH (incorrect behavior)

- **Lines ~412–480 (`INJECTION_PATTERNS`)**: The prompt injection detection regex patterns use the `g` flag (global). In JavaScript, regexes with the `g` flag maintain `lastIndex` state when used with `.test()`. Since these patterns are stored as module-level constants and called repeatedly across sessions, `.test()` on a global regex will alternate between matching and not matching on subsequent identical strings (the "stateful regex bug"). **Fix:** Remove the `g` flag from patterns used with `.test()`, or call `.test()` only on freshly constructed regex instances.

- **Line ~600–640**: The session welcome message on creation and the capability-exchange messages on `negotiateSession` are injected as `system`-role NIP messages. However, these messages contain agent names and organization names from user-supplied profiles (e.g. `instructorProfile.agentName`). If `agentName` contains special characters or NIP keywords, the welcome message itself would trigger the injection detector when subsequent messages are checked for drift against session context. **Fix:** Sanitise profile strings (truncate, strip control characters) before embedding in system messages.

- **Lines ~605–650**: The `MessageQueue` (delivery queue) inside `messagingHub.ts` stores entries by reference to the `OutboundMessage` object. If `_deliver` mutates `entry.message.metadata` (which it does on line ~1130: `entry.message.metadata.deliveredMessageId = result.messageId`), and the same `OutboundMessage` object is referenced elsewhere, this creates a shared-state mutation bug. This is within `messagingHub.ts` not `nipEngine.ts`, but worth noting in cross-system context.

### MEDIUM (code quality)

- **Line 34**: `let _identityEngine: any = null` uses `any` to avoid a circular import. This should be typed with a minimal interface (duck typing) to provide compile-time safety for the methods called on it (`.getIdentity()`, `.isActive()`, `.recordActivity()`).

- **Lines ~240–260**: `NIPSession.messages` is an in-memory array that grows without bound for the lifetime of a session. Long sessions with high message volumes (rate limit allows N messages/minute) will consume unbounded memory. **Fix:** Cap the messages array (e.g. last 1000 messages) or archive to persistent storage.

---

## nipRoutes.ts

### CRITICAL (will crash in production)

- **Lines 136–143**: `nipEngine.nipEngine.createSession(instructorProfile, executorProfile, ...)` is called with `instructorProfile` and `executorProfile` validated only as `typeof value !== "object"`. Arrays pass this check (`Array.isArray([]) === true` but `typeof [] === "object"`). The engine will then attempt `instructorProfile.organizationId` on an array, returning `undefined`, and cascade into undefined behavior in access checks. **Fix:** Also check `!Array.isArray(instructorProfile)`.

### HIGH (incorrect behavior)

- **Line 200 (`/api/nip/sessions`)**: No `req.body` null guard. If the request arrives with `Content-Type: text/plain` and no JSON body, `req.body` is `undefined`, and destructuring `const { instructorProfile, executorProfile, taskScope, accessTier } = req.body` throws `TypeError: Cannot destructure property 'instructorProfile' of undefined`. **Fix:** Use `req.body ?? {}`.

- **Line 248**: Same missing `req.body` null guard for `POST /api/nip/sessions/:id/messages`.

### MEDIUM (code quality)

- **Lines 232, 273, 315, 330, 366 (error status heuristic)**: All error status code decisions use `err.message?.includes("not found")` as a 404 heuristic. This is fragile — any error that happens to include "not found" in its message (e.g. `"Config value not found for key X"`) will be returned as a 404 instead of 500. **Fix:** Use custom error classes with a `statusCode` property, or use error codes.

---

## identityEngine.ts

### CRITICAL (will crash in production)

- **All in-memory stores** (`identityStore`, `blockStore`, `verificationStore`, `auditStore`): No size cap on any store. An attacker calling `POST /api/identity/register` repeatedly (no rate limiting or auth) can register unlimited identities, each with audit entries, causing OOM. **Fix:** Add registration rate limiting (per IP); cap `auditStore` entries per identity.

### HIGH (incorrect behavior)

- **`/api/identity/:cryptoId/full` (identityRoutes.ts line 493–507)**: This endpoint returns the **full internal identity object** including `keyMaterial` (128-char hex of the 64-byte random seed) and `blockedIds` array. The JSDoc comment says "self only; auth-gated in production" but **there is no authentication on this route**. Any caller who knows a `cryptoId` can retrieve the sensitive internal data. **Fix:** Require authentication (JWT, session token) on this endpoint; never expose `keyMaterial` externally regardless.

- **`displayName` validation** (identityRoutes.ts line 93–98): Validates 2–50 characters and format, but does **not** sanitise for HTML/script injection. `displayName` values may be rendered in a frontend UI. A name like `<img src=x onerror=alert(1)>` passes the length check. **Fix:** Strip HTML tags from `displayName` or enforce an alphanumeric-plus-allowed-chars pattern.

### MEDIUM (code quality)

- **Line 109**: `let sseClientCounter = 0` is a module-level counter that overflows to `Number.MAX_SAFE_INTEGER` after ~9 quadrillion connections, which is not a realistic concern, but it should use a UUID for client IDs to be consistent with other SSE implementations in the codebase.

- **Trust score recalculation**: `recalculateTrust` is called on every `POST /:cryptoId/activity` request (identityRoutes.ts line 729–731), which re-reads and recomputes the full trust factors. Under high write traffic this is fine for the current in-memory implementation, but if storage is later migrated to a database, this becomes an N+1 query per activity event.

---

## cacheEngine.ts

### CRITICAL (will crash in production)

- **Line 309–310**: In `ExactCache.set`, when an entry is evicted by the LRU: `this.totalBytes = Math.max(0, this.totalBytes - bytes)` subtracts the **new** entry's byte size instead of the **evicted** entry's byte size. The evicted entry's bytes are not accessible at this point (the `LRUMap.set` returns only the evicted key, not the value). This means `totalBytes` will drift lower than actual usage over time, eventually reporting negative or zero bytes, making the memory budget enforcement (`enforceMemoryBudget`) ineffective. **Fix:** Track bytes by key in a separate map so the evicted entry's byte count can be subtracted correctly when the key is evicted.

- **Line 620–622**: `this.sweepTimer = setInterval(() => this.sweep(), 60_000)` is started in the constructor. If multiple `CacheEngine` instances are created (e.g. in tests), each spawns a timer. The `.unref()` call prevents process-exit blocking but does not prevent multiple timers running concurrently and mutating the same state. The singleton export at line 876 prevents this in production, but it is a latent bug. **Fix:** Make the constructor private or add a guard against multiple instantiations.

### HIGH (incorrect behavior)

- **Line 648**: `const queryEmbedding: number[] | null = null; // populated by caller if available` — the comment is aspirational. The semantic cache lookup always passes `null` as the embedding, meaning it **always** falls back to TF-IDF similarity, never using vector similarity even when the cached response has an `embedding` field. The `set` path stores embeddings correctly (line 687), but the `get` path ignores them. **Fix:** The caller (`CacheEngine.get`) must accept an optional `embedding` parameter and pass it through.

- **Line 720–721**: Hit rate calculation uses `exactHits / (exactHits + exactMisses || 1)`. The `|| 1` is intended to prevent division by zero, but it applies when `exactHits + exactMisses === 0` (correct) **and also** when the sum is `0` due to counter reset (`resetStats`). After a reset, the first hit will compute `1 / (1 + 0 || 1) = 1/1 = 1.0` (100% hit rate) — which happens to be correct for the first hit. Low risk but the expression should be `(exactHits + exactMisses) > 0 ? exactHits / (exactHits + exactMisses) : 0` for clarity.

### MEDIUM (code quality)

- **Line 748–752 (`resetStats`)**: Uses `(this.exact as unknown as { hits: number; misses: number }).hits = 0` — a double cast to mutate private fields. This is a code smell; the `ExactCache` and `SemanticCache` classes should expose a `resetCounters()` method instead.

- **Line 574**: `const COST_PER_TOKEN_USD = 0.000_015` is module-level hardcoded. Should be configurable (same issue as noted in `mcpProtocol.ts`).

---

## cacheRoutes.ts

### HIGH (incorrect behavior)

- **Lines 37–43 (`/api/cache/config`)**: The config endpoint reconstructs a synthetic config object from stats instead of exposing the actual `CacheEngine` configuration: `enabled: stats.exact.entries > 0 || true` always evaluates to `true` because `... || true` is always `true`. The `enabled` field is meaningless here. **Fix:** Either expose a `getConfig()` method on `CacheEngine` that returns the actual `this.config` object, or remove this misleading endpoint.

- **Lines 53–55 (`/api/cache/clear`)**: The `tier` parameter is read from `req.body` without validation against the allowed values `"exact" | "prefix" | "semantic"`. Passing `tier = "all"` or any invalid string results in `cacheEngine.clear("all")` being called, which silently no-ops inside `CacheEngine.clear` because neither `"all"` nor any invalid string matches the `tier === "exact"` etc. checks — effectively a silent clear-all rather than a validation error. **Fix:** Validate `tier` against the allowed enum values before calling `cacheEngine.clear(tier)`.

### MEDIUM (code quality)

- **Lines 100–127 (`dashboard`)**: The dashboard recomputes `totalRequests` and `overallHitRate` from raw stats that are already computed inside `getStats()`. This duplicates logic; `stats.totalHits` and `stats.overallHitRate` are already available on the stats object. **Fix:** Use `stats.totalHits` and `stats.overallHitRate` directly to avoid drift if the computation logic changes in `CacheEngine`.

---

## marketplaceRoutes.ts

### CRITICAL (will crash in production)

- **Line 569–576**: The seed endpoint `POST /api/marketplace/seed` calls `Math.random()` to generate fake install counts and ratings. This is test/demo data but the endpoint is **unprotected** and **permanently wired into production routes**. Any external caller can hit it on a fresh deployment and corrupt the marketplace data with random numbers. If called after existing data (the `if (existing.length > 0) return` guard is bypassable with a DELETE endpoint), data integrity is at risk. **Fix:** Remove this endpoint from production, or protect it with an admin auth check and a deployment-time environment flag.

- **Line 33**: `storage.getMarketplaceSkills({ category, search })` is called twice in the same request (lines 32 and 33) — once for the paginated result set and once for the total count. For a large marketplace with thousands of skills, this doubles the database query load on every listing request. **Fix:** Add a `count`-only query path or return `{ skills, total }` from a single storage call.

### HIGH (incorrect behavior)

- **Line 60–64**: The `POST /api/marketplace/skills` publish endpoint validates `name`, `description`, `authorName`, and `content` presence but does **not** validate `authorEmail` format, `repoUrl` format, or `version` semver format. An invalid `repoUrl` will be stored and displayed to users. **Fix:** Validate email format with a regex; validate `repoUrl` is an `https://` URL; validate `version` against a semver pattern.

- **Line 338**: `const ratingNum = parseInt(rating)` — if `rating` is a float string like `"4.7"`, `parseInt` truncates to `4`. This silently discards precision. **Fix:** Use `Number(rating)` instead of `parseInt` and check `Number.isInteger(ratingNum)`.

- **Line 117–132 (`PATCH /api/marketplace/skills/:id`)**: No ownership check — any caller can update any skill's metadata. The route should require that the caller is the original author. Since there is no authentication system at the route level, at minimum the request should require the author's email or a write token. **Fix:** Add ownership verification.

- **Line 378–382 (`DELETE /api/marketplace/skills/:id`)**: Same — no ownership or admin check. Any caller can delete any skill. **Fix:** Add auth.

### MEDIUM (code quality)

- **Line 90**: `tags: Array.isArray(tags) ? JSON.stringify(tags) : (tags || "[]")` — if `tags` is a string (the user serialised it themselves), it is stored as-is, potentially as a non-JSON string. This inconsistency will cause JSON.parse failures downstream. **Fix:** Always JSON.stringify if the value is an array; reject non-array non-undefined values.

- **Line 165, 238, 326, 349, 366**: `try { scoreSkillById(skill.id); } catch { /* non-fatal */ }` — swallowing scoring errors silently means a broken scoring pipeline will never surface in logs. **Fix:** At minimum log the error: `catch (e) { console.warn("[scoring] scoreSkillById failed:", e); }`.

---

## marketplaceScoring.ts

### HIGH (incorrect behavior)

- **Line 83**: `const bayesian = n > 0 ? (C * m + sum) / (C + n) : 0` — when `n === 0` (no ratings), the Bayesian score is `0` instead of the prior mean `m = 3.0`. This means a new skill with no ratings scores **0** on the `ratingBayesian` signal (25% weight), significantly penalising new skills vs. skills with even a single rating. The correct Bayesian prior estimate when there are no observed samples is the prior mean, not 0. **Fix:** Change the `n === 0` case to return `m` (the prior mean): `const bayesian = (C * m + sum) / (C + n)` (the formula naturally gives `m` when `n = 0` since `C * m / C = m`). The current `if n > 0` guard is incorrect.

- **Line 318**: `storage.updateMarketplaceSkill(skill.id, { ... } as any)` — the `as any` cast suppresses TypeScript's type checking of the update payload. Fields like `qualityScore`, `installVelocity`, `scoreTier`, etc. may not exist in the `MarketplaceSkill` schema, meaning these writes silently no-op in the storage layer. **Fix:** Define a proper `MarketplaceSkillScoringUpdate` interface and use it; verify all fields exist in the storage schema.

### MEDIUM (code quality)

- **Line 119–131 (`scoreForkLineage`)**: The cycle detection uses `visited.has(current.id)` but only checks the **current** node before following the link, not the **target** node. If `skill` itself has `forkedFromId === skill.id` (self-reference), the loop increments `depth` once before hitting the cycle check on the next iteration. Result: self-forked skills get `depth = 1` instead of `0`. Low probability in practice, but **Fix:** Check `current.forkedFromId` against `visited` before incrementing depth.

- **Line 58**: `const ageMs = Math.max(Date.now() - skill.publishedAt, 86_400_000)` assumes `skill.publishedAt` is a Unix timestamp in milliseconds. If the storage layer stores it in seconds (SQLite common pattern), `Date.now() - skill.publishedAt` would be ~1.7 trillion ms, making all skills appear millions of days old and velocity → 0. **Fix:** Assert or document the expected timestamp unit; add a sanity check `if (ageMs > 50 * 365 * 86_400_000) throw new Error("publishedAt appears to be in seconds, not ms")`.

---

## autonomyRoutes.ts

### CRITICAL (will crash in production)

- **Lines 43–45**: `GET /api/autonomy/health` has no error handling. If `getHealthStatus()` throws (e.g. the watchdog module fails to initialize), the request crashes with an unhandled Express error. **Fix:** Wrap in try/catch.

- **Line 77–80**: `PATCH /api/autonomy/checkpoints/:id` passes `req.body` directly to `updateCheckpoint` with no validation. An attacker can overwrite arbitrary checkpoint fields including internal status values, timestamps, or step arrays. **Fix:** Validate that only allowed fields are present in `req.body`; use a whitelist of mutable fields.

- **Lines 206–209**: `POST /api/autonomy/learning/log` passes `req.body` directly to `logExecution` with no validation whatsoever. The route handler does not check any required fields. If `logExecution` expects certain fields and they are absent, it will throw or silently record a malformed entry. **Fix:** Validate required fields (`taskType`, `model`, `outcome` at minimum) before calling `logExecution`.

### HIGH (incorrect behavior)

- **Line 105**: `const maxStaleMs = parseInt(req.body.maxStaleMs) || undefined` — `parseInt(undefined)` returns `NaN`, and `NaN || undefined` returns `undefined`, so missing `maxStaleMs` defaults correctly. However, `parseInt("0")` returns `0`, and `0 || undefined` returns `undefined`, silently ignoring a `maxStaleMs: 0` request. Edge case, but an operator trying to abandon all stale tasks immediately would be surprised. **Fix:** Use `req.body.maxStaleMs !== undefined ? parseInt(req.body.maxStaleMs) : undefined`.

- **Lines 270–275**: `GET /api/autonomy/skills/improvements` passes `req.query` values directly to `getImprovementSuggestions` without validating that `status` and `priority` are allowed enum values. Any string will be passed through to the filtering logic. **Fix:** Validate against allowed enum values.

- **Lines 281–284**: `POST /api/autonomy/skills/improvements/:id/apply` has no error handling around `applyImprovement`. If the improvement doesn't exist or the application fails, the error propagates as an unhandled Express error. **Fix:** Wrap in try/catch.

- **Lines 162–165**: `DELETE /api/autonomy/cron/:id` calls `deleteCronJob(req.params.id)` with no error handling and no existence check. If the ID doesn't exist and `deleteCronJob` throws, the error propagates. **Fix:** Check existence first or wrap in try/catch.

### MEDIUM (code quality)

- **Lines 51–54, 56–58, 60–62**: Multiple checkpoint GET routes have no error handling. Any storage layer failure propagates as an unhandled 500. For an endpoint intended to monitor production health, it should never crash the request handler. **Fix:** Add try/catch to all health/status read endpoints.

- **Lines 119–125**: Same issue with all cron GET routes — no error handling on `getAllCronJobs()`, `getCronStats()`, `getEnabledJobs()`.

- **Line 287–289**: `rejectImprovement(req.params.id, req.body.reason)` — `req.body.reason` is not validated; it could be `undefined`. If `rejectImprovement` requires a non-null reason string, this will crash. **Fix:** Validate `reason` is a string or provide a default.

---

## Summary

| File | CRITICAL | HIGH | MEDIUM |
|------|----------|------|--------|
| a2aProtocol.ts | 3 | 2 | 2 |
| mcpProtocol.ts | 3 | 3 | 3 |
| cliToolEngine.ts | 3 | 3 | 3 |
| protocolRoutes.ts | 3 | 4 | 2 |
| messagingHub.ts | 3 | 3 | 2 |
| messagingRoutes.ts | 2 | 2 | 2 |
| nipEngine.ts | 2 | 2 | 2 |
| nipRoutes.ts | 1 | 2 | 1 |
| identityEngine.ts | 1 | 2 | 2 |
| identityRoutes.ts | 0 | 1 | 0 |
| cacheEngine.ts | 2 | 2 | 2 |
| cacheRoutes.ts | 0 | 2 | 1 |
| marketplaceRoutes.ts | 2 | 4 | 2 |
| marketplaceScoring.ts | 0 | 2 | 2 |
| autonomyRoutes.ts | 3 | 4 | 3 |
| **TOTALS** | **28** | **38** | **29** |

**28 critical, 38 high, 29 medium** across all 15 files.

### Top Priority Fixes

1. **SSRF vulnerabilities** — `discoverAgent`, `POST /api/protocols/http/request`, `WebhookAdapter.send`, and `agents/:id/send` all pass user-supplied URLs to `fetch()` with no IP range blocking. One exploit path to internal cloud metadata.
2. **MCP bearer token logged in plaintext** — secrets must never appear in application logs.
3. **Slack/Gmail webhook auth missing** — forged events can inject arbitrary messages into the agent system.
4. **Unprotected `/api/identity/:cryptoId/full`** — exposes `keyMaterial` without auth.
5. **`webhookHandlers` Map is permanently empty** — all registered webhook handlers in `protocolRoutes.ts` are silently no-ops.
6. **Slack and Gmail adapters never actually send** — messages are constructed but not delivered; delivery records show "sent".
7. **NIP injection patterns use stateful `g` regex flag** — causes alternating match/no-match on identical content.
8. **`ExactCache.totalBytes` accounting bug** — subtracts wrong size on eviction; memory budget enforcement is unreliable.
9. **Bayesian rating formula** — returns 0 instead of prior mean for unrated skills, incorrectly penalising new content.
10. **Package name injection via comment headers** in `executeCodeInterpreter` — pip/npm install with unsanitised package names.
