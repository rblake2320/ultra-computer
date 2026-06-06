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
- Policy tests: `npm run test:unit -- --run tests/unit/policyEngine.test.ts`
- Coverage: `npm run test:coverage`
- Build: `npm run build`
- Security audit: `npm run audit`
- Production smoke: `npm run smoke:prod` after `npm run build`
- CLI/security changes: `npx tsx tests/adversarial-security.test.ts --cli-only`
- Evidence rule: follow `docs/VERIFICATION_POLICY.md`. Never report mocked, stubbed, simulated, fixture-based, or unit-only checks as production proof.
- Status labels: use `VERIFIED LIVE`, `VERIFIED LOCALLY`, `UNIT-LEVEL ONLY`, `STATIC ONLY`, `NOT VERIFIED`, or `BLOCKED` with an exact reason.

## Code Style
- TypeScript ESM imports use `.js` extensions for local server modules.
- Keep dev-mode auth passthrough when `ULTRA_API_KEY` is unset.
- Use `resolveInside` from `server/pathSafety.ts` for sandbox path containment.

## Boundaries
- Generated protobuf files: `shared/generated/**`.
- Audit evidence images under `audit/*.png` are historical artifacts.
- Do not read, print, or commit `.env*`, private keys, webhook secrets, or API keys.
- Agent/tool permissions live in `policies/*-access.json` and are deny-by-default. Do not broaden policy rules to make a feature or test pass; wire the feature through the policy evaluator and keep the policy as the hard constraint.
- Do not round policy evaluator tests up to live tool proof. They are unit-level evidence unless the real governed route and real external capability were exercised.

## Non-Obvious Patterns
- Raw request bodies are required for Slack/GitHub HMAC verification.
- Sandbox file APIs must reject prefix siblings such as `sandbox2`, not just `../` traversal.
- Browser clients can set `window.__ULTRA_API_KEY__`; EventSource auth uses an `api_key` query parameter because native EventSource cannot send custom headers.
- Policy decisions are audited to `data/policy/audit.jsonl` with command, URL, path, and metadata redacted before write.

## Versions
- Node.js 20+.
- TypeScript `5.6.3`.
- Express 5, React 18, Vite 7, Vitest 4.

Review rubric: see `code_review.md`.
