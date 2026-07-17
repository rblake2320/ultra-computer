# Ultra Computer

**AI Agent Orchestration Platform** — A multi-provider agent harness for
orchestration, governed tool execution, durable work queues, browser automation,
skills, memory, and agent-to-agent protocols.

> **Status:** Launch-candidate hardening branch. Repository, unit, local-process,
> and Docker results are evidence only for the paths they exercise. Paid model
> providers and third-party connectors require separate live verification. The
> OpenAI catalog discovery attempted during the 2026-07-16 readiness pass
> returned HTTP 401 and is therefore **not verified live**.

---

## What Is This?

Ultra Computer is a complete agent orchestration system that manages AI model routing, tool execution, browser automation, skill libraries, and multi-agent coordination. It provides the infrastructure for agents to operate autonomously with human-in-the-loop safety controls.

### Key Capabilities

| Module | Description |
|--------|-------------|
| **Model Router** | Provider-native and OpenAI-compatible adapters with capability-aware routing |
| **Model Catalog** | Provider-backed model discovery, lifecycle tracking, and explicit compatibility evidence |
| **Orchestrator** | Conversation-driven task decomposition with sub-agent spawning |
| **Tool System** | Extensible tool execution with sandboxed Docker environments |
| **Skill Library** | Persistent, versioned skill scripts with search and auto-improvement |
| **Memory Manager** | Long-term memory with semantic search and session context |
| **Connector Registry** | MCP-compatible integrations for external services |
| **Browser Automation** | Playwright-based browser tool for web interactions |
| **Marketplace** | Community skill marketplace with quality scoring pipeline |
| **Autonomy Suite** | Self-healing watchdog, task checkpointing, cron scheduler, circuit breakers |
| **Protocol Hub** | A2A, MCP, and CLI protocol adapters for agent interoperability |
| **Messaging Hub** | Omni-channel messaging (Slack, Gmail, Webhooks) with delivery queues |
| **NIP Engine** | AI-to-AI bidirectional NLP instruction protocol with safety monitoring |
| **Identity System** | Tamper-proof cryptographic identity with verification tiers and trust scoring |

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Frontend (React)                    │
│  Chat · Models · Skills · Connectors · Memory · NIP  │
│  Sandbox · Browser · Marketplace · Autonomy · Identity│
└──────────────────────┬──────────────────────────────┘
                       │ REST + SSE
┌──────────────────────┴──────────────────────────────┐
│                Express 5 API Server                   │
├───────────────┬───────────────┬───────────────────────┤
│  Orchestrator │  Model Router │  Tool Execution Layer │
├───────────────┼───────────────┼───────────────────────┤
│  Skill System │  Memory Mgr   │  Connector Registry   │
├───────────────┼───────────────┼───────────────────────┤
│  A2A Protocol │  MCP Protocol │  CLI Tool Engine      │
├───────────────┼───────────────┼───────────────────────┤
│  NIP Engine   │  Identity Sys │  Messaging Hub        │
├───────────────┼───────────────┼───────────────────────┤
│  Self-Healing │  Self-Learning│  Cron Scheduler       │
└───────────────┴───────────────┴───────────────────────┘
                       │
              ┌────────┴────────┐
              │    SQLite DB    │
              │  (Drizzle ORM)  │
              └─────────────────┘
```

### Tech Stack

- **Runtime**: Node.js 22–24 with TypeScript; Node.js 24 is used by CI and containers
- **Server**: Express 5.2 with esbuild bundling
- **Frontend**: React 18 + Vite + Tailwind CSS + shadcn/ui
- **Database**: SQLite via Drizzle ORM
- **Schema**: Drizzle definitions with additive application migrations
- **Build**: esbuild (server) + Vite (client) via custom `script/build.ts`

---

## NLP Instruction Protocol (NIP)

An application protocol for AI-to-AI bidirectional natural-language
instruction with inline safety checks.

**What makes NIP unique:**
- **NLP-native** — agents communicate in natural language, not structured JSON
- **Bidirectional** — both sides can instruct, question, and provide feedback
- **Cross-trust-boundary** — works between separate organizations
- **Traceable** — every message logged, human-readable reports auto-generated
- **Safety-monitored** — inline prompt injection detection (39 patterns), scope drift detection, rate limiting, auto-lockdown

## Cryptographic Identity System

Users and agents can receive random cryptographic identifiers with fingerprints,
verification tiers, trust metadata, block lists, and audit records. These
application controls do not replace external identity proofing, multi-user
authorization, or tenant isolation.

- **CryptoID**: SHA-256 hash from 64 random bytes + timestamp + process entropy (64-char hex, immutable)
- **Fingerprint**: Short 16-char identifier for display
- **Verification Tiers**: Unverified → Verified → Premium → Enterprise → Admin
- **Trust Scoring**: Dynamic 0-100 score based on account age, session completion, alerts, reports, community contributions
- **Block Lists**: Users can block others; blocked-by count visible without revealing who
- **Audit Trail**: Every identity action logged immutably

---

## Prerequisites

- Node.js 22, 23, or 24; Node.js 24 is recommended
- npm 11 (`packageManager` is pinned in `package.json`)
- Docker Desktop or Docker Engine with Compose for the production-shaped stack
- At least one supported model provider credential, or a reachable local
  OpenAI-compatible/Ollama endpoint, to perform inference

## Install and Develop

```bash
npm ci
npm run dev
npm run doctor
npm run check
npm run test:unit
npm run build
```

Development serves the UI and API at `http://localhost:5000`. Development may
run without `ULTRA_API_KEY`; do not expose that mode to an untrusted network.

## Reliability Pass

The supported local workflow gate is an authenticated seven-test Playwright
suite:

```bash
npm run test:e2e
```

It starts the real development server with a temporary SQLite database and a
real Chromium browser. With Ollama available on `127.0.0.1:11434`, it also
creates and tests a real local model and persists a real assistant response.
The suite verifies private launch, first-model role assignment, real local
inference, graceful no-model guidance, real Windows-compatible CLI execution
with traversal rejection, database-backed process restart, and both disabled
and explicitly enabled `ULTRA_EXPERIMENTAL` states. This is local process proof,
not container-recreation proof or evidence for paid providers.

Run `npm run doctor` for installation diagnostics. Add `-- --live` only when
you intend to make real connection probes against every enabled model:

```bash
npm run doctor -- --live
```

Reliability behavior added in this pass:

- Only enabled models with a successful connection status and currently
  resolvable credentials receive work. The first model that passes its live
  test becomes Default and Orchestrator when those roles are otherwise empty.
- Role changes are atomic; failed targets cannot clear a working role, and
  disconnect/delete/failure reconciles both roles to another ready model.
- A conversation with only failed or untested model records persists
  actionable setup guidance instead of attempting a request or crashing.
- A2A send and stream failures report failed tasks instead of echoing input as
  a successful-looking answer.
- Protocol webhooks dispatch through the registered handler and return failure
  when dispatch fails; messaging integrations never simulate delivery.
- The CLI engine parses one command into an allowlisted executable and argument
  array, runs with `shell: false`, and uses a fixed sandbox working directory.
  Shell operators, substitutions, redirections, compound commands, executable
  paths, and caller-selected process directories are rejected.

## Production-Shaped Docker Deployment

Create `.env` from `.env.example`, then set unique values for
`ULTRA_API_KEY` and `ENCRYPTION_KEY`. Generate the two application secrets
independently:

```bash
npm run gen:key
npm run gen:key
docker compose up -d --build
docker compose ps
```

Open `http://127.0.0.1:5000/` and enter the configured `ULTRA_API_KEY` at
the owner-access screen. The browser validates it against the local server and
keeps it only in that tab's `sessionStorage`; closing the tab ends the session.

The standard stack runs the HTTP/gRPC application and Redis. Host-published
ports bind to loopback, SQLite state is stored in the `app-data` volume, and
Redis uses AOF persistence in `redis-data`. Terminate inbound HTTPS at a trusted
reverse proxy or the optional Cloudflare Tunnel profile:

```bash
docker compose --profile tunnel up -d --build
```

For a direct, non-container production process, provision Redis separately,
set the production variables below, then run `npm run build && npm start`.

## Environment Variables

`.env.example` is the deployment template. The application recognizes:

| Variable | Purpose / default |
| --- | --- |
| `NODE_ENV` | `development`, `test`, or `production`; production activates fail-closed configuration checks. |
| `HOST`, `PORT` | HTTP bind host and port; defaults `0.0.0.0` and `5000`. |
| `GRPC_PORT`, `DISABLE_GRPC` | gRPC port (server default `5001`, container `50051`) or explicit disable with `1`. |
| `APP_PORT`, `GRPC_HOST_PORT` | Compose-only host ports; defaults `5000` and `50051`. |
| `DATABASE_PATH` | SQLite file; defaults to `./data/ultra_computer.db` in production and `./ultra_computer.db` otherwise. |
| `ULTRA_EXPERIMENTAL` | Set `1` in the application process to register and show Swarm, NIP, Identity, Marketplace, and autonomy/self-improvement surfaces. Disabled by default; standard Compose does not forward this opt-in. |
| `ULTRA_API_KEY` | Production bearer key; required, at least 32 characters, and must not be a placeholder. |
| `ENCRYPTION_KEY` | Production encryption/HMAC key; required, exactly 64 hexadecimal characters, and not a placeholder or single repeated character. |
| `ALLOWED_ORIGIN` | Allowed browser origin; set to the public HTTPS origin in production. |
| `TRUST_PROXY` | Express proxy trust setting; use only for a known reverse-proxy topology. |
| `ALLOW_HOST_SHELL` | Development-only opt-in to host shell fallback. Production rejects `true`. |
| `OUTBOUND_HTTP_TIMEOUT_MS` | Governed request timeout; default `15000`. |
| `OUTBOUND_HTTP_MAX_REDIRECTS` | Governed redirect limit; default `3`. |
| `OUTBOUND_HTTP_MAX_RESPONSE_BYTES` | Governed response limit; default `10485760`. |
| `ULTRA_LOCAL_EGRESS_ALLOWLIST` | Exact comma-separated private/local hosts allowed by policy. Empty by default. |
| `ULTRA_ALLOW_INSECURE_HTTP` | Explicit HTTP egress exception. Keep `false` in production. |
| `REDIS_URL` or `REDIS_HOST`/`REDIS_PORT` | Redis connection; host/port default to `localhost:6379`. |
| `REDIS_CACHE_PERSIST` | Set `true` to persist the model-response cache through Redis. |
| `REQUIRE_TASK_QUEUE` | Production requires the queue unless explicitly set to `0`; `1` requires it in other modes. |
| `TEMPORAL_ADDRESS`, `TEMPORAL_TASK_QUEUE`, `RUN_TEMPORAL_WORKER` | Used only by the optional `temporal-proof` profile and proof worker. Normal application messages do not dispatch through Temporal. |
| `TEMPORAL_DB_PASSWORD`, `TEMPORAL_PORT`, `TEMPORAL_UI_PORT` | Optional `temporal-proof` profile database secret and loopback ports. |
| `SLACK_SIGNING_SECRET`, `GMAIL_PUSH_TOKEN`, `GITHUB_WEBHOOK_SECRET` | Optional webhook verification secrets. Unconfigured receivers reject requests outside development. |
| `OAUTH_REDIRECT_BASE_URL` | Public HTTPS base URL used to construct connector OAuth callbacks; required before OAuth can start in production. |
| `TUNNEL_TOKEN` | Optional Cloudflare Tunnel token for the `tunnel` profile. |
| `BROWSER_POOL_SIZE` | Number of pre-warmed browser contexts; default `2`. |
| `ULTRA_POLICY_DIR`, `ULTRA_POLICY_AUDIT_FILE` | Policy files and JSONL audit destinations. |
| `ULTRA_DURABLE_RUN_DIR` | Durable-run ledger directory. |
| `LOG_LEVEL`, `DEBUG_CACHE` | Logging level and optional cache diagnostics. |
| `BASE_URL` | Base URL advertised by the local A2A agent card. |
| `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `GEMINI_API_KEY`, `MISTRAL_API_KEY`, `GROQ_API_KEY`, `TOGETHER_API_KEY`, `DEEPSEEK_API_KEY`, `XAI_API_KEY`, `COHERE_API_KEY`, `CO_API_KEY` | Optional provider credentials. Credentials may instead be stored through the Models UI. |

Do not put real secrets in `.env.example`, logs, screenshots, issues, or pull
requests.

## Application Spending Admission

Paid text and image requests pass through a SQLite-backed reservation and
settlement ledger before provider dispatch. The operator setting
`spend_limit_usd` defaults to and cannot exceed `$20` per UTC month. Committed
ledger cost plus active reservations may not exceed that application limit.
Unknown paid model/image pricing fails closed; discovering a new model does not
make it billable or automatically usable.

The ledger is durable across application restart when `DATABASE_PATH` is on
persistent storage, and SQLite immediate transactions serialize admissions for
this single database. It is not a provider-side quota or invoice guarantee:
providers can apply pricing dimensions, taxes, cache rates, minimums, delayed
usage, or charges outside this application. Use provider billing alerts and a
provider-enforced hard quota when available. Multi-node deployments also need a
shared transactional accounting design before claiming a fleet-wide ceiling.

## Current-Release Model Support

Ultra Computer does not rely solely on a frozen list of model names:

1. Add provider credentials or an explicit compatible base URL.
2. In **Models**, select the provider and choose **Sync current models**.
3. The server queries the provider catalog and stores first/last-seen and
   lifecycle data without silently replacing pinned/default selections.
4. Run **Test connection** for a selected model. Only that explicit probe can
   record verified chat compatibility; discovery alone leaves capabilities
   unverified.

OpenAI uses its native Responses API; Anthropic and Google use their native
SDK/API contracts. Groq, Mistral, Together, DeepSeek, xAI, Cohere, Ollama, and
custom endpoints use an explicit OpenAI-compatible path where applicable.
Newly released models can therefore appear without a code release when the
provider exposes them, but a provider API change or unsupported capability may
still require an adapter update. Automatic billable probing and automatic
replacement of pinned models remain intentionally parked in `PARKED.md`.

## Security Boundaries

- Production refuses weak/missing application secrets and host-shell fallback.
- REST/gRPC APIs use the deployment bearer key. Browser SSE connections use
  short-lived, path-bound HMAC tokens instead of placing the long-lived API key
  in URLs.
- Browser-rendered model output is sanitized; executable chat markup is not
  trusted.
- Uploads enforce type, size, name, path-containment, and collision checks.
- Agent HTTP follows deny-by-default policy, blocks private/local destinations
  unless exactly allowlisted, revalidates redirects, bounds time/size, and
  requires HTTPS in production unless explicitly excepted.
- The Compose app is non-root and read-only with writable state mounted only at
  designated volumes. It intentionally does not mount the Docker socket.
- File transforms accept only files under the canonical `sandbox/` root and
  publish through bounded temporary files. The code interpreter never runs on
  the application host: it requires the Docker sandbox and fails closed when
  Docker is unavailable. Runtime package installation is not supported; use a
  reviewed sandbox image containing the required dependencies.
- Browser automation governs every navigation and subresource. Typed values
  are kept only for the immediate page action, are excluded from audits and
  persistence, and disable unrestricted evaluation/PDF export for that session.
- Slack, Gmail and GitHub callbacks bypass the owner key only to reach their
  provider-specific signature/token verifier. Generic inbound webhooks require
  `X-Ultra-Timestamp` (Unix seconds) and `X-Ultra-Signature` set to
  `sha256=HMAC_SHA256(webhookSecret, timestamp + "." + rawBody)`; timestamps
  outside five minutes are rejected.
- This is a single-owner API-key boundary. Multi-user RBAC and tenant isolation
  are not implemented; see `PARKED.md`.

### Launch Gate

Run the full local launch gate before promoting a build:

```bash
npm run verify
npm run verify:release

# Optional live-local Docker gate for a clean Linux production container
npm run live:docker
```

`npm run verify` typechecks, runs unit and coverage suites, builds, audits
dependencies, generates an SBOM, and starts the production server for a local
health smoke. `npm run verify:release` additionally runs integration suites;
environment-dependent suites may skip unless their documented real services
and credentials are supplied, so review the test output rather than treating
the command name as blanket live proof.

`npm run verify` is local repository-gate evidence. It must not be reported as production proof for live external providers, connectors, MCP/A2A peers, browser workflows, or deployment environments that were not actually exercised. Use the evidence labels in `docs/VERIFICATION_POLICY.md` for all release reports.

`npm run live:docker` builds and runs a clean Linux production container from a version-pinned Node base image as a non-root runtime user, then exercises selected real HTTP paths. The image installs the Chromium runtime used by the Playwright browser tool. It is Docker live-local proof, not Hyper-V/Azure VM proof and not proof of real third-party provider behavior. Immutable multi-architecture base-image digests remain tracked in PARK-0004. Set `LIVE_DOCKER_CLEAN_IMAGE=true` to remove the local proof image after the run.

Durable execution status is tracked in `docs/DURABLE_EXECUTION_GATE.md` and
`reports/durable-execution-readiness.md`. BullMQ dispatch, the durable run
ledger, and duplicate side-effect admission are application paths. The
optional `temporal-proof` profile proves only a self-contained three-activity
sample; normal messages do not use it, so it is not application crash-resume
evidence. Start that isolated proof environment with
`docker compose --profile temporal-proof up -d`.

---

## Policy-Governed Tool Execution

Agent effectiveness layers such as memory, skills, MCP, A2A, browser automation, and shell tools are constrained by the policy control plane. Policies are JSON files under `policies/` and every file uses deny-by-default semantics:

| Policy | Scope |
|--------|-------|
| `policies/tool-access.json` | Top-level tool names that may be invoked. |
| `policies/filesystem-access.json` | Filesystem read/write/list/search/execute roots. |
| `policies/network-access.json` | Outbound public HTTP(S) methods and network actions. Private, loopback, link-local, and `.local` targets are hard-denied by the evaluator. |
| `policies/shell-access.json` | Shell command patterns allowed or denied before execution. |
| `policies/github-access.json` | GitHub connector and MCP tool operations, with mutating tools denied pending an explicit approval workflow. |

Server-side policy loading and validation live in `server/policyEngine.ts`. Tool, shell, filesystem, browser, connector, MCP, A2A, CLI, and protocol HTTP execution paths route decisions through the evaluator where they touch external capability boundaries. Policy decisions are written to `data/policy/audit.jsonl` with redacted command, URL, path, actor/context, and metadata fields.

Focused verification:

```bash
npm run test:unit -- --run tests/unit/policyEngine.test.ts
npm run verify
```

The policy unit test is `UNIT-LEVEL ONLY` evidence for policy evaluation/redaction behavior. Live tool, GitHub, MCP, A2A, provider, and browser claims require real governed execution through the relevant route.

---

## API Overview

All endpoints are under `/api/`. Key groups:

| Prefix | Module | Endpoints |
|--------|--------|-----------|
| `/api/conversations` | Chat | CRUD + messages + SSE stream |
| `/api/models` | Models | CRUD + test connection |
| `/api/skills` | Skills | CRUD + trigger keywords |
| `/api/connectors` | Connectors | CRUD + connect + MCP tool calls |
| `/api/memory` | Memory | CRUD + semantic search |
| `/api/sandbox` | Docker | Status + config + pull + cleanup |
| `/api/skill-scripts` | Library | CRUD + versioning + run |
| `/api/files` | Files | Browse + read + write + delete |
| `/api/browser` | Browser | Navigate + screenshot + actions |
| `/api/marketplace` | Marketplace (experimental) | Skills + ratings + quality scores; requires `ULTRA_EXPERIMENTAL=1` |
| `/api/autonomy` | Autonomy (experimental) | Watchdog + cron + checkpoints + learning; requires `ULTRA_EXPERIMENTAL=1` |
| `/api/protocols` | Protocols | A2A + MCP + CLI adapters |
| `/api/messaging` | Messaging | Channels + send + webhooks + subscriptions |
| `/api/nip` | NIP (experimental) | Sessions + messages + monitor + reports + access; requires `ULTRA_EXPERIMENTAL=1` |
| `/api/identity` | Identity (experimental) | Register + verify + trust + blocks + directory; requires `ULTRA_EXPERIMENTAL=1` |
| `/api/spend` | Spending admission | Current application ledger, reservations, limit, and available amount |

Full API documentation: [Notion Page](https://www.notion.so/33f16b3224c981dca6c9c74293e36a47)

### Self-Evolving Skill Loop

Ultra Computer can now turn high-signal memory into governed skill proposals:

1. Session context is captured as memory.
2. Procedural memories are analyzed for repeated workflows.
3. Draft skill scripts are proposed with evidence, trigger keywords, and sandbox governance notes.
4. A human promotes or rejects each proposal.
5. Promoted skills enter the versioned skill-script library and can be improved by the existing skill auto-improvement loop.

Relevant endpoints:

| Endpoint | Purpose |
|----------|---------|
| `GET /api/autonomy/skills/proposals` | List skill proposals |
| `POST /api/autonomy/skills/proposals/generate` | Generate proposals from memory |
| `POST /api/autonomy/skills/proposals/:id/promote` | Promote a proposal into a skill script |
| `POST /api/autonomy/skills/proposals/:id/reject` | Reject a proposal with an optional reason |

---

## Project Structure

```
ultra-computer/
├── client/                  # React frontend
│   └── src/
│       ├── components/      # Shared UI components
│       ├── pages/           # Route pages (19 pages)
│       ├── hooks/           # Custom React hooks
│       └── lib/             # API client, utilities
├── server/                  # Express backend
│   ├── routes.ts            # Route registration hub
│   ├── storage.ts           # Drizzle ORM data layer
│   ├── orchestrator.ts      # Agent orchestration engine
│   ├── modelRouter.ts       # Multi-provider model routing
│   ├── tools.ts             # Tool execution + Docker sandbox
│   ├── skillSystem.ts       # Skill management
│   ├── memoryManager.ts     # Long-term memory
│   ├── connectorRegistry.ts # External service connectors
│   ├── a2aProtocol.ts       # Agent-to-Agent protocol
│   ├── mcpProtocol.ts       # Model Context Protocol
│   ├── cliToolEngine.ts     # CLI tool adapter
│   ├── nipEngine.ts         # NLP Instruction Protocol
│   ├── identityEngine.ts    # Cryptographic identity system
│   ├── messagingHub.ts      # Omni-channel messaging
│   ├── selfLearning.ts      # Self-improvement loops
│   ├── processWatchdog.ts   # Health monitoring
│   └── ... (38 server files)
├── shared/                  # Shared types & schema
│   └── schema.ts            # Drizzle database schema
├── script/
│   └── build.ts             # Custom build pipeline
└── package.json
```

---

## Versioning

This project follows [Semantic Versioning](https://semver.org/):

- **v0.x.x** — Beta releases, API may change
- **v1.0.0** — First stable release (planned)

### Changelog

#### v0.1.0 (2026-04-11) — Initial Beta
- Core agent orchestration (model router, orchestrator, tool system)
- 19-page frontend with full CRUD for all modules
- Skill library with versioning and auto-improvement
- Docker sandbox execution environment
- Playwright browser automation
- Community skill marketplace with quality scoring
- Autonomy suite (self-healing, self-learning, cron, circuit breakers)
- Protocol hub (A2A, MCP, CLI)
- Omni-channel messaging (Slack, Gmail, Webhooks)
- NLP Instruction Protocol (AI-to-AI bidirectional instruction)
- Tamper-proof cryptographic identity system
- Full API documentation in Notion

---

## License

Proprietary — Blakes Innovations. All rights reserved.

---

## Author

**Rob Blake** — Blakes Innovations
