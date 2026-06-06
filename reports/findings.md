# Findings

## UC-HIGH-001 - Security - Sandbox Prefix-Sibling Escape

- Severity: High
- Evidence: `server/fileRoutes.ts`, `server/tools.ts`, and `server/protocolRoutes.ts` used `startsWith(base)` style checks for path containment.
- Root cause: String-prefix containment treats sibling directories such as `sandbox2` as children of `sandbox`.
- Fix: Added `server/pathSafety.ts` with separator-aware `isPathInside` and `resolveInside`, replaced affected call sites, and added `tests/unit/pathSafety.test.ts`.
- Status: Fixed.

## UC-HIGH-002 - Supply Chain - Vulnerable Dependencies

- Severity: High
- Evidence: baseline `reports/baseline/audit-local-cache.txt` reported 35 vulnerabilities, including high severity advisories.
- Root cause: Lockfile-resolved transitive dependencies were stale; two remaining direct dependency ranges require breaking upgrades.
- Fix: Ran `npm audit fix`, reducing audit output to 2 vulnerabilities.
- Status: Partially fixed; `@anthropic-ai/sdk` and `drizzle-orm` remain blocked by breaking upgrades.

## UC-MED-001 - CI/CD - No Workflow Present

- Severity: Medium
- Evidence: no `.github/workflows` existed.
- Root cause: Verification commands were documented but not enforced.
- Fix: Added `.github/workflows/ci.yml` for npm install, typecheck, unit tests, build, and audit on Windows and Ubuntu.
- Status: Fixed, but audit job will fail until UC-HIGH-002 is fully resolved.

## UC-MED-002 - Agent Readiness - Bloated/Drifting Claude Guidance

- Severity: Medium
- Evidence: `CLAUDE.md` duplicated long operational guidance and no `AGENTS.md` or review rubric existed.
- Root cause: Tool-specific instructions were used as the primary repo context.
- Fix: Added concise `AGENTS.md`, made `CLAUDE.md` a one-line pointer, and added `code_review.md`.
- Status: Fixed.

## UC-MED-003 - License Metadata Drift

- Severity: Medium
- Evidence: `package.json` declared MIT while README declared proprietary.
- Root cause: Package metadata and human docs diverged.
- Fix: Added proprietary `LICENSE`, set package metadata to `private: true` and `UNLICENSED`.
- Status: Fixed.

## UC-LOW-001 - Project Hygiene Files Missing

- Severity: Low
- Evidence: missing `CONTRIBUTING.md`, `SECURITY.md`, `CHANGELOG.md`, `.editorconfig`, `CODEOWNERS`, and PR template.
- Root cause: Repo lacked release/contribution hygiene scaffolding.
- Fix: Added the missing files.
- Status: Fixed.
