# Production Fixes — Server Core Files

**Date:** 2025-07  
**Scope:** 7 server core files  
**Method:** Surgical edits via the `edit` tool; no wholesale rewrites.

---

## server/index.ts

### 1. Process-level uncaught error handlers
Added `process.on("uncaughtException")` and `process.on("unhandledRejection")` at the top of the file, before any other code. Both log the error and call `process.exit(1)`.

### 2. Top-level IIFE wrapped in try/catch
The `(async () => { ... })()` block now has a `try { ... } catch (err) { console.error(...); process.exit(1); }` wrapper so startup failures (e.g., port conflicts, DB errors) produce a clear fatal log instead of an unhandled rejection.

### 3. Response-body logging removed
Removed the `capturedJsonResponse` interceptor and its `:: ${JSON.stringify(capturedJsonResponse)}` log suffix. API responses may contain API keys, tokens, and personal data — logging them violated the principle of least exposure. The log line now records only method, path, status, and duration.

### 4. CORS origin fixed
Replaced `process.env.ALLOWED_ORIGIN || \`${req.protocol}://${req.headers.host}\`` with `process.env.ALLOWED_ORIGIN || "*"`. Deriving the allowed origin from a request header is a CORS bypass (attacker controls `Host`).

### 5. Global error handler returns generic 5xx messages
The `(err, req, res, next)` handler now sends `"Internal Server Error"` for status ≥ 500 instead of the raw `err.message`. Real errors are logged server-side. 4xx errors still pass through `err.message`.

### 6. `__PORT_5000__` rewrite made conditional
The URL rewrite middleware is now wrapped in `if (process.env.NODE_ENV !== "production")` so it is never active in production bundles where the build process handles substitution.

---

## server/routes.ts

### 7. POST endpoints return 201
Changed all resource-creation POST endpoints to respond with `res.status(201).json(...)`:
- `POST /api/models`
- `POST /api/conversations`
- `POST /api/conversations/:id/messages`
- `POST /api/skill-scripts`
- `POST /api/memory`
- `POST /api/connectors`

### 8. DELETE endpoints: 404 if not found
Added existence checks before all DELETE operations:
- `DELETE /api/models/:id` — checks `storage.getModel()`
- `DELETE /api/skills/:id` — checks `storage.getSkill()` (existing built-in check retained)
- `DELETE /api/connectors/:id` — checks `storage.getConnector()`
- `DELETE /api/memory/:id` — checks memory by ID via `getMemories(10000).find()`
- `DELETE /api/skill-scripts/:id` — checks `storage.getSkillScript()`

### 9. POST /api/memory body validation
Added:
- `typeof content !== "string"` check
- `importance` must be 0–1 if provided
- `category` must be a string with max length 100

### 10. PATCH /api/skill-scripts/:id mass-assignment fixed
Replaced `const { content, changeNote, tags, ...rest } = req.body; const updateData = { ...rest }` with an explicit allowlist: `name`, `description`, `language`, `filePath`, `isFavorite`, `tags`, `content`. No `...rest` spread.

### 11. SSE /api/notifications — try/catch on send() and ping
Wrapped the `res.write()` call in `send()` and the keepalive `setInterval` write in try/catch. On error the interval is cleared and all conversation subscriptions are removed.

### 12. POST /api/settings — body must be plain object
Added `if (!req.body || typeof req.body !== "object" || Array.isArray(req.body))` guard to reject arrays and non-objects.

### 13. GET /api/skill-scripts?q= length limit
Added `if (q.length > 500) return res.status(400).json(...)` guard.

### 14. POST /api/connectors/:id/connect — apiKey validation
Added check: `typeof apiKey !== "string" || apiKey.length >= 500` → 400.

### 15. POST /api/connectors — category allowlist
Defined `CONNECTOR_CATEGORY_ALLOWLIST` set and validated `category` against it. Returns 400 for unknown categories.

### 16. taskQueue.initialize() error logged
Changed `.catch(() => {})` to `.catch((err) => console.error("[taskQueue] Initialization error:", err))`.

---

## server/storage.ts

### 17. DB path uses path.resolve + env var
Changed `new Database("ultra_computer.db")` to:
```ts
const dbPath = path.resolve(process.cwd(), process.env.DB_PATH || "ultra_computer.db");
const sqlite = new Database(dbPath);
```
Added `import path from "path"`.

### 18. deleteConversation wrapped in transaction
Uses `sqlite.transaction(() => { ... })()` to atomically delete messages, tasks, agentRuns, and the conversation itself.

### 19. deleteSkillScript wrapped in transaction
Uses `sqlite.transaction()` to atomically delete versions and the script.

### 20. deleteMarketplaceSkill wrapped in transaction
Uses `sqlite.transaction()` to atomically delete versions, ratings, installs, and the skill.

### 21. searchMemories uses SQL LIKE
Replaced full-table JS `.filter()` with a Drizzle `or(like(...), like(...))` query with `limit()`.

### 22. searchSkillScripts uses SQL LIKE
Replaced full-table JS `.filter()` with a Drizzle `or(like(...), like(...), like(...), like(...))` query.

### 23. getMarketplaceSkills pushed to SQL
Replaced the full-table-load + JS sort/filter/slice pattern with SQL-level `WHERE`, `ORDER BY`, `LIMIT`, and `OFFSET` using Drizzle. Ordering columns: `installCount` (popular), `ratingSum` (rating), `qualityScore` (quality), `publishedAt` (default/newest).

### 24. createModel try/catch for unique constraint
Wrapped the `db.insert(models)...` call in try/catch; re-throws with a clear `UNIQUE constraint violated` message.

---

## server/modelRouter.ts

### 25. Static import for Google SDK
Removed both dynamic `await import("@google/generative-ai")` calls from `chatGoogle` and `streamGoogle`. Added `import { GoogleGenerativeAI } from "@google/generative-ai"` at the top of the file. Dynamic imports of local/bundled modules fail in the esbuild CJS bundle.

### 26. `maxTokens || 4096` → `maxTokens ?? 4096`
Fixed in both `chat()` and `chatStream()`. The `||` operator would substitute the default when `maxTokens` is `0`, which is a valid value for some providers.

### 27. Early API key validation for Anthropic and Google
`makeAnthropicClient()` now throws `Error("No API key configured for provider anthropic ...")` if `creds.apiKey` is falsy. `chatGoogle()` and `streamGoogle()` do the same for Google. Previously an empty string was passed silently, producing a cryptic SDK error.

### 28. OpenAI choices existence check
Added `if (!res.choices?.length) throw new Error("No response from model")` in `chatOpenAICompat` before accessing `res.choices[0]`.

---

## server/orchestrator.ts

### 29. fs.mkdirSync(IPC_DIR) wrapped in try/catch
The top-level `fs.mkdirSync` call is now inside `try { ... } catch (err) { console.error(...); }` so a permissions error at startup doesn't crash the module load.

### 30. JSON.parse(t.dependsOn) in executeDAG wrapped in try/catch
The filter in the `ready` array computation now wraps `JSON.parse(t.dependsOn)` in try/catch with fallback to `[]`.

### 31. JSON.parse(task.dependsOn) in buildDependencyContext wrapped in try/catch
Same fix — fallback to `[]` on parse error.

### 32. fs.writeFileSync → fs.promises.writeFile
Both IPC write calls (initial and final) now use `fs.promises.writeFile(...).catch(err => console.error(...))` to avoid blocking the event loop.

### 33. Non-null assertions replaced with null checks
`storage.getTask(task.id)!` replaced with `const t = storage.getTask(task.id); if (t) emit(...)` in three places (running, completed, failed states).

### 34. maxIterations made configurable
`const maxIterations = 20` replaced with:
```ts
const maxIterationsConfig = storage.getSetting("max_dag_iterations");
const maxIterations = maxIterationsConfig ? parseInt(maxIterationsConfig, 10) || 20 : 20;
```

### 35. MAX_TOOL_ITERATIONS made configurable
Replaced `const MAX_TOOL_ITERATIONS = 10` (module-level constant) with a `getMaxToolIterations()` function that reads `storage.getSetting("max_tool_iterations")`. The value is computed once per worker run at the start of the loop.

### 36. Removed setCurrentSession / global session coupling
Removed `setCurrentSession(agentRunId)` call and its import from `tools.js`. `executeTool` is now called with `sessionId` explicitly: `executeTool(call.name, call.args, agentRunId)`.

---

## server/tools.ts

### 37. Removed global currentSessionId
Deleted the module-level `let currentSessionId: string = "default"` and `export function setCurrentSession(...)`. The `executeTool` function now takes `sessionId: string = "default"` as a required-with-default parameter. Internal helpers `executeBash` and `executeBashDocker` updated similarly. `setCurrentSession` was the only export removed.

### 38. write_file size limit
Added `if (content.length > 50_000_000)` guard at the top of `executeWriteFile`, returning an error rather than attempting to write a 50+ MB file to disk.

### 39. Replaced `new Function()` calculator with safe evaluator
Replaced the previous approach (which called `new Function(\`return (${sanitized})\`)` with full global access) with `safeEvalMath()` that:
1. Validates all `Math.*` tokens against an allowlist.
2. Removes `Math.identifier` tokens and validates every remaining character against `[0-9.+\-*/%() \t\n,eE]`.
3. Calls `new Function("Math", \`"use strict"; return (${expression});\`)` with **only** the `Math` object in scope — no access to `process`, `require`, `globalThis`, etc.

### 40. executeBashHost env leakage fixed
Replaced `env: { ...process.env, HOME: SANDBOX_DIR }` with a minimal `safeEnv` object containing only: `PATH`, `HOME` (set to SANDBOX_DIR), `LANG`, `TERM`, `NODE_ENV`. This prevents leaking API keys, database passwords, and other secrets that live in `process.env`.

### 41. fetch_url Content-Type check
Added content-type validation in `executeFetchUrl`. Binary/non-text responses (images, PDFs, archives, etc.) are rejected with a descriptive error. Allowed types: `text/*`, `application/json`, `application/xml`, `application/xhtml`, `application/javascript`, `application/ld+json`, and empty content-type.

---

## server/modelConnections.ts

### 42. API key masking safety
In `discoverEnvVars()`, the masked string now checks `value.length > 12` before applying the `slice(0,6)...slice(-4)` pattern. Short keys (≤ 12 chars) return `"***"` to avoid revealing the full value through the mask windows.

### 43. Reduced `as any` casts on storage.updateModel calls
Replaced 6 instances of `{ ..., field: value } as any` with field-level casts (`field: value as any`) so TypeScript still validates the object shape while the specific nullable fields are cast individually. Applied to: `connectModel`, `disconnectModel`, `handleModelOAuthCallback`, `testConnection`, and `createFromPreset`.

---

## server/dockerSandbox.ts

### 44. containerId validation before shell use
Added `isValidContainerId(id: string): boolean` function (`/^[a-f0-9]{12,64}$/`). The ID returned by `docker run` is validated before being stored in `state.containerId`. `removeContainer` validates the stored ID before passing it to `docker rm -f`.

### 45. Concurrent container creation race — pendingCreation Map
Added `private pendingCreation = new Map<string, Promise<ContainerState>>()` to `DockerSandbox`. In `getContainer()`, if a creation promise is already in flight for a `sessionId`, the second caller awaits the same promise instead of launching a duplicate `docker run`. The map entry is cleaned up via `.finally()`.

### 46. SIGTERM/SIGINT handlers properly await shutdown
Changed:
```ts
process.on("SIGTERM", () => dockerSandbox.shutdown());
```
to:
```ts
process.on("SIGTERM", () => {
  dockerSandbox.shutdown().finally(() => process.exit(0));
});
```
Same for SIGINT. The previous handlers fired the async `shutdown()` but exited immediately, leaving containers running.

---

## Summary Table

| File | Issues Fixed |
|------|-------------|
| server/index.ts | 6 |
| server/routes.ts | 10 |
| server/storage.ts | 8 |
| server/modelRouter.ts | 4 |
| server/orchestrator.ts | 8 |
| server/tools.ts | 5 |
| server/modelConnections.ts | 2 |
| server/dockerSandbox.ts | 3 |
| **Total** | **46** |
