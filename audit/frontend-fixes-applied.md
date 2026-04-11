# Frontend Critical Bug Fixes

Applied: all 7 fixes described below.

---

## Fix 1 — Double Layout on 404 routes (`App.tsx`)

**Problem:** The catch-all `<Route>` wrapped `WelcomePage` in `<Layout>`, but `WelcomePage` already renders its own `<Layout>`, causing a double-nested layout on any unknown route.

**Fix:** Replaced `<Layout><WelcomePage /></Layout>` with `<Route component={WelcomePage} />` in the catch-all route, matching how the root `/` route works.

**File:** `client/src/App.tsx`

---

## Fix 2 — Safe JSON parse utility (`safeJson.ts`)

**Problem:** Multiple pages called `JSON.parse()` directly on database string fields, which throws if the field is `null`, `undefined`, or malformed JSON.

**Fix:** Created a typed utility `safeJsonParse<T>(value, fallback)` that returns the fallback on any parse failure.

**File:** `client/src/lib/safeJson.ts` (new file)

```typescript
export function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
```

---

## Fix 3 — Unguarded `JSON.parse` calls replaced with `safeJsonParse`

**Problem:** Three pages had unguarded `JSON.parse(field || "[]")` calls that could throw on corrupt data.

**Fixes applied:**

| File | Field replaced |
|------|---------------|
| `ModelsPage.tsx` | `model.capabilities` |
| `SkillsPage.tsx` | `skill.triggerKeywords` |
| `SkillLibraryPage.tsx` | `script.tags` (3 call sites + `ScriptDetail` component) |

All replaced with `safeJsonParse(field, [] as string[])`.

---

## Fix 4 — `MarketplacePage` hardcoded `userId`

**Problem:** `userId: "local-user"` was hardcoded in the rating mutation, meaning all users appeared identical in the ratings system.

**Fix:** Added a module-level stable-per-session ID:
```typescript
const localUserId = `user-${window.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}`;
```
Placed outside the component so it does not regenerate on re-renders.

**File:** `client/src/pages/MarketplacePage.tsx`

---

## Fix 5 — `FileBrowserPage` `__PORT_5000__` placeholder

**Problem:** Three `fetch`/`window.open` calls used `"__PORT_5000__"` as a literal fallback string when `VITE_API_BASE` was not set, producing broken URLs like `__PORT_5000__/api/sandbox/files/...`.

**Fix:** Replaced `|| "__PORT_5000__"` with `|| ""` (empty string) so URLs are same-origin relative paths when the env variable is absent, matching the pattern used in `queryClient.ts`.

**File:** `client/src/pages/FileBrowserPage.tsx`
- Image preview `src` construction
- Upload `fetch` call
- Download `window.open` call

---

## Fix 6 — `onError` handlers added to silent mutations

Mutations that failed silently now show a destructive toast notification.

| File | Mutations fixed |
|------|----------------|
| `MemoryPage.tsx` | `createMemory`, `deleteMemory` |
| `SandboxPage.tsx` | `saveConfig`, `cleanup`, `resetDetection` (also added missing `useToast` import) |
| `SkillLibraryPage.tsx` | `deleteScript`, `updateScript` |

Handler added: `onError: () => toast({ title: "Error", description: "Operation failed", variant: "destructive" })`

---

## Fix 7 — `TokenDashboardPage` N+1 query replaced

**Problem:** The page fetched `/api/conversations` then issued one `GET /api/conversations/{id}/agent-runs` request per conversation, resulting in N+1 HTTP requests.

**Fix:** Replaced with a single `GET /api/all-agent-runs` query that returns all runs in one response. The `conversations` query is retained for session title enrichment. The `enrichedRuns` `useMemo` was updated to iterate `allRuns` directly, looking up `run.conversationId` in the conversation map.

**File:** `client/src/pages/TokenDashboardPage.tsx`
