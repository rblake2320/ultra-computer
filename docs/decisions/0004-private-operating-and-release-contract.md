# ADR-0004: Operate and release one private installation

Status: accepted for implementation, 2026-10-04. Supersedes the unmeasured
operating boundary in ADR-0002; the effect-quarantine contract remains.

## Decision

Use a dedicated installation and queue, one owner and one active worker. A
private Node supervisor holds an exclusive OS-released lease, restarts its own
child after crashes or sustained unhealthy status, retries missing Docker/Redis,
and keeps four bounded logs. Stop uses an instance-bound private request and
confirms the outcome; maintenance refuses unfinished admissions. Windows login
startup belongs to the current user's named installation and can be removed.
No stored PID is used to kill a process during ordinary lifecycle operations.

Readiness targets: five read connections; 3 reads/sec sustained and 5/sec for a
10-second burst; 1,000 retained conversations and 10,000 messages; one active
inference plus a three-job burst; API p95 <250ms/p99 <1,000ms; job p95 <30s/p99
<60s; zero unexpected request errors; observed controlled availability >=99%;
app recovery <60s and Redis recovery <30s; warmed RSS growth <96MiB and RSS <1GiB.
The local release run lasts at least 600 seconds with varied real-model answers.
Numbers certify only that run and infrastructure, not monthly availability.
The next bottleneck is local inference; the API owner limits are 500 requests
and 20 new messages per minute. Worker concurrency remains one.

CI runs a distinct 60-second receiving regression using the existing 270M test
model and repeated 2+2; it is not the production model/workload certificate.
Real-model acceptance uses the installed 4B model. The 270M model produced an
incorrect 1+1 answer with a format suffix and is not certified as a production
reasoning model. Format suffixes preserve the direct short-question route.

Refuse occupied app ports before installation verification so a second process
cannot mistake another installation's health for its own. Restore keeps owner
and encryption keys but reserves distinct free ports and a new private queue.

Build a clean committed source/build/SBOM archive, with source integrity checks.
GitHub Actions creates a cryptographic build attestation scoped to the repository,
workflow and commit. Verify it before extracting; installer hashes detect source
tampering. Candidate artifacts carry their tested scope. The owner's shell
verification supplies the final human acceptance required by Constitution R14.

## Controls and consequences

`test:private-production` exercises the built installation and real supervisor,
owner denial, occupied-port/duplicate refusal, data volume, inference and read
traffic, process kill, Redis outage and receiving work after recovery. Restore
receiving checks validate history, encrypted-key continuity and real inference.
Private archives and state never enter the distribution. CI retains failures.

This is a single-host private deployment. A host reboot/login, Docker Desktop
or Ollama outage can make it unavailable; uncertainty after effects stays visible
for owner inspection. Offline full-state backups require a drained/stopped app.
Capacity for additional owners or an unattended/public SLA requires a new
acceptance contract. See the dated machine-generated operating receipt.

Sources: [Node child processes](https://nodejs.org/api/child_process.html),
[Windows login startup](https://learn.microsoft.com/windows/win32/setupapi/run-and-runonce-registry-keys),
[GitHub build attestations](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations).
