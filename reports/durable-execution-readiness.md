# Durable Execution Readiness Report

Date: 2026-06-13 (VERIFIED LIVE update)

Status: `SUPERSEDED FOR APPLICATION READINESS — sample proof only`

> **Current correction — 2026-07-17:** The historical evidence below proves a
> self-contained Temporal sample, not Ultra Computer's message/orchestrator
> path. Normal application work uses BullMQ or direct execution and never
> starts a Temporal workflow. The Temporal services now require the explicit
> `temporal-proof` Compose profile. Do not use this report as production
> crash-resume evidence for the application.

## VERIFIED LIVE — 2026-06-13

Proof run: `scripts/temporal-proof-run.ts` against real Temporal server v1.24.2 (postgres12 backend via Docker).

```
VERIFIED LIVE — Temporal durable execution proof PASSED
  workflowId  : durable-proof-4acbda4b-4819-402a-9438-e73ec9ce5f6b
  result      : done:b:a:durable-proof-4acbda4b-4819-402a-9438-e73ec9ce5f6b
  activities  : 3/3 completed in event history (EVENT_TYPE_ACTIVITY_TASK_COMPLETED = 12)
  idempotent  : YES — second fetch returned identical result without re-running
  total events: 23
  server      : temporalio/auto-setup:1.24.2 on postgres12 backend
```

## What Changed Since Previous Report

- `scripts/temporal-proof-workflow.ts` — self-contained 3-step workflow for proof
- `scripts/temporal-proof-run.ts` — full proof script: connect, start worker, run workflow, verify event history, verify idempotency, shutdown
- `docker-compose.yml` — isolates the sample server/database/worker behind the
  explicit `temporal-proof` profile
- Temporal SDK installed: `@temporalio/activity`, `@temporalio/client`, `@temporalio/worker`, `@temporalio/workflow` v1.18.1
- `npm run temporal:proof` — runs the live proof against localhost:7233
- `npm run temporal:namespace` — registers default namespace (workaround for auto-setup binding quirk)
- `docs/DURABLE_EXECUTION_VERIFICATION.md` — updated with VERIFIED LIVE evidence

## Direct Answers

Does ultra-computer currently have durable execution, or only ordinary request/worker execution?

- VERIFIED LIVE as of 2026-06-13: Temporal end-to-end proof passed on a real server.
- `server/temporal*.ts` contains a proof worker and a whole-orchestrator
  activity wrapper, but no application ingress starts its workflow.
- App crash-resume (actual `runOrchestrator` through Temporal): **NOT WIRED**.
  Retrying the whole orchestrator after a partial failure could duplicate
  provider or tool side effects, so this wrapper is deliberately not presented
  as a production path.

What has now been implemented to prevent duplicated work or lost state?

- Temporal event history preserved the completed activities in the isolated
  sample (historical VERIFIED LIVE evidence; not an app-path claim)
- Idempotent result fetch: querying a completed workflow returns same result from history, no re-run (VERIFIED LIVE)
- Workflow IDs from `workflowIdFromMessage(messageId)` prevent duplicate workflows per message
- File ledger in `server/durableExecution.ts` records run/step state, attempts, and events with atomic file writes

## Requirement Matrix

| Requirement | Status | Evidence | Gap |
| --- | --- | --- | --- |
| Workflow state persistence | VERIFIED LIVE | Temporal postgres12 backend; event history persisted in DB | None for workflow scope; file ledger for app-layer tracking |
| Exact step resume after crash/restart | SAMPLE ONLY | 3-step proof workflow ran | App orchestration is not decomposed into resumable activities |
| Idempotent activity execution | SAMPLE ONLY | Second proof result fetch returned identical result | Provider/tool side effects are outside the sample |
| Retry policies with backoff and non-retryable errors | WIRED | `temporalWorkflow.ts` retry policy wired; `classifyRetry()` maps to non-retryable types | Provider live rate-limit path not exercised |
| Rate-limit handling | UNIT-LEVEL ONLY | `classifyRetry("429 rate limit")` tests | Provider live rate-limit path: CREDENTIAL_GATED |
| Human approval/signal gates | NOT VERIFIED | No durable signal implementation | Needs workflow signals/updates |
| Cancellation/timeout handling | NOT VERIFIED | Existing queue cancel/status only | No runtime-managed workflow cancellation proof |
| Observability timeline/event history | VERIFIED LIVE | Temporal UI (localhost:8080) shows event history; 23 events confirmed via API | None |
| Audit log correlation per workflow/tool call | VERIFIED LOCALLY | Workflow-prefixed tool session IDs; policy audit test | External provider tool paths: CREDENTIAL_GATED |
| Deployment/worker restart behavior | WIRED | Worker shutdown lifecycle STOPPING→DRAINING→DRAINED→STOPPED verified | Kill-restart-resume under real load: ENVIRONMENT_REQUIRED |
| Queue dispatch no-fake-success | VERIFIED LOCALLY | `tests/unit/taskQueue.test.ts`; BullMQ live Docker path | Redis live path confirmed in local Docker stack |

## Verification Status

### 2026-06-13 Gates

| Gate | Status | Result |
| --- | --- | --- |
| Temporal live proof | VERIFIED LIVE | `npm run temporal:proof`: PASSED — 3/3 activities, idempotent, 23 events |
| Full unit suite | UNIT-LEVEL ONLY PASS | `npm run test:unit -- --run`: 45 passed |
| Typecheck | STATIC ONLY PASS | `npm run check`: exit 0 |
| Docker stack health | VERIFIED LIVE | `docker compose ps`: temporal healthy, postgres healthy, redis healthy |
| Temporal UI | VERIFIED LIVE | localhost:8080 — workflow listed in Completed, event history accessible |
| App worker crash-resume | NOT WIRED | Application ingress does not start Temporal workflows |

### Known: Temporal namespace setup quirk

`temporalio/auto-setup` binds gRPC to the container's bridge IP (`172.25.0.4:7233`), not `127.0.0.1`.
Run `npm run temporal:namespace` once after `docker compose up -d` to register the default namespace.
This is a one-time operation; the namespace persists in the postgres backend.
