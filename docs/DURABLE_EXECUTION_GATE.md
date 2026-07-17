# Durable Execution Gate

This gate exists because AI-agent work must not be claimed production-durable when it is only an in-process loop, a local queue, or a demo that loses state on restart.

## Required Evidence Labels

- `VERIFIED LIVE`: a real durable workflow runtime was started and exercised.
- `VERIFIED LOCALLY`: real local behavior was exercised, but not a production durable runtime.
- `UNIT-LEVEL ONLY`: unit harness proof only.
- `STATIC ONLY`: source/config/documentation proof only.
- `NOT VERIFIED`: not exercised; exact reason required.
- `BLOCKED`: required credential/service/environment unavailable; exact blocker and next action required.

## Current Primary Guidance Checked

- Temporal platform docs describe crash-proof execution that resumes from the recorded workflow state, and the TypeScript guide separates Workflows, Activities, Workers, Clients, observability, testing, and versioning: https://docs.temporal.io/ and https://docs.temporal.io/develop/typescript
- Temporal TypeScript failure guidance covers application failures, non-retryable errors, activity retry behavior, workflow timeouts, and retry policies: https://docs.temporal.io/develop/typescript/workflows/timeouts
- Temporal TypeScript observability guidance covers workflow/application state, metrics, tracing, logging, and visibility APIs: https://docs.temporal.io/develop/typescript/platform/observability
- Microsoft Durable Task docs describe durable workflows with state persistence, automatic recovery, distributed coordination, task hubs, retries, versioning, timers, fan-out/fan-in, monitors, and human interaction: https://learn.microsoft.com/en-us/azure/durable-task/
- Microsoft Durable Task for AI agents says durable agent sessions survive process crashes, restarts, and scaling events; it also calls out durable entities, checkpointing, dashboards, latency tradeoffs, streaming limits, and state-size limits: https://learn.microsoft.com/en-us/azure/durable-task/sdks/durable-agents-microsoft-agent-framework

## Current Commands

```bash
npm run test:unit -- --run tests/unit/durableExecution.test.ts tests/unit/taskQueue.test.ts
npm run check
npm run verify
npm run live:docker
gitleaks detect --no-banner --redact --source .
git diff --check
```

## What Is Implemented Now

- `server/durableExecution.ts` persists workflow/run records under `data/durable-runs` by default.
- Each run has a workflow ID, idempotency key, conversation/message correlation, execution mode, attempts, step records, and event history.
- Step records support idempotency-key updates instead of duplicate entries.
- Error details and metadata are redacted before persistence.
- Retry classification distinguishes policy denial, validation, auth, rate limit, timeout, transient network, and unknown errors.
- `server/taskQueue.ts` no longer reports stub success. A BullMQ job must have a real processor configured or it fails.
- `server/routes.ts` configures the queue processor to call `runOrchestrator`; when Redis is available, new messages enqueue real orchestrator work. When Redis is unavailable, the route falls back to direct in-process execution and that fallback is not durable proof.
- `server/orchestrator.ts` records durable-ready steps around memory recall, skill matching, planning, DAG tasks, tool calls, synthesis, swarm run, and error handling. Tool policy audits use workflow-prefixed session IDs for correlation.

## What Is Not Implemented Yet

- The normal application message path is not backed by Temporal, Microsoft
  Durable Task Scheduler, or an equivalent workflow runtime. The separate
  `service-integration` CI job starts a Temporal sample and worker to prove
  infrastructure connectivity only; it does not make application messages
  crash-resumable.
- The orchestrator does not yet resume exactly at step 6 of 10 after a crash. It records the last known step, but exact replay/resume requires a real deterministic workflow runtime or a larger internal workflow engine.
- LLM calls and tool activities are not yet isolated as durable activities with runtime-managed retries, heartbeats, cancellation, and non-retryable error semantics.
- Human approval/signal gates are not durable waits yet.
- Deployment versioning for in-flight workflows is not implemented.

## Required Migration Path

1. Keep workflow code deterministic and move fallible work into activities: model calls, tool calls, connector calls, browser actions, filesystem writes, GitHub/MCP calls, and provider calls.
2. Use `workflowIdFromMessage(messageId)` or a successor as the external workflow ID and keep idempotency keys stable across retries.
3. Pass the workflow ID through tool execution so policy audit records and workflow history correlate.
4. Map `classifyRetry()` categories into Temporal/Durable Task retry policies, including non-retryable policy, validation, and auth failures.
5. Add human approval as signals/updates rather than polling or sleeping inside the agent loop.
6. Add runtime proof only when a real Temporal/Durable Task runtime starts, executes a workflow, survives worker restart/crash, resumes without duplicated completed activities, and exposes event history.

## If A Worker Dies At Step 6 Of 10

Current status after this pass: the persisted ledger can show the workflow ID, last recorded step, redacted error metadata, and status. It does not guarantee exact continuation from step 6. Operators must inspect the durable run record, policy audit, task DB rows, and logs, then rerun or repair with idempotency awareness.

Production-durable target: the workflow runtime resumes at the next uncompleted activity using event history, does not re-execute completed activities, applies retry/non-retryable policy, and reports progress through runtime visibility APIs.
