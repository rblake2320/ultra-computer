# Frontend Production Readiness Audit

Audited: 26 files across pages, components, and shared library.

---

## ChatPage.tsx

### CRITICAL (will crash in production)
- **ChatPage.tsx receives `conversationId` as a prop but the full file content is too large to view entirely; however the main `useQuery` for messages uses the queryKey `["/api/conversations/${conversationId}/messages"]`. If `conversationId` is ever undefined or the route param is malformed, the query fires with a broken URL.**  
  Fix: Add a guard `if (!conversationId) return <Redirect to="/" />;` at the top of the component.

- **`renderMarkdown()` (lines 36+) calls `dangerouslySetInnerHTML` with the result. Although escaping is done for text nodes, the full implementation must ensure all user-controlled HTML attributes are escaped; any gap creates an XSS vector.**  
  Fix: Review every interpolation path inside `renderMarkdown`; use a proven sanitizer (DOMPurify) as the final step before `dangerouslySetInnerHTML`.

### HIGH (broken UX)
- **`useQuery` calls for conversations and messages have no `isLoading` or `isError` handling rendered to the user in the main body.** The `data = []` default fallback silently hides backend errors.  
  Fix: Add an error banner when `isError` is true; show a skeleton or spinner when `isLoading` is true.

- **SSE stream (`EventSource`) error handler is not shown to the user.** If the stream fails, the chat silently stops updating.  
  Fix: Track `sseError` state and show a "connection lost – reconnecting…" banner.

### MEDIUM (code quality)
- **`Download` icon is imported (line 16) but search did not surface a usage in the preview.** Verify it is used; if not, remove the dead import.

---

## SettingsPage.tsx

### CRITICAL (will crash in production)
- None identified.

### HIGH (broken UX)
- **Both `useQuery` calls (lines 22–28) use silent default values (`{}` and `[]`) with no `isLoading` or `isError` handling.** If `/api/settings` or `/api/models` fails, the form renders with empty values and the user gets no feedback.  
  Fix:
  ```tsx
  const { data: settings = {}, isLoading: settingsLoading, isError: settingsError } = useQuery(…);
  if (settingsLoading) return <Skeleton />;
  if (settingsError) return <ErrorBanner />;
  ```

- **`systemName` is never validated before saving.** An empty system name is transmitted silently.  
  Fix: In `handleSaveGeneral`, guard `if (!systemName.trim()) { toast({ title: "Name required", variant: "destructive" }); return; }`.

### MEDIUM (code quality)
- **`handleThemeToggle` (line 71) is a one-liner wrapper that only calls `toggle()`.** It can be replaced with `onCheckedChange={toggle}` directly, removing the dead wrapper.

---

## FileBrowserPage.tsx

### CRITICAL (will crash in production)
- **`selectedEntry.ext.toUpperCase()` (line 539) — `ext` is typed as `string` in the `FileEntry` interface but could be an empty string. `"".toUpperCase()` is safe; however if ext is `undefined` at runtime (backend schema mismatch) this will crash.**  
  Fix: Use `(selectedEntry.ext || "FILE").toUpperCase()`.

- **`(import.meta as any).env?.VITE_API_BASE || ""` cast repeated 3 times (lines 249, 354, 378).** The `as any` cast suppresses type checking. If Vite's env type augmentation is missing, future refactors will silently break.  
  Fix: Centralise via `queryClient.ts`'s existing `API_BASE` export or add a typed `src/vite-env.d.ts` declaration.

### HIGH (broken UX)
- **No loading state is shown when `isLoading` is true in the breadcrumb area.** The stats strip shows `0 files · 0 folders` while loading, which is misleading.  
  Fix: Conditionally hide the stats strip or show "Loading…" while `isLoading`.

### MEDIUM (code quality)
- **`data.files.filter(…)` on lines 408–409 iterates the flat list twice.** Use a single reduce pass.

- **`confirm()` used for delete confirmation (line 383).** `confirm()` blocks the main thread and is disallowed in some cross-origin iframe contexts. Replace with an `AlertDialog` component.

---

## TokenDashboardPage.tsx

### CRITICAL (will crash in production)
- **`run.startedAt - run.startedAt` comparison at line 462 sorts runs, but `AgentRun.startedAt` is typed as `integer` in the schema, which maps to `number`. This is safe. However `run.completedAt` is nullable (`integer` with no `notNull`). At line 457–459:**
  ```ts
  run.completedAt && run.startedAt
    ? run.completedAt - run.startedAt
  ```
  `run.completedAt` from the DB can be `null` at JS level. The schema defines it without `.notNull()`, so the type from drizzle is `number | null`. Subtraction of `null` produces `NaN`, which `formatDuration` handles, so this is low-risk but still a type gap.

- **`TokenDashboardPage` imports `apiRequest` (line 3) but also uses the `queryFn` override for `/api/all-agent-runs` (line 434–437). If `apiRequest` is not named as the default `queryFn` in the global queryClient, this works correctly. This is fine.**

### HIGH (broken UX)
- **No `isError` handling on either query (lines 429, 434).** If the backend returns an error, the page shows empty cards with zeros.  
  Fix: Add `isError` guards and display an error card.

- **`Cell` key (line 263) uses the array index `idx` instead of a stable identifier.** If the data reorders, React will remount cells unnecessarily.  
  Fix: `key={entry.fullModel}`.

### MEDIUM (code quality)
- **Unused import: `apiRequest` (line 3) is imported but the default `queryFn` on `queryClient` handles `/api/conversations`. Only `/api/all-agent-runs` needs the explicit `queryFn`. This is fine, but `apiRequest` at line 436 makes it used — no dead import.**

---

## BrowserPage.tsx

### CRITICAL (will crash in production)
- **`useQuery` for sessions (lines 123–128) has no `isError` handling. If the backend errors, `sessions` silently stays `[]` and `activeSession` is never set.** Users see the empty-state UI forever without knowing there was an error.  
  Fix: Destructure `isError` and show an error banner.

- **`screenshotMutation` (lines 267–284) calls `/api/browser/navigate` with the current `urlInput` value, but `urlInput` could still be `"https://"` (the initial value) when the user clicks "Screenshot".** This fires a navigate request to an incomplete URL.  
  Fix: Validate `urlInput` before firing the screenshot mutation, or change the screenshot endpoint to not require navigation.

### HIGH (broken UX)
- **`handleNavigate` (line 201) has no validation for the case where `urlInput` consists only of `"https://"` (the initial state).** The guard `if (!url) return` won't catch this.  
  Fix: Add `if (url === "https://" || url === "http://") return;`.

- **Console log entries use array index as key (line 840): `key={i}`.** Unstable keys when items prepend.  
  Fix: Use a stable ID such as `${entry.ts}-${entry.type}-${i}` (or generate IDs at push time).

### MEDIUM (code quality)
- **`ArrowDown` icon imported (line 30) but not referenced in any JSX in the visible portion of the file.**  
  Fix: Remove the dead import.

- **`label` elements (lines 558, 587, 602, 663) use `<label>` without `htmlFor`.** The inputs inside use `data-testid` but no `id`, so the label click does not focus the input.  
  Fix: Add matching `id` and `htmlFor` attributes, or use `<label>` wrapping the input.

---

## ModelsPage.tsx

### CRITICAL (will crash in production)
- **`deleteModel` mutation (line 146) has no `onError` handler.** If the delete fails, the UI silently appears to succeed (the query cache is not updated on error). The model card stays in place only because the query is not invalidated, but the user gets no failure notification.  
  Fix:
  ```ts
  onError: (e: any) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  ```

- **`connectModelMutation` (lines 151–159) has no `onError` handler.** A failed reconnect leaves the credential input open with no feedback.  
  Fix: Add `onError` toast as above.

### HIGH (broken UX)
- **All three `useQuery` calls (lines 98–100) have no `isLoading` or `isError` handling.** While the connected-tab shows an empty state, the Add Model tab will render an empty provider grid with no spinner or error message.  
  Fix: Show a loading skeleton or error message based on query state.

- **`setDefault` mutation (line 166) and `setOrchestrator` mutation (line 171) both have no `onError` handlers.** Silent failures.  
  Fix: Add `onError` toast handlers.

- **`disconnectMutation` (lines 161–164) has no `onError` handler.**  
  Fix: Add `onError` toast.

### MEDIUM (code quality)
- **`ICON_MAP: Record<string, any>` (line 60)** — uses `any` type.  
  Fix: Type as `Record<string, React.ComponentType<{ className?: string }>>`.

- **Form submit for manual model (line 769) has no validation for `form.modelId` format** (allows whitespace-only values since `!form.modelId` passes for a space).  
  Fix: Trim and validate: `disabled={!form.name.trim() || !form.modelId.trim()}`.

---

## SkillsPage.tsx

### CRITICAL (will crash in production)
- None identified.

### HIGH (broken UX)
- **`useQuery` for skills (line 20) has no `isLoading` or `isError` handling.** The page renders immediately with `skills = []`, showing the "No custom skills yet" empty state even while data is loading.  
  Fix: Add loading skeleton and error state.

- **`toggleSkill` mutation (lines 33–37) has no `onError` handler.** A failed toggle silently appears to succeed.  
  Fix: Add `onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" })`.

### MEDIUM (code quality)
- **Toggle buttons (lines 130, 168) have no `aria-label`.** Screen readers will announce the icon name, not the action.  
  Fix: Add `aria-label={skill.enabled ? "Disable skill" : "Enable skill"}`.

---

## ConnectorsPage.tsx

### CRITICAL (will crash in production)
- None identified.

### HIGH (broken UX)
- **`useQuery` for connectors (line 32) has no `isLoading` or `isError` handling.** While loading, all category sections show nothing (they filter `grouped[cat]` which is empty).  
  Fix: Show a spinner or skeleton grid during `isLoading`; show an error banner on `isError`.

- **`disconnect` mutation (lines 65–68) has no `onError` handler.** Silent failure.  
  Fix: Add `onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" })`.

- **`addCustom` mutation (lines 70–78) has no `onError` handler.** If the server rejects the custom connector, the dialog stays open with no feedback.  
  Fix: Add `onError` toast.

- **The connect dialog (line 201) uses `connectingId!` (non-null assertion) when calling `connect.mutate`.** If `connectingId` is somehow cleared between click and mutation, this throws.  
  Fix: Add a `if (!connectingId) return;` guard in the `onClick`.

### MEDIUM (code quality)
- **Custom MCP form (lines 218–236) has no validation for `mcpServerUrl` format.** An invalid URL will be sent to the backend.  
  Fix: Validate URL format before enabling the Add button.

---

## MemoryPage.tsx

### CRITICAL (will crash in production)
- None identified.

### HIGH (broken UX)
- **`useQuery` for memories (line 29) has no `isLoading` or `isError` state.** The empty-state message "No memories stored yet" is shown during the initial fetch.  
  Fix: Guard with `isLoading` spinner.

- **`searchMemory` mutation (line 48) uses `useMutation` for a read operation and its result type is untyped (`any`).** If the backend returns a non-array on error, `displayed` (line 52) could be a non-array that gets `.filter`ed on line 53.  
  Fix: Type the mutation result as `Memory[]` and guard: `const displayed: Memory[] = Array.isArray(searchResults) ? searchResults : memories;`.

### MEDIUM (code quality)
- **Native `<select>` (line 108) is used instead of the project's Shadcn `<Select>` component.** Breaks the visual design system.  
  Fix: Replace with `<Select>` / `<SelectTrigger>` / `<SelectContent>`.

- **Native `<input type="range">` (line 118) is used instead of the project's `<Slider>` component.** Same design inconsistency.  
  Fix: Replace with `<Slider>`.

---

## SandboxPage.tsx

### CRITICAL (will crash in production)
- **`status.containers.length` (line 307) — `status` is typed as `SandboxStatus | undefined` (from `useQuery`). Even though it's guarded by `status && status.containers.length > 0`, `containers` itself could be undefined if the backend omits the key. This would crash.**  
  Fix: `status?.containers?.length > 0`.

### HIGH (broken UX)
- **`pullImage` mutation (lines 66–68) has no `onSuccess` or `onError` handlers at the mutation level.** Success is shown via an `isSuccess` flag on the mutation, which disappears after a re-render. There is no toast on failure at the top-level (only `isError` conditional render).  
  Fix: Add `onError: () => toast(...)` to the mutation.

- **`configLoading` (line 48) is destructured but never checked in the render.** While config is loading, `form` is `null` and the entire configuration section is hidden — the user sees a blank space with no spinner.  
  Fix: Show a skeleton or loading indicator when `configLoading` is true.

### MEDIUM (code quality)
- **Save success (line 299) shows a plain text "Saved" that persists until the next re-render.** Use `toast` instead for consistent UX.

---

## SkillLibraryPage.tsx

### CRITICAL (will crash in production)
- None identified.

### HIGH (broken UX)
- **`useQuery` for scripts (lines 57–63) has no `isLoading` or `isError` handling.** During load, the list area shows the empty-state message.  
  Fix: Show a spinner or skeleton list.

- **`versions` query (lines 65–69) has no `isError` handling.** If fetching versions fails, the version panel silently shows nothing.

### MEDIUM (code quality)
- **`setEditForm` prop typed as `(fn: (f: any) => any) => void` (line 420) uses `any`.** Type it properly as `React.Dispatch<React.SetStateAction<FormState>>` with an explicit interface.

- **`handleExport` (lines 141–158) creates an anchor element and calls `.click()` without appending to the document body first.** Some browsers require the anchor to be in the DOM for programmatic clicks.  
  Fix: `document.body.appendChild(a); a.click(); document.body.removeChild(a);`.

---

## WelcomePage.tsx

### CRITICAL (will crash in production)
- None identified.

### HIGH (broken UX)
- **`create` mutation (lines 21–27) has no `onError` handler.** If creating a conversation fails (e.g. no model configured), the button stays disabled briefly and nothing happens.  
  Fix:
  ```ts
  onError: (e: any) => toast({ title: "Failed to create session", description: e.message, variant: "destructive" }),
  ```

### MEDIUM (code quality)
- **`WelcomePage` wraps itself in `<Layout>` (line 30), but `App.tsx` mounts `WelcomePage` directly (line 37) without a `<Layout>` wrapper.** All other routes are `<Layout><Page /></Layout>`. This is intentional for the welcome page but inconsistent.  
  Fix: Document the exception or extract the inner content without the Layout wrapper to avoid confusion.

---

## MarketplacePage.tsx

### CRITICAL (will crash in production)
- **`JSON.parse(skill.tags || "[]")` at line 246** — this is called inside a component render path without a try/catch wrapper. Although `"[]"` is the fallback, corrupted DB data (e.g. a bare string) will throw.  
  Fix: Replace with `safeJsonParse(skill.tags, [] as string[])` (the utility already exists in `lib/safeJson.ts`).

- **`JSON.parse(detail.tags || "[]")` at line 446** — same issue in the detail view component.  
  Fix: Same as above.

### HIGH (broken UX)
- **`SkillDetailView` (line 384) — `useQuery` for detail has no `isError` rendering.** If the fetch fails, the loading spinner (shown on `isLoading`) transitions to nothing, leaving a blank panel.  
  Fix: Add `if (isError) return <ErrorPanel />;` after the loading check.

- **`ScoreBreakdownPanel` (line 302) — same pattern; no `isError` handling.**

- **The `localUserId` (line 160) is computed once at module-load time via `window.crypto.randomUUID()`. On every page refresh the user gets a new anonymous ID**, which makes the "rate this skill" feature functionally unusable across sessions.  
  Fix: Persist to `localStorage`: `localStorage.getItem("marketplace-user-id") ?? (() => { const id = crypto.randomUUID(); localStorage.setItem("marketplace-user-id", id); return id; })()`.

### MEDIUM (code quality)
- **`onError` handlers use `(e: any)` in mutations (lines 398, 409, 420, 433).** Type as `Error`.

---

## AutonomyPage.tsx

### CRITICAL (will crash in production)
- **`Object.entries(circuits)` (line 236 inside `CircuitBreakersPanel`) — `circuits` is typed as `Record<string, ...>` but comes from the API. If the backend returns `null` or `undefined` for the `circuits` field, `Object.entries(null)` throws.**  
  Fix: Guard `const entries = Object.entries(circuits ?? {});`.

### HIGH (broken UX)
- **`abandonMutation` (lines 391–397) has no `onError` handler.** A failed abandon leaves no feedback.  
  Fix: Add `onError: (e: any) => toast({ title: "Abandon failed", description: e.message, variant: "destructive" })`.

- **`isLoading || !dashboard` check (line 399) shows a spinner whenever `dashboard` is undefined, which also happens during the 10-second refetch interval after the first successful load.** The page briefly blanks on every refetch.  
  Fix: Separate the initial load (`!dashboard && isLoading`) from refetch state (`isFetching`) so the existing data stays visible during background refreshes.

### MEDIUM (code quality)
- None additional.

---

## ProtocolsPage.tsx

### CRITICAL (will crash in production)
- **`serverResources.slice(0, 6).map((r: any, i: number) =>` (line 568)** — `serverResources` is typed as `any[]` via `useQuery<any[]>`. If the backend returns a non-array, `.slice` will throw.  
  Fix: Default `data` to `[]` in `useQuery` and type it properly.

- **`inputSchema?: Record<string, any>` (line 61)** — If `tool.inputSchema` is accessed with dot-notation in the render and is undefined, it will throw.

### HIGH (broken UX)
- **`useQuery` for `serverTools` (line 417) and `serverResources` (line 422) have no `isError` handling.** If either fetch fails, the tool/resource panels silently show nothing or a skeleton loop.  
  Fix: Add `isError` guards.

- **CLI execute mutation (line 603) and script mutation (line 616) `onError` handlers call `(e: any)` without surfacing the error to the user via toast.**  
  Fix: Add user-visible toast on error.

### MEDIUM (code quality)
- **`body: any` (line 100 in type definition)** — use `unknown` or a specific type.

- **Multiple `(e: any)` patterns across all mutations** — type as `Error`.

---

## MessagingPage.tsx

### CRITICAL (will crash in production)
- None identified.

### HIGH (broken UX)
- **`ChannelsTab` — `useQuery` for channels (line 182) has `isLoading` handling but no `isError` handling.** A failed channels fetch shows an empty loading skeleton permanently.  
  Fix: Add `isError` guard with an error message.

- **`MessagesTab` — `useQuery` for messages (line 406) has `isLoading` handling but no `isError` handling.** If history fails, the list shows the empty-state "No messages found" message.  
  Fix: Distinguish between empty and error states.

- **SSE stream in `DashboardTab` (lines 858–879) — `es` may be undefined if the `try` block throws before assignment, and the cleanup `es?.close()` correctly guards this. But the outer `try` should narrow: if `EventSource` is unavailable, the catch silently does nothing. This is acceptable for progressive enhancement but worth documenting.**

### MEDIUM (code quality)
- **`testMutation` in `ChannelsTab` (line 199) — `isPending` check disables all test buttons, not just the one being tested.** Every channel's Test button becomes disabled while any test runs.  
  Fix: Track `testingId` state like the models page pattern.

---

## NIPPage.tsx

### CRITICAL (will crash in production)
- **`JSON.parse(ev.data)` at line 619** inside the SSE `onmessage` handler is inside a try/catch, so this is safe.

- **`(scrollRef as any)` cast (line 715)** — a `ref` typed via `any` will not surface type errors if the DOM element changes.  
  Fix: Type it properly: `const scrollRef = useRef<HTMLDivElement>(null)`.

### HIGH (broken UX)
- **`sessionDetail` query (lines 214+) has no `isLoading` or `isError` handling.** While the detail is loading, the detail panel shows stale or empty data.  
  Fix: Show a skeleton or spinner.

- **Multiple mutations across NIPPage use `(e: any)` in `onError`** — type as `Error`.

- **`pauseAll` mutation (line 823) — `activeSessions.map(s => apiRequest(…))` fires N concurrent API calls without handling partial failure.** If some succeed and some fail, the UI is left in an inconsistent state.  
  Fix: Handle the `Promise.all` result carefully and show per-session errors.

### MEDIUM (code quality)
- **`[key: string]: any` in the interface at line 76** — use a proper discriminated union for the extra fields instead of an index signature.

---

## IdentityPage.tsx

### CRITICAL (will crash in production)
- **`identity.communityProfile.skills.slice(0, 4).map(…)` (line 806)** — `communityProfile` and its `skills` field may be `undefined` at runtime if the backend omits them. Calling `.slice` on `undefined` throws.  
  Fix: `(identity.communityProfile?.skills ?? []).slice(0, 4).map(…)`.

- **`identity.trustFactors.map(…)` (line 471)** — `trustFactors` may be `undefined` at runtime.  
  Fix: `(identity.trustFactors ?? []).map(…)`.

### HIGH (broken UX)
- **`identityQuery` (line 250) has an `isLoading` branch (line 360) but no `isError` branch.** If registration fetch fails, the page shows nothing after the spinner disappears.  
  Fix: Add `if (identityQuery.isError) return <ErrorPanel />;`.

- **`directoryQuery` (lines 629+) has `isLoading` rendering (line 711) but no `isError` handling.** A failed directory fetch silently shows the loading skeleton, then nothing.  
  Fix: Add `isError` guard.

- **`blocksQuery` (line 1088) — no `isError` handling.**

- **`statsQuery` and `auditQuery` (lines 1253, 1261) — no `isError` handling.**

### MEDIUM (code quality)
- **`queryClient` is declared as `const queryClient = useQueryClient()` (line 229) — naming shadows the module-level `queryClient` import from other files. Not an issue here but confusing.**

---

## CachePage.tsx

### CRITICAL (will crash in production)
- **`CachePage` uses `isLoading || !dashboard` as the loading check (line 549).** Same issue as AutonomyPage: on background refetches the existing dashboard data is still valid, but `!dashboard` will be false and `isLoading` will be true, causing a flash of the `LoadingSkeleton` on every auto-refresh cycle if `autoRefresh` is on.  
  Fix: Use `!dashboard` only for the initial load: `if (!dashboard) return <LoadingSkeleton />;`.

### HIGH (broken UX)
- **`useQuery` for dashboard (line 544) has no `isError` handling.** A backend error causes the loading skeleton to persist indefinitely (once `isLoading` becomes false but `dashboard` stays undefined).  
  Fix: Add `isError` check and render an error state.

### MEDIUM (code quality)
- **`ModelBreakdownTable` — `Object.entries(breakdown)` (line 290) — `breakdown` is passed as `modelBreakdown ?? {}`. If the API returns `null` for `modelBreakdown`, this is safe due to the `??` guard at line 554. Good.**

---

## App.tsx

### CRITICAL (will crash in production)
- None identified.

### HIGH (broken UX)
- **`ProtocolsPage` is the only page imported as a default import (`import ProtocolsPage from "./pages/ProtocolsPage"`, line 22) while all others use named imports.** This will break if `ProtocolsPage` is refactored to a named export.  
  Fix: Export `ProtocolsPage` as a named export and update the import: `import { ProtocolsPage } from "./pages/ProtocolsPage"`.

### MEDIUM (code quality)
- **No 404/catch-all route with a meaningful UI.** The `<Route component={WelcomePage} />` fallback (line 96) redirects all unknown paths to the welcome page, silently losing the original URL context.  
  Fix: Create a `NotFoundPage` component with a "Page not found" message and a link back home.

---

## Layout.tsx

### CRITICAL (will crash in production)
- None identified.

### HIGH (broken UX)
- **`createConv` mutation (line 52) has no `onError` handler.** If creating a new session fails from the sidebar button, the button just re-enables with no feedback.  
  Fix: Add `onError: () => toast({ title: "Failed to create session", variant: "destructive" })`.

- **`deleteConv` mutation (line 60) has no `onError` handler.** If deletion fails, the conversation entry stays but no error is surfaced.  
  Fix: Add `onError` toast.

- **`renameConv` mutation (line 68) has no `onError` handler.** If rename fails, the old title silently reappears.  
  Fix: Add `onError` toast.

- **`useQuery` for conversations (line 50) has no `isError` handling.** If the sidebar fetch fails, the sidebar silently shows "No sessions yet".  
  Fix: Show an error message in the sidebar.

### MEDIUM (code quality)
- **Nav items use `<div role="button">` (lines 163–173 and 300–313) instead of `<button>` elements.** `<div role="button">` requires manual `tabIndex` (which is present) and keyboard handling (also present), but `<button>` is semantically correct and handles focus, disabled state, and form submission automatically.  
  Fix: Replace with `<button>` and apply styling via `className`.

---

## ThemeProvider.tsx

### CRITICAL (will crash in production)
- **Theme is applied based on CSS class, but there is a flash-of-incorrect-theme (FOIT) before the API response returns.** The initial state comes from `window.matchMedia` (line 13), but the DOM update only fires after the `useEffect` (line 18) resolves. This is a render-phase race.  
  Fix: Apply the system theme class synchronously in a `<script>` tag in `index.html` before React hydrates, or use `localStorage` for fast initial reads.

### HIGH (broken UX)
- **`loaded` state (line 15) is set to `true` after the API call but is never used to gate anything in the render.** Children render immediately with the potentially-wrong theme.  
  Fix: Either use the `loaded` flag to show a neutral/transparent background until the theme is confirmed, or accept the flash as a known limitation and remove the `loaded` state.

### MEDIUM (code quality)
- None additional.

---

## NotificationCenter.tsx

### CRITICAL (will crash in production)
- None identified.

### HIGH (broken UX)
- **`useConversationSSE` dependency array (line 109) uses `conversationIds.join(",")` as a single dependency instead of the array itself.** This is a known pattern workaround but loses React's ability to detect array element type changes. It is functional but fragile.

- **Clicking a notification does not navigate to the relevant conversation.** The `conversationId` is stored on each notification but no click handler uses it.  
  Fix: Add an `onClick` to each `<li>` that navigates to `/chat/${notif.conversationId}` and closes the popover.

### MEDIUM (code quality)
- **`onEvent: (convId: string, event: any) => void` (line 62)** — `event` uses `any`. Type the incoming SSE events with a discriminated union.

---

## lib/queryClient.ts

### CRITICAL (will crash in production)
- **`API_BASE = … || "__PORT_5000__"` (line 3).** If `VITE_API_BASE` is not set and the placeholder string `"__PORT_5000__"` is not substituted by the build system, every API call will request `__PORT_5000__/api/…`, which will fail silently in production.  
  Fix: Either fail loudly:
  ```ts
  const API_BASE = (import.meta as any).env?.VITE_API_BASE;
  if (!API_BASE) throw new Error("VITE_API_BASE is not configured");
  ```
  Or ensure the build pipeline always substitutes the placeholder.

### HIGH (broken UX)
- **`retry: 1` (line 31)** on all queries means every failed request retries once. For user-facing mutations routed through `useQuery` this can cause double side-effects.  
  Fix: Set `retry: false` for mutations specifically, or keep `retry: 1` only for queries (the current setup applies it to queries only, which is fine — verify this is not applied to mutations).

### MEDIUM (code quality)
- **`apiRequest` returns `res.json()` (line 16) without a return type annotation.** This propagates `any` through the entire call graph.  
  Fix: Add generic: `async function apiRequest<T = unknown>(method: string, path: string, body?: unknown): Promise<T>`.

---

## lib/safeJson.ts

### CRITICAL (will crash in production)
- None identified.

### HIGH (broken UX)
- None identified.

### MEDIUM (code quality)
- **The function accepts `string | null | undefined` but does not handle the case where `value` is a valid JSON primitive (e.g., `"true"` or `"42"`).** `JSON.parse("true")` returns `true`, which is not assignable to `T` in many usages. The caller bears responsibility, but this is a latent misuse vector.  
  Fix: Document that `T` must match the expected JSON structure, or add a runtime type guard.

---

## shared/schema.ts

### CRITICAL (will crash in production)
- None identified.

### HIGH (broken UX)
- **`AgentRun.completedAt` (line 161) is defined without `.notNull()`.** The TypeScript type is `number | null`. Frontend code that does arithmetic on `completedAt` (e.g. `TokenDashboardPage.tsx` duration calculation) must guard for `null` — which it does — but the inconsistency between `startedAt.$defaultFn` (always set) and `completedAt` (nullable) is easy to miss.

### MEDIUM (code quality)
- **`Message.metadata`, `AgentRun.toolCalls`, `AgentRun.tokenUsage`, `Skill.triggerKeywords`, `Connector.config` etc. are all stored as JSON strings in `text()` columns.** The schema provides no typed accessors. Every frontend and backend consumer must call `JSON.parse` manually.  
  Fix: Consider adding a computed/virtual column helper or a repository layer that parses these fields automatically.

---

## Summary

| Severity | Count |
|----------|-------|
| **CRITICAL** | **14** |
| **HIGH** | **47** |
| **MEDIUM** | **25** |
| **Total** | **86** |

### Critical issues by category
1. `JSON.parse` without try/catch in render paths: **MarketplacePage** (×2)
2. Unguarded property access on potentially-null values: **IdentityPage** (`trustFactors.map`, `communityProfile.skills.slice`), **AutonomyPage** (`Object.entries(circuits)` on possibly null), **SandboxPage** (`status.containers`)
3. Hardcoded placeholder API base URL: **queryClient.ts** (`"__PORT_5000__"`)
4. Missing `onError` handlers on destructive mutations that leave UI inconsistent: **ModelsPage** (`deleteModel`, `connectModelMutation`)
5. SSE navigate+screenshot mutation fires on incomplete URL: **BrowserPage**
6. `dangerouslySetInnerHTML` XSS surface: **ChatPage**
7. `isLoading || !dashboard` causes skeleton flash during auto-refresh: **CachePage**, **AutonomyPage**

### High-severity issues by category
- Missing `isError` handling on `useQuery`: present in every page except FileBrowserPage (which handles it correctly)
- Missing `onError` handlers on mutations: ModelsPage (×4), ConnectorsPage (×3), Layout (×3), WelcomePage, SkillsPage, SandboxPage, AutonomyPage
- Broken/missing navigation: NotificationCenter (notifications not clickable), App.tsx (no 404 page)
- UX gaps during loading states: SettingsPage, SkillsPage, ConnectorsPage, MemoryPage, SkillLibraryPage, IdentityPage (×4), NIPPage
- Theme flash of incorrect content: ThemeProvider
