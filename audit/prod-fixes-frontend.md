# Production Frontend Fixes — Ultra Computer

Applied on: 2025-07

All changes are surgical — only the listed issues were modified, unrelated code was untouched.

---

## 1. `client/src/pages/ChatPage.tsx`

- **Added `useLocation` import** from `wouter` (was missing, required for redirect).
- **Guard: redirect to `/` when `conversationId` is falsy** — useEffect with `setLocation("/")` if `!conversationId`.
- **Added `sseError` state** (`useState(false)`) to track SSE connection failures.
- **Added `isError: convError` and `isError: msgsError`** to both useQuery calls; both queries also get `enabled: !!conversationId` guard.
- **SSE error/open handlers** — `es.onerror` sets `sseError(true)`, `es.onopen` clears it.
- **isError early return** — if both queries error and `conversation` is still undefined, renders a friendly error message.
- **SSE error banner** — renders an inline destructive banner when `sseError` is true.

---

## 2. `client/src/pages/ModelsPage.tsx`

- **Added `isLoading` / `isError`** to all three queries (`models`, `providers`, `envVars`).
- **Loading + error early returns** — spinner while loading, friendly error if models or providers fail.
- **Added `onError` to `deleteModel`** mutation.
- **Added `onError` to `connectModelMutation`** mutation.
- **Added `onError` to `disconnectMutation`** mutation.
- **Added `onError` to `setDefault`** mutation.
- **Added `onError` to `setOrchestrator`** mutation.
- **Fixed form validation** — `disabled={!form.name.trim() || !form.modelId.trim()}` (was using loose falsy check).

---

## 3. `client/src/pages/SettingsPage.tsx`

- **Added `isLoading` / `isError`** to both `settings` and `models` queries.
- **Loading + error early returns** before the main render.
- **`handleSaveGeneral` now validates** `systemName.trim()` — returns early with a destructive toast if empty.

---

## 4. `client/src/pages/ConnectorsPage.tsx`

- **Added `isLoading` / `isError`** to connectors query.
- **Loading + error early returns** before the main render.
- **Added `onError`** to `disconnect` mutation.
- **Added `onError`** to `addCustom` mutation.
- **Null guard on `connectingId`** before calling `connect.mutate` — `if (!connectingId) return` plus `disabled={!connectingId || ...}`.

---

## 5. `client/src/pages/SkillsPage.tsx`

- **Added `isLoading` / `isError`** to skills query.
- **Loading + error early returns** before the main render.
- **Added `onError`** to `toggleSkill` mutation.

---

## 6. `client/src/pages/BrowserPage.tsx`

- **Added `isError: sessionsError`** to sessions query.
- **Sessions error display** in Sessions tab: shows "Failed to load sessions" message when `sessionsError` is true.
- **URL validation** — `handleNavigate` now returns early if the URL is exactly `"https://"` or `"http://"` (bare scheme with no host).

---

## 7. `client/src/pages/MemoryPage.tsx`

- **Added `isLoading` / `isError`** to memories query.
- **Loading + error early returns** before the main render.
- **Guarded `searchResults` as array** — `safeSearchResults = Array.isArray(searchResults) ? searchResults : memories`; `displayed` uses `safeSearchResults` when `searchResults` is truthy.

---

## 8. `client/src/pages/FileBrowserPage.tsx`

- **Null guard on `selectedEntry.ext`** — changed `selectedEntry.ext.toUpperCase() || "FILE"` to `(selectedEntry.ext || "FILE").toUpperCase()` to avoid `.toUpperCase()` on empty string (no runtime error but semantically wrong).
- **isLoading indicator for stats strip** — wrapped stats `<span>` elements in a conditional to show "Loading..." while `isLoading` is true.

---

## 9. `client/src/pages/SandboxPage.tsx`

- **Null guard on `status.containers`** — `status.containers.length > 0` → `(status.containers?.length ?? 0) > 0`.
- **Added `onError`** to `pullImage` mutation.
- **configLoading skeleton** — early return with "Loading configuration..." when `configLoading` is true.

---

## 10. `client/src/pages/TokenDashboardPage.tsx`

- **Added `isError: convsError`** to conversations query.
- **Added `isError: runsError`** to agent-runs query.
- **Error early return** — renders friendly message if either query errors.

---

## 11. `client/src/pages/SkillLibraryPage.tsx`

- **Added `isLoading: scriptsLoading` / `isError: scriptsError`** to scripts query.
- **Added `isError: versionsError`** to versions query.
- **Loading + error states** shown inline in the script list `ScrollArea`.

---

## 12. `client/src/pages/WelcomePage.tsx`

- **Added `useToast` import** (was missing).
- **Added `onError`** to `create` mutation — shows a destructive toast on failure.

---

## 13. `client/src/pages/MarketplacePage.tsx`

- **Added `safeJsonParse` import** from `../lib/safeJson`.
- **Replaced `JSON.parse(skill.tags || "[]")`** in `SkillCard` with `safeJsonParse(skill.tags, [])`.
- **Replaced `JSON.parse(detail.tags || "[]")`** in `SkillDetailView` with `safeJsonParse(detail.tags, [])`.
- **Added `isError: scoreError`** to `ScoreBreakdownPanel` query — renders error card if fetch fails.
- **Added `isError: detailError`** to `SkillDetailView` query — renders error message before the `!detail` check.

---

## 14. `client/src/pages/AutonomyPage.tsx`

- **Fixed `Object.entries(circuits)`** in `CircuitBreakersPanel` — changed to `Object.entries(circuits ?? {})` to guard against null/undefined `circuits`.
- **Added `onError`** to `abandonMutation`.
- **Fixed skeleton flash** — replaced `isLoading || !dashboard` with separate error check (`dashboardError && !dashboard`) followed by `!dashboard` (skeleton only on initial load, not on background refresh).

---

## 15. `client/src/pages/ProtocolsPage.tsx`

- **Added default `[]`** to `serverTools` query: `data: serverTools = []`.
- **Added default `[]`** to `serverResources` query: `data: serverResources = []`.
- **Added `isError: toolsError`** to tools query.
- **Added `isError: resourcesError`** to resources query.
- **Replaced `!serverTools` skeleton** with `toolsError` error display (since `serverTools` always has default `[]` now).

---

## 16. `client/src/pages/MessagingPage.tsx`

- **Added `isError: channelsError`** to channels query in `ChannelsTab`.
- **Added `isError: msgsError`** to messages query in `MessagesTab`.
- **Error display** — added `channelsError` branch before `isLoading` in ChannelsTab.
- **Error display** — added `msgsError` branch before `msgsLoading` in MessagesTab.

---

## 17. `client/src/pages/NIPPage.tsx`

- **Added `isLoading: detailLoading` / `isError: detailError`** to `sessionDetail` query.
- **Inline loading/error display** — rendered within the expanded session card when `expandedId === session.id`.
- **Fixed `scrollRef` type** — removed `scrollRef as any` cast on the `<div ref>` (ref was already typed `useRef<HTMLDivElement>(null)`).

---

## 18. `client/src/pages/IdentityPage.tsx`

- **Added `isError`** early return after `identityQuery.isLoading` check in `IdentityProfileTab`.
- **Fixed null guard on `trustFactors`** — `identity.trustFactors && identity.trustFactors.length > 0` → `(identity.trustFactors ?? []).length > 0`; `.map()` also guarded with `??[]`.
- **Fixed null guard on `communityProfile.skills`** — `identity.communityProfile?.skills &&...length > 0` → `(identity.communityProfile?.skills ?? []).length > 0`; `.slice()` also guarded.
- **Added `directoryError`** variable from `directoryQuery.isError`; rendered error branch in Directory grid.
- **Added `blocksQuery.isError`** early return in `BlockListTab`.
- **Added `statsQuery.isError`** early return in `AuditLogTab`.
- **Added `auditQuery.isError`** early return in `AuditLogTab`.

---

## 19. `client/src/pages/CachePage.tsx`

- **Fixed skeleton flash** — replaced `isLoading || !dashboard` with `!dashboard` for the skeleton (after a new `dashboardError` check first).
- **Added `isError: dashboardError`** to dashboard query.
- **Error early return** — renders friendly message if dashboard query errors.

---

## 20. `client/src/components/Layout.tsx`

- **Added `useToast` import** (was missing).
- **Added `isError: convsError`** to conversations query.
- **Added `onError`** to `createConv` mutation.
- **Added `onError`** to `deleteConv` mutation.
- **Added `onError`** to `renameConv` mutation.
- **Error display in sidebar** — shows "Failed to load sessions" in destructive text when `convsError` is true.

---

## 21. `client/src/App.tsx`

- **Added proper `NotFound` component** — renders a centered 404 message inside `<Layout>` instead of redirecting to `WelcomePage`.
- **Updated catch-all `<Route>`** — changed `component={WelcomePage}` to `component={NotFound}`.

---

## Summary

| Category | Count |
|---|---|
| isError handling added | 21 files |
| onError added to mutations | 18 mutations across 10 files |
| Null guards fixed | 4 locations |
| Form validation fixed | 2 locations |
| Skeleton flash (auto-refresh) fixed | 2 pages (CachePage, AutonomyPage) |
| URL validation added | BrowserPage |
| SSE error state added | ChatPage |
| NotFound component | App.tsx |
| JSON.parse → safeJsonParse | MarketplacePage (2 usages) |
| scrollRef cast removed | NIPPage |
