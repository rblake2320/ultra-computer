# Production Runbook

## Status

Ultra Computer is a launch-candidate branch when `npm run verify` passes on a clean checkout. Treat public deployment as a controlled launch until session auth, managed persistence, production telemetry, and live external capability verification are in place.

All release claims must follow `docs/VERIFICATION_POLICY.md`. Do not report a mocked, stubbed, simulated, fixture-based, unit-only, or static check as production proof.

## Required Secrets

Set these values in the deployment environment, never in committed files:

| Variable | Requirement |
| --- | --- |
| `ULTRA_API_KEY` | Strong bearer token for protected API routes. |
| `ENCRYPTION_KEY` | 64-character hex value from `npm run gen:key`. |
| `SLACK_SIGNING_SECRET` | Slack webhook signing secret. |
| `GITHUB_WEBHOOK_SECRET` | GitHub webhook signing secret. |
| `ALLOWED_ORIGIN` | Public frontend origin when API and UI are split. |
| `PORT` | HTTP port, default `5000`. |
| `GRPC_PORT` | gRPC port, default `50051`. |
| `OAUTH_REDIRECT_BASE_URL` | Public callback base URL for OAuth connectors. |

## Preflight

1. Confirm Node.js 20+.
2. Run `npm ci`.
3. Review `policies/*-access.json` for the release. They are deny-by-default; do not add broad allow rules for launch convenience.
4. Run `npm run test:unit -- --run tests/unit/policyEngine.test.ts`.
5. Run `npm run verify`.
6. Run `gitleaks detect --no-banner --redact --source .`.
7. Label each verification result using `VERIFIED LIVE`, `VERIFIED LOCALLY`, `UNIT-LEVEL ONLY`, `STATIC ONLY`, `NOT VERIFIED`, or `BLOCKED`.
8. For every `NOT VERIFIED` or `BLOCKED` live capability, record the exact reason and do not mark that capability green.
9. Archive `reports/sbom.cdx.json` with the release artifacts.

## Deploy

1. Build with `npm run build`.
2. Set the required production secrets.
3. Start with `npm start`.
4. Probe `GET /api/health`.
5. Confirm the browser app loads with an injected `window.__ULTRA_API_KEY__` value or an equivalent gateway/session mechanism.

## Operate

- Health: `GET /api/health`.
- Logs: route server stdout/stderr to the platform log collector.
- Policy audit: ship `data/policy/audit.jsonl` to the log collector. Records include domain/action, tool/action, allow/deny, reason, actor/session when available, and redacted command/URL/path/metadata.
- Webhooks: reject unsigned Slack and GitHub webhooks; rotate secrets after incidents.
- Sandbox: prefer Docker isolation. Avoid fallback host execution for untrusted workloads.
- Self-evolving skills: review `GET /api/autonomy/skills/proposals` before promotion. Do not auto-promote memory-derived proposals in production without human approval.
- Queue: run Redis/BullMQ for production job durability when workloads exceed one process.
- Database: SQLite is acceptable for single-node launch traffic. Move to managed multi-node persistence before broad public GA.

## Rollback

1. Stop intake at the load balancer or platform router.
2. Restore the previous artifact and its matching environment configuration.
3. Probe `GET /api/health`.
4. Re-enable traffic gradually.
5. Record the incident, failed checks, and remediation in `CHANGELOG.md` or the release notes.

## Current Launch Limits

- Browser production auth currently supports injected API keys; first-party login/session auth is still a GA requirement.
- Coverage is recorded but below a mature enterprise target. Expand integration coverage around auth, webhooks, sandbox file APIs, and persistence.
- Observability has health/watchdog foundations; add metrics, tracing, dashboards, and alert policy before high-volume public launch.
