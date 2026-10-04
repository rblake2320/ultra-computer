# ADR-0006: Bounded model turns and an optional OpenShell sandbox

Status: accepted for the private single-owner deployment, 2026-10-04.
Related: WHY-0039, WHY-0040, ADR-0004, ADR-0005.

The installed chat generated speculative agent recommendations instead of
performing a requested upgrade. Real Ollama measurements also observed three
calls each for arithmetic and a short summary: needless tool use, planning and
memory extraction consumed tokens beyond the answer itself.

Use a direct worker for one request and retain planning for explicit sequential
or longer work. Plain answers omit tool schemas. Automatically injected KB
content is capped at 2,048 tokens, recent dialogue at six messages/8,000 characters.
Ollama optional thinking is disabled through its actual compatible HTTP field.
Memory stores explicit original owner text; ordinary chat adds no extraction call.
All parallel workers and fallbacks share an AsyncLocalStorage admission budget:
16 provider attempts, 64,000 estimated input tokens and 32,768 output tokens plus
pending reservations. Input accounting uses UTF-8 bytes/4, not an exact tokenizer.
Unknown output usage is charged at its reserved allowance. This augments the
existing paid-provider ledger and does not alter its $20 ceiling. Tool requests
must have successful receipts; explicitly named tools must match. This check
blocks unexecuted action claims; receiving acceptance checks actual file contents.
It does not validate every sentence a model writes.

NVIDIA OpenShell is an optional isolation engine on Windows with WSL Ubuntu 24.04
and Docker Desktop integration. CLI and gateway/runtime/supervisor images are
pinned by digest. Only the trusted gateway receives the Docker socket. Workloads
run as UID/GID 1000, offline, with Landlock required. No automatic provider
attachment, host-command fallback or automatic network approval exists. The
gateway publishes authenticated gRPC and health on loopback ports 5671 and 5672.
Selecting OpenShell fails closed if its authenticated gateway is absent.

Native Linux staging is necessary: Windows-mounted WSL files report zero
allocated blocks, and vendor sparse-tar upload converted a nonempty input to
zeros in live tests. A fixed helper sequentially copies checked sandbox data to
a private Linux directory, then uploads directory contents at /workspace.
Incoming JSON manifests reject links, special files, traversal, Windows aliases,
conflicting names and quotas before host writes. Each transfer permits 256 files
and 8 MiB. Remote deletions are not mirrored to host files. The gateway is trusted
infrastructure; this integration is not a multi-tenant boundary.

Regression controls: efficientMemory, actionEvidence, modelRunBudget,
conversationContext and captured providerAdapters request tests. Real acceptance:
`npm run test:efficiency`, `npm run test:openshell`, then the installed
`npm run verify:efficient-owner` and `npm run verify:owner`.

Sources checked 2026-10-04:
- https://docs.ollama.com/api/openai-compatibility
- https://docs.nvidia.com/openshell/latest/about/overview
- https://docs.nvidia.com/openshell/latest/how-it-works/sandboxes/overview
- https://github.com/NVIDIA/OpenShell/releases/tag/v0.1.2
