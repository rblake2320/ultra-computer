# Contributing

1. Create a focused branch.
2. Install with `npm ci`.
3. Make the smallest change that solves the issue.
4. Run `npm run check`, `npm run test:unit -- --run`, and `npm run build`.
5. For CLI, webhook, auth, or sandbox changes, also run
   `npx tsx tests/adversarial-security.test.ts --cli-only`.
6. Update README or CHANGELOG for user-facing behavior.

Do not weaken tests, lint/type gates, auth, HMAC verification, or sandbox
containment to make a change pass.
