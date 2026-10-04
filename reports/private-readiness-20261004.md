# Private-owner installation and release evidence

Date: 2026-10-04. Target: one private owner, one active queue worker, local Node
24.17 on Windows, Docker Engine 29.5.3 Linux containers, SQLite and a dedicated
Redis 7 queue. Changes are a release candidate for human review; exact automatic
replay of uncertain tool effects remains PARK-0021.

## Observed defects and permanent controls

| Defect / root cause | Escape and class sweep | Regression / receiving control |
|---|---|---|
| Published beta models API returned 500: startup CREATE IF NOT EXISTS never added connection columns. | Fresh DB tests missed the actual published schema; migration markers were mistaken for column readiness. | Historical v0.1.0 SQL fixture; additive transaction/snapshot/readiness; migration idempotency/preservation test and built API upgrade gate. |
| Killed queued work returned success with no answer: unfinished duplicate claim returned without execution, processor always returned completed. | Queue tests accepted a processor return independently of durable terminal state. | Serialized claims, explicit receipt, safe resume/unsafe quarantine; real SIGKILL and answer/job/run assertions. |
| Acknowledged message could miss dispatch: SQLite and Redis admission lacked a persistent bridge. | Successful enqueue was tested, not the persisted-before-dispatch boundary. | FULL-sync SQLite outbox, stable job ID, terminal-state guards, pending-first batching; persisted-boundary fixture with real restart, Redis and inference. |
| Exhaustion/failure diagnostics became successful tasks; historical tasks could execute again. | Browser assertion accepted any nonempty text; task selection included prior conversation tasks. | Structured non-retryable failure, provider completion barrier, current task-ID set; outcome tests, arithmetic and unchanged historical completion timestamps. |
| Gemma received native tools it cannot use; verbose worker prompt yielded acknowledgements. | Provider capability was confused with installed-model capability; basic semantic output was not required. | Ollama model metadata, concise question path, real arithmetic and installed native-tool tests. |
| Code interpreter failed in the standard app container and its UI implied host fallback. | Base Ubuntu image lacked advertised language executables; no exact installer gate exercised them. | Built sandbox image; fail-closed availability; real isolated Python, Node, TypeScript and Bash installation checks. |
| Global Docker cleanup could kill another installation's containers. | Cleanup tested removal, not foreign-container survival. | Owner/process labels and private startup ownership lock; ownership regression plus real own-orphan/foreign-container check. |
| Backup covered SQLite alone; optional environment/cache inflated portable state. | No operator-level receiving recovery test existed. | Offline app lock + drained queue/outbox; manifest checksums; real refusal/tamper/restore/key/artifact checks; reinstallable Laya cache excluded. |
| Installer browser download and SBOM could hang on unrelated cache/network work. | Setup assumed missing browsers; SBOM queried online optional dependency metadata. | Real cached browser launch before bounded download; bounded offline locked-tree SBOM; exact installer and full verification gate. |

## Worked — local receiving evidence

- `npm run setup:private` in an isolated clone installed 822 locked packages,
  found zero npm advisories, built the app/image, generated persistent protected
  keys, started dedicated Redis and verified owner authentication/model APIs
  and four real interpreters returning `4`. Repeating setup preserved identity.
- `npm run verify`: typecheck, 346 unit tests in 50 files, coverage thresholds,
  production build, zero-advisory audit, SBOM and authenticated production smoke.
  Coverage: statements 29.73%, branches 24.01%, functions 31.78%.
- `npm run test:e2e`: 9/9, zero skips, 50.9 seconds. Real local model connection,
  `2+2=4`, `3+3=6`, no re-executed historical task, credential persistence UX,
  connector/upload UI, no-model guidance, governed file access and restart history.
- `npm run test:private-runtime`: actual published-schema upgrade retained its
  sentinel; unauthenticated API returned 401; real Ollama connected. A process
  killed during memory recall recovered in 29.767 seconds, attempts 2, one
  assistant answer `2+2=4`, durable and queue completed. Seeded persisted admission
  before dispatch recovered `3+3=6` in 616ms with terminal completed admission.
  The latter is a declared boundary fixture followed by real services/inference.
- Offline full-state recovery: running app refused backup (`database is locked`),
  changed artifact refused restore (checksum mismatch), restored built app retained
  conversation, artifact, owner/encryption keys and SQLite integrity `ok`. A fresh
  queue project was generated. Derived-data exclusion reduced the archive from
  28,544 files to 10 canonical files with the optional Laya install present.
- Sandbox startup removed an owned stale container while leaving a real container
  labelled for another installation running.
- Real `llama3.1:8b-instruct-q4_K_M` native calculator call returned `4`. Forced
  one-iteration exhaustion then produced failed agent/task/queue and conversation
  error, without a successful exhaustion placeholder.
- A real agent ran a benign Python script that wrote a visible marker before
  sleeping. The app was killed after the marker appeared. Restart produced
  durable `interrupted`, conversation error, failed job and persisted owner
  guidance. The receiving marker stayed at exactly one effect; it was not replayed.
- `npm run live:docker`: Redis dispatch, container destruction/recreation state
  retention, production auth and fail-closed policy/audit boundaries passed.
- CLI adversarial suite: 31 passed, zero failed/skipped. Policy was not broadened
  to make installation or tests pass.
- Optional `npm run setup:laya`: isolated Python 3.12 CPU environment, pinned
  `laya==0.3.20`, torch 2.7.1 CPU, transformers 5.18.0, HF hub 1.33.0, numpy 2.5.3;
  pip reported no broken requirements. Model revision
  `7b928d828b7b0e022f929d9bd2e44165aa270148`; structured routing benchmark 7/8,
  16.99 seconds total, 459–2613ms per case. Enterprise price was misclassified as
  billing. The checkpoint emitted a calibration warning; confidence is advisory.

Receipts and bounded logs are retained in the review workspace. The committed
installation/runtime commands regenerate receiving receipts under `data/`.
Private installation and real message recovery now run in the existing core-e2e
CI job in addition to required cross-platform, Docker, service and security jobs.

## Workload boundary and operational contract

This is an installation/core-workflow test candidate, not a measured enterprise
or multi-owner capacity claim. The diagnostic read sample was 200 requests,
concurrency 5, roughly 3 seconds on a fresh DB without concurrent inference:
p95 20.09ms, p99 21.56ms, zero errors. It is not sustained-load/SLO evidence.
The supported private queue has one active job. The next practical constraints
are local model throughput, SQLite writes and sandbox resource limits.

Work before planning can recover automatically. Work after planning/tool effects
is explicitly interrupted and requires the owner to inspect artifacts before a
new request. Exact activity replay remains PARK-0021. Backups require a stopped
app and drained queue/outbox. Laya is optional and has no action authority.
Paid-provider or third-party credentials were not used to force release proof.
The historical Temporal sample remains separate from normal application messages.
