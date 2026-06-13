# Integration Tests — Live External Capability Verification

These tests exercise real external services. They require credentials and run against live endpoints. They are NOT part of `npm run test:unit` — they must be invoked explicitly.

## Evidence label

Passing integration tests produce `VERIFIED LIVE` evidence for the capability under test.

## Required environment variables per test

| Test file | Required vars | What it verifies |
|---|---|---|
| `github-live.test.ts` | `GITHUB_TOKEN`, `ULTRA_API_KEY` | Real GitHub connector read via governed transport |
| `model-provider-live.test.ts` | `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`, `ULTRA_API_KEY` | Real model provider call via governed orchestrator |
| `redis-queue-live.test.ts` | `REDIS_URL`, `ULTRA_API_KEY` | Real BullMQ queue dispatch — job enqueued and processed |
| `temporal-durable-live.test.ts` | `TEMPORAL_ADDRESS`, `ULTRA_API_KEY` | Real Temporal workflow execution and crash-resume |

## How to run

```bash
# GitHub connector live test
GITHUB_TOKEN=ghp_... ULTRA_API_KEY=... npx vitest run tests/integration/github-live.test.ts

# Model provider live test (Anthropic)
ANTHROPIC_API_KEY=sk-ant-... ULTRA_API_KEY=... npx vitest run tests/integration/model-provider-live.test.ts

# Redis queue live test (requires Redis running)
REDIS_URL=redis://localhost:6379 ULTRA_API_KEY=... npx vitest run tests/integration/redis-queue-live.test.ts

# Temporal durable live test (requires Temporal + Redis running via docker compose up -d)
TEMPORAL_ADDRESS=localhost:7233 ULTRA_API_KEY=... npx vitest run tests/integration/temporal-durable-live.test.ts
```

## Credential security

- Never commit credentials. Use `.env.local` (gitignored) or a secrets manager.
- Integration tests read credentials from environment variables only.
- No credential is logged; the policy audit records are redacted.
