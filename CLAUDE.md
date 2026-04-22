# Ultra Computer — Claude Code Guidelines

## Think Before Coding
- Surface assumptions explicitly before acting on them
- When a request has multiple valid interpretations, name them and pick one — don't silently choose
- If confused about intent, ask rather than guess
- Advocate for a simpler approach when the task doesn't warrant complexity

## Simplicity First
- Write minimal code that solves only the stated problem
- No speculative features, future-proofing, or unrequested configurability
- No error handling for scenarios that can't happen
- If a senior engineer would call it over-engineered, it is

## Surgical Changes
- Modify only what's necessary — do not improve adjacent code
- Do not reformat or clean up code you didn't change
- Do not add comments, docstrings, or type annotations to untouched code
- Match the existing style exactly
- Only remove imports/variables orphaned by your own changes

## Goal-Driven Execution
- Turn vague requests into specific, testable objectives before starting
- For multi-step work, state the steps upfront with checkpoints
- Run adversarial/edge-case checks after implementing security changes

---

## Project-Specific Rules

### Stack
- **Backend:** Express v5, TypeScript (ESM), SQLite via Drizzle ORM, `better-sqlite3`
- **Frontend:** React + Vite, Radix UI, React Query, React Router
- **Tests:** Shell scripts in `tests/`, adversarial suite at `tests/adversarial-security.test.ts`
- **Dev server:** `npm run dev` (port 5000)

### Auth
- Auth middleware is passthrough when `ULTRA_API_KEY` is not set — this is intentional dev mode, do not change this behavior
- Production requires `ULTRA_API_KEY`, `SLACK_SIGNING_SECRET`, `GITHUB_WEBHOOK_SECRET`

### Commits
Use these prefixes — one logical change per commit:
- `security:` — security fixes or hardening
- `hardening:` — defensive improvements (limits, timeouts, guards)
- `fix:` — bug fixes
- `feat:` — new features
- `test:` — test additions or changes
- `chore:` — deps, config, tooling

### Security
- Default-deny is better than blocklist — prefer allowlists where feasible
- HMAC verification on all inbound webhooks (Slack, GitHub)
- Raw body must be captured via `verify` callback for both `express.json` and `express.urlencoded`
- `crypto.timingSafeEqual` for all secret comparisons — never `===` or `!==`
- `path.resolve` + `startsWith` for sandbox containment — never strip `../` manually
- Follow symlinks with `fs.realpathSync` after containment check

### Testing
- Run `npx tsx tests/adversarial-security.test.ts --cli-only` after any CLI/security changes
- Do not push without verifying existing tests still pass
