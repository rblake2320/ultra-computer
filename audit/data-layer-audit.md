# Ultra Computer — Data Layer & Route Audit

**Scope:** `shared/schema.ts`, `server/storage.ts`, `server/routes.ts`, `server/index.ts`, and all modular route files.  
**Verdict: NOT production-ready.** Multiple critical and high-severity issues identified below.

---

## 1. SCHEMA INTEGRITY

### ✅ Tables are complete and consistently defined
All 14 tables defined in `schema.ts` are mirrored verbatim in the inline DDL in `storage.ts`. Column names, types, nullability, and defaults match across both files. No columns are referenced in code that don't exist in the schema.

### ✅ All tables are actively used
Every table (`models`, `skills`, `connectors`, `memory`, `conversations`, `messages`, `tasks`, `agentRuns`, `skillScripts`, `skillScriptVersions`, `marketplaceSkills`, `marketplaceVersions`, `marketplaceRatings`, `marketplaceInstalls`, `settings`) has at least one CRUD path exercised by routes or internal services.

### 🔴 CRITICAL: No migration infrastructure for existing deployments
`drizzle.config.ts` points to `./data.db` but `storage.ts` opens `./ultra_computer.db`. These are **different files**. The `drizzle-kit` migration tooling is pointed at the wrong database. Additionally, no `migrations/` directory exists — it was never generated or run.

**Impact:** Any schema change (new column, new table) will silently fail on existing deployments unless users manually `DROP` and re-create the database. The `CREATE TABLE IF NOT EXISTS` pattern used in `storage.ts` prevents errors on fresh starts, but **column additions to existing tables are never applied**. A production deployment that gained new columns (e.g., the entire scoring pipeline columns on `marketplace_skills`, or `authMethod`/`oauthTokens`/`envVarName`/`connectionStatus` on `models`) will have those columns missing in the live database and queries will silently return `null` for them.

**Fix:** Either remove `drizzle.config.ts` (it's misleading), or fix the `url` to `ultra_computer.db` and add `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` migrations run at startup before any query.

### 🟡 MEDIUM: `insertMarketplaceSkillSchema` omits too many fields, forcing `as any` throughout
`insertMarketplaceSkillSchema` omits all scoring fields (`qualityScore`, `installVelocity`, `ratingBayesian`, `ratingVariance`, `forkDepth`, `versionFrequency`, `contentRichness`, `scoreTier`, `lastScoredAt`) and all counter fields (`installCount`, `ratingSum`, `ratingCount`, `forkCount`). This is correct for `INSERT`, but `IStorage.updateMarketplaceSkill` accepts `Partial<InsertMarketplaceSkill>`, which means the scoring pipeline cannot pass typed updates.

**Result:** `marketplaceScoring.ts` lines 318 and 356, `marketplaceRoutes.ts` lines 162, 576 — all use `as any` casts to push scoring fields into update calls. The TypeScript compiler provides zero protection on these writes. A typo in a scoring field name would silently no-op the DB update.

**Fix:** Define a separate `UpdateMarketplaceSkill` type that includes all mutable columns, and update `IStorage.updateMarketplaceSkill` to use it.

---

## 2. ROUTE COMPLETENESS

### 🔴 CRITICAL: `/api/all-agent-runs` — route exists nowhere
`client/src/pages/TokenDashboardPage.tsx` line 435 issues a query to `/api/all-agent-runs`. This route is **not registered anywhere** in `routes.ts` or any route module. It will hit the `404 { error: "Not found" }` catch-all. The Token Dashboard is completely broken for its agent-run aggregation feature.

**Fix:** Add a route `GET /api/all-agent-runs` that fetches agent runs across all conversations (possibly with a limit/offset).

### 🔴 CRITICAL: `DELETE /api/identity/:cryptoId/blocks/:blockId` — route does not exist
`client/src/pages/IdentityPage.tsx` line 1107 calls `apiRequest("DELETE", /api/identity/${cryptoId}/blocks/${blockId})`. The server has `GET /api/identity/:cryptoId/blocks` (list) and `POST /api/identity/:cryptoId/unblock` (unblock by passing `blockedId` in body), but **no DELETE route accepting a blockId path parameter**. The "unblock" button in the Identity UI will always receive a 404.

**Fix:** Either add `DELETE /api/identity/:cryptoId/blocks/:blockId` or fix the client to call `POST /api/identity/:cryptoId/unblock` with a body.

### 🟡 MEDIUM: No `PATCH /api/connectors/:id` route
There is no way to update a connector's metadata (name, description, category, logoUrl, mcpServerUrl, scopes) after creation. The client can `POST /connectors`, `POST /connectors/:id/connect`, `POST /connectors/:id/disconnect`, and `DELETE /connectors/:id` — but no general update. While no frontend call was found for this specific path, it's a notable gap in the CRUD API surface.

### 🟡 MEDIUM: `/api/notifications` SSE only captures conversations present at connection time
`routes.ts` line 679: `const conversations = storage.getConversations()` is called once when the SSE client connects. Any conversation created **after** the client connects is never subscribed to. This means the global notification bell will miss events from new sessions during an active browser session — a significant UX bug.

**Fix:** Subscribe to a global orchestrator event bus rather than per-conversation at connect time, or re-evaluate subscriptions when new conversations are created.

### ✅ All route files are properly registered
`routes.ts` imports and calls `registerFileRoutes`, `registerOAuthRoutes`, `registerExportRoutes`, `registerBrowserRoutes`, `registerMarketplaceRoutes`, `registerAutonomyRoutes`, `registerProtocolRoutes`, `registerMessagingRoutes`, `registerNIPRoutes`, and `registerIdentityRoutes`. All modular route files are wired in.

### ✅ No completely orphaned routes found
Every registered route corresponds to a plausible client action or system service. The autonomy, NIP, identity, protocol, and messaging routes serve their respective UI pages.

---

## 3. STORAGE CONSISTENCY

### ✅ IStorage interface is fully implemented by SQLiteStorage
Every method declared in `IStorage` (lines 238–334) is implemented in `SQLiteStorage` (lines 336–592). There are no abstract methods left unimplemented.

### 🟡 MEDIUM: `getMessage(id)` is implemented but never called
`IStorage.getMessage(id: string)` is declared and implemented in `SQLiteStorage`, but **no route, service, or utility calls it**. It's dead interface surface. Minor, but contributes to interface sprawl.

### 🟡 MEDIUM: `deleteConversation` has no cascade delete
`SQLiteStorage.deleteConversation` only deletes the `conversations` row. It does **not** delete associated `messages`, `tasks`, or `agentRuns`. This leaves orphaned rows in all three tables that can never be accessed through any route (since all fetches are scoped by `conversationId`). Over time this silently grows the database unboundedly.

**Fix:** Add cascade deletes for `messages`, `tasks`, and `agentRuns` when a conversation is deleted. SQLite supports `ON DELETE CASCADE` if FK constraints are enabled via `PRAGMA foreign_keys = ON`, which is never set in `storage.ts`.

### 🟡 MEDIUM: `incrementMarketplaceInstallCount`, `updateMarketplaceRating`, `incrementMarketplaceForkCount` are race-prone
All three methods read the current value with `getMarketplaceSkill()` then write back an incremented value in a separate statement. Under concurrent requests this is a read-modify-write race. With better-sqlite3 (synchronous driver), within a single Node.js process this is unlikely to manifest, but it's bad practice and will break under any future connection pooling.

**Fix:** Use `SET install_count = install_count + 1` style SQL expressions rather than read-then-write.

### 🟡 MEDIUM: `scoreSkillById` calls `getMarketplaceSkills()` for every single-skill score update
`marketplaceScoring.ts` line 338: every call to `scoreSkillById` (which is called after every install, rating, fork, and new version) fetches **all marketplace skills** from the database just to pass as the `allSkills` context to `scoreForkLineage`. For a marketplace with 100+ skills, this is a full table scan on every user interaction.

**Fix:** Pass `allSkills` as a parameter to `scoreSkillById`, or cache it briefly, or compute fork depth lazily.

### 🟡 MEDIUM: `getMarketplaceSkills` is called twice in `GET /api/marketplace/skills`
`marketplaceRoutes.ts` lines 32–33:
```typescript
const skills = storage.getMarketplaceSkills({ category, search, sort, limit, offset });
const total = storage.getMarketplaceSkills({ category, search }).length;
```
The second call is a full filtered scan (no limit) just to get the count. Both scans happen in the same request. Add a count-only query or return total from the first call.

---

## 4. ROUTE REGISTRATION & WIRING

### ✅ All route files exist and export their `register*` function
Every file imported in `routes.ts` exists, exports the expected named function, and the function signature matches (`app: Express`).

### ✅ Index.ts wiring is correct
`server/index.ts` correctly sets up middleware (JSON body parsing, CORS, URL prefix stripping, request logging) before calling `registerRoutes`. Error handler and API 404 catch-all are registered after routes, in the correct order.

### 🟡 MEDIUM: Global 404 catch-all uses Express 5 syntax but some wildcard routes use Express 4 syntax inconsistently
`index.ts` line 106 uses `app.all("/api/{*path}", ...)` (Express 5 route syntax). `fileRoutes.ts` uses `/api/sandbox/files/*filePath` (Express 5 wildcard). But `routes.ts` and other route files use plain `:param` style (Express 4). The codebase appears to target Express 5 — this is fine, but should be explicitly confirmed in `package.json` to avoid breakage.

---

## 5. ERROR HANDLING

### 🔴 CRITICAL: `PATCH /api/models/:id` passes `req.body` directly to `updateModel` with no sanitization
`routes.ts` line 152:
```typescript
const updated = storage.updateModel(req.params.id, req.body);
```
The client can pass **any field** — including `apiKey`, `oauthTokens`, `connectionStatus`, `connectionError` — directly into the database. This is a **mass assignment vulnerability**. A malicious client could set `connectionStatus: "connected"` without actually connecting, inject a fake `oauthTokens` value, or overwrite `createdAt`.

**Fix:** Whitelist allowed update fields explicitly (e.g., `name`, `enabled`, `speedTier`, `notes`, `isDefault`, `isOrchestrator`, `contextWindow`, `capabilities`). Credential/auth fields must only be set via the `/connect` endpoint.

### 🔴 CRITICAL: `PATCH /api/conversations/:id` passes `req.body` directly to `updateConversation`
`routes.ts` line 211:
```typescript
const updated = storage.updateConversation(req.params.id, req.body);
```
The client can set `status`, `orchestratorModelId`, `activeSkillIds` — and even try to set `createdAt` (Drizzle ignores unknown fields, but `id`, `status`, and `orchestratorModelId` are all writable). While lower-severity than the model case, a client could corrupt conversation state.

**Fix:** Whitelist to `{ title, status, orchestratorModelId, activeSkillIds }` at minimum.

### 🔴 CRITICAL: `PATCH /api/skills/:id` passes `req.body` directly to `updateSkill`
`routes.ts` line 336: same mass assignment pattern. A client could set `isBuiltIn: true` on a user skill (breaking the delete guard on line 343), or set `usageCount` to any value.

**Fix:** Whitelist to `{ name, description, content, triggerKeywords, enabled }`.

### 🟠 HIGH: `PATCH /api/autonomy/checkpoints/:id` has no 404 guard
`autonomyRoutes.ts` line 77–79:
```typescript
app.patch("/api/autonomy/checkpoints/:id", (req, res) => {
  const cp = updateCheckpoint(req.params.id, req.body);
  res.json(cp);
});
```
If `updateCheckpoint` returns `undefined` (checkpoint not found), `res.json(undefined)` sends an empty 200 response body. No 404 is returned. Same issue exists for `advanceStep` on line 82.

**Fix:** Check return value and return `res.status(404).json({ error: "Checkpoint not found" })` if null.

### 🟠 HIGH: `POST /api/autonomy/learning/log` accepts unvalidated `req.body`
`autonomyRoutes.ts` line 207: `logExecution(req.body)` is called with the raw request body. No field validation, no type checking, no size limit. An attacker can flood the learning log with arbitrary data.

**Fix:** Validate required fields (taskType, outcome, etc.) before passing to `logExecution`.

### 🟡 MEDIUM: `POST /api/memory` doesn't validate `importance` range
`routes.ts` line 419: `importance: importance ?? 0.7` — no check that `importance` is a number between 0 and 1. A client can set `importance: 9999`, which would skew memory retrieval ordering permanently.

**Fix:** Add `if (importance !== undefined && (typeof importance !== 'number' || importance < 0 || importance > 1))` check.

### 🟡 MEDIUM: `GET /api/conversations/:id/stream` doesn't verify the conversation exists before opening SSE
`routes.ts` line 268: the SSE stream opens immediately without checking if `convId` corresponds to a real conversation. An attacker can open unlimited SSE connections to non-existent IDs, holding connections open indefinitely (the keep-alive ping runs forever). Each connection holds a `setInterval`.

**Fix:** Check `storage.getConversation(convId)` before upgrading to SSE and return 404 if not found.

### 🟡 MEDIUM: File upload route has no auth, no file type restriction, no rate limiting
`fileRoutes.ts` line 140: `app.post("/api/sandbox/files/upload", upload.array("files"), ...)` — anyone can upload arbitrary files to the server sandbox directory with no authentication, no MIME type checking, and no rate limiting. The 100 MB per-file limit is the only guard.

**Fix:** For production, add authentication middleware and file type allowlisting.

### 🟡 MEDIUM: Multer `destination` field may not be populated in multipart body
`fileRoutes.ts` line 111: `const dest = (req.body?.destination as string) || ""` inside the multer `destination` callback. When using `multer.diskStorage`, the `req.body` may not be fully parsed at the time the `destination` function is called if the `destination` field appears **after** the file fields in the multipart stream. This is a known multer limitation.

**Fix:** Use a fixed upload directory and handle subdirectory routing after the upload completes, or ensure `destination` is the first field sent in multipart requests.

### 🟡 MEDIUM: `resolveSafe` path traversal protection is fragile
`fileRoutes.ts` line 27: 
```typescript
const decoded = decodeURIComponent(relativePath).replace(/\.\.\//g, "").replace(/\.\./g, "");
```
This strips `../` and `..` before calling `path.resolve`. However, the final `if (!resolved.startsWith(SANDBOX_DIR + path.sep))` check is the correct protection — the string replacement is redundant and could be bypassed by non-standard encodings (e.g., `..%2F`). The defense-in-depth here relies on the `path.resolve` + `startsWith` check, which is correct, but the comment/intent implies the string stripping is load-bearing when it isn't.

**Fix:** Remove the string replacement (it's misleading); rely solely on the `path.resolve` + `startsWith` check, which correctly catches all traversals.

---

## 6. TYPE SAFETY

### 🔴 CRITICAL: `as any` on `createModel` (routes.ts line 129)
```typescript
const model = storage.createModel({ ... } as any);
```
The object literal is cast to `any` to suppress TypeScript errors. The underlying reason is that the object includes fields present in the table (e.g., `connectionStatus`) that are also omitted from `insertModelSchema` by `$defaultFn`. The `as any` suppresses the type check entirely — if a field name is misspelled or a required field is missing, TypeScript will not catch it.

**Fix:** Review `insertModelSchema` and ensure all fields that are legitimately settable at creation time are present in the type, then remove the cast.

### 🔴 CRITICAL: Six `as any` casts in marketplace scoring pipeline suppress type errors on DB writes
`marketplaceScoring.ts` lines 318, 356 and `marketplaceRoutes.ts` lines 162, 421, 576 — all `as any`. The scoring fields are in the DB schema but not in `InsertMarketplaceSkill`. See Schema Integrity §1.3 for root cause and fix.

### 🟠 HIGH: `updateData: any` in `PATCH /api/skill-scripts/:id`
`routes.ts` line 509: `const updateData: any = { ...rest }`. This is then passed to `storage.updateSkillScript`. No type safety on what fields are being updated.

### 🟠 HIGH: `opts: any` in several autonomy routes
`autonomyRoutes.ts` lines 197, 270: query parameter objects typed as `any` before being passed to `getExecutionHistory` and `getImprovementSuggestions`. Query strings are always strings — coercion is needed but should be done with typed objects, not `any`.

### 🟡 MEDIUM: `let userMsg: any` in message creation route (routes.ts line 234)
The variable `userMsg` is declared as `any` then populated with the result of `storage.createMessage()` which returns a typed `Message`. The `any` type propagates to the `res.json(userMsg)` response. Trivially fixable: `let userMsg: Message`.

### 🟡 MEDIUM: `SseClient.res: any` in messagingRoutes.ts line 32
The `res` field on the internal `SseClient` interface is typed `any` rather than `import('express').Response`. Low severity but removes IDE support and static checks on the response object.

### 🟡 MEDIUM: `(s as any).scoreTier` in marketplaceRoutes.ts line 421
The stats endpoint casts a `MarketplaceSkill` to `any` to read `.scoreTier`. This field IS defined in the schema and returned by `getMarketplaceSkills()` as part of `MarketplaceSkill`. The cast is unnecessary — the field exists on the type. This was probably written before the scoring pipeline columns were added to the schema.

**Fix:** Remove the cast.

---

## 7. ADDITIONAL OBSERVATIONS

### Settings key inconsistency
`GET /api/settings` (routes.ts line 440) returns only these keys: `["theme", "default_model_id", "system_name", "max_tool_iterations", "sandbox_auto_enable"]`. However, `POST /api/settings` also allows `"sandbox_config"` to be written. This means `sandbox_config` can be stored but never retrieved via the settings endpoint — it's only loaded directly in `routes.ts` line 638 at startup. This is intentional by design (raw Docker config should not be exposed), but the GET/POST asymmetry is undocumented.

### Marketplace total count double-scan
`marketplaceRoutes.ts` lines 32–33 perform two full filtered scans of `marketplace_skills` per request — one paginated, one for total count. SQLite performs both synchronously so there's no concurrency concern, but it's wasteful at scale. A `COUNT(*)` subquery or a single pass returning total with data would be cleaner.

### Webhook registry is ephemeral
`protocolRoutes.ts` lines 24–25: `webhookRegistry` and `webhookHandlers` are plain `Map` objects in module scope. All registered webhooks are lost on every server restart. If this is intentional (webhooks are registered programmatically each session), it should be documented. If webhooks are expected to survive restarts, they need DB persistence.

### OAuth state is ephemeral and single-server only
`oauthFlow.ts` line 7: `pendingStates` is an in-memory `Map`. This is correct for single-process deployments, but would break behind a load balancer with multiple Node.js instances. Document this constraint.

### No `PRAGMA foreign_keys = ON`
SQLite foreign key enforcement is off by default. No route sets `PRAGMA foreign_keys = ON` at startup. Cascade deletes (the missing ones noted above) and referential integrity constraints do not apply. Orphaned rows accumulate silently.

---

## Summary Table

| Severity | Count | Examples |
|---|---|---|
| 🔴 CRITICAL | 6 | Missing `/api/all-agent-runs` route, missing DELETE `/blocks/:blockId` route, mass assignment on PATCH `/models/:id` + `/conversations/:id` + `/skills/:id`, `as any` on createModel, scoring pipeline `as any` writes, no DB migrations |
| 🟠 HIGH | 4 | No 404 guard on checkpoint PATCH, unvalidated learning log body, `updateData: any` in skill-scripts PATCH, `opts: any` in autonomy query routes |
| 🟡 MEDIUM | 16 | Notifications SSE misses new conversations, `getMessage` never called, cascade delete missing, race conditions in counters, N+1 in scoreSkillById, double-scan in marketplace list, no importance range validation, SSE opens without conversation existence check, file upload lacks auth/type checks, multer destination timing, fragile resolveSafe comment, `InsertMarketplaceSkill` too narrow, `let userMsg: any`, `SseClient.res: any`, unnecessary cast in scoreTier, no PATCH connector route |

---

*Audit generated by static analysis of 14 source files. No runtime profiling performed.*
