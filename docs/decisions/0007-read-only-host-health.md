# ADR-0007: Read-only health snapshots outside the command sandbox

Status: Accepted for the private single-owner installation, 2026-10-04.

The owner requested host diagnostics. Chat executed `ls -lah` inside /workspace
and reported that it could not obtain CPU/RAM/GPU/disk/process/Ollama metrics.
Existing shell tests exercised sandbox commands, not this receiving request.
An unconnected example MCP host server exposes broad file/environment access;
connecting it would grant more than this diagnostic task needs.

Add one built-in, policy-audited `host_health` capability with no arguments.
It samples OS CPU counters, reads physical RAM, invokes fixed NVIDIA queries,
reads fixed local disks and process names/PIDs/resident RAM, and GETs only the
loopback Ollama /api/ps endpoint. Commands use fixed structured arguments and
shell:false, with time/output limits. No model-selected host command, URL, path,
credential/environment read, process mutation or network grant is added.
Tool policy retains deny-by-default; the new rule names only host_health.

Known standalone health requests collect and format deterministic data before
model selection, avoiding planning, synthesis, memory calls and hallucinated
measurements. They persist normal queue admission, task/run/tool receipts,
durable terminal status and SSE events. Unknown or multi-action text retains
the agent workflow. Host resource questions require a host_health receipt;
successful sandbox ls is insufficient. Noncanonical explanatory questions stay
in the ordinary text path. A two-second cache and one concurrent collection
bound repeated sampling without creating a background monitor.

Partial snapshots retain Unavailable per metric. A failed Ollama request never
becomes zero models. Process output is capped to the top 12 by resident RAM;
command lines/owners/environments are excluded. A container install labels its
runtime scope explicitly and does not advertise physical-host measurements.
NVIDIA metrics require a supported installed driver/tool. Ollama observes this
machine's default loopback port, not arbitrary remote model providers.

Controls: hostHealthWiring reproduces missing schema/policy before the fix;
hostHealth tests reject hostile arguments and malformed readings, contain
outages, require the correct receipt, and check zero-call chat without a model.
`npm run verify:host-health` checks the installed authenticated queue/chat path,
actual OS/model readings, timestamp, receipt, zero call count and auth denial.
See WHY-0044 and the host-health sections of the readiness reports. These tests
do not convert the existing admission ledger into exact durable workflow replay.
