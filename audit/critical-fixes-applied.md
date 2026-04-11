# Critical Bug Fixes — Applied
**Project:** Ultra Computer (Express + TypeScript)  
**Date:** 2026-04-11  
**Engineer:** Automated audit agent  
**Method:** Surgical `edit` tool patches — no full-file rewrites

---

## Fix 1 — `currentSessionId` Race Condition
**File:** `server/tools.ts`

**Problem:** The module-level `currentSessionId` global was shared across concurrent agent runs, causing tool executions from one run to corrupt another run's session context.

**Changes:**
- Added optional `sessionId?: string` parameter to `executeTool(name, args, sessionId?)` — caller-supplied value takes precedence over the global.
- `executeBash(command, start, sessionId = currentSessionId)` now accepts and threads through its own `sessionId`.
- `executeBashDocker(command, start, sessionId = currentSessionId)` similarly uses the per-call `sessionId` instead of the shared global.

---

## Fix 2 — A2A `require()` Crash
**File:** `server/a2aProtocol.ts`

**Problem:** `require("./orchestrator.js")` inside async handlers caused a runtime crash in ESM mode (no `require` defined). Dynamic `await import()` calls were also scattered, creating race conditions.

**Changes:**
- Added static top-level import: `import { runOrchestrator, subscribeToConversation, unsubscribeFromConversation } from "./orchestrator.js";`
- Removed the `require("./orchestrator.js")` crash line from `handleMessageSend`.
- Removed redundant `const { runOrchestrator } = await import("./orchestrator.js")` from `handleMessageSend`.
- Removed `const orchestratorMod = await import("./orchestrator.js")` from `handleMessageStream`.

---

## Fix 3 — Mass Assignment Vulnerabilities
**File:** `server/routes.ts`

**Problem:** Three `PATCH` routes passed `req.body` directly to storage update functions, allowing clients to overwrite any database column (e.g., `id`, `createdAt`, admin flags).

**Changes — `PATCH /api/models/:id`:** Whitelist to: `name`, `enabled`, `speedTier`, `notes`, `isDefault`, `isOrchestrator`, `contextWindow`, `capabilities`.

**Changes — `PATCH /api/conversations/:id`:** Whitelist to: `title`, `status`, `orchestratorModelId`, `activeSkillIds`.

**Changes — `PATCH /api/skills/:id`:** Whitelist to: `name`, `description`, `content`, `triggerKeywords`, `enabled`.

---

## Fix 4 — SQLite WAL Mode + Atomic Increments
**File:** `server/storage.ts`

**Problem (WAL mode):** SQLite default journal mode causes read/write lock contention under concurrent agent runs. Foreign key constraints were also not enforced by default.

**Change:** Added immediately after DB creation:
```typescript
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
```

**Problem (increments):** Five methods read a count, incremented it in JS, then wrote it back — a classic read-modify-write race that loses counts under concurrency.

**Changes — all five methods now use atomic SQL UPDATE:**
- `incrementSkillUsage`: `UPDATE skills SET usage_count = usage_count + 1 WHERE id = ?`
- `incrementSkillScriptUsage`: `UPDATE skill_scripts SET usage_count = usage_count + 1, updated_at = ? WHERE id = ?`
- `incrementMarketplaceInstallCount`: `UPDATE marketplace_skills SET install_count = install_count + 1 WHERE id = ?`
- `updateMarketplaceRating`: `UPDATE marketplace_skills SET rating_sum = rating_sum + ?, rating_count = rating_count + ? WHERE id = ?`
- `incrementMarketplaceForkCount`: `UPDATE marketplace_skills SET fork_count = fork_count + 1 WHERE id = ?`

---

## Fix 5 — Missing Cascade Deletes
**File:** `server/storage.ts`

**Problem:** `deleteConversation(id)` deleted only the `conversations` row, leaving orphaned rows in `messages`, `tasks`, and `agent_runs` (foreign keys were not cascading in the schema).

**Change:** `deleteConversation` now explicitly deletes child rows before deleting the parent:
```typescript
db.prepare("DELETE FROM messages WHERE conversationId = ?").run(id);
db.prepare("DELETE FROM tasks WHERE conversationId = ?").run(id);
db.prepare("DELETE FROM agent_runs WHERE conversationId = ?").run(id);
db.prepare("DELETE FROM conversations WHERE id = ?").run(id);
```

---

## Fix 6 — Missing `/api/all-agent-runs` Route
**Files:** `server/storage.ts`, `server/routes.ts`

**Problem:** The `GET /api/all-agent-runs` endpoint was referenced in the frontend but did not exist, causing 404 errors. `getAllAgentRuns()` was also missing from the storage layer.

**Changes:**
- Added `getAllAgentRuns(): AgentRun[]` to the `IStorage` interface and its implementation in `storage.ts` (returns all agent runs `ORDER BY startedAt DESC`).
- Added `GET /api/all-agent-runs` route in `routes.ts` calling `storage.getAllAgentRuns()`.

---

## Fix 7 — AutonomyPage Cache Invalidation Mismatch
**File:** `client/src/pages/AutonomyPage.tsx`

**Problem:** All three mutations (`analyzeMutation`, `improveMutation`, `abandonMutation`) invalidated the query key `["/api/autonomy"]`, but the dashboard data was fetched under `["/api/autonomy/dashboard"]`. After mutations, the UI never refreshed.

**Change:** All three `onSuccess` invalidation calls updated to use `["/api/autonomy/dashboard"]`.

---

## Fix 8 — Unblock Route Path Mismatch
**File:** `server/identityRoutes.ts`

**Problem:** The identity engine had an `unblockIdentity(cryptoId, blockId)` method, but no HTTP route was registered for it. The route that should have been `DELETE /api/identity/:cryptoId/blocks/:blockId` was absent, making unblocking impossible via the API.

**Change:** Added `DELETE /api/identity/:cryptoId/blocks/:blockId` route (placed before the existing `GET /api/identity/:cryptoId/blocks` to avoid Express path shadowing).

---

## Fix 9 — Silent Error Swallowing in MemoryManager
**File:** `server/memoryManager.ts`

**Problem:** Catch blocks used bare `catch {}`, silently discarding all errors from memory operations. Failures were completely invisible in logs.

**Change:** All silent `catch {}` blocks replaced with:
```typescript
catch (error) { console.error('[MemoryManager]', error); }
```

---

## Fix 10 — MCP Server Has No Authentication
**Files:** `server/mcpProtocol.ts`, `server/protocolRoutes.ts`

**Problem:** The MCP JSON-RPC endpoint (`POST /api/protocols/mcp/rpc`) had no authentication at all — any unauthenticated client could invoke arbitrary tool calls.

**Changes in `mcpProtocol.ts`:**
- Added `import crypto from "crypto";`
- Generated a random 256-bit bearer token at module load: `const MCP_BEARER_TOKEN = crypto.randomBytes(32).toString("hex")`
- Logs the token to console on startup so operators can retrieve it: `[mcpProtocol] MCP server bearer token: <token>`
- Exported `validateMCPAuthHeader(authHeader: string | undefined): boolean` — performs constant-time comparison via `crypto.timingSafeEqual` to prevent timing attacks.
- Exported `getMCPBearerToken(): string` for programmatic retrieval.

**Changes in `protocolRoutes.ts`:**
- Added auth guard at the top of the `/api/protocols/mcp/rpc` handler:
```typescript
if (!mcpProtocol.validateMCPAuthHeader(req.headers.authorization as string | undefined)) {
  return res.status(401).json({
    jsonrpc: "2.0",
    id: req.body?.id ?? null,
    error: { code: -32000, message: "Unauthorized: valid Bearer token required" },
  });
}
```

---

## Fix 11 — `selfLearning.logExecution` Not Wired Into Orchestrator
**File:** `server/orchestrator.ts`

**Problem:** `selfLearning.ts` exported `logExecution()` for continuous improvement tracking, but it was never called. Agent runs produced no execution telemetry.

**Changes:**
- Added static import at top: `import { logExecution } from "./selfLearning.js";`
- Added `const agentRunStart = Date.now();` immediately before the IPC file write (to capture a precise start timestamp).
- After `storage.updateAgentRun(...)`, added `logExecution(...)` call with:
  - `conversationId` — from function parameter
  - `taskType` — `task.taskType ?? "general"`
  - `taskDescription` — `task.description`
  - `skillsUsed` — `[]` (populated by future skill-matching integration)
  - `modelUsed` — `model.id`
  - `outcome` — `"failure"` if `finalOutput` contains `[FAILED:` or `[LLM call failed`, otherwise `"success"`
  - `durationMs` — `Date.now() - agentRunStart`
  - `retryCount` — `0`
  - `inputTokenEstimate` — `totalPromptTokens`
  - `outputTokenEstimate` — `totalCompletionTokens`
  - `toolCallCount` — `toolCallLog.length`

---

## Summary Table

| # | File | Category | Severity |
|---|------|----------|----------|
| 1 | `server/tools.ts` | Race condition (shared mutable global) | Critical |
| 2 | `server/a2aProtocol.ts` | Runtime crash (require in ESM) | Critical |
| 3 | `server/routes.ts` | Security — mass assignment (3 routes) | Critical |
| 4 | `server/storage.ts` | Race condition (read-modify-write) + WAL | High |
| 5 | `server/storage.ts` | Data integrity (orphaned rows) | High |
| 6 | `server/storage.ts` + `server/routes.ts` | Missing route + storage method | Medium |
| 7 | `client/src/pages/AutonomyPage.tsx` | UI bug (stale cache after mutations) | Medium |
| 8 | `server/identityRoutes.ts` | Missing route (unblock dead-end) | Medium |
| 9 | `server/memoryManager.ts` | Observability (silent error swallowing) | Medium |
| 10 | `server/mcpProtocol.ts` + `server/protocolRoutes.ts` | Security — unauthenticated RPC endpoint | Critical |
| 11 | `server/orchestrator.ts` | Missing integration (dead self-learning code) | Low |
