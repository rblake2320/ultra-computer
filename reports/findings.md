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
- Fix: Upgraded `@anthropic-ai/sdk` to `0.101.0`, `drizzle-orm` to `0.45.2`, and kept `drizzle-zod` on the compatible `0.7.0` line.
- Status: Fixed; `npm audit --audit-level=moderate` exits 0.

## UC-HIGH-003 - Production Startup - Windows Socket Option Failure

- Severity: High
- Evidence: production smoke test failed with `listen ENOTSUP: operation not supported on socket 0.0.0.0:5099`.
- Root cause: `reusePort: true` is not supported on Windows for this socket setup.
- Fix: Made `reusePort` platform-aware in `server/index.ts`.
- Status: Fixed; production health smoke exits 0.

## UC-MED-001 - CI/CD - No Workflow Present

- Severity: Medium
- Evidence: no `.github/workflows` existed.
- Root cause: Verification commands were documented but not enforced.
- Fix: Added `.github/workflows/ci.yml` for npm install, typecheck, unit tests, coverage, build, audit, SBOM generation, and production smoke on Windows and Ubuntu.
- Status: Fixed.

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

## UC-MED-004 - Browser Auth - REST/SSE Clients Ignored Browser API Key

- Severity: Medium
- Evidence: production browser render showed two `401 Unauthorized` console errors when `ULTRA_API_KEY` was enabled.
- Root cause: REST requests did not use `window.__ULTRA_API_KEY__`, and EventSource cannot send authorization headers.
- Fix: Added browser API key support to REST requests and query-token support for GET/EventSource endpoints.
- Status: Fixed; production browser render check exits 0.

## UC-LOW-002 - Frontend Performance - Oversized Initial Bundle

- Severity: Low
- Evidence: production build warned that the initial app chunk exceeded 500 kB.
- Root cause: all route pages were statically imported into the initial bundle.
- Fix: Added route-level lazy loading and manual vendor chunking.
- Status: Fixed; build exits 0 without chunk warnings.

## UC-LOW-003 - Launch Governance - Missing Security Automation

- Severity: Low
- Evidence: repository lacked CodeQL, dependency review, dependency update automation, Scorecard, SBOM generation, and production runbook.
- Root cause: initial hardening focused on local correctness and immediate blockers.
- Fix: Added CodeQL, Dependency Review, OpenSSF Scorecard, Dependabot, CycloneDX SBOM generation, `npm run verify`, `npm run smoke:prod`, and `docs/PRODUCTION_RUNBOOK.md`.
- Status: Fixed.

## UC-LOW-004 - Product Loop - Memory Did Not Become Governed Skills

- Severity: Low
- Evidence: memory capture and skill auto-improvement existed, but there was no reviewable proposal step to turn procedural memory into reusable skills.
- Root cause: self-improvement focused on existing skills, not new memory-derived skill creation.
- Fix: Added `server/skillProposalEngine.ts`, autonomy proposal endpoints, and unit coverage for proposal generation/deduplication.
- Status: Fixed.
