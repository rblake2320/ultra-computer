# AGENTS.md

## Commands
- Install: `npm ci`
- Build: `npm run build`
- Full gate: `npm run verify`
- SBOM: `npm run sbom`
- Dev: `npm run dev` (serves on port 5000)
- Production smoke: set `ULTRA_API_KEY`, `SLACK_SIGNING_SECRET`, `GITHUB_WEBHOOK_SECRET`, and `ENCRYPTION_KEY`, then run `npm start`

## Verification
- Diagnostics: `npm run doctor`; add `-- --live` only for intentional real
  probes against every enabled model.
- Authenticated local E2E: `npm run test:e2e` (eight tests; requires real Ollama
  for the two inference/model-connection paths; zero skips are required for a
  full local claim).
- Typecheck: `npm run check`
- Unit tests: `npm run test:unit -- --run`
- Policy tests: `npm run test:unit -- --run tests/unit/policyEngine.test.ts`
- Coverage: `npm run test:coverage`
- Build: `npm run build`
- Security audit: `npm run audit`
- Production smoke: `npm run smoke:prod` after `npm run build`
- Docker live-local gate: `npm run live:docker`
- Durable execution unit gate: `npm run test:unit -- --run tests/unit/durableExecution.test.ts tests/unit/taskQueue.test.ts`
- CLI/security changes: `npx tsx tests/adversarial-security.test.ts --cli-only`
- Operational readiness gate: follow `docs/OPERATIONAL_READINESS_GATE.md` and update `reports/policy-control-plane-readiness.md` when policy/control-plane architecture changes.
- Durable execution gate: follow `docs/DURABLE_EXECUTION_GATE.md` and update `reports/durable-execution-readiness.md` when agent execution, queueing, retries, checkpoints, or tool-call orchestration changes.
- Evidence rule: follow `docs/VERIFICATION_POLICY.md`. Never report mocked, stubbed, simulated, fixture-based, or unit-only checks as production proof.
- Status labels: use `VERIFIED LIVE`, `VERIFIED LOCALLY`, `UNIT-LEVEL ONLY`, `STATIC ONLY`, `NOT VERIFIED`, or `BLOCKED` with an exact reason.

## Decision and Change Records
- `CHANGELOG.md` records what changed; `WHY.md` records why consequential behavior exists.
- Add an ADR under `docs/decisions/` for architecture, public API, schema, authentication/authorization, model-routing, security-boundary, deployment, or operational-guarantee decisions.
- Record intentional deferrals in `PARKED.md` with the current risk, owner, reactivation condition, and next decision. Do not bury known gaps in TODO comments.
- Link the WHY entry, ADR, verification evidence, and parked items from the pull request. Preserve history by superseding decisions instead of rewriting them.
- Never delete a rationale or parked record merely because implementation changed; close or supersede it with links to the replacement and evidence.

## Code Style
- TypeScript ESM imports use `.js` extensions for local server modules.
- Keep dev-mode auth passthrough when `ULTRA_API_KEY` is unset.
- Use `resolveInside` from `server/pathSafety.ts` for sandbox path containment.

## Boundaries
- Generated protobuf files: `shared/generated/**`.
- Audit evidence images under `audit/*.png` are historical artifacts.
- Do not read, print, or commit `.env*`, private keys, webhook secrets, or API keys.
- Never capture a DOM/accessibility snapshot while a credential field is
  populated; inspect form structure with value-excluding metadata and clear
  any credential exposed to tool output before continuing.
- Agent/tool permissions live in `policies/*-access.json` and are deny-by-default. Do not broaden policy rules to make a feature or test pass; wire the feature through the policy evaluator and keep the policy as the hard constraint.
- Do not round policy evaluator tests up to live tool proof. They are unit-level evidence unless the real governed route and real external capability were exercised.
- Do not call agent execution production-durable unless a real durable runtime such as Temporal, Microsoft Durable Task, or an equivalent is started and crash/restart/resume behavior is exercised. BullMQ, local JSON ledgers, and unit tests are useful boundaries but not exact workflow replay proof.
- Do not describe the application spend ledger as provider invoice control.
  Unknown paid pricing fails closed, the configured limit cannot exceed $20,
  and provider-side quotas remain a separate control.

## Non-Obvious Patterns
- Raw request bodies are required for Slack/GitHub HMAC verification.
- Sandbox file APIs must reject prefix siblings such as `sandbox2`, not just `../` traversal.
- Browser clients use the owner-access gate, which retains `ULTRA_API_KEY` only
  in tab-scoped `sessionStorage`; EventSource clients exchange it for a
  short-lived, path-bound stream token and never put the long-lived key in a
  URL.
- Policy decisions are audited to `data/policy/audit.jsonl` with command, URL, path, and metadata redacted before write.
- Never replace a proven HTML sanitizer with regex-based sanitization. Rendering generated HTML requires a maintained sanitizer, explicit URL policy, attribute escaping, and regression tests.
- Never add a model by hard-coded name alone. Add or update discovery, capability metadata, lifecycle handling, provider-native compatibility, and tests; discovery alone is not proof that a model works.
- Never pass request, model, or agent text to a system shell. CLI execution must
  select a fixed allowlisted executable, pass a structured argument array with
  `shell: false`, and keep the process working directory server-controlled.
- Credential forms must expose an explicit persistence action and explain when
  a secret is stored. Do not hide secret persistence behind an unlabeled card
  click or imply that an unsaved credential is already configured.

## Versions
- Node.js 24 is the container and CI baseline; Node 22 remains supported.
- TypeScript `7.x`.
- Express 5, React 18, Vite 8, Vitest 4.
- Temporal SDK `1.20.3` — workflow isolation model: workflow code in its own bundleable file (`.ts`), never mixed with activity or runner code.
- BullMQ `^5.78.0` — task queue, requires Redis on `REDIS_URL`.

## Runtime Stack (Docker Compose)

`DATABASE_PATH` is the only supported SQLite path override. Keep production
state on `/app/data/ultra_computer.db`; do not reintroduce
`ULTRA_DATABASE_PATH`. Optional surfaces register only when
`ULTRA_EXPERIMENTAL=1`.

```
docker compose up -d          # starts redis, temporal-postgres, temporal, temporal-ui, app
docker compose --profile tunnel up -d   # also starts cloudflared
```

Services and ports:
| Service | Internal | Host-mapped |
|---------|----------|-------------|
| app (Node.js) | 5000, 50051 | 5000, 50051 |
| redis | 6379 | 6379 |
| temporal (gRPC) | 7233 | 7233 |
| temporal-ui | 8080 | 8080 |
| temporal-postgres | 5432 | not exposed |
| cloudflared | — | none (outbound only) |

First-run only: `npm run temporal:namespace` registers the `default` namespace.
Temporal healthcheck uses the container's bridge IP, not localhost — `hostname -i` inside the container.

## Durable Execution Architecture

Two layers:
1. **BullMQ** — task queue for every inbound message. Falls back to direct in-process execution when Redis is unavailable.
2. **Temporal** — durable workflow engine for long-running or crash-sensitive tasks. Worker in `server/temporalWorker.ts`, workflow in `server/temporalWorkflow.ts`, activities in `server/temporalActivities.ts`.

Proof: `npm run temporal:proof` — runs a 3-step workflow, verifies 3 `ACTIVITY_TASK_COMPLETED` events in history (type=12), verifies idempotent result fetch.

Evidence: `docs/DURABLE_EXECUTION_VERIFICATION.md`, `reports/durable-execution-readiness.md`.

## Cloudflare Tunnel (Public Access)

Set `TUNNEL_TOKEN` in `.env`, then `docker compose --profile tunnel up -d`.
The `cloudflared` service is gated behind the `tunnel` profile — it does not start with plain `docker compose up -d`.
Setup guide: `docs/CLOUDFLARE_SETUP.md`.

Review rubric: see `code_review.md`.
