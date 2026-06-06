# Inputs

- Repository: `https://github.com/rblake2320/ultra-computer.git`
- Default branch: `master`
- Hardening branch: `codex/hardening`
- Last release tag: none found locally
- Runtime: Node.js 20+ per README and `@types/node`
- Package manager: npm with `package-lock.json`
- Project type: TypeScript full-stack app, Express 5 API, React/Vite frontend, SQLite/Drizzle data layer
- Monorepo: no
- Flags: `has_ui`, `is_service`, `handles_secrets`

## Canonical Commands

- Install: `npm ci`
- Build: `npm run build`
- Typecheck: `npm run check`
- Unit tests: `npm run test:unit -- --run`
- Coverage: `npx vitest run --coverage`
- Audit: `npm audit --audit-level=moderate`
- Secret scan: `gitleaks detect --no-banner --redact --source .`

## Baseline Notes

The default npm cache pointed at `D:\dev\npm-cache` and failed with `UNKNOWN: unknown error, stat`. Baseline was rerun with a repo-local cache to distinguish environment failure from repository failure.
