# Ultra Computer — Usage Guide

For someone who has never used it before.

---

## What Is Ultra Computer?

Ultra Computer is not a chatbot. It is an **AI agent harness** — a system that:

1. Takes your goal as a message
2. Breaks it into parallel tasks automatically
3. Assigns each task to the best AI model available
4. Runs multiple AI "workers" at the same time
5. Remembers everything across sessions
6. Returns one complete answer

The difference from a chatbot: if you ask a standard chatbot to "research this topic, write code for it, and summarize the results," it does those three things one at a time with one model. Ultra Computer splits them into three parallel agents, picks the right model for each, and finishes faster with better results.

---

## Before You Start — One-Time Setup

### Step 1: Configure and start the stack

Copy `.env.example` to `.env`. Set unique `ULTRA_API_KEY`,
`ENCRYPTION_KEY`, and `TEMPORAL_DB_PASSWORD` values; do not use examples or
reuse one secret for every purpose. Then:

```bash
docker compose up -d --build
```

This starts six things in the background:
- **Redis** — handles the task queue
- **PostgreSQL** — stores Temporal workflow state
- **Temporal** — durable execution engine for registered Temporal workflows
- **Temporal UI** — workflow dashboard at http://localhost:8080
- **Your app** — the main interface at http://localhost:5000
- **Temporal worker** — executes registered durable workflows

Use `docker compose ps` and wait for required services to report healthy.

### Step 2: Confirm Temporal (optional)

The auto-setup service creates the default namespace. To confirm it or repair a
missing namespace:

```bash
npm run temporal:namespace
```

You will see `already-registered` on subsequent runs — that is fine.

### Step 3: Open the app

Go to **http://localhost:5000** in your browser.

You will see the Ultra Computer welcome screen with a "Start New Session" button.

---

## The Most Important Thing — Connect an AI Model

Inference and orchestration require at least one connected AI model.

### How to add and verify a model:

1. In the left sidebar, click **Models**
2. Click **Quick Add** (the fastest way)
3. Choose a provider:
   - **Anthropic** — Claude models (API key from [console.anthropic.com](https://console.anthropic.com))
   - **OpenAI** — models returned by your account (API key from [platform.openai.com](https://platform.openai.com))
   - **Google** — Gemini (API key from [aistudio.google.com](https://aistudio.google.com))
   - **Ollama** — local models on your machine, free, no API key needed
   - **Groq** — fast inference, free tier available
   - **Mistral, Together, Cohere, DeepSeek, xAI** — also supported
   - Any **OpenAI-compatible** endpoint — set a custom base URL
4. Paste your API key
5. Choose **Sync current models** to fetch the provider's current catalog.
6. Select a model and run **Test connection** before assigning it work.

Catalog discovery proves only that the provider listed an identifier. It does
not prove tools, images, streaming, structured output, or even chat
compatibility. Successful explicit testing records verified chat capability.
The system never silently replaces a model you pinned as default.

During the 2026-07-16 readiness pass, the real OpenAI catalog request returned
HTTP 401. Do not treat local adapter tests as proof that a paid provider account
worked live.

### What Orchestrator vs Default means:

When you add a model, you will see two toggles:
- **Orchestrator** — this model does the planning. It reads your message,
  decides what tasks to create, and decides which sub-agent handles what. Use
  the strongest model whose required capabilities you have explicitly verified.
- **Default** — the fallback model for worker tasks when nothing more specific is configured

You only need one model to start. Set it as both Orchestrator and Default.

### Add multiple models for best results:

The system automatically routes each task to the best model based on the `speedTier` you assign when adding a model:
- **fast** — quick lookups and simple responses
- **medium** — general tasks
- **powerful** — complex analysis, writing, code (Claude Opus, GPT-4o)

You do not have to configure routing rules — the system handles it.

---

## Your First Session

### Starting a conversation:

1. Go to **http://localhost:5000**
2. Click **Start New Session**
3. You are now in the chat interface

### Sending a message:

Type anything in the text box and press Enter (or click Send).

The system will:
1. Show a "planning" status as it reads your message
2. Display a task list — each subtask it has created
3. Stream agent output in real-time as workers complete each task
4. Show the final answer when all tasks are done

### What you see on screen:

- **Left panel** — conversation history and sidebar navigation
- **Center** — chat and streaming agent output
- **Right panel** — task graph showing what each agent is doing right now

### Example messages to try:

```
Research the latest developments in quantum computing and write a 3-paragraph summary
```
→ One agent researches, one agent writes, orchestrator combines.

```
Write a Python function that reads a CSV file and computes the average of each column
```
→ Code task — automatically uses a code-optimized model.

```
Compare the pricing of AWS S3, Google Cloud Storage, and Azure Blob Storage
```
→ Creates parallel research tasks for each provider, then a comparison agent.

---

## Skills — Teaching the AI to Handle Specific Tasks

Skills are instruction files (written in markdown) that tell agents how to handle specific types of requests. They activate automatically based on keywords in your message.

### Viewing built-in skills:

1. Click **Skills** in the sidebar
2. You will see skills already installed (web research, code review, writing, etc.)
3. Each skill shows which keywords trigger it

### Activating a skill for your session:

In the chat interface, look for the skills toggle near your conversation. Turn on any skill to apply it to the current session.

### Creating a custom skill:

1. Go to **Skills**
2. Click **New Skill**
3. Give it a name (e.g., "Financial Analysis")
4. Write the skill content in markdown — these are the instructions the agent follows when the skill is active
5. Add trigger keywords (e.g., `finance, revenue, P&L, earnings`)

Now whenever your message contains those keywords, this skill's instructions are automatically included in the agent's context.

### Installing from the Marketplace:

1. Click **Marketplace** in the sidebar
2. Browse community-published skills
3. Click **Install** on any skill to add it to your system

---

## Memory — The AI That Remembers You

The memory system stores facts across sessions. The orchestrator automatically saves important information from your conversations and reads it back at the start of future sessions.

### Viewing your memory:

1. Click **Memory** in the sidebar
2. You will see all stored memory entries organized by category and importance score

### What gets remembered automatically:

- Facts you state ("I prefer Python over JavaScript")
- Project context ("We're building a fintech app that handles ACH transfers")
- Preferences ("Always include error handling in code examples")

### Adding a memory manually:

1. On the Memory page, click **Add Memory**
2. Type the fact you want stored
3. Set a category (general, project, preference, etc.)
4. Set importance (0 to 1, where 1 = most critical to recall)

### Tips:

- High-importance memories are always recalled
- Lower-importance memories are recalled when relevant
- The AI uses memory to avoid asking you the same questions twice
- You can delete any memory you do not want retained

---

## Knowledge Base — Documents the AI Always Has Access To

The Knowledge Base stores reference documents — material the AI can read when answering questions.

### Adding a document:

1. Click **Knowledge** in the sidebar
2. Click **Add Entry**
3. Give it a name and paste the content (markdown, JSON, plain text, or code)
4. Set the **tier policy**:
   - **Auto** — injected based on relevance and available context window
   - **Always** — always included in every agent call
   - **Powerful-only** — only given to large-context models
   - **Never** — stored but never injected automatically

### Good things to put in the Knowledge Base:

- Your product specification or README
- API documentation for a system the AI needs to work with
- Your coding standards or style guide
- A list of your team members and their roles
- Database schema definitions

---

## Connectors — Connecting to External Tools

Connectors let the AI take actual actions in your other tools — not just talk about them.

### Available connectors include:

- **Gmail** — read and draft emails
- **GitHub** — create issues, read PRs, check code
- **Notion** — read and write pages
- **Slack** — send messages
- **PostgreSQL** — run database queries
- **Jira** — manage tickets
- **Snowflake** — query data warehouse
- And 14+ more via **MCP** (Model Context Protocol — any tool with an MCP server)

### Connecting a tool:

1. Click **Connectors** in the sidebar
2. Find the tool you want
3. Click **Connect**
4. For API key connectors: paste your key, click Save
5. For OAuth connectors (Google, GitHub, etc.): click Connect → authorize in the browser popup → done

### Using a connector:

Once connected, just mention the tool in your message:

```
Check my GitHub notifications and summarize any PRs waiting for my review
```
```
Draft a Slack message to the #engineering channel announcing today's deployment
```

The AI knows which connectors are available and uses them automatically.

---

## Swarm Mode — Multiple AI Agents Working Together

The Swarm feature creates a team of specialized agents that work on a single goal together, share information, and vote on decisions.

### Creating a swarm:

1. Click **Swarm** in the sidebar
2. Click **New Swarm**
3. Give it a goal (e.g., "Analyze our competitor landscape and produce a market report")
4. Choose a mode:
   - **Collaborative** — agents share findings and build on each other's work
   - **Competitive** — agents work independently and the best answer wins
   - **Exploratory** — agents try different approaches and report back
5. Add agents — each with a name, role, and specific instructions
6. Click **Start**

### Watching a swarm run:

The Swarm page shows each agent's status in real-time:
- What each agent is currently working on
- Messages agents send to each other
- The shared "blackboard" where agents post discoveries
- Consensus votes when agents need to agree on something

### When to use Swarm vs regular chat:

- **Regular chat** — most tasks. Single goal, orchestrator handles everything.
- **Swarm** — when you need genuine parallelism with agents that communicate. Research projects, large codebase analysis, multi-domain investigations.

---

## Docker Sandbox — Safe Code Execution

The sandbox runs agent shell commands in a resource-limited Docker container.
Only the application sandbox directory is mounted, and container networking is
disabled by default. If Docker isolation is unavailable, shell execution fails
instead of running the command on the application host.

### Enabling the sandbox:

1. Click **Sandbox** in the sidebar
2. Toggle **Enable Sandbox**
3. Click **Pull Image** to download the execution environment (one-time, takes about a minute)

### Using the sandbox:

Once enabled, when the AI writes code it can offer to run it. Results come back
in the chat. A container is reused within an agent session and reaped after its
idle timeout; files written under the mounted sandbox directory persist.

The standard Compose deployment does not mount the Docker daemon socket into
the app container because that socket grants host-equivalent control. Shell
tools therefore fail closed in that topology until a separately isolated
executor is configured. Developers running the server directly may opt into
host execution only with `ALLOW_HOST_SHELL=true`; production rejects that
setting at startup.

Outbound agent HTTP is independently governed. `OUTBOUND_HTTP_TIMEOUT_MS`,
`OUTBOUND_HTTP_MAX_REDIRECTS`, and `OUTBOUND_HTTP_MAX_RESPONSE_BYTES` bound
requests. Private/local targets remain denied unless a local developer
adds the exact required hostname or IP address to the comma-separated
`ULTRA_LOCAL_EGRESS_ALLOWLIST`. Plain HTTP remains denied unless
`ULTRA_ALLOW_INSECURE_HTTP=true` is set for a documented exception. Keep both
exceptions empty or disabled unless a specific integration requires them.

### Settings you can adjust:

- **CPU limit** — max CPU the sandbox can use
- **Memory limit** — max RAM (default 512MB)
- **Execution timeout** — how long code can run before being killed (default 30s)
- **Network** — disabled by default (enable only if your code needs internet access)

---

## Browser Automation — The AI That Can Browse the Web

The browser feature uses Playwright to let the AI actually open web pages and interact with them.

### Using browser automation:

1. Click **Browser** in the sidebar
2. Type what you want the AI to do on the web
3. The AI navigates, clicks, fills forms, and extracts information

### Example browser tasks:

```
Go to the Anthropic pricing page and tell me how much Claude Opus costs per million tokens
```
```
Search Google for "best PostgreSQL indexing strategies 2025" and summarize the top 3 results
```

The AI returns screenshots and extracted text from what it finds.

---

## Monitoring — Know What Is Happening

### Real-time task view:

Inside any chat session, the right panel shows the live task graph:
- Green = completed
- Blue / pulsing = in progress
- Red = failed

### Temporal UI — durable execution dashboard:

Go to **http://localhost:8080**

This shows registered Temporal workflows, their event history, and current
status. The ordinary chat route is not automatically proof of durable
crash/restart recovery. The live integration gate proves real activity
execution, history, and idempotent result retrieval; the worker-termination
chaos proof remains tracked in `PARKED.md`.

### Health check:

```
http://localhost:5000/api/health
```
Returns model count, memory count, skill count, connector count, sandbox status, and whether the task queue is connected.

### Token dashboard:

Click **Tokens** in the sidebar to see how many tokens each model has consumed across all sessions — useful for tracking API costs.

---

## Settings

Click **Settings** in the sidebar to configure:

- **Theme** — light or dark
- **System name** — what the AI calls itself
- **Default model** — which model is used when nothing more specific applies
- **Max tool iterations** — how many times an agent can use tools in one turn (default 10)
- **Sandbox auto-enable** — automatically enable the Docker sandbox for every new session

---

## Security — Locking It Down for Production

If you are running this where anyone other than you can reach it:

1. Open the `.env` file
2. Generate separate values with `npm run gen:key` for `ULTRA_API_KEY` and
   `ENCRYPTION_KEY`, and set a separate `TEMPORAL_DB_PASSWORD`
3. Restart the stack: `docker compose down && docker compose up -d`

Production will not start without a non-placeholder key of at least 32
characters and a separate valid `ENCRYPTION_KEY`. Protected REST requests use:
```
Authorization: Bearer your-api-key-here
```

Browser event streams obtain short-lived, path-bound stream tokens; the
long-lived deployment key is not placed in EventSource URLs. Development may
run without API authentication, so bind it locally and never expose it to an
untrusted network.

The bundled Compose deployment binds published ports to loopback. For remote
access, terminate TLS at a trusted reverse proxy or use the explicit Cloudflare
Tunnel profile. This application is currently a single-owner deployment; it
does not provide multi-user RBAC or tenant isolation.

---

## Public Access via Cloudflare Tunnel

If you want to reach the app from outside your local network without opening firewall ports:

See **docs/CLOUDFLARE_SETUP.md** for the full walkthrough. The short version:

1. Create a tunnel in Cloudflare Zero Trust dashboard
2. Add a public hostname pointing to `http://app:5000`
3. Copy the tunnel token into `.env` as `TUNNEL_TOKEN=...`
4. Start with tunnel: `docker compose --profile tunnel up -d`

The tunnel is outbound-only — Cloudflare handles HTTPS and routing.

---

## Common Problems and Fixes

**"No model configured" when sending a message**
→ Go to Models page and add at least one model. Set it as both Orchestrator and Default.

**Messages sit there spinning with no response**
→ Check the model shows a green connected status on the Models page. Verify your API key is valid.

**Temporal UI shows workflows as "failed"**
→ Run `npm run temporal:namespace` to ensure the namespace is registered. Check `docker compose ps` to confirm all containers are healthy.

**Redis errors in logs**
→ Redis is not running. Run `docker compose up -d redis`.

**Stack won't start**
→ Docker Desktop must be open and running. Run `docker compose down` then `docker compose up -d`.

**Cloudflared exits immediately**
→ `TUNNEL_TOKEN` is not set or is wrong in `.env`. The rest of the stack runs fine without it.

---

## Quick Reference

### URLs

| What | URL |
|------|-----|
| Main app | http://localhost:5000 |
| Temporal workflow dashboard | http://localhost:8080 |
| Health check | http://localhost:5000/api/health |

### Commands

| What | Command |
|------|---------|
| Start everything | `docker compose up -d` |
| Stop everything | `docker compose down` |
| Register Temporal namespace (once) | `npm run temporal:namespace` |
| Run durable execution proof | `npm run temporal:proof` |
| Start with Cloudflare tunnel | `docker compose --profile tunnel up -d` |
| Check what is running | `docker compose ps` |
| View app logs | `docker compose logs app -f` |
| View all logs | `docker compose logs -f` |
| Generate a new encryption key | `npm run gen:key` |

---

## The Learning Loop — It Gets Better Over Time

Ultra Computer has a self-improvement system running in the background. Every interaction is logged. The system periodically:

- Analyzes which skills triggered for which types of messages
- Identifies gaps (tasks that failed or produced poor results)
- Auto-refines skill content based on what worked

You do not need to configure anything for this. The longer you use it, the better it gets at handling your specific types of requests.
