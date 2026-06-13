# Production Readiness

Date: 2026-06-06

## Verdict

Status: launch candidate for a controlled public conversation or private beta. The local and CI repository gates are passing, and the branch now has CI, dependency audit, CodeQL, Dependency Review, OpenSSF Scorecard, Dependabot, SBOM generation, production smoke testing, a runbook, and a verification truthfulness policy.

Rating: 9.2 / 10 for repository launch readiness after this hardening pass.

Not a 10 / 10 for unrestricted enterprise GA yet because production identity/session auth, managed multi-node persistence, full telemetry, and broader integration coverage are product/platform work outside the local repo gate.

Detailed control-plane architecture, failure lifecycle, coverage matrix, and current-source best-practice review: `reports/policy-control-plane-readiness.md`.

## Verification Truthfulness Rule

Nothing in testing or verification may be faked, mocked, simulated, or represented as production proof unless it actually exercises the real behavior being claimed. Unit harnesses, stubs, mocks, fixtures, evaluator-only checks, and static checks must be labeled as such. If a real external capability cannot be exercised locally or remotely, mark it `BLOCKED` or `NOT VERIFIED` with the exact reason and do not round it up to green. See `docs/VERIFICATION_POLICY.md`.

## Matrix

| Area | Status | Evidence |
| --- | --- | --- |
| Build and type safety | STATIC ONLY passing | `npm run check`, `npm run build` |
| Unit tests | UNIT-LEVEL ONLY passing | 45 passing tests in the latest local gate |
| Policy evaluator/redaction | UNIT-LEVEL ONLY passing | `tests/unit/policyEngine.test.ts`; does not prove live external tool execution |
| Coverage capture | UNIT-LEVEL ONLY passing | `npm run test:coverage` |
| Dependency audit | STATIC ONLY passing | `npm run audit` exits 0 |
| Secret scanning | STATIC ONLY passing | `gitleaks detect --no-banner --redact --source .` |
| Production startup | VERIFIED LOCALLY passing | `npm run smoke:prod` starts the production build and checks local health |
| Docker live-local deployment | VERIFIED LOCALLY passing | `npm run live:docker` builds a clean Linux image from a digest-pinned Node base, starts a non-root production container, exercises auth, filesystem API, browser private-network denial, policy audit, missing policy fail-closed behavior, and audit write failure logging |
| Browser render | VERIFIED LOCALLY passing | `reports/after/browser-prod.png`; local production render only |
| Self-evolving skill loop | UNIT-LEVEL ONLY passing | Memory-derived skill proposals can be generated/deduped in tests; live production promotion workflow not exercised |
| Policy-governed live GitHub/MCP/A2A/provider calls | NOT VERIFIED | Requires real credentials/services and live governed calls; not exercised by local unit/static gates |
| Hyper-V/Azure VM deployment | BLOCKED | Hyper-V operations lack Windows authorization in this session; Azure CLI is not logged in |
| CI | VERIFIED LOCALLY in CI passing | Ubuntu and Windows matrix with build, tests, audit, SBOM, smoke |
| Static analysis | STATIC ONLY passing | CodeQL workflow is present; SARIF upload is advisory until GitHub code scanning is enabled for the repo |
| Supply chain | STATIC ONLY passing | Enforced npm audit, Dependabot, OpenSSF Scorecard, CycloneDX SBOM; GitHub Dependency Review and SARIF upload are advisory until dependency graph / Advanced Security / code scanning support is enabled for the repo |
| Operational docs | STATIC ONLY passing | `docs/PRODUCTION_RUNBOOK.md`, `docs/VERIFICATION_POLICY.md` |
| Persistence scale | Yellow | SQLite is single-node launch friendly, not broad GA architecture |
| Auth model | Yellow | API-key production gate works; first-party session auth remains GA work |
| Observability | Yellow | Health/watchdog exists; metrics/tracing/alerts remain GA work |

## Launch Recommendation

Use this branch as the launch-candidate baseline. For the "next biggest launch" target, run a controlled release first, measure real traffic and failure modes, then finish the GA items before promising high-volume enterprise reliability.

## Competitive Signal Added

The NVIDIA / Nous Hermes pattern of turning organizational memory into reusable skills is now represented as a governed proposal loop. Ultra Computer does not silently mutate production skills from memory; it proposes skill scripts with evidence and requires promotion before use.
