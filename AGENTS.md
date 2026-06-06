# AGENTS.md

## Commands
- Install: `npm ci`
- Build: `npm run build`
- Full gate: `npm run verify`
- SBOM: `npm run sbom`
- Dev: `npm run dev` (serves on port 5000)
- Production smoke: set `ULTRA_API_KEY`, `SLACK_SIGNING_SECRET`, `GITHUB_WEBHOOK_SECRET`, and `ENCRYPTION_KEY`, then run `npm start`

## Verification
- Typecheck: `npm run check`
- Unit tests: `npm run test:unit -- --run`
- Coverage: `npm run test:coverage`
- Build: `npm run build`
- Security audit: `npm run audit`
- Production smoke: `npm run smoke:prod` after `npm run build`
- CLI/security changes: `npx tsx tests/adversarial-security.test.ts --cli-only`

## Code Style
- TypeScript ESM imports use `.js` extensions for local server modules.
- Keep dev-mode auth passthrough when `ULTRA_API_KEY` is unset.
- Use `resolveInside` from `server/pathSafety.ts` for sandbox path containment.

## Boundaries
- Generated protobuf files: `shared/generated/**`.
- Audit evidence images under `audit/*.png` are historical artifacts.
- Do not read, print, or commit `.env*`, private keys, webhook secrets, or API keys.

## Non-Obvious Patterns
- Raw request bodies are required for Slack/GitHub HMAC verification.
- Sandbox file APIs must reject prefix siblings such as `sandbox2`, not just `../` traversal.
- Browser clients can set `window.__ULTRA_API_KEY__`; EventSource auth uses an `api_key` query parameter because native EventSource cannot send custom headers.

## Versions
- Node.js 20+.
- TypeScript `5.6.3`.
- Express 5, React 18, Vite 7, Vitest 4.

Review rubric: see `code_review.md`.
