# ADR-0002: Private owner installation and truthful outcomes

Status: Accepted implementation; human release review required
Date: 2026-10-04
Related: WHY-0030, PARK-0021

## Context

The release target is one private owner. A beta database started healthy but
failed model reads. A process kill left a running ledger and no answer while
BullMQ certified completion. A non-tool Ollama model received native tools;
iteration exhaustion was persisted as success. The standard app container had
no Docker backend for code execution.

## Decision

Run a host Node process with a dedicated Redis container. Generate persistent
protected owner/encryption keys, bind to loopback and build a code image. Keep
the existing Compose/sample deployment separate; do not add a host Docker socket
mount to manufacture sandbox availability.

Use additive transactional migration based on actual columns, retain old rows,
snapshot legacy on-disk state and query required columns in readiness. SQLite
uses WAL and FULL synchronization for canonical writes.

Persist accepted private messages in an outbox before acknowledgement. Deliver
with stable BullMQ IDs and one worker. Only explicit completion receipts finish
jobs; terminal admissions cannot be resurrected by redispatch.

Serialize durable claims across processes. Resume a dead owner's run only when
all recorded steps are acceptance, memory recall or skill matching. Quarantine
later interruptions, reconcile task/agent failures and persist visible guidance.
Completed duplicates return their receipt. Never automatically repeat unknown
side effects. This supersedes direct production fallback and unfinished-duplicate
success; exact activity replay remains PARK-0021.

Reject empty/incomplete provider responses and loop exhaustion as success. Run
only current-message task IDs. Discover installed Ollama native tool capability.
Scope sandbox cleanup to installation/process ownership; private startup under
the state lock may reclaim only its installation's stale containers.

Take offline backups under the same ownership lock with Redis/outbox drained.
Preserve canonical state and encryption continuity; verify checksums before
restoring into empty state. Exclude Redis completed-job/cache history and derived
Laya environment/cache. Laya is advisory CPU classification with no action
authority, pinned artifacts and structured input.

## Alternatives and consequences

A Docker socket mount widens host authority. Full-agent retry can duplicate
effects. Migrating all application work to Temporal now expands the installer
and execution redesign. This private contract exposes uncertain interruption
to its owner for review instead. One active worker bounds the install; multiple
owners/replicas need a new deployment/capacity contract. Backups require downtime
and a drained queue. Laya confidence is uncalibrated for an affected checkpoint.

## Controls

Historical schema fixture; migration, durable claim, exhaustion, dispatch and
ownership regressions; arithmetic browser assertions; `setup:private` and
`test:private-runtime`; real full-state receiving checks; existing Docker/service
and dependency/secret gates. Private install and message recovery are steps in
the existing core-e2e CI job. The dated report records the measured outcomes.
