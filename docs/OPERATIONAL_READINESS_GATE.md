# Operational Readiness Gate

Run this gate before claiming a release is ready beyond local development.

## Required Evidence Labels

Use `docs/VERIFICATION_POLICY.md` labels for every line item:

- `PASS`: real behavior exercised for the claim being made.
- `UNIT ONLY`: unit harness proof only.
- `STATIC ONLY`: type/build/scan/source proof only.
- `NOT VERIFIED`: not exercised; exact reason required.
- `BLOCKED`: required credential/service/environment unavailable; exact blocker and next action required.
- `GAP ACCEPTED`: risk owner and follow-up required.

## Required Review Areas

1. Request/auth/context path.
2. Policy evaluation path.
3. Tool/action execution path.
4. Audit logging and redaction path.
5. User/operator error reporting path.
6. Failure containment and fail-closed behavior.
7. Recovery and rollback path.
8. CI, dependency, SBOM, secret-scan, and static-analysis path.
9. Live external capability proof, or explicit `NOT VERIFIED`/`BLOCKED`.

## Current Commands

```bash
npm run test:unit -- --run tests/unit/policyEngine.test.ts
npm run check
npm run verify
npm run live:docker
gitleaks detect --no-banner --redact --source .
git diff --check
```

## Current Report

The current gate report is `reports/policy-control-plane-readiness.md`.

Do not convert its `UNIT ONLY`, `STATIC ONLY`, `NOT VERIFIED`, `BLOCKED`, or `GAP ACCEPTED` entries into green release claims unless new evidence actually exercises the real behavior being claimed.
