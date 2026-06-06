# Security Policy

## Supported Versions

Ultra Computer is beta software. Security fixes target the current `master`
branch until a stable release line exists.

## Reporting a Vulnerability

Report vulnerabilities privately to the repository owner. Include affected
version or commit, reproduction steps, impact, and any relevant logs.

Do not open public issues for exploitable vulnerabilities, secrets, auth bypasses,
path traversal, SSRF, webhook signature bypasses, or sandbox escapes.

## Production Requirements

- Set `ULTRA_API_KEY`.
- Set webhook secrets for any enabled Slack or GitHub inbound webhooks.
- Keep sandbox file access constrained through `server/pathSafety.ts`.
- Keep `policies/*-access.json` deny-by-default. Memory, skills, browser,
  MCP/A2A, shell, filesystem, network, and GitHub capabilities must remain
  bounded by `server/policyEngine.ts` decisions.
- Ship `data/policy/audit.jsonl` to the deployment log collector and treat
  unexpected denials or broad allow rules as release blockers.
- Run `npm audit --audit-level=moderate` before deployment and document any
  unresolved advisory.
