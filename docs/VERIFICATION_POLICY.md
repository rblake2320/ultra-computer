# Verification Policy

## Truthful Evidence Rule

Testing and verification must not be faked, mocked, simulated, or represented as production proof unless the check actually exercises the real behavior being claimed.

Evidence labels are mandatory when reporting status:

| Label | Meaning |
| --- | --- |
| `VERIFIED LIVE` | Exercised against the real external capability or production-equivalent service being claimed. |
| `VERIFIED LOCALLY` | Exercised real local code and processes without faking the behavior being claimed. |
| `UNIT-LEVEL ONLY` | Exercised a unit harness, stub, fake, mock, fixture, or isolated evaluator. This proves only the unit contract. |
| `STATIC ONLY` | Typecheck, lint, build, dependency, or source inspection evidence only. |
| `NOT VERIFIED` | Not exercised. The exact reason must be stated. |
| `BLOCKED` | Could not be exercised because a required account, secret, service, environment, permission, cost approval, or external condition was unavailable. The exact blocker must be stated. |

## Standing Constraints

- Do not claim `clean`, `working`, `green`, or `production-ready` for a behavior that was only mocked, stubbed, simulated, or unit-tested.
- Do not round `UNIT-LEVEL ONLY`, `STATIC ONLY`, `NOT VERIFIED`, or `BLOCKED` up to `VERIFIED LIVE`.
- If a test uses fake data, mocked providers, local fixtures, stubs, or evaluator-only checks, label it explicitly as unit-level proof only.
- If a real external capability cannot be exercised locally or remotely, mark it `BLOCKED` or `NOT VERIFIED` with the exact reason.
- Reports must separate repository gate health from live product proof. A passing `npm run verify` is a local repository gate, not proof that every external provider, connector, browser workflow, MCP server, A2A peer, or production deployment path works live.

## Policy-System Reporting

For policy-governed tools, unit tests may prove that policy rules allow or deny a constructed context. They do not prove the live external capability unless the test performs the real operation through the governed route.

Examples:

- `tests/unit/policyEngine.test.ts` is `UNIT-LEVEL ONLY` evidence for policy evaluation and redaction contracts.
- `npm run check` is `STATIC ONLY` evidence for TypeScript compatibility.
- `npm run smoke:prod` is `VERIFIED LOCALLY` evidence that the production build starts and health responds locally.
- A real GitHub MCP mutation/read check is `VERIFIED LIVE` only if it calls GitHub through the governed connector using real credentials and confirms the real response.
