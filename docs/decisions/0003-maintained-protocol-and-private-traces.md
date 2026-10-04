# ADR-0003: Maintained MCP client and private execution diagnostics

Status: Accepted implementation; human release review required
Date: 2026-10-04
Related: WHY-0032, ADR-0002

## Context

The private owner installer already supports local inference and durable task
admission. The handwritten remote MCP client accepts only 2025-11-25, incorrectly
advertises sampling, parses only the first SSE event and exposes transport
headers in registry snapshots. The modern protocol adds stateless discovery.
Execution outcomes need receiving records that can correlate queue work with
model requests without collecting owner content.

## Decision

Use pinned MCP client SDK 2.3.0 to negotiate modern discovery and supported
legacy initialization. Keep inbound Ultra Computer MCP explicitly 2025-11-25.
Keep governed egress, a 15-second request deadline, a 2 MiB response limit and
zero redirects. Transport credentials stay in private SDK objects. Advertise
no unimplemented sampling, roots or elicitation. Required owner input fails
explicitly instead of granting permission. Close clients during shutdown.

Use stable OpenTelemetry 2.11 trace packages with a local metadata exporter.
Record workflow/model span IDs, parent identity, duration, outcome, provider
enum and hashed configured IDs. Drop prompts, outputs, URLs, exception details
and arbitrary attributes. Export only the application's three allowed span
names. Retain four 256 KiB JSONL files, under the private database directory.
The existing owner middleware protects `/api/diagnostics/traces`. Export failure
is visible in diagnostics. No collector, new listener or external exporter.

Upgrade Transformers.js to pinned 4.3.0 with its native CPU ONNX dependency.
Retain the same MiniLM model/cache and embedding version; benchmark compatibility
against 4.2.0 rather than assert a quality or speed gain from the library update.

Constrain planner formatting through provider JSON schema, then independently
validate at most eight tasks, field lengths, unique IDs, existing dependencies
and an acyclic graph. Invalid plans use the existing safe single-task fallback.
Separate cached responses by configured model/provider, sampling parameters,
format/schema, route and non-user instructions. Semantic similarity cannot
substitute a response under a different response contract.

## Alternatives and consequences

Auto-instrumenting HTTP or forwarding traces to a hosted service could collect
credentials/content and widens the private deployment. Installing a second
durable runtime does not solve this deployment's measured problems. Upgrading
the shared Ollama daemon or replacing working Laya for novelty risks unrelated
host workloads. Small local models may still generate logically invalid JSON:
format constraints do not certify reasoning or grant execution authority.

## Verification

Official SDK modern/SSE calculator and resource receiving tests; legacy session,
authentication and redirect negatives; offline cached CPU embeddings; real local
provider task plan and schema/cache isolation; real provider rejection trace;
private queue/model parent correlation; bounded rotation and canary exclusion;
all existing installer, browser and protected release gates.
