# Protocol Status

**Verified:** 2026-07-17

| Protocol | Product status | Version / evidence |
| --- | --- | --- |
| MCP client/server | Supported locally | Current stable `2025-11-25`; Streamable HTTP initialization, session ID, protocol header, strict JSON-RPC response IDs, `tools/call`, authentication forwarding and cleanup are covered by focused tests. |
| A2A external interoperability | Disabled | Current released A2A specification is `1.0.0`. The retained legacy engine models `0.3.0`, so all external A2A routes return HTTP 501 and the UI shows the version gap. |
| CLI tools | Supported locally | Shell-free allowlisted argv execution inside the fixed sandbox; traversal and shell operators are rejected. |
| GraphQL HTTP | Registered but not a supported UI workflow | The UI hooks are unused and subscriptions have no authenticated WebSocket server. Human approval is required before disabling this public endpoint. |
| Native gRPC / JSON bridge | Registered but not a supported browser workflow | The browser bridge is JSON over HTTP, not gRPC-Web; native transport is not externally launch-proven. Human approval is required before disabling these public endpoints. |

Authoritative current sources:

- A2A specification: https://github.com/a2aproject/A2A/blob/main/docs/specification.md
  (latest released version 1.0.0)
- A2A JavaScript SDK: https://github.com/a2aproject/a2a-js (stable release
  currently documents 0.3 compatibility; v1 work must be adopted only after a
  stable, reviewed release or a repository-native 1.0 implementation passes
  the official compatibility kit)
- MCP specification: https://modelcontextprotocol.io/specification/2025-11-25
  (current stable protocol version)

## Reactivation gate for A2A

External A2A may be enabled only after all of the following pass:

1. A 1.0 Agent Card and supported-interface binding are generated from one
   authoritative implementation.
2. Every request sends/validates the required `A2A-Version` semantics.
3. Message/task/artifact/status shapes pass the official compatibility kit.
4. Authentication and governed egress are proven on both server and client
   paths.
5. Non-streaming, streaming, cancellation, task retrieval and rejection cases
   are exercised against a controlled external v1 peer.
6. The UI is re-enabled only after the dashboard reports that live proof.
