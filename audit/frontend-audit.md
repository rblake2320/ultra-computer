# Frontend Pages Audit — Ultra Computer
> Audited: all 18 pages + App.tsx routing

---

## App.tsx — Routing Overview

- Uses `wouter` with hash-based routing (`useHashLocation`). All routes wrapped in `<ErrorBoundary>`. No 404 handling beyond a catch-all that renders `<WelcomePage>` again.
- **Issue**: `WelcomePage` renders its own `<Layout>` internally, but the catch-all route also wraps it in `<Layout>`, causing double-layout rendering on unknown routes.
- `ProtocolsPage` uses a default export (`import ProtocolsPage from ...`) while every other page is named; this inconsistency is a minor style smell, not a bug.
- No route-level code splitting (lazy loading) — all 18 pages bundle eagerly. This is acceptable for an Electron/local app but would hurt web load time.

---

## Page-by-Page Audit

---

### 1. ChatPage.tsx
**Rating: FUNCTIONAL**

**Data / Backend connectivity**
- Fetches real data: `GET /api/conversations/:id`, `GET /api/conversations/:id/messages`, `GET /api/conversations/:id/tasks`.
- Uses SSE (`getSSEUrl`) for streaming token output. Proper cleanup on unmount.
- `useMutation` to `POST /api/conversations/:id/messages`.

**State handling**
- Loading state: not explicitly shown — the message area just renders empty while data loads. No skeleton or spinner for the initial conversation load.
- Error state: no UI error message if the conversation fetch fails (silent empty state).
- Empty state: renders a blank slate correctly.

**Issues**
- The custom `renderMarkdown` function is large, hand-rolled, and has no test coverage. It produces `dangerouslySetInnerHTML` output; while `escapeHtml` and `safeUrl` helpers exist, the regex pipeline is complex and fragile.
- No loading spinner for the conversation fetch — user sees a blank page until data arrives.
- No explicit error boundary content specific to chat failures (relies on the global `<ErrorBoundary>`).
- `useRef`/`useCallback` for SSE event source is correct; cleanup on `conversationId` change is handled.
- Textarea does not have a visible `<label>` element — `aria-label` is absent. Accessibility gap.
- No character/token budget indicator before sending.
- The `Download` icon is imported but its purpose is not immediately clear from context (likely for artifacts).

**Form validation**
- Submit disabled when `message.trim()` is empty. Adequate for MVP but no max-length guard.

---

### 2. ModelsPage.tsx
**Rating: FUNCTIONAL**

**Data / Backend connectivity**
- Fetches from: `GET /api/models`, `GET /api/models/providers`, `GET /api/models/env-vars`.
- Mutations to: `POST /api/models`, `POST /api/models/quick-add`, `DELETE /api/models/:id`, `POST /api/models/:id/connect`, `POST /api/models/:id/disconnect`, `POST /api/models/:id/test`, `PATCH /api/models/:id`.
- All real endpoints, well-structured.

**State handling**
- Empty state for zero models: ✓ (prompts to add first model).
- Loading state: none — no spinner while `useQuery` is fetching. The model count badge shows `0` during load, which is technically correct but jarring.
- Error state: only shown inline for connection errors per model card (`connectionError` field). No top-level error if `GET /api/models` itself fails.

**Issues**
- `JSON.parse(model.capabilities || "[]")` — if the DB stores malformed JSON, this throws uncaught. Should be try/caught.
- The reconnect UI shares `qaApiKey` state with the Quick Add tab — if both are open simultaneously, they clobber each other. Low probability but a real bug.
- Manual form submit (`createModel.mutate(form)`) sends the entire form including `notes` field, but the form UI has no Notes input. Notes field is silently ignored (backend likely ignores it too), but it's dead state.
- No loading indicator on the `TestTube2` button while `testModel` is running.
- `w-4.5` Tailwind class used (e.g. `className="w-4.5 h-4.5 text-primary"`) — not a standard Tailwind size; requires custom config to not break.

**Form validation**
- Manual submit: disabled unless `form.name` and `form.modelId` are filled. ✓
- Quick add: preset button disabled if `qaAuth === "api_key"` and no API key, except Ollama. ✓

**Accessibility**
- `<button>` elements in the provider grid have no `aria-label`. Icon-only action buttons lack aria labels.

---

### 3. SkillsPage.tsx
**Rating: FUNCTIONAL**

**Data / Backend connectivity**
- `GET /api/skills`, `POST /api/skills`, `PATCH /api/skills/:id`, `DELETE /api/skills/:id`. All real.

**State handling**
- Empty state for custom skills: ✓
- Loading state: none — no skeleton while skills load.
- Error state: `onError` toasts for create/delete failures. No error if the initial fetch fails.

**Issues**
- `JSON.parse(skill.triggerKeywords || "[]")` — same unguarded JSON.parse risk as ModelsPage.
- Toggle buttons for built-in skills and custom skills use naked `<button>` elements without `aria-label`. Accessibility gap.
- No confirmation dialog before deleting a skill.
- The create form submits even if `name` exists but `content` is empty — `disabled={!form.name || !form.content}` is correct but there is no visual inline validation feedback (field just stays enabled/disabled silently).

**Accessibility**
- Toggle `<button>` has `title` but no `aria-label` in a semantically useful form.

---

### 4. ConnectorsPage.tsx
**Rating: FUNCTIONAL**

**Data / Backend connectivity**
- `GET /api/connectors`, `POST /api/connectors/:id/connect`, `POST /api/connectors/:id/disconnect`, `GET /api/oauth/:id/authorize`, `POST /api/connectors` (custom MCP).
- OAuth redirect handling via `useEffect` on mount — parses query params from hash. Logic is correct but fragile if the URL format ever changes.

**State handling**
- Loading state: none. The connector list is empty while loading (no skeleton).
- Error state: `onError` toasts. No error if the initial `GET /api/connectors` fails.
- Empty state: a rendered empty category just returns `null` silently — fine for UX but provides no "no connectors" messaging if ALL categories are empty.

**Issues**
- Connect dialog requires either `apiKey` OR `serverUrl` (`disabled={!apiKeyInput && !serverUrlInput}`), but the OAuth flow ignores both fields — user could be confused about whether to fill in anything.
- The "Add MCP" dialog submits with only `name` required; `mcpServerUrl` is optional in the UI but likely required by the backend. No backend validation error is surfaced elegantly.
- No deletion/removal of non-custom connectors — hardcoded system connectors can only be connected/disconnected.
- Static hardcoded header: `"14+ built-in integrations"` — would ideally reflect actual connector count.

**Accessibility**
- Icon-only disconnect button missing `aria-label` (has `title` only).

---

### 5. MemoryPage.tsx
**Rating: FUNCTIONAL**

**Data / Backend connectivity**
- `GET /api/memory`, `POST /api/memory`, `DELETE /api/memory/:id`, `POST /api/memory/search`. All real.

**State handling**
- Empty state: ✓ (nice empty state with Brain icon).
- Loading state: none.
- Error state: `onError` not set on `createMemory` or `deleteMemory` mutations — failures are silent.

**Issues**
- `deleteMemory` has no `onError` handler. Silent failure.
- `createMemory` has no `onError` handler. Silent failure.
- The search uses `useMutation` for semantic search (`POST /api/memory/search`) while also doing local client-side filter. The logic is:
  - If `searchResults` exist (from POST), use those.
  - Else if `searchQuery` is set, filter `memories` locally.
  - The two paths can conflict: typing in the search box filters locally, then clicking the button does a semantic search. If the user clears the button result, `searchResults` stays stale (no reset on query change).
- Native `<select>` for category instead of a proper shadcn `<Select>` — inconsistent styling.
- Native `<input type="range">` for importance slider — inconsistent with the rest of the app which uses the `Slider` component.
- Importance slider label shows the raw float (e.g. `0.7`) — not user friendly.

**Accessibility**
- The importance `<input type="range">` has a label but no `aria-label` / `htmlFor` linkage.

---

### 6. SettingsPage.tsx
**Rating: PRODUCTION**

**Data / Backend connectivity**
- `GET /api/settings`, `GET /api/models`, `POST /api/settings`. All real.
- `useEffect` syncs server state into local state properly.

**State handling**
- Loading state: no skeleton while settings load, but inputs default to empty/false gracefully — no visual flash.
- Error state: `onError` toast for save failure. ✓
- The default model dropdown shows "No models configured" when no models exist. ✓

**Issues**
- Save button does not disable while the page is loading (settings haven't arrived yet) — user could submit defaults.
- Two separate "Save" buttons (General vs System) means partial saves are possible. Not necessarily wrong but could confuse users.
- Theme toggle calls `toggle()` from `useTheme` but saves it locally (client-only). The `POST /api/settings` for theme is not called — theme preference is not persisted to the backend.

**Accessibility**
- All form fields have proper `<Label htmlFor>` or `id` pairings. ✓
- `Switch` components have `aria-label`. ✓
- `Slider` has `aria-label`. ✓
- Best accessibility of all pages reviewed.

---

### 7. FileBrowserPage.tsx
**Rating: FUNCTIONAL**

**Data / Backend connectivity**
- `GET /api/sandbox/files`, `DELETE /api/sandbox/files/:path`, `POST /api/sandbox/files/upload`, file content fetch via `GET /api/sandbox/files/:path`.
- Download via `window.open` to `/api/sandbox/files/:path/download`. ✓
- Upload uses raw `fetch` (not `apiRequest`) to send multipart form data — correct approach.

**State handling**
- Loading state: spinner in the tree panel. ✓
- Error state: `"Failed to load files"` text in tree panel if fetch fails. ✓
- `FilePreview` handles: loading, error, binary, image, text/code, markdown. ✓
- Empty state: illustrated empty sandbox state. ✓
- Filter no-results state. ✓

**Issues**
- `window.confirm()` for delete — blocks the event loop and is not stylistically consistent with the rest of the app. Should use a confirmation dialog.
- Image download URL uses `` (import.meta as any).env?.VITE_API_BASE || "__PORT_5000__"`` — the literal string `"__PORT_5000__"` is a template placeholder that must be substituted at build time. If substitution fails, this URL is broken.
- Same `__PORT_5000__` issue in the upload function. If `VITE_API_BASE` is not set, uploads and image previews will 404.
- The `FilePreview` component renders markdown as a raw `<pre>` block, not rendered markdown. This is labeled as "preview" but is technically a plain text dump.
- No renaming or creating new files/folders.
- TreeItem uses `depth < 2` to auto-expand — this means deep trees are collapsed, but there is no "expand all" control.

**Accessibility**
- Tree items are `<button>` elements — reasonable for keyboard navigation.
- No `aria-expanded` on tree directory buttons.
- No `role="tree"` / `role="treeitem"` ARIA attributes on the file tree.

---

### 8. TokenDashboardPage.tsx
**Rating: FUNCTIONAL**

**Data / Backend connectivity**
- `GET /api/conversations` then parallel `GET /api/conversations/:id/agent-runs` for each — N+1 query pattern. For 100 conversations this fires 101 requests simultaneously. No rate limiting or batching.
- The `apiRequest` import is in the file but the `useQuery` for conversations uses the default `queryFn` (URL as key), while agent runs use an explicit `queryFn`. This is inconsistent but functional.

**State handling**
- Loading state: `Skeleton` components in cards and table. ✓
- Empty state: `"No agent runs found"` table row. ✓
- Error state: per-conversation run errors are silently swallowed (`catch { return { ...runs: [] } }`). Dashboard shows zeros rather than an error message.
- Filter state for date range and model: well handled. ✓

**Issues**
- `apiRequest` is imported but only used inside the `queryFn` closure. The import statement itself is never used at the top level — minor dead import.
- N+1 query pattern for agent runs is a scalability issue. A `/api/agent-runs` endpoint with pagination would be far superior.
- `run.completedAt - run.startedAt` — both are typed as `number` (timestamps), but the schema may store them as Date strings; if so, this arithmetic returns `NaN`. No guard.
- No error state shown if `GET /api/conversations` itself fails — page just shows zeros.

---

### 9. BrowserPage.tsx
**Rating: FUNCTIONAL**

**Data / Backend connectivity**
- `GET /api/browser/sessions` (polling every 5s), `POST /api/browser/navigate`, `POST /api/browser/action`, `POST /api/browser/evaluate`, `POST /api/browser/resize`, `DELETE /api/browser/sessions/:id`. All real.
- Screenshot URL uses `getSSEUrl` which is correct for cross-origin/port resolution.

**State handling**
- Loading state: spinner for screenshot loading. ✓
- Error state: errors logged to in-page console. ✓
- Empty state (no active session): illustrated empty state with instructions. ✓
- Status badge reflects loading/idle/error. ✓

**Issues**
- Screenshot auto-refreshes every 3 seconds even while the user is typing in the evaluate panel — potentially disruptive. Should pause on user interaction.
- `screenshotMutation` (`POST /api/browser/navigate`) duplicates `navigateMutation`'s mutation function — dead code path. The camera icon button in the top bar calls `refreshScreenshot()` directly, bypassing `screenshotMutation`. The mutation exists but is never called from the screenshot button.
- Session selector in the bottom bar uses `border-0 bg-transparent` on `SelectTrigger` which may be invisible on some themes.
- The `log` icon for `screenshot` uses emoji `📷` — breaks consistency with the rest of the icon-based UI.
- No URL format validation — any string is accepted and sent to navigate (e.g. `https://`).
- Actions tab has no feedback that the action succeeded beyond the JSON result — errors are shown in the result but not differentiated visually.

**Accessibility**
- URL input has no `<label>` or `aria-label`.
- Action form fields use `<label>` elements without `htmlFor`. Text is adjacent but not programmatically linked.

---

### 10. SandboxPage.tsx
**Rating: FUNCTIONAL**

**Data / Backend connectivity**
- `GET /api/sandbox/status` (polling every 5s), `GET /api/sandbox/config`, `POST /api/sandbox/config`, `POST /api/sandbox/pull-image`, `POST /api/sandbox/reset-detection`, `POST /api/sandbox/cleanup`. All real.

**State handling**
- Loading state: `statusLoading` and `configLoading` checks exist but no spinner/skeleton shown to the user — the form simply doesn't render while config is null (controlled by `{form && (...)}` gate). Acceptable.
- Error state: `pullImage.isError` shows inline error text. ✓
- `saveConfig.isSuccess` shows "Saved" inline. ✓

**Issues**
- No `onError` or toast for `saveConfig` failure — the user gets no feedback if saving config fails (the `Saving…` label reverts silently).
- No `onError` for `cleanup` — silent failure.
- No `onError` for `resetDetection` — silent failure.
- The `resetDetection` and `cleanup` mutations invalidate `status` but not `config` — if cleanup changes enabled state, config may be stale.
- Active containers table uses raw `<table>` / `<thead>` / `<tbody>` instead of the app's `Table` component — inconsistent with TokenDashboardPage.
- The "Kill All Containers" button has `variant="destructive"` but no confirmation dialog — destructive action fires immediately on click.

**Accessibility**
- `Switch` components have no `aria-label`. 
- `Label` components are adjacent but not linked with `htmlFor` to the `Switch` components.

---

### 11. SkillLibraryPage.tsx
**Rating: FUNCTIONAL**

**Data / Backend connectivity**
- `GET /api/skill-scripts`, `GET /api/skill-scripts?q=...`, `POST /api/skill-scripts`, `PATCH /api/skill-scripts/:id`, `DELETE /api/skill-scripts/:id`, `POST /api/skill-scripts/:id/run`, `GET /api/skill-scripts/:id/versions`.
- "Run" doesn't actually execute anything — it just copies the script content to clipboard and shows a toast. The `POST /api/skill-scripts/:id/run` endpoint returns content, which is then pasted into chat manually. **This is misleading UX — the "Run" button title says "Run (copy to clipboard)" in a tooltip but visually implies direct execution.**

**State handling**
- Empty state: ✓
- Loading state: none shown.
- Error state: `onError` toast for create. No error handler for update or delete.

**Issues**
- `JSON.parse(script.tags || "[]")` — unguarded JSON parse throughout.
- `JSON.parse(selected.tags || "[]")` — same risk.
- The `setEditForm` prop is typed as `(fn: (f: any) => any) => void` using `any` — TypeScript safety lost in `ScriptDetail`.
- Version history panel queries `GET /api/skill-scripts/${showVersions}/versions` — if `showVersions` changes before the query resolves, there's a brief window where stale version data is shown for the wrong script.
- Editing uses the same `form` state as creating a new script — if you open the create form and then click Edit on a script, the two forms share state and could overwrite each other (they're not both visible simultaneously, but the state merge is unexpected).
- No `deleteScript` error handler — silent failure.
- No `updateScript` error handler — silent failure.

**Accessibility**
- List items are `<div>` with `onClick` — not keyboard-focusable by default. Should be `<button>` or include `tabIndex={0}` with keyboard handlers.

---

### 12. MarketplacePage.tsx
**Rating: FUNCTIONAL**

**Data / Backend connectivity**
- `GET /api/marketplace/skills?q=...`, `GET /api/marketplace/stats`, `GET /api/marketplace/skills/:id`, `GET /api/marketplace/skills/:id/score`, `POST /api/marketplace/skills/:id/install`, `POST /api/marketplace/skills/:id/uninstall`, `POST /api/marketplace/skills/:id/fork`, `POST /api/marketplace/skills/:id/rate`, `POST /api/marketplace/skills`, `POST /api/marketplace/seed`, `POST /api/marketplace/scoring/run`.
- `POST /api/marketplace/seed` and `POST /api/marketplace/scoring/run` are admin actions exposed in the UI without any access control. Any user can seed the marketplace or trigger scoring runs.

**State handling**
- Loading/empty states: present. Uses `isLoading` guards.
- Error state: `onError` toasts for mutations. No handling for `GET` failures.

**Issues**
- Rating mutation uses hardcoded `userId: "local-user"` — this is a placeholder that should never ship to production. User identity is faked.
- Admin-level operations (`/api/marketplace/seed`, `/api/marketplace/scoring/run`) are accessible as regular buttons in the UI. No role check.
- Publish flow lacks server-side validation feedback — if the backend rejects content/slug, the error toast only shows the raw error message.
- `GET /api/marketplace/installs` is invalidated but never fetched in this page — unclear if installs are displayed anywhere in the current UI.
- `fork` mutation lacks an `onError` handler.

---

### 13. AutonomyPage.tsx
**Rating: FUNCTIONAL**

**Data / Backend connectivity**
- `GET /api/autonomy/dashboard` (refetch every 10s), `POST /api/autonomy/learning/analyze`, `POST /api/autonomy/skills/improvements/generate`, `POST /api/autonomy/checkpoints/abandon-stale`.
- Single dashboard endpoint that returns all data — efficient.

**State handling**
- Loading state: full-page spinner. ✓
- No explicit error state — if dashboard fetch fails, the spinner stays forever (never shows an error to the user).
- After data loads, all panels render real data. ✓

**Issues**
- `analyzeMutation` invalidates `queryKey: ["/api/autonomy"]` but the dashboard query key is `["/api/autonomy/dashboard"]` — **the invalidation is a no-op**. After running analysis, the data does not refresh automatically. This is a real bug.
- Same issue for `improveMutation`.
- `abandonMutation` invalidates `["/api/autonomy"]` — same bug.
- **All three action buttons have broken cache invalidation.**
- The loading spinner shows during initial fetch but no error boundary for the failed state — perpetual spinner is confusing.

---

### 14. ProtocolsPage.tsx
**Rating: FUNCTIONAL**

**Data / Backend connectivity**
- `GET /api/protocols/dashboard`, `POST /api/protocols/a2a/agents/discover`, `DELETE /api/protocols/a2a/agents/:id`, `POST /api/protocols/a2a/agents/:id/send`, `POST /api/protocols/mcp/servers/connect`, `DELETE /api/protocols/mcp/servers/:id`, `GET /api/protocols/mcp/servers/:id/tools`, `GET /api/protocols/mcp/servers/:id/resources`, `POST /api/protocols/cli/execute`, `POST /api/protocols/cli/script`, `POST /api/protocols/http/request`, `POST /api/protocols/webhooks`, `DELETE /api/protocols/webhooks/:id`.
- Very comprehensive. CLI and HTTP tabs provide a direct execution interface.

**State handling**
- Dashboard uses `refetchInterval: 5000`. ✓
- Uses `Skeleton` components for loading states. ✓
- Error states handled via toasts.
- Alert component from shadcn used for errors. ✓

**Issues**
- `default export` for `ProtocolsPage` while all other pages use named exports. App.tsx imports it correctly but it's inconsistent.
- CLI tab sends raw shell commands to the backend — there is no input sanitization or warning to the user about the security implications. The UI shows the output but doesn't warn that bad commands can affect the server.
- HTTP request builder provides no authentication mechanism selector beyond manual headers — basic/bearer auth is manual.
- No confirmation before deleting an A2A agent or MCP server.
- The `refetchInterval` on the dashboard will continue polling even when the tab/page is backgrounded.

---

### 15. MessagingPage.tsx
**Rating: FUNCTIONAL**

**Data / Backend connectivity**
- `GET /api/messaging/channels`, `POST /api/messaging/channels`, `POST /api/messaging/channels/:id/test`, `PATCH /api/messaging/channels/:id`, `DELETE /api/messaging/channels/:id`, `GET /api/messaging/history?...`, `POST /api/messaging/send`, `GET /api/messaging/subscriptions`, `POST /api/messaging/subscriptions`, `DELETE /api/messaging/subscriptions/:channelId/:conversationId`, `POST /api/messaging/notify`, `GET /api/messaging/stats`, SSE `GET /api/messaging/stream`.
- Extensive and real. SSE stream silently ignores errors. ✓

**State handling**
- Loading states: `Skeleton` for channels and subscriptions. ✓
- Empty states: all four tabs have proper empty states. ✓
- Error states: `onError` toasts. ✓

**Issues**
- Message history uses the full URL with query params as the `queryKey` string (e.g. `/api/messaging/history?limit=50&direction=inbound`) — this is functional but means changing filters creates new cache entries instead of invalidating the old one. Stale message history could be shown when switching filters.
- SSE stream in the Dashboard tab (`DashboardTab`) starts regardless of whether the user is on the Dashboard tab — resources are consumed even when the tab is not visible.
- The `conversations` query uses `queryKey: ["/api/conversations?limit=50"]` — the `limit=50` is baked into the query key but not into the query URL used elsewhere (which uses `/api/conversations`). Creates separate cache entries.
- `window.confirm` for channel removal — should use a dialog.
- Sending a message with `!sendChannel || !content` disabled is correct, but there is no feedback about *why* the button is disabled if no channels are connected.

---

### 16. NIPPage.tsx (Network Instruction Protocol)
**Rating: FUNCTIONAL**

**Data / Backend connectivity**
- `GET /api/nip/sessions/stats`, `GET /api/nip/sessions`, `GET /api/nip/sessions/:id`, `POST /api/nip/sessions`, `POST /api/nip/sessions/:id/negotiate`, `POST /api/nip/sessions/:id/pause`, `POST /api/nip/sessions/:id/resume`, `POST /api/nip/sessions/:id/terminate`, `POST /api/nip/sessions/:id/complete`, `POST /api/nip/sessions/:id/report`, `GET /api/nip/sessions/:id/messages`, `POST /api/nip/sessions/:id/messages`, `GET /api/nip/alerts`, `POST /api/nip/alerts/:id/acknowledge`, `POST /api/nip/sessions/pause-all`.
- Heavy, comprehensive. Real endpoints throughout.

**State handling**
- Loading states: spinners used. ✓
- Empty states: present per section. ✓
- Error states: toasts on mutation failures.

**Issues**
- The file is 1,423 lines — extremely long for a single file. Multiple functional sub-components should be extracted into separate files.
- `createMut` fires two sequential API calls (`POST /api/nip/sessions` then `POST /api/nip/sessions/:id/negotiate`) — if negotiate fails, the session is created but not negotiated and the user gets an error toast but the session still appears in the list.
- SSE-like stream polling uses `refetchInterval` rather than a proper EventSource — may cause stale data if messages arrive between intervals.
- New session form (`NewSessionForm`) is embedded inside the page file — the same shared `form` state issue as SkillLibraryPage is potentially present since editing and creating could share state scope.
- Alert acknowledgment invalidates `["/api/nip/alerts"]` but the stats query `["/api/nip/sessions/stats"]` is not invalidated — alert count in stats card stays stale.

---

### 17. IdentityPage.tsx
**Rating: FUNCTIONAL**

**Data / Backend connectivity**
- `GET /api/identity/:cryptoId`, `POST /api/identity/register`, `PATCH /api/identity/:cryptoId/profile`, `POST /api/identity/:cryptoId/verify`, `GET /api/identity/search?...`, `POST /api/identity/:cryptoId/blocks`, `DELETE /api/identity/:cryptoId/blocks/:blockId`, `GET /api/identity/verifications`, `POST /api/identity/verifications/:requestId/approve`, `POST /api/identity/verifications/:requestId/reject`, `GET /api/identity/:cryptoId/blocks`, `GET /api/identity/stats`.
- Real and comprehensive.

**State handling**
- Loading states: `Skeleton` components used throughout. ✓
- Empty states: present. ✓
- Error states: toasts on failures.

**Issues**
- The file is 1,463 lines — should be broken into sub-components/files.
- `cryptoId` is used as a local state string that defaults to empty — if the user hasn't registered, queries fire with empty `cryptoId` (`GET /api/identity/`). This is likely a 400/404 on the backend and the error is silently swallowed by React Query's default behavior.
- The identity registration flow requires a `cryptoId` input from the user — this suggests identities are not auto-generated, which means a new user sees a mostly-broken page until they manually register.
- Admin actions (approve/reject verification) are in the same page as user actions — no role separation in the UI. Any user can see the admin verification review panel.
- `GET /api/identity/search?${params.toString()}` — the full URL with query params as the queryKey creates many cache entries; filter changes don't invalidate previous results.

---

### 18. WelcomePage.tsx
**Rating: FUNCTIONAL**

**Data / Backend connectivity**
- `POST /api/conversations` to create a new session, then navigates to `/chat/:id`. Simple and correct.

**State handling**
- Button disabled while mutation is pending. ✓
- No error state if `POST /api/conversations` fails — failure is silent.

**Issues**
- Feature list is entirely hardcoded/static — not bad for a landing page, but `"14+ Connectors"` is a hardcoded number that may drift from reality.
- `WelcomePage` renders its own `<Layout>` wrapper. The App.tsx `/` route does NOT wrap it in `<Layout>`. However, the catch-all route `<Route>` also renders `<WelcomePage>` but DOES wrap it in an outer `<Layout>`, causing double-layout on unknown routes. **This is a real rendering bug for 404 paths.**
- No error toast or user feedback if session creation fails.

---

## Cross-Cutting Issues

### No global loading/error states
None of the pages display a meaningful error state when their initial `useQuery` fails. They silently show empty states or zero-counts. This is a systemic gap — every page needs at minimum an inline error banner for fetch failures.

### Unguarded JSON.parse (widespread)
Multiple pages do `JSON.parse(field || "[]")` without a try/catch:
- `ModelsPage`: `model.capabilities`
- `SkillsPage`: `skill.triggerKeywords`
- `SkillLibraryPage`: `script.tags` (multiple callsites)
- `MarketplacePage`: similar pattern likely present

If the database returns malformed JSON in any of these fields, the component crashes and the ErrorBoundary is invoked. This should be wrapped in a safe parse utility.

### `w-4.5` Tailwind class
Used in `ModelsPage` — this is not a standard Tailwind utility. Without a custom `extend` in `tailwind.config`, it silently has no effect and the icon is unsized.

### Broken cache invalidation in AutonomyPage
All three action buttons in `AutonomyPage` invalidate `["/api/autonomy"]` but the actual query key is `["/api/autonomy/dashboard"]`. Running analysis, generating improvements, or abandoning stale tasks never refreshes the dashboard. **This is a production bug.**

### N+1 query pattern in TokenDashboardPage
Fetching per-conversation agent runs in parallel for every conversation is an architectural issue. With 100+ sessions, this floods the backend with requests.

### Hardcoded `userId: "local-user"` in MarketplacePage
A rating is submitted with `userId: "local-user"`. This is a stub that must not ship.

### Double `<Layout>` on catch-all route (App.tsx)
The catch-all route `<Route>` wraps `<WelcomePage>` in `<Layout>`, but `WelcomePage` already renders `<Layout>` itself internally. The `/` route correctly avoids this, but the catch-all does not.

### No loading state on useQuery for most pages
Of 18 pages, roughly 12 show no loading indicator during the initial data fetch. Only `TokenDashboardPage`, `MessagingPage`, `AutonomyPage`, `IdentityPage`, `ProtocolsPage`, and `FileBrowserPage` show meaningful loading states.

---

## Summary Ratings

| Page | Rating | Key Issue |
|------|--------|-----------|
| ChatPage | FUNCTIONAL | No loading/error state for conversation fetch; hand-rolled markdown renderer |
| ModelsPage | FUNCTIONAL | `w-4.5` class; reconnect state clobbering; no query error state |
| SkillsPage | FUNCTIONAL | Silent mutation failures; no loading state |
| ConnectorsPage | FUNCTIONAL | No loading/empty state; OAuth dialog UX confusing |
| MemoryPage | FUNCTIONAL | Silent mutation failures; native inputs inconsistent; stale search state |
| SettingsPage | PRODUCTION | Best-in-class accessibility; theme not persisted to backend |
| FileBrowserPage | FUNCTIONAL | `__PORT_5000__` placeholder risk; window.confirm for delete |
| TokenDashboardPage | FUNCTIONAL | N+1 query pattern; timestamp arithmetic may return NaN |
| BrowserPage | FUNCTIONAL | Dead `screenshotMutation`; no URL validation |
| SandboxPage | FUNCTIONAL | Silent config save failure; no confirmation on destructive actions |
| SkillLibraryPage | FUNCTIONAL | "Run" is misleading (copies to clipboard only); shared form state |
| MarketplacePage | FUNCTIONAL | Hardcoded `userId: "local-user"`; admin actions unprotected |
| AutonomyPage | FUNCTIONAL | **All action buttons have broken cache invalidation** |
| ProtocolsPage | FUNCTIONAL | Default export inconsistency; no confirmation on destructive actions |
| MessagingPage | FUNCTIONAL | Filter key creates cache bloat; SSE consumes resources in background |
| NIPPage | FUNCTIONAL | 1423-line file; two-step session create can fail partially |
| IdentityPage | FUNCTIONAL | 1463-line file; cryptoId can be empty causing silent 404s |
| WelcomePage | FUNCTIONAL | Double Layout on 404 routes; no error on session create failure |

**0 pages rate PRODUCTION** (SettingsPage is the closest, with minor theme persistence issue).  
**0 pages rate BROKEN** (no pages crash or have dead imports that prevent rendering).  
**1 page rates COSMETIC** (none — all pages have some real data fetching).  
**17 pages rate FUNCTIONAL** — they work but all have rough edges that would frustrate production users.  
**1 page rates near-PRODUCTION**: SettingsPage.
