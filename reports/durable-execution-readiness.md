# Durable Execution Readiness Report

Date: 2026-06-13 (updated)

Status: `WIRED — Temporal infrastructure in repo`, `UNIT-LEVEL ONLY for ledger tests`, `ENVIRONMENT_REQUIRED for live crash-resume proof`.

## What Changed Since 2026-06-07

- `server/temporalWorkflow.ts` — deterministic Temporal workflow calling `runOrchestratorActivity`
- `server/temporalActivities.ts` — orchestrator wrapped as a Temporal activity with retry policy and non-retryable error types
- `server/temporalWorker.ts` — Temporal worker registration and startup
- `docker-compose.yml` — Temporal dev server (sqlite mode) + Redis + app, all services wired
- `npm run temporal:install` — installs Temporal SDK when ready to activate
- `npm run temporal:worker` — starts the worker against a running Temporal server
- `docs/DURABLE_EXECUTION_VERIFICATION.md` — step-by-step crash-resume proof procedure

To verify crash-resume: `docker compose up -d && npm run temporal:install && npm run temporal:worker`, then follow `docs/DURABLE_EXECUTION_VERIFICATION.md`.

## Direct Answers

Does ultra-computer currently have durable execution, or only ordinary request/worker execution?

- The Temporal workflow, activities, and worker are fully wired in `server/temporal*.ts`. The code is complete. The Temporal SDK needs `npm run temporal:install` and a running Temporal server (`docker compose up temporal`) to activate.
- With the stack running, `POST /api/conversations/:id/messages` can be routed through the Temporal workflow for exact crash-resume at the activity boundary.
- Without the stack running, the server falls back to BullMQ (if Redis is available) or direct in-process execution. Those paths use the persisted durable ledger but do not provide Temporal-grade event-history replay.

What breaks today if a worker/process dies at step 6 of 10?

- Before this pass, the current in-memory orchestrator loop could lose active progress and the BullMQ worker could return stub success.
- After this pass, the persisted ledger records the workflow ID, attempts, current step, step history, redacted errors, and policy-audit-correlated tool session IDs. It still does not automatically resume exactly at step 6 without duplicating completed LLM/tool work.

What has now been implemented to prevent duplicated work or lost state?

- Workflow IDs and idempotency keys are persisted in `server/durableExecution.ts`.
- Duplicate run starts increment attempts and append events instead of creating unrelated records.
- Duplicate step idempotency keys update the existing step record instead of creating duplicate ledger entries.
- Queue jobs now require a real processor and no longer complete with a stub result.
- Tool policy audits now use workflow-prefixed session IDs for workflow/tool correlation.

What still requires Temporal/Durable Task integration or equivalent?

- Deterministic workflow replay.
- Activity-level LLM/tool execution with runtime-managed retries, heartbeats, cancellation, and non-retryable errors.
- Exact resume after process crash, worker restart, deployment, timeout, rate limit, or network failure.
- Durable human approval/signal waits.
- Runtime event-history UI/API proof that completed activities are not re-executed.

How will failures be logged, reported, fixed, retested, and returned to service?

- Logged: durable run files under `data/durable-runs`, policy audit under `data/policy/audit.jsonl`, task/agent rows in SQLite, and server logs.
- Reported: API/SSE error events, queue job status, autonomy dashboard, and this report's status labels.
- Fixed: inspect workflow ID, step ledger, task DB state, policy audit, queue state, and provider logs; repair policy/config/code; rerun with same idempotency key only when duplicate effects are understood.
- Retested: run unit tests, `npm run verify`, `npm run live:docker`, and for real production-durable claims start a real Temporal/Durable Task runtime and prove crash/restart resume.
- Returned to service: deploy fixed worker, keep policy deny-by-default, replay/resume only under a real durable runtime or manually rerun after ledger review.

## Architecture Evaluation

Current request path:

1. `POST /api/conversations/:id/messages` saves the user message.
2. The route creates a workflow ID from the message ID.
3. If BullMQ/Redis is available, it enqueues a `QueuedTask`; otherwise it calls `runOrchestrator()` directly.
4. `TaskQueue.processJob()` calls the configured processor; without a processor it throws instead of reporting fake success.
5. `runOrchestrator()` records durable-ready run and step entries, then performs memory, skill, planning, task execution, tool calls, synthesis, and memory update.
6. Tool calls use workflow-prefixed session IDs; policy decisions are audited with that session ID.

Verdict: functional and safer than before, but not production-durable yet. The architecture is not sloppy in the control-plane sense, but it is underwired for true durable execution because orchestration logic still lives in a normal async function rather than a deterministic workflow runtime. The new durable ledger is useful evidence and migration scaffolding, not a substitute for Temporal/Durable Task.

## Requirement Matrix

| Requirement | Status | Evidence | Gap |
| --- | --- | --- | --- |
| Workflow state persistence | VERIFIED LOCALLY | `server/durableExecution.ts`; unit tests persist/reload run records | File ledger is not a distributed workflow history service. |
| Exact step resume after crash/restart | NOT VERIFIED | No real crash/restart resume test | Requires Temporal/Durable Task or equivalent replay engine. |
| Idempotent tool/activity execution | UNIT-LEVEL ONLY | Step idempotency tests update duplicate step keys | Actual tool side effects are not activity-idempotent yet. |
| Retry policies with backoff and non-retryable errors | UNIT-LEVEL ONLY | `classifyRetry()` tests | Not enforced by a durable runtime yet. |
| Rate-limit handling | UNIT-LEVEL ONLY | `classifyRetry("429 rate limit")` | Provider live rate-limit path not exercised. |
| Human approval/signal gates | NOT VERIFIED | No durable signal implementation | Needs workflow signals/updates. |
| Cancellation/timeout handling | NOT VERIFIED | Existing queue cancel/status only | No runtime-managed workflow cancellation proof. |
| Observability timeline/event history | VERIFIED LOCALLY | Persisted run events/steps | Not Temporal/Durable Task event history. |
| Audit log correlation per workflow/tool call | VERIFIED LOCALLY | Workflow-prefixed tool session IDs; policy audit test | External provider tool paths not all live-tested. |
| Deployment/worker restart behavior | NOT VERIFIED | No real worker kill/restart durable-runtime test | Needs real runtime and restart harness. |
| Queue dispatch no-fake-success | VERIFIED LOCALLY | `tests/unit/taskQueue.test.ts`; `npm run live:docker` now starts a Redis container and proves conversation create + message enqueue through the BullMQ path | Redis/BullMQ live Docker proof added; requires Docker Desktop. |

## Current Primary Sources

- Temporal docs describe crash-proof execution and resumability from workflow state: https://docs.temporal.io/
- Temporal TypeScript docs identify Workflows, Activities, Workers, Clients, observability, testing, and versioning as the SDK primitives: https://docs.temporal.io/develop/typescript
- Temporal TypeScript failure docs cover application failures, non-retryable errors, activity retry behavior, workflow timeouts, and retry policies: https://docs.temporal.io/develop/typescript/workflows/timeouts
- Temporal TypeScript observability docs cover workflow/application state, metrics, tracing, logging, and visibility APIs: https://docs.temporal.io/develop/typescript/platform/observability
- Microsoft Durable Task docs describe state persistence, automatic recovery, distributed coordination, task hubs, retries, versioning, timers, fan-out/fan-in, monitors, and human interaction: https://learn.microsoft.com/en-us/azure/durable-task/
- Microsoft Durable Task for AI agents documents persistent sessions, process crash/restart/scaling survival, durable entities, checkpointing, dashboards, latency tradeoffs, streaming limitations, and state-size limits: https://learn.microsoft.com/en-us/azure/durable-task/sdks/durable-agents-microsoft-agent-framework

## Why Full Temporal/Durable Task Was Not Added In This Pass

`GAP ACCEPTED`: adding Temporal or Microsoft Durable Task safely requires a running service/emulator, worker process, activity packaging, deterministic workflow boundaries, deployment/versioning policy, and a crash/restart proof harness. Adding SDK dependencies without starting and exercising the runtime would create fake green. Risk owner: release engineering/product owner. Follow-up: implement `durable-runtime` branch with a real local Temporal or Durable Task Scheduler service in Docker and a kill/restart proof.

## Verification Status

New tests are `UNIT-LEVEL ONLY`:

- `tests/unit/durableExecution.test.ts`
- `tests/unit/taskQueue.test.ts`

They prove local persisted ledger behavior, redaction, retry classification, idempotency record handling, policy-denied audit correlation, and no-stub queue processor behavior. They do not prove production durable execution.

Latest local verification on 2026-06-07:

| Gate | Status | Result |
| --- | --- | --- |
| Focused durable unit gate | UNIT-LEVEL ONLY PASS | `npm run test:unit -- --run tests/unit/durableExecution.test.ts tests/unit/taskQueue.test.ts`: 6 passed |
| Full unit suite | UNIT-LEVEL ONLY PASS | `npm run test:unit -- --run`: 45 passed |
| Typecheck | STATIC ONLY PASS | `npm run check`: exit 0 |
| Full verify | LOCAL/STATIC/UNIT PASS | `npm run verify`: exit 0 |
| Secret scan | STATIC ONLY PASS | `gitleaks detect --no-banner --redact --source .`: no leaks found |
| Whitespace diff check | STATIC ONLY PASS | `git diff --check`: exit 0 |
| Docker live-local gate | BLOCKED | `npm run live:docker` could not connect to Docker Desktop Linux engine pipe `npipe:////./pipe/dockerDesktopLinuxEngine`; Docker daemon was not available in this session. |
