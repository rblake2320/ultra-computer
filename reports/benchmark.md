# External Benchmark

Comparable projects:

- LangGraph: graph-based agent framework with docs, examples, `AGENTS.md`, `CLAUDE.md`, MIT license, security policy, 34k stars, and 544 releases as of the GitHub page opened during review. Source: https://github.com/langchain-ai/langgraph
- AutoGen: multi-agent framework that is now in maintenance mode and points new users to Microsoft Agent Framework; it documents layered Core, AgentChat, and Extensions APIs, plus Studio and Bench tools. Source: https://github.com/microsoft/autogen
- CrewAI: open-source multi-agent platform with tools, memory, A2A/MCP support, checkpointing, docs, community forum, and security trust center links. Source: https://crewai.com/open-source

| Dimension | Ultra Computer | Best-in-class signal | Verdict |
| --- | --- | --- | --- |
| Feature surface | Broad UI and API for agents, tools, browser, marketplace, messaging, protocols | CrewAI/LangGraph focus on production orchestration primitives and extensive docs | At-par on breadth, behind on maturity |
| Architecture | Many modules with shared Express server | AutoGen documents layered APIs and extension boundaries | Behind |
| Tests | 26 unit tests plus shell/adversarial scripts | Mature projects expose broad CI, examples, and release workflows | Behind |
| CI | Added npm matrix for Windows and Ubuntu | LangGraph has `.github` and release discipline visible | Behind, improved |
| Security | Auth, HMAC, sandboxing exist; audit still red | Comparable tools publish security policies/trust centers | Behind, improved |
| Docs | README quickstart and architecture overview | CrewAI/LangGraph have extensive hosted docs and quickstarts | Behind |
| Release | No local tags, no changelog before this pass | LangGraph shows hundreds of releases | Behind |
| Agent readiness | Added `AGENTS.md`, `CLAUDE.md`, review rubric | LangGraph includes `AGENTS.md` and `CLAUDE.md` | At-par for baseline files |

Roadmap items: hosted docs, broader integration tests, release automation, nonbreaking dependency remediation for the remaining `@anthropic-ai/sdk` and `drizzle-orm` advisories.
