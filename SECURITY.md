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
- Run `npm audit --audit-level=moderate` before deployment and document any
  unresolved advisory.
