# Durable Execution Verification

> **Scope correction — 2026-07-17:** This document preserves historical proof
> of a self-contained Temporal sample. It does not prove application
> crash-resume: normal Ultra Computer messages use BullMQ/direct orchestration
> and do not start this workflow. Use the explicit `temporal-proof` Compose
> profile only for the sample.

## VERIFIED LIVE — 2026-06-13

**Proof run:** `scripts/temporal-proof-run.ts` against real Temporal server v1.24.2

```
VERIFIED LIVE — Temporal durable execution proof PASSED
  workflowId  : durable-proof-4acbda4b-4819-402a-9438-e73ec9ce5f6b
  result      : done:b:a:durable-proof-4acbda4b-4819-402a-9438-e73ec9ce5f6b
  activities  : 3/3 completed in event history (EVENT_TYPE_ACTIVITY_TASK_COMPLETED = 12)
  idempotent  : YES — second fetch returned identical result without re-running
  total events: 23 (WorkflowStarted + 3x Scheduled/Started/Completed + WorkflowCompleted + WorkflowTasks)
  server      : temporalio/auto-setup:1.24.2 on postgres12 backend
```

### What was proved

1. **End-to-end workflow dispatch** — Client → Temporal server → Worker → Activities → Result
2. **3-step sequential activity chain** — stepA → stepB → stepC each passing output to next
3. **Event history persistence** — All 3 `ACTIVITY_TASK_COMPLETED` events recorded in server
4. **Idempotent result fetch** — Querying a completed workflow twice returns same result, no re-execution
5. **Clean worker shutdown** — STOPPING → DRAINING → DRAINED → STOPPED lifecycle honored

### To re-run the proof

```bash
# 1. Start the stack
docker compose --profile temporal-proof up -d

# 2. Register the default namespace (auto-setup uses container IP, not localhost)
npm run temporal:namespace

# 3. Run the live proof
npm run temporal:proof
```

---

## Application integration status

The following proof components exist, but are not the normal application path:
- `server/temporalWorkflow.ts` — deterministic Temporal workflow
- `server/temporalActivities.ts` — orchestrator wrapped as a Temporal activity
- `server/temporalWorker.ts` — Temporal worker registration with NativeConnection

Starting this worker alone does not route application messages through
Temporal. The whole-orchestrator activity also lacks safe, individually
resumable side-effect boundaries and must not be described as production
durability.

### Start the proof worker

```bash
RUN_TEMPORAL_WORKER=1 npx tsx server/temporalWorker.ts
```

## Historical app crash-resume procedure — not valid proof

The steps below are retained to explain the prior claim, but sending a message
to the REST API does not create a Temporal workflow. They must not be used as a
verification gate until application ingress uses a workflow whose provider and
tool side effects are decomposed into idempotent activities.

### 1. Start the full stack

```bash
docker compose --profile temporal-proof up -d
npm run temporal:namespace
```

Wait for all services to be healthy:
```bash
docker compose ps
```

### 2. Start the Temporal worker

```bash
TEMPORAL_ADDRESS=localhost:7233 RUN_TEMPORAL_WORKER=1 npx tsx server/temporalWorker.ts
```

### 3. Send a test message via the app

```bash
curl -X POST http://localhost:5000/api/conversations \
  -H "Authorization: Bearer $ULTRA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"title":"durable-proof"}'
# Copy the returned id

curl -X POST http://localhost:5000/api/conversations/<id>/messages \
  -H "Authorization: Bearer $ULTRA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"content":"durable execution proof","role":"user"}'
```

### 4. Kill the worker mid-execution

Press Ctrl+C on the worker process.

### 5. Check the Temporal UI

Open http://localhost:8080

Find your workflow in the "Running" or "Failed" list. Note the last completed activity in the event history.

### 6. Restart the worker

```bash
TEMPORAL_ADDRESS=localhost:7233 RUN_TEMPORAL_WORKER=1 npx tsx server/temporalWorker.ts
```

Temporal can recover workflows it owns, but the REST message above is not one
of those workflows in the current application.

### 7. Verify in the UI

No application workflow is expected from that REST request. Only the isolated
proof script can produce the sample workflow described above.

## Evidence labels

- Proof script PASSED → `VERIFIED LIVE: durable execution 3-step workflow`
- Event history: 3/3 ACTIVITY_TASK_COMPLETED → `VERIFIED LIVE: event sourcing`
- Idempotent result fetch → `VERIFIED LIVE: idempotent activity execution`
- App worker integration → `NOT WIRED: no ingress starts the workflow`
- App crash-resume → `NOT VERIFIED`

## What the sample demonstrates

Temporal's event sourcing means:
- Crashed workers resume from the last completed activity boundary
- Completed activities are replayed from history, not re-executed
- Retry policy (`maximumAttempts: 5`, `nonRetryableErrorTypes`) maps to `classifyRetry()` categories
- The sample's workflow ID prevents duplicate starts for that sample. The
  application separately uses a durable run claim to prevent a duplicate
  message from entering orchestrator side effects.

## Known: Temporal namespace setup quirk

`temporalio/auto-setup` binds gRPC to the container's bridge IP (`172.25.0.4:7233`), not `127.0.0.1`.
The bundled setup script can't connect via `localhost:7233` from inside the container.
Workaround: `npm run temporal:namespace` registers the default namespace from the host after startup.
This is a one-time setup step; the namespace persists in the postgres backend.

## What still requires a live environment to verify

- Rate-limit live behavior (requires a provider returning 429)
- Multi-worker scaling (requires multiple worker replicas)
- Application workflow dispatch and crash-resume (not implemented)
