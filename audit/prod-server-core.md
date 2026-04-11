# Production Readiness Audit — Server Core Files

Audited by: Senior Production Engineer  
Date: 2025-07-04  
Scope: `/home/user/workspace/ultra-computer/server/` — 11 core files

---

## routes.ts

### CRITICAL (will crash in production)
- **Line 133**: `res.json(model)` returns HTTP 200 after `POST /api/models` — should be **201 Created**. Fix: `res.status(201).json(model)`.
- **Line 357**: `POST /api/skill-scripts` calls `res.json(script)` with HTTP 200 — should be **201 Created**. Fix: `res.status(201).json(script)`.
- **Line 221**: `POST /api/conversations` returns 200, not 201. Fix: `res.status(201).json(conv)`.
- **Line 280**: `POST /api/conversations/:id/messages` returns `res.json(userMsg)` (200) after creation — should be **201**. Fix: `res.status(201).json(userMsg)`.
- **Line 444–458**: `POST /api/memory` — `content`, `category`, and `importance` are unvalidated. A non-string `content`, out-of-range `importance` float, or oversized `category` string will be passed raw to `storage.createMemory()`; SQLite may silently accept but downstream logic will misbehave. Fix: add `typeof content !== "string"`, `content.length > 100_000`, `importance` range (0–1), and `category` allowlist checks.
- **Line 108–113**: `POST /api/models` — race condition in "unset other defaults" logic. The loop calls `storage.updateModel()` per model in two separate loops (lines 109, 112) but there is no transaction. A concurrent `POST /api/models` with `isDefault: true` can leave two models marked as default. Fix: wrap the unset + create in a SQLite `BEGIN TRANSACTION`.
- **Line 153–154**: `PATCH /api/models/:id` — same race on `isDefault`/`isOrchestrator` unset loop without a transaction.
- **Line 374–378**: `DELETE /api/skills/:id` — if `storage.getSkill()` returns a non-built-in skill then it is deleted (line 377) but the route never confirms the skill existed in the first place (if `skill` is undefined and `skill?.isBuiltIn` is falsy, deletion proceeds silently). Fix: add `if (!skill) return res.status(404).json({ error: "Not found" })`.
- **Line 434–437**: `DELETE /api/connectors/:id` — no existence check. `storage.deleteConnector()` silently no-ops on unknown IDs, but the client gets `{ ok: true }` regardless. Fix: check existence and return 404.
- **Line 460–463**: `DELETE /api/memory/:id` — same issue: no 404 on unknown ID. Fix: check existence first.
- **Line 567–570**: `DELETE /api/skill-scripts/:id` — no existence check; silently returns `{ ok: true }`. Fix: check existence, return 404.
- **Line 171–174**: `DELETE /api/models/:id` — no existence check; always returns `{ ok: true }`. Fix: add existence check + 404.

### HIGH (incorrect behavior)
- **Line 53, 59, 67**: `console.log` used directly — should use the `log()` helper from `index.ts` or a proper logger. These lines use raw `console.log` which bypasses timestamp formatting and any future log-level filtering.
- **Line 70–73**: `taskQueue.initialize()` rejection is silently swallowed (`.catch(() => {})`). A Redis misconfiguration or init error will be invisible at startup. Fix: log the error: `.catch(err => console.error("[taskQueue] init failed:", err))`.
- **Line 482–488**: `POST /api/settings` — unvalidated `req.body` is iterated. If the body is not a plain object (e.g. an array), `Object.entries()` will produce unexpected keys. Fix: add `if (typeof req.body !== "object" || Array.isArray(req.body)) return res.status(400).json(...)`.
- **Line 493–498**: `GET /api/skill-scripts?q=` — `q` query param is not length-limited; a multi-megabyte query string will be passed to `storage.searchSkillScripts()` which does in-memory string matching over all scripts. Fix: add `if (q.length > 500) return res.status(400)...`.
- **Line 408–413**: `POST /api/connectors/:id/connect` — no validation that `apiKey` is a string or length-bounded. An object or very long string passes to `connectWithApiKey`. Fix: validate type and length.
- **Line 541–542**: `PATCH /api/skill-scripts/:id` — `updateData` is built from `...rest` (line 542, `as any`) — this is a mass assignment risk because any field from the client that isn't destructured (`name`, `description`, `language`, `isFavorite`, `filePath`, etc.) flows into the update without an allowlist. Fix: explicitly allowlist fields or apply schema validation.
- **Line 700–737**: `GET /api/notifications` SSE endpoint — the `send()` function (line 708) has no try/catch around `res.write()`. If the client disconnects mid-flight the write will throw and become an uncaught exception (unlike the per-conversation stream at line 297–303 which does have a try/catch). Fix: wrap with try/catch and unsubscribe on error.
- **Line 727–728**: SSE keep-alive ping in `/api/notifications` has no try/catch — contrast with the `/api/conversations/:id/stream` ping at line 310 which does. Fix: add try/catch around `res.write` and `clearInterval` on failure.
- **Line 396–405**: `POST /api/connectors` — `category` is unsanitized; any string is accepted including very long ones. Fix: add allowlist validation: `["productivity","dev","data","crm","custom"]`.

### MEDIUM (code quality / maintainability)
- **Lines 53, 59, 67, 71–72, 111, 150, 284, 553**: Pervasive `console.log` / `console.error` throughout `registerRoutes` — no structured logger, no log levels, no correlation IDs. All should use a proper logger (e.g. `pino`, `winston`) with `info`/`warn`/`error` levels.
- **Line 157, 227, 363, 542**: Several `Record<string, any>` / `as any` type assertions — these hide type errors. Specifically `allowedUpdate: Record<string, any>` on lines 157, 227, 363 mean no type safety for model/conversation/skill updates. Fix: type these as `Partial<InsertModel>`, etc.
- **Line 116**: `id: id || uuidv4()` — accepts a caller-supplied `id` for `POST /api/models` without validating it is a valid UUID format. An attacker could supply a malicious string as the primary key. Fix: validate with a UUID regex or always generate a new ID server-side and ignore the client-provided value.
- **Line 132**: `} as any` cast on `storage.createModel(...)` — suppresses TypeScript type checking on the insert. Fix: properly type the model insert or add missing fields to `InsertModel`.

---

## storage.ts

### CRITICAL (will crash in production)
- **Line 24**: `new Database("ultra_computer.db")` — hardcoded relative path. In production the working directory is not guaranteed; this will either create the DB in an unexpected location or fail to open it. Fix: use an absolute path derived from `process.env.DB_PATH || path.resolve(__dirname, "../../ultra_computer.db")`.
- **Line 360–366**: `deleteConversation()` — four separate `db.delete()` calls with no transaction. A crash between steps leaves orphaned messages/tasks/agent_runs. Fix: wrap in `db.transaction(() => { ... })`.
- **Line 444–446**: `deleteSkillScript()` — same issue: two separate deletes without a transaction. Fix: wrap in `db.transaction()`.
- **Line 536–541**: `deleteMarketplaceSkill()` — four separate deletes without a transaction.

### HIGH (incorrect behavior)
- **Line 424–428**: `searchMemories()` — loads **all** memories (`db.select().from(memory)...all()`) then filters in JavaScript. With a large memory table this will OOM. Fix: use SQL `LIKE` / FTS on the DB side, or at minimum add a sane upper limit (`LIMIT 1000`).
- **Line 451–458**: `searchSkillScripts()` — same problem: fetches all rows then filters in JS. For large datasets this is unbounded memory. Fix: push the filter to SQL.
- **Line 481–509**: `getMarketplaceSkills()` — fetches all rows then sorts/filters/paginates in JS. This defeats the purpose of pagination and will OOM on large catalogs. Fix: push `WHERE`, `ORDER BY`, `LIMIT`, `OFFSET` to the SQL query.
- **Line 32–239**: DDL runs at module import time with `sqlite.exec()` — any schema error (e.g. a typo, a breaking change) will crash the process on startup with no recovery path and no migration history. Fix: use a proper migration system (e.g. `drizzle-kit`, `db-migrate`).
- **Line 344**: `createModel()` — no check for duplicate `id`; `db.insert()` will throw a SQLite `UNIQUE constraint failed` error which will propagate as an unhandled exception to the caller. The caller in routes.ts (line 115) has no try/catch. Fix: wrap in try/catch or check for existence first.

### MEDIUM (code quality / maintainability)
- **Lines 342–597**: All ORM method bodies are one-liners with no error handling. Any SQLite error (disk full, corruption, constraint violation) propagates raw to the caller as an unhandled exception. Fix: add try/catch with `StorageError` wrapping throughout.
- **Line 405**: `sqlite.prepare(...)` is called inside `incrementSkillUsage()` on every invocation — a new prepared statement is created each call. Fix: prepare once at class construction time.
- **Line 449**: Same issue in `incrementSkillScriptUsage()` — prepared statement created per-call.
- **Line 544, 548, 552**: Same issue in `incrementMarketplaceInstallCount()`, `updateMarketplaceRating()`, `incrementMarketplaceForkCount()` — each creates a new prepared statement on every call.

---

## modelRouter.ts

### CRITICAL (will crash in production)
- **Line 293**: `(b as any).text` — `as any` type assertion on Anthropic content blocks. If Anthropic's SDK changes the shape of a content block, this silently fails to extract text and returns an empty string, making all Anthropic calls return empty responses without any error. Fix: use the SDK's proper type guards: `b.type === "text" && "text" in b ? b.text : ""`.
- **Line 237**: `res.choices[0]?.message?.content || ""` — if the OpenAI API returns no choices (rate limit, content filter, model error), this silently returns an empty string instead of throwing. The caller won't know the call failed. Fix: check `if (!res.choices?.length) throw new Error(...)`.

### HIGH (incorrect behavior)
- **Line 102**: `const maxTokens = options.maxTokens || 4096` — `||` means if `maxTokens` is explicitly passed as `0`, the fallback `4096` is used instead. This is a subtle bug; use `options.maxTokens ?? 4096`.
- **Line 182**: Same issue in `chatStream`: `options.maxTokens || 4096` should be `?? 4096`.
- **Line 341–342**: `chatGoogle` — `new GoogleGenerativeAI(creds.apiKey || "")` — an empty string API key will cause the Google SDK to throw an opaque error at call time rather than a clear "no credentials" error. The same pattern exists for Anthropic (line 271). Fix: add an early guard: `if (!creds.apiKey) throw new Error("No API key for provider google")`.
- **Line 349**: `msgs.filter(m => m.role !== "system").at(-1)?.content || ""` — if all messages are system messages (edge case), `lastMsg` is `""` and `chat.sendMessage("")` is called, which the Google API may reject. Fix: add an explicit guard.
- **Lines 341–394**: `chatGoogle` and `streamGoogle` both `await import("@google/generative-ai")` dynamically on every call. Dynamic imports inside hot-path functions cause repeated module resolution overhead in production. Fix: hoist to a top-level import.

### MEDIUM (code quality / maintainability)
- **Line 271**: `makeAnthropicClient` passes an empty string `""` as `apiKey` when none is available. Anthropic SDK accepts this but will fail on the first call with an authentication error rather than on client construction. Fix: add an early check and throw a descriptive error.
- **Line 219**: `apiKey = creds.apiKey || (model.provider === "ollama" ? "ollama" : "none")` — the string `"none"` is passed as an API key to OpenAI-compatible providers. Providers that require real authentication will send the literal string `"none"` as a Bearer token, leading to confusing 401 responses. Fix: only pass an API key if one actually exists.

---

## modelConnections.ts

### CRITICAL (will crash in production)
- **Line 515**: `connectionError: null as any` — `as any` cast to bypass TypeScript check. This means the DB schema type for `connectionError` is not null-compatible without an escape hatch, indicating a schema–type mismatch that should be fixed at the schema level rather than suppressed.
- **Line 573**: `} as any` on `storage.updateModel(modelId, {...} as any)` — same pattern, masking a type mismatch. Both of these pass extra fields (`lastTestedAt`, `lastTestLatency`, `connectionStatus`, `connectionError`) that apparently are not in `InsertModel`. Fix: add these fields to the `InsertModel` type rather than casting.
- **Line 681**: `storage.createModel({...} as any)` — same issue in `createFromPreset`. The cast hides missing or extra fields and will silently pass incorrect data to the DB.

### HIGH (incorrect behavior)
- **Line 423**: `pendingModelOAuthStates` is an in-memory `Map` — it is **not shared across processes** and **not persisted**. In any multi-process deployment (PM2 cluster, Kubernetes replicas) an OAuth callback arriving at a different instance will fail to find the state. Fix: store pending OAuth states in the SQLite DB or Redis.
- **Line 613**: `const { testModelConnection } = await import("./modelRouter.js")` — circular dynamic import inside `testConnection()` at call time. `modelConnections.ts` imports from `modelRouter.ts` (line 16) and `modelRouter.ts` imports from `modelConnections.ts` (line 15) — this creates a circular dependency. Dynamic import at call time masks the issue but can cause initialization races. Fix: break the cycle by extracting credential resolution into a shared utility module.
- **Line 502**: `const tokenData = await tokenResponse.json() as Record<string, any>` — if the OAuth token endpoint returns non-JSON (e.g. a 200 with HTML error page from a misconfigured provider), `.json()` throws an uncaught error in the `try` block, which is caught correctly at line 520, but the error message will be "Unexpected token" which is unhelpful. Fix: check `Content-Type` header before calling `.json()`.
- **Line 723**: `masked: isSet ? \`${value.slice(0, 6)}...${value.slice(-4)}\`` — for short API keys (< 10 chars) this will expose most or all of the key. Fix: only mask if `value.length > 12`, otherwise return a fixed `"***"`.

### MEDIUM (code quality / maintainability)
- **Lines 54–336**: `PROVIDER_REGISTRY` is a hardcoded in-process object. Adding a new provider requires a code deploy. This is acceptable for now but should be externalized to a config file or DB for maintainability.
- **Line 379**: `let tokens: any = {}` — using `any` for parsed OAuth tokens. Fix: define a typed interface `OAuthTokens { access_token?: string; refresh_token?: string; expires_at?: number; token_type?: string; scope?: string }`.

---

## orchestrator.ts

### CRITICAL (will crash in production)
- **Line 31**: `fs.mkdirSync(IPC_DIR, { recursive: true })` — runs at module import time (top-level). If the filesystem is read-only or the path is invalid, this throws synchronously during module loading, crashing the server before it can even start. Fix: wrap in try/catch and log a warning, or defer until first use.
- **Line 306**: `(JSON.parse(t.dependsOn) as string[]).every(dep => completed.has(dep))` — `JSON.parse` can throw if `dependsOn` contains invalid JSON (e.g. if a task was written with a corrupt value). This happens inside a `filter()` with no try/catch, causing `executeDAG` to throw and fail the entire conversation. Fix: wrap in try/catch and treat malformed `dependsOn` as `[]`.
- **Line 352**: `const deps: string[] = JSON.parse(task.dependsOn)` — same uncaught `JSON.parse` risk in `buildDependencyContext`. Fix: try/catch with fallback to `[]`.
- **Line 419, 566**: `fs.writeFileSync(ipcPath, ...)` — synchronous file I/O on the main async event loop. Under load, writing IPC files blocks the Node.js event loop for every agent run. Fix: use `fs.promises.writeFile()` (async).
- **Line 324**: `emit(conversationId, { type: "task_update", task: storage.getTask(task.id)! })` — the non-null assertion `!` will throw if `getTask` returns `undefined` (e.g. the task was deleted by a concurrent request). Fix: add a null check.
- **Line 332, 338**: Same non-null assertion `storage.getTask(task.id)!` twice in the parallel task execution loop — same crash risk.

### HIGH (incorrect behavior)
- **Line 111, 150, 393**: `console.log` calls in orchestration hot path — should use a structured logger.
- **Line 150, 393**: `console.log` inside task routing logic leaks internal model IDs and routing reasons to stdout in production without any log level control.
- **Line 553**: `console.log` inside context compaction — same issue.
- **Line 265**: LLM response is JSON-extracted with a naive `response.content.match(/\{[\s\S]*\}/)` — the first `{` to last `}` greedy match will incorrectly capture if the response contains multiple JSON objects or explanation text wrapping the JSON. This has a fallback (line 268) but the fallback discards the LLM's actual task decomposition silently. Fix: use a more robust extractor or instruct the model to output JSON in a delimited code block and extract from that.
- **Line 296**: `const maxIterations = 20` — hardcoded in `executeDAG`. This should use the configurable `max_tool_iterations` setting from storage (`storage.getSetting("max_tool_iterations")`).
- **Line 365**: `const MAX_TOOL_ITERATIONS = 10` — module-level constant, should be read from the `max_tool_iterations` setting so operators can tune it without a deploy.
- **Line 312**: Deadlock resolution in `executeDAG` is a busy-wait polling loop (`await new Promise(r => setTimeout(r, 200))`). In a genuine circular dependency (which the LLM could produce), the loop will spin 20 times before breaking out, wasting 4 seconds. Fix: detect cycles in the DAG at decomposition time and short-circuit.
- **Line 751**: `results.values().next().value ?? ""` — returns `undefined` as `""` if the Map is empty, but the caller (`runOrchestrator` line 179) calls `synthesizeResults` with `results.size === 1` check, so an empty Map is never passed here. Still, the fallback is fragile; consider an explicit early return.

### MEDIUM (code quality / maintainability)
- **Line 26**: `currentSessionId: string = "default"` in `tools.ts` (set via `setCurrentSession`) — shared module-level mutable state. In concurrent orchestrator runs, the last `setCurrentSession()` call wins and sessions can bleed into each other if multiple `runWorkerAgent` calls interleave between the `setCurrentSession(agentRunId)` call (line 512) and the `executeTool` call (line 515). Fix: pass `sessionId` directly as a parameter to `executeTool` (the signature already supports this via `sessionId?` parameter).
- **Line 683**: `savedScripts.slice(0, 10)` — silently truncates the script library context without any indication to the LLM that more scripts exist. Fix: add a note like `"(showing 10 of N)"` in the prompt.

---

## tools.ts

### CRITICAL (will crash in production)
- **Line 26–27**: `let currentSessionId: string = "default"` is shared mutable state at module scope. Under concurrent agent runs, `setCurrentSession` sets the global and `executeBash` reads it — there is a race condition where agent B's `setCurrentSession` call can overwrite agent A's session ID between A's `setCurrentSession()` (orchestrator.ts line 512) and A's `executeTool()` (line 515). Fix: remove the global; pass `sessionId` explicitly through `executeTool` (the parameter already exists on line 154 — just always require it from callers).
- **Line 260**: `fs.writeFileSync(safePath, content, "utf-8")` — no size limit on file content. A malicious or runaway agent can write arbitrarily large files and fill disk. Fix: add a max content size check (e.g. 50 MB) before writing.
- **Line 418**: Calculator sanitization uses `new Function()` which is essentially `eval()`. Although the allowlist reduces risk, `new Function("\"use strict\"; return ()")` can still be abused via prototype manipulation on some Node.js versions. Fix: use a purpose-built safe-eval library (e.g. `expr-eval`) instead of `new Function`.
- **Line 448**: `executeSearchFiles` builds a `grep` command via shell-escaped single-quote substitution. While the escaping (`s.replace(/'/g, "'\\''")`) is correct, the approach is fragile — any future change to the escaping logic could re-introduce shell injection. Fix: use `execFile` with an argument array instead of `execAsync` with a constructed shell string.

### HIGH (incorrect behavior)
- **Line 219**: `console.warn` when Docker exec fails and falls back to host — acceptable for debugging but is production noise without log levels. Same pattern at line 99 in `dockerSandbox.ts`.
- **Line 227–232**: `executeBashHost` passes `...process.env` to the child process. This leaks all host environment variables (including API keys like `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, etc.) into every sandbox shell command. This is a significant secret-leakage risk if the sandbox is not fully isolated. Fix: pass a minimal allow-list of environment variables instead of the full `process.env`.
- **Line 344–358**: SSRF protection for `fetch_url` checks hostname by string matching but does NOT resolve the hostname via DNS first. An attacker can bypass the check using a DNS rebinding attack (register a domain that initially resolves to a public IP but rebinds to 127.0.0.1 after the check). Fix: resolve the hostname to an IP and check the IP against the blocklist, or use a DNS-over-HTTPS resolver with the resolved IP check.
- **Line 329–398**: `executeFetchUrl` does not check `Content-Type` for binary responses. A URL returning binary data (images, PDFs, executables) will be read with `response.text()` which garbles the content and can produce multi-MB strings that waste context window. Fix: check `Content-Type` and reject non-text responses, or cap binary reads.

### MEDIUM (code quality / maintainability)
- **Lines 22–23**: `SANDBOX_DIR` creation at module import time — if the path is invalid, this crashes at startup. Same pattern as `IPC_DIR` in orchestrator.ts. Fix: wrap in try/catch.
- **Line 406–415**: Calculator allowlist is applied only to `Math.*` identifiers before the general character check (line 418). The two-pass approach is hard to reason about. Fix: use a single-pass approach with a dedicated math expression parser.

---

## index.ts

### CRITICAL (will crash in production)
- **Line 89**: `await registerRoutes(httpServer, app)` — the entire async IIFE has no top-level `try/catch`. If `registerRoutes` throws (e.g. a DB connection error, a startup seed failure), the process will exit with an unhandled promise rejection and no graceful shutdown. Fix: wrap with try/catch and log + `process.exit(1)`.
- **Lines 88–135**: No `process.on("uncaughtException")` or `process.on("unhandledRejection")` handlers. Any uncaught rejection anywhere in the app (including in detached async tasks) will crash Node.js 15+ silently or with a hard exit. Fix: add global handlers that log and optionally alert.

### HIGH (incorrect behavior)
- **Line 59**: `console.log` used inside the `log()` helper — this is intentional since `log` IS the log helper, but there is no log-level support (no debug/info/warn/error distinction), no structured output (JSON), and no way to silence logs in tests. In production, every request is logged at the same level with full JSON response bodies (line 78–79 dumps `capturedJsonResponse` to stdout). Fix: use a structured logger with log levels and redact sensitive fields before logging.
- **Line 78**: Response body is unconditionally logged (`logLine += \` :: ${JSON.stringify(capturedJsonResponse)}\``) — this will log API keys, OAuth tokens, and other secrets in the response bodies of endpoints like `GET /api/models/env-vars`, model connect responses, etc. Fix: add a blocklist of paths to skip body logging (or log only non-sensitive fields).
- **Line 95**: `console.error("Internal Server Error:", err)` — error handler logs the raw `err` object including stack traces. In production this leaks internal implementation details. Fix: log at `error` level to a structured logger, not directly to stderr with full object dump.
- **Line 101**: Global error handler returns `res.status(status).json({ message })` — leaks `err.message` (which may contain internal paths, SQL, or API endpoint details) to the client. Fix: return a generic message to the client (`"An internal server error occurred"`) and log the real error server-side.
- **Line 27**: `res.setHeader("Access-Control-Allow-Origin", allowedOrigin)` — the allowed origin is computed from `req.headers.host` which is a client-controlled header. In environments where the reverse proxy doesn't override the `Host` header, this means any client can set their own origin to be trusted. Fix: use a fixed `ALLOWED_ORIGIN` environment variable and require it to be set in production.

### MEDIUM (code quality / maintainability)
- **Line 44–49**: The `/__PORT_5000__` URL rewriting middleware is a development-environment hack left in the production code path. It should be conditional on `NODE_ENV !== "production"` to avoid the unnecessary string check on every request in production.
- **Line 11**: `rawBody: unknown` type on `IncomingMessage` — `unknown` is less useful than `Buffer` (the actual type of `buf` in the `verify` callback). Fix: type as `Buffer | undefined`.

---

## dockerSandbox.ts

### CRITICAL (will crash in production)
- **Line 240**: `await execAsync(\`docker ${args.join(" ")}\`, ...)` — the container label argument at line 187 (`label = \`ultra-sandbox-${sessionId.substring(0, 8)}\``) concatenates a session ID (a UUID prefix) into a shell command string. Although UUIDs are hex+hyphen and safe, any future change to session ID format could introduce shell injection. Fix: use `execFile("docker", args)` instead of `execAsync` with the joined string.
- **Line 297**: `const escapedCmd = command.replace(/'/g, "'\\''")` — single-quote escaping is applied to the user command before wrapping in `/bin/sh -c '...'`. However, if `command` contains a NUL byte (`\0`), the shell interprets this as end-of-string, potentially truncating the command silently. This is a minor risk but affects correctness. Fix: validate `command` does not contain NUL bytes before execution.
- **Line 333**: `await execAsync(\`docker rm -f ${state.containerId}\`, ...)` — `containerId` comes from Docker stdout (line 244). If Docker ever returns a container ID with unexpected characters (e.g. a compromised Docker daemon), this could inject into the shell command. Fix: use `execFile("docker", ["rm", "-f", state.containerId])`.
- **Line 386**: `await execAsync('docker rm -f $(docker ps -aq --filter "label=ultra-computer=sandbox") 2>/dev/null || true', ...)` — uses command substitution `$(...)` directly in `execAsync`. If `docker ps` produces unexpected output this could be used for injection. Fix: use two separate `execFile` calls: first get IDs, then remove.

### HIGH (incorrect behavior)
- **Line 85–103**: `isDockerAvailable()` caches the result permanently in `this.dockerAvailable`. If Docker becomes unavailable mid-session (daemon crash), the cached `true` means all subsequent `exec` calls will attempt Docker and fail, falling back to host execution silently rather than alerting. Fix: add a periodic re-check or invalidate the cache on exec failures.
- **Line 162–183**: `getContainer()` is not atomic. Two concurrent calls for the same `sessionId` can both see `existing` as absent and both call `createContainer()` for the same session, racing to create two containers. The second `this.containers.set(sessionId, state)` will overwrite the first, leaking the first container forever. Fix: add a mutex or use a pending-creation Map to serialize creation per session.
- **Line 94, 99, 253, 337, 365**: `console.log` in production hot path without log levels. Fix: use a structured logger.
- **Line 248–251**: Auto-installs `python3 curl jq bc` into bare Ubuntu containers on first use. This has a 60-second timeout but runs during the first command execution, making the first bash call for a new session very slow (apt-get update can take >10 seconds). Fix: use a pre-built custom Docker image with these tools already installed.
- **Line 423–432**: `SIGTERM`/`SIGINT` handlers call `dockerSandbox.shutdown()` (async) but the process may exit before the promise resolves. Fix: use `process.on("SIGTERM", async () => { await dockerSandbox.shutdown(); process.exit(0); })` with proper async handling.

### MEDIUM (code quality / maintainability)
- **Line 300–322**: `execInContainer` returns a `Promise` constructed with `new Promise((resolve, reject) => {...})` but the `reject` callback is never called — all errors are resolved (including killed processes). This means `await execInContainer(...)` never rejects; callers never see a rejected promise. The container `status` is still set to `"ready"` on both success and error (lines 283, 286) which is correct, but error propagation relies entirely on the resolved value. This is acceptable but should be documented.

---

## skillSystem.ts

### CRITICAL (will crash in production)
- **Line 19**: `JSON.parse(skill.triggerKeywords || "[]")` — if `triggerKeywords` contains malformed JSON (e.g. a skill was stored with a non-JSON string), this throws inside `matchSkills()`, which is called on every user message in the orchestrator (orchestrator.ts line 96). This will crash the orchestrator for every message until the corrupt skill is fixed. Fix: wrap in try/catch and return `[]` on parse error.

### HIGH (incorrect behavior)
- **Line 179**: `Math.random().toString(36).slice(2) + Date.now().toString(36)` — used as a skill ID instead of a UUID. This is collision-prone (Math.random has 52 bits of entropy, Date.now adds millisecond precision — under concurrent seeding calls the IDs could collide). Fix: use `uuidv4()` consistently (it's already imported in routes.ts but not here). Add an import.
- **Line 173–174**: `seedBuiltInSkills()` guard `if (existing.length >= BUILT_IN_SKILLS.length) return` — if a user deletes a built-in skill and a non-built-in skill exists, the count check can pass (≥ threshold) and the deleted built-in is never re-seeded. Fix: check by name instead of count.

### MEDIUM (code quality / maintainability)
- **Lines 11–42**: `SkillMatcher.matchSkills()` calls `storage.getSkills()` on every invocation (every user message). This is an unbounded DB read with no caching. Fix: add a short-lived in-memory cache (e.g. TTL 30 seconds) to avoid redundant DB reads during rapid conversation turns.
- **Line 19**: `JSON.parse` inside a `map()` with no error boundary — one corrupt skill disables all skill matching. Fix: add a per-item try/catch.

---

## memoryManager.ts

### CRITICAL (will crash in production)
- **Line 66**: `const facts = JSON.parse(jsonMatch[0])` — no try/catch. If the LLM returns a `[...]` block that is not valid JSON (e.g. malformed due to truncation at `maxTokens: 500`), this throws inside the `try` block at line 35, which is caught at line 110, so the crash is technically handled — but the error message will be an opaque JSON parse error rather than a useful log. This is HIGH rather than CRITICAL because of the outer catch.
- **Line 102–107**: Deduplication runs inside the per-fact insert loop: for each new fact, fetch 200 memories, compute dedup, then delete duplicates. If 10 facts are extracted in one turn, this is 10 × (fetch 200 + compute + N deletes) = significant I/O for what should be a post-insert batch operation. Under load this creates excessive DB writes. Fix: collect all new memories, batch-insert, then run deduplication once at the end.

### HIGH (incorrect behavior)
- **Line 74**: `const existingMemories = storage.getMemories(200)` — fetched once before the loop, then used inside the loop for `calculateImportance`. After the first insert, new memories exist that are not in this snapshot, making subsequent `calculateImportance` calls in the same loop potentially stale. This is a logical inconsistency. Fix: move the fetch inside the loop or accept the snapshot approach consistently.
- **Line 112**: `console.error('[MemoryManager]', error)` — raw error object logged. Fix: use a structured logger.
- **Line 34–114**: `extractAndStore` is called after every user message (orchestrator.ts line 201). Each call makes an LLM API request (`chat(...)` line 39) at `maxTokens: 500`. Under load or with many concurrent conversations, this triggers many expensive LLM calls for memory extraction — there is no debouncing, rate limiting, or queue. Fix: make memory extraction asynchronous and queued, not inline in the response path.

### MEDIUM (code quality / maintainability)
- **Line 59**: `assistantResponse.slice(0, 1000)` — only the first 1000 chars of the assistant response are sent to the memory extraction LLM. This means memory extraction ignores the bulk of long responses (e.g. code blocks, detailed analysis). This is probably intentional for token efficiency but is undocumented. Add a comment.
- **Line 117–124**: `compact()` is defined but never called. There is no scheduled job or lifecycle hook that calls it. Fix: wire it up to a periodic task (e.g. the cron scheduler).

---

## connectorRegistry.ts

### CRITICAL (will crash in production)
- **Line 202**: `await fetch(\`${serverUrl}/tools/${toolName}\`, ...)` — `serverUrl` comes from `connector.mcpServerUrl || config.serverUrl` (line 199). Neither value is validated as a URL before use. A connector with a malformed `mcpServerUrl` (e.g. a relative path, `javascript:` URI, or an internal network address) will either throw or make an SSRF request. Fix: validate `serverUrl` with `new URL(serverUrl)` and enforce `http://`/`https://` protocol, and apply the same SSRF protection as `executeFetchUrl` in tools.ts.
- **Line 212**: `return response.json()` — no try/catch. If the MCP server returns non-JSON (HTML error page, network timeout body), `.json()` throws an unhandled promise rejection that propagates to the caller (`POST /api/connectors/:id/call` in routes.ts line 421) which does have a try/catch. So this is caught, but the error message is unhelpful. Fix: wrap in try/catch with a descriptive error.

### HIGH (incorrect behavior)
- **Line 178–184**: `connectWithApiKey()` stores the `apiKey` (and all extra config) in the `config` JSON column without any encryption or hashing. API keys for GitHub, Jira, Linear, Confluence, PostgreSQL (connection string), and Snowflake are stored in plaintext in SQLite. Fix: encrypt sensitive config at rest using AES-256 with a server-side key from `process.env.CONFIG_ENCRYPTION_KEY`.
- **Line 179**: `const config = JSON.stringify({ apiKey, ...(extraConfig || {}) })` — `extraConfig` is typed as `Record<string, string>` but comes directly from `req.body` in routes.ts (line 409: `const { apiKey, serverUrl, ...extra } = req.body`). Any additional request body fields (including potentially dangerous ones) are stored verbatim. Fix: allowlist the fields accepted in `extraConfig`.
- **Line 155–175**: `seedConnectors()` — no error handling. If a DB insert fails (e.g. constraint violation, disk full), the error propagates to `registerRoutes` which also has no try/catch around the seed calls (routes.ts lines 35–36). Fix: wrap in try/catch and log.

### MEDIUM (code quality / maintainability)
- **Line 188**: `callMCPTool` has no timeout on the `fetch` call. A slow or hung MCP server will hang the HTTP request handler indefinitely. Fix: add an `AbortController` with a configurable timeout (e.g. 30 seconds).
- **Lines 26–152**: `BUILT_IN_CONNECTORS` is a hardcoded list. Adding a new connector requires a code deploy and a re-seed. Consider making this DB-configurable.
- **Line 191**: `if (connector.status !== "connected") throw new Error(...)` — the thrown error message includes the internal connector ID. Fix: use a generic message for the API surface.

---

## Cross-File Issues

### CRITICAL
- **No authentication or authorization on any route.** Every `/api/*` endpoint is publicly accessible with no session, JWT, API key, or IP allowlist check. `DELETE /api/models/:id`, `DELETE /api/memory/:id`, `POST /api/connectors/:id/call`, `GET /api/memory`, etc. are all unauthenticated. Fix: add an authentication middleware (at minimum an `ADMIN_TOKEN` env-var check for all `/api/` routes before going to production).
- **No rate limiting on any endpoint.** `POST /api/conversations/:id/messages` (which triggers full LLM orchestration) can be called unlimited times per second, making the server trivially abusable for LLM cost exhaustion. Fix: add `express-rate-limit` with per-IP limits on mutation endpoints.

### HIGH
- **No request ID / correlation ID.** Log lines from concurrent requests are interleaved with no way to trace a single request across `routes.ts → orchestrator.ts → tools.ts`. Fix: use a middleware to add `X-Request-ID` and propagate it through all log calls.
- **No graceful shutdown.** Active LLM stream responses and running agent tasks will be abruptly terminated on `SIGTERM` without draining. Fix: listen for `SIGTERM`, stop accepting new connections, wait for active SSE streams and agent runs to finish (with a timeout), then exit.

---

## Summary

| File                 | Critical | High | Medium |
|----------------------|----------|------|--------|
| routes.ts            | 12       | 10   | 4      |
| storage.ts           | 4        | 4    | 4      |
| modelRouter.ts       | 2        | 5    | 2      |
| modelConnections.ts  | 3        | 4    | 2      |
| orchestrator.ts      | 6        | 8    | 2      |
| tools.ts             | 4        | 4    | 2      |
| index.ts             | 2        | 5    | 2      |
| dockerSandbox.ts     | 4        | 5    | 1      |
| skillSystem.ts       | 1        | 2    | 2      |
| memoryManager.ts     | 1 (mitigated) | 3 | 2 |
| connectorRegistry.ts | 2        | 3    | 3      |
| **Cross-file**       | **2**    | **2**| —      |
| **TOTAL**            | **43**   | **55** | **26** |

**43 critical, 55 high, 26 medium across all files.**

### Highest-Priority Fixes Before Any Production Deployment

1. **Add authentication middleware** — no auth on any route is a showstopper.
2. **Add rate limiting** — especially on `POST /api/conversations/:id/messages`.
3. **Fix race conditions** in `POST /api/models` and `POST /api/models` default-flag updates (no transactions).
4. **Encrypt connector API keys** at rest — plaintext secrets in SQLite is a critical data-security issue.
5. **Fix global `currentSessionId` race** in tools.ts — concurrent agent runs will bleed session IDs.
6. **Add process-level uncaught exception handlers** in index.ts — any unhandled rejection crashes the server.
7. **Validate MCP serverUrl** in connectorRegistry.ts — SSRF vector.
8. **Wrap DB DDL in migrations** — inline `CREATE TABLE IF NOT EXISTS` at startup has no rollback, versioning, or audit trail.
9. **Stop logging response bodies** in index.ts — API keys and tokens appear in stdout.
10. **Fix `process.env` leakage** into Docker host fallback in tools.ts — all API keys exposed to sandboxed shells.
