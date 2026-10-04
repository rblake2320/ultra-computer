# Recent technology upgrades for the private owner release

Research window: May 4–October 4, 2026. Implementation: ADR-0003 / WHY-0032.

| Adopted release | Primary source and publication | Applied benefit |
|---|---|---|
| Transformers.js 4.3.0 | [September 16 release](https://github.com/huggingface/transformers.js/releases/tag/4.3.0) | Update the existing CPU inference engine and ONNX runtime; preserve cached MiniLM embeddings. |
| MCP client SDK 2.3.0 | [October 2 release](https://github.com/modelcontextprotocol/typescript-sdk/releases/tag/v2.3.0), [July 28 protocol](https://blog.modelcontextprotocol.io/posts/2026-07-28/) | Modern discovery and legacy negotiation, correct SSE parsing, SDK result validation, private transport state and governed traffic. |
| OpenTelemetry 2.11.0 | [August 31 release](https://github.com/open-telemetry/opentelemetry-js/releases/tag/v2.11.0) | Correlate real queued execution with local model requests and distinguish failed attempts, without exporting owner content. |

Exact packages and transitive artifacts are in package-lock.json and the
CycloneDX SBOM. CPU installation retains the skip-optional-CUDA profile.
Transformers' separate experimental structured-generation processor is not
installed: this app generates through provider adapters, not a browser pipeline.

## Observed controls

- **Worked:** Offline cached MiniLM on 4.2.0 and 4.3.0: 384 finite normalized
  values and repeat cosine greater than 0.9999. The relevant recovery document
  scores 0.60085, versus a lexical distractor at 0.32470 and unrelated text at
  0.00851. Scores differ by less than 0.000001 between versions. These establish
  compatibility; the library upgrade is not a measured quality/speed gain.
- **Worked:** Actual official SDK modern server, forced SSE responses, calculator
  result 4 and receiving resource contents. Invalid arguments fail. Legacy
  session and protocol headers remain negotiated. Authentication failure does
  not downgrade; a redirect reaches its destination zero times. Registry
  snapshots contain no configured authorization header.
- **Worked:** A real installed `gemma3:latest` 4B provider returns a two-task
  plan with the independently required dependency. Plain and JSON-schema calls
  with the same prompt stay isolated. A nonexistent provider model produces a
  failed trace. No paid provider was called.
- **Worked:** Graph admission rejects duplicate IDs, absent/duplicate
  dependencies, cycles, wrong types and more than eight tasks.
- **Worked:** Metadata canaries in attributes, events and exception/status text
  are absent from retained traces; four rotated files remain bounded and parse.
  An occupied file path produces an observable exporter failure.
- **Worked:** 366 unit checks in 57 files and all nine browser workflows,
  including local chat, persistence, owner access and real sandbox output.

## Failures found and repaired

The real schema/cache test exposed a semantic cache response crossing format
boundaries despite distinct exact keys. Partition semantic entries by model,
request parameters, route and non-user instructions; include response format
and reasoning effort in router keys and configured provider/model identity.

A 270M model produced a cyclic graph. The deterministic admission check
rejected it; the existing safe one-task fallback handles invalid plans. Provider
JSON schema is a formatting constraint, not evidence of logical correctness.

Adding completion validation inside traced requests initially prevented the
bounded Ollama empty-probe retry. The browser model card remained in error.
Restore the retry only for that typed empty-output failure; retain a failed
span for the first attempt. A real HTTP regression test requires exactly the
existing 64/128-token probe sequence. The complete browser retest passed.

## Other research decisions

[Ollama 0.35 System One decision models](https://github.com/ollama/ollama/releases/tag/v0.35.0)
and [TypeSafe's typed decision API](https://docs.typesafe.ai/api) are relevant
options for a later measured classifier trial. Keep the already installed
[exact Laya model](https://huggingface.co/convaiinnovations/laya) advisory: its
earlier eight-case acceptance scored 7/8 and retained a calibration warning.
Confidence does not authorize execution. Do not replace the shared Ollama
daemon or download another classifier without a demonstrated benefit here.

[Temporal SDK 1.24](https://github.com/temporalio/sdk-typescript/releases/tag/v1.24.0)
does not resolve a measured private-release defect. Adding another durable
runtime would change the deployment contract; retain the existing BullMQ
admission/recovery policy and post-effect quarantine.

The canonical deployment and master remain untouched. This branch is delivered
through PR #58 for owner release review. Protected checks and private installer
acceptance remain required on its final head.
