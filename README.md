# Ultra Computer

**AI Agent Orchestration Platform** — A production-grade autonomous agent harness with self-healing, self-learning, multi-protocol communication, and tamper-proof identity management.

> **Status**: Launch-candidate hardening branch. Local repository gates are passing; this is not a blanket claim that every live external capability has been exercised. See `docs/VERIFICATION_POLICY.md`, `docs/OPERATIONAL_READINESS_GATE.md`, `reports/policy-control-plane-readiness.md`, `reports/production-readiness.md`, and `docs/PRODUCTION_RUNBOOK.md` before operating a public deployment.

---

## What Is This?

Ultra Computer is a complete agent orchestration system that manages AI model routing, tool execution, browser automation, skill libraries, and multi-agent coordination. It provides the infrastructure for agents to operate autonomously with human-in-the-loop safety controls.

### Key Capabilities

| Module | Description |
|--------|-------------|
| **Model Router** | Multi-provider model routing with speed tiers and automatic failover |
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

- **Runtime**: Node.js 20+ with TypeScript
- **Server**: Express 5.2 with esbuild bundling
- **Frontend**: React 19 + Vite + Tailwind CSS + shadcn/ui
- **Database**: SQLite via Drizzle ORM
- **ORM**: Drizzle with push migrations
- **Build**: esbuild (server) + Vite (client) via custom `script/build.ts`

---

## NLP Instruction Protocol (NIP)

A novel protocol for AI-to-AI bidirectional natural language instruction. One agent teaches another through conversation, with full safety monitoring.

**What makes NIP unique:**
- **NLP-native** — agents communicate in natural language, not structured JSON
- **Bidirectional** — both sides can instruct, question, and provide feedback
- **Cross-trust-boundary** — works between separate organizations
- **Traceable** — every message logged, human-readable reports auto-generated
- **Safety-monitored** — inline prompt injection detection (39 patterns), scope drift detection, rate limiting, auto-lockdown

## Tamper-Proof Identity System

Every user/agent gets a cryptographic identity that cannot be spoofed, faked, or duplicated.

- **CryptoID**: SHA-256 hash from 64 random bytes + timestamp + process entropy (64-char hex, immutable)
- **Fingerprint**: Short 16-char identifier for display
- **Verification Tiers**: Unverified → Verified → Premium → Enterprise → Admin
- **Trust Scoring**: Dynamic 0-100 score based on account age, session completion, alerts, reports, community contributions
- **Block Lists**: Users can block others; blocked-by count visible without revealing who
- **Audit Trail**: Every identity action logged immutably

---

## Quick Start

```bash
# Install dependencies
npm ci

# Development (hot reload)
npm run dev

# Production build
npm run build

# Generate a 64-character ENCRYPTION_KEY value
npm run gen:key

# Set required production secrets, then start
npm start

# The app serves on http://localhost:5000
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `5000` |
| `NODE_ENV` | Environment | `development` |
| `DATABASE_URL` | SQLite path | `./ultra_computer.db` |
| `ULTRA_API_KEY` | Required bearer token for protected API routes in production | none |
| `ENCRYPTION_KEY` | Required 64-character hex key for encrypted secrets | none |
| `SLACK_SIGNING_SECRET` | Required for Slack webhook signature verification | none |
| `GITHUB_WEBHOOK_SECRET` | Required for GitHub webhook signature verification | none |
| `ALLOWED_ORIGIN` | Optional CORS origin allowlist | same origin |
| `GRPC_PORT` | gRPC server port | `50051` |

### Launch Gate

Run the full local launch gate before promoting a build:

```bash
npm run verify
```

The gate typechecks, runs unit and coverage suites, builds, audits dependencies, generates an SBOM, and starts the production server for a health smoke test.

`npm run verify` is local repository-gate evidence. It must not be reported as production proof for live external providers, connectors, MCP/A2A peers, browser workflows, or deployment environments that were not actually exercised. Use the evidence labels in `docs/VERIFICATION_POLICY.md` for all release reports.

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
| `/api/marketplace` | Marketplace | Skills + ratings + quality scores |
| `/api/autonomy` | Autonomy | Watchdog + cron + checkpoints + learning |
| `/api/protocols` | Protocols | A2A + MCP + CLI adapters |
| `/api/messaging` | Messaging | Channels + send + webhooks + subscriptions |
| `/api/nip` | NIP | Sessions + messages + monitor + reports + access |
| `/api/identity` | Identity | Register + verify + trust + blocks + directory |

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
