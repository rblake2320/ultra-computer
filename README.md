# Ultra Computer

**AI Agent Orchestration Platform** — A production-grade autonomous agent harness with multi-provider model routing, sandboxed tool execution, multi-agent swarms, and self-healing infrastructure.

> **Status**: Beta v0.9.0 — Fully functional, stress-tested (51/51 passing), ready for self-hosted deployment.

---

## Quick Start (3 options)

### Option 1: One-Command Install (Mac / Linux)

```bash
curl -fsSL https://raw.githubusercontent.com/rblake2320/ultra-computer/main/install.sh | bash
```

This will:
- Check for Node.js 18+ (installs via nvm if missing)
- Clone the repo
- Install dependencies
- Build the project
- Start the server on http://localhost:5000

### Option 2: Docker (Recommended for Production)

```bash
git clone https://github.com/rblake2320/ultra-computer.git
cd ultra-computer
docker compose up -d
```

Opens at http://localhost:5000. Includes Redis for task queuing and optional sandbox containers.

### Option 3: Windows Install

```powershell
# Download and run the installer
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/rblake2320/ultra-computer/main/install.bat" -OutFile install.bat
.\install.bat
```

### Option 4: Manual Setup

```bash
git clone https://github.com/rblake2320/ultra-computer.git
cd ultra-computer
npm install
npm run build
npm start
```

Open http://localhost:5000 in your browser.

---

## First Run

When you first open Ultra Computer, you'll need to:

1. **Add a Model** — Go to the Models page and add at least one AI model:
   - Click "Add Model" or use Quick Add
   - Enter your API key (Anthropic, OpenAI, Mistral, etc.)
   - Or connect a local model (Ollama, LM Studio, vLLM)

2. **Start Chatting** — Go to the Chat page and send a message. The orchestrator will:
   - Decompose your request into parallel tasks
   - Route each task to the best model
   - Execute tools (code, web search, file I/O) automatically
   - Synthesize results into a single response

3. **Optional: Configure Sandbox** — For code execution in Docker containers:
   - Go to the Sandbox page
   - Select an image preset (Standard recommended)
   - Docker must be installed on your machine

---

## What Is This?

Ultra Computer is a self-hostable clone of how AI agent orchestration systems work internally — the full harness, not just a chat UI. It manages:

- **Multi-provider model routing** across 19 providers with role-based assignment
- **Autonomous task execution** with sandboxed Docker environments
- **Multi-agent swarms** with blackboard collaboration and consensus
- **Persistent memory** with semantic search
- **Skill libraries** with versioning and a community marketplace
- **Browser automation** via Playwright
- **Self-healing** with watchdog, circuit breakers, and auto-recovery

### Capabilities

| Module | Description |
|--------|-------------|
| **Model Router** | 19 providers (Anthropic, OpenAI, Ollama, vLLM, Mistral, Groq, etc.) with role-based assignment and automatic failover |
| **Orchestrator** | DAG-based task decomposition, parallel execution, 2-level agent hierarchy |
| **Tool System** | 14 real tools (bash, file I/O, web search, browser, calculator, image gen) with per-task filtering |
| **Sandbox** | Docker containers with CPU/memory limits, session isolation, smart auto-routing |
| **Skill Library** | Versioned skill scripts with search, auto-improvement, and marketplace |
| **Memory Manager** | Long-term memory with semantic search and session context |
| **Swarm Engine** | Multi-agent collaboration with Contract Net Protocol and stigmergy |
| **Connector Registry** | MCP-compatible integrations for external services |
| **Browser Automation** | Playwright-based headless browser for web interactions |
| **Marketplace** | Community skill marketplace with quality scoring pipeline |
| **Autonomy Suite** | Self-healing watchdog, task checkpointing, cron scheduler, circuit breakers |
| **Protocol Hub** | A2A, MCP, and CLI protocol adapters for agent interoperability |
| **Messaging Hub** | Omni-channel messaging (Slack, Gmail, Webhooks) with delivery queues |
| **NIP Engine** | AI-to-AI bidirectional NLP instruction protocol with safety monitoring |
| **Identity System** | Tamper-proof cryptographic identity with verification tiers |
| **Sentinel** | Input/output safety filtering, PII detection, prompt injection blocking |
| **Observability** | Distributed tracing, span tracking, performance dashboards |
| **Cost Controller** | Per-model token tracking, budget caps, usage analytics |
| **Telemetry** | Self-learning execution analytics for continuous improvement |
| **Cache** | Intelligent response caching with TTL and hit-rate tracking |

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Frontend (React)                    │
│  29 pages · Tailwind CSS · shadcn/ui · Recharts      │
│  Chat · Models · Skills · Connectors · Memory · NIP  │
│  Sandbox · Browser · Marketplace · Autonomy · Swarm  │
│  Identity · Protocols · Messaging · Telemetry · More │
└──────────────────────┬──────────────────────────────┘
                       │ REST (290+ endpoints) + SSE
┌──────────────────────┴──────────────────────────────┐
│              Express 5 API Server (Node.js)           │
├───────────────┬───────────────┬───────────────────────┤
│  Orchestrator │  Model Router │  Tool Execution Layer │
│  (DAG planner │  (19 providers│  (14 tools, Docker    │
│   + workers)  │   + roles)    │   sandbox, sessions)  │
├───────────────┼───────────────┼───────────────────────┤
│  Skill System │  Memory Mgr   │  Connector Registry   │
├───────────────┼───────────────┼───────────────────────┤
│  Swarm Engine │  NIP Engine   │  Identity System      │
├───────────────┼───────────────┼───────────────────────┤
│  Self-Healing │  Sentinel     │  Cost Controller      │
├───────────────┼───────────────┼───────────────────────┤
│  Observability│  Telemetry    │  Cache Engine         │
└───────────────┴───────────────┴───────────────────────┘
                       │
              ┌────────┴────────┐     ┌───────────────┐
              │    SQLite DB    │     │  Redis (opt.)  │
              │  (24+ tables)   │     │  (task queue)  │
              └─────────────────┘     └───────────────┘
```

---

## System Requirements

| Requirement | Minimum | Recommended |
|---|---|---|
| **Node.js** | 18.0+ | 20.x LTS |
| **RAM** | 2 GB | 4 GB+ |
| **Disk** | 500 MB | 2 GB+ |
| **OS** | Windows 10+, macOS 12+, Ubuntu 20.04+ | Any modern OS |
| **Docker** | Optional (for sandbox) | Docker Desktop or Docker Engine |
| **Redis** | Optional (for task queue) | Redis 7+ |

### Supported AI Providers

| Provider | Local/Cloud | Auth Method |
|---|---|---|
| Anthropic (Claude) | Cloud | API Key |
| OpenAI (GPT) | Cloud | API Key |
| Ollama | Local | None (auto-detect) |
| LM Studio | Local | None (auto-detect) |
| vLLM | Local | None / API Key |
| Mistral | Cloud | API Key |
| Groq | Cloud | API Key |
| Together AI | Cloud | API Key |
| DeepSeek | Cloud | API Key |
| xAI (Grok) | Cloud | API Key |
| Cohere | Cloud | API Key |
| OpenRouter | Cloud | API Key |
| Hugging Face | Cloud | API Key |
| Fireworks AI | Cloud | API Key |
| Cerebras | Cloud | API Key |
| Perplexity | Cloud | API Key |
| Google (Gemini) | Cloud | API Key |
| NVIDIA NIM | Cloud | API Key |
| Any OpenAI-compatible | Either | API Key |

---

## Configuration

### Environment Variables (optional)

```bash
# Server
PORT=5000                          # Server port (default: 5000)
NODE_ENV=production                # Environment mode

# Pre-configure a model (skip manual setup)
DEFAULT_ANTHROPIC_KEY=sk-ant-...   # Auto-creates Anthropic model on first run
DEFAULT_OPENAI_KEY=sk-...          # Auto-creates OpenAI model on first run
```

### Settings (via UI or API)

| Setting | Default | Description |
|---|---|---|
| `sandbox_auto_enable` | `smart` | When to use Docker sandbox: `smart`, `always`, `off` |
| `max_tool_iterations` | `10` | Max tool-calling loops per agent |
| `theme` | `dark` | UI theme: `dark` or `light` |

---

## API Overview

Ultra Computer exposes 290+ REST endpoints. Key groups:

| Endpoint Group | Description |
|---|---|
| `POST /api/chat` | Send a message, get orchestrated response via SSE |
| `GET/POST /api/models` | CRUD for AI model connections |
| `GET /api/models/roles` | Role-based model assignment (chat, code, vision, etc.) |
| `GET/POST /api/skills` | Skill library management |
| `GET/POST /api/connectors` | External service integrations |
| `GET/POST /api/memory` | Long-term memory entries |
| `GET /api/sandbox/status` | Docker sandbox health |
| `GET /api/sandbox/tools-for-task/:type` | What tools each task type gets |
| `GET /api/sandbox/image-presets` | Docker image presets for sandbox |
| `GET /api/swarm` | Multi-agent swarm sessions |
| `GET /api/telemetry` | Execution analytics |
| `GET /api/health` | Server health check |

Full API documentation: `GET /api/docs` (coming soon)

---

## Development

```bash
# Start dev server (auto-reload)
npm run dev

# Type check
npm run check

# Build for production
npm run build

# Start production server
npm start
```

### Project Structure

```
ultra-computer/
├── client/                 # React frontend
│   └── src/
│       ├── pages/         # 29 page components
│       ├── components/    # shadcn/ui components
│       └── lib/           # Query client, utilities
├── server/                 # Express backend
│   ├── orchestrator.ts    # DAG task planner + worker agents
│   ├── modelRouter.ts     # Multi-provider model selection
│   ├── tools.ts           # Tool execution layer
│   ├── dockerSandbox.ts   # Docker container management
│   ├── swarmEngine.ts     # Multi-agent coordination
│   ├── routes.ts          # 290+ API endpoints
│   └── storage.ts         # SQLite + Drizzle ORM (24+ tables)
├── shared/                 # Shared types (schema.ts)
├── docker-compose.yml      # One-command deployment
├── Dockerfile              # Production container image
├── install.sh              # Mac/Linux installer
├── install.bat             # Windows installer
└── package.json
```

---

## License

MIT — Use it, modify it, ship it.

---

## Credits

Built as an educational reference implementation of AI agent orchestration architecture. Inspired by the design patterns of production AI agent systems.
