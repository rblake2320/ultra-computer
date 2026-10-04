# ADR-0005: Connect models from the selected credential and current provider catalog

Accepted for implementation, 2026-10-04.

Catalog sync uses the explicitly selected API key, environment variable or local
unauthenticated endpoint. Missing explicit credentials fail without silently using
a different saved key. Background/API callers that omit the selection prefer a
connected saved model. Never transmit the application owner key as a provider key.
Upstream authentication denial returns an actionable HTTP 422 rather than the
application's owner-authentication HTTP 401. Provider error bodies are not echoed.

Fetch all Google/Anthropic pages with fixed-origin cursor URLs, bounded requests,
repeated-cursor detection and a 20-page ceiling. Publish the catalog only after
complete discovery. A complete empty catalog is authoritative. Retired models
cannot reappear through static presets; reappearing models need a new probe.
Quick Add accepts discovered models, uses the synchronized endpoint, and returns
their receiving connection status. Discovery does not assign default/core roles.

Suggested presets reflect the provider documentation checked below. Synced account
or installed-model availability takes precedence. Use OpenAI Responses and Claude
Messages natively. GPT-6 probes use supported low/none reasoning with 1,024 output
tokens; current Claude probes use low effort and fixed sampling. Ollama short
probes disable optional thinking. Paid prices are conservative Standard-rate
bounds, including cache-write and OpenAI long-context/regional premiums; unknown
paid models remain blocked under the existing $20 ceiling. OpenRouter's model list
is public, while generation still requires credentials and verified budget pricing.

Controls: modelCatalogConnections, currentModelPresets, providerAdapters and
credentialStorage unit tests; live installed-model discovery/Quick Add browser
workflow; receiving tests against the installed private build. Old saved model
records and owner data are retained.

Sources checked 2026-10-04:
- [GPT-6.1 Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol),
  [GPT-6 Astra](https://developers.openai.com/api/docs/models/gpt-6-astra),
  [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna),
  [GPT-6 request parameters](https://developers.openai.com/api/docs/guides/latest-model).
- [Claude models](https://platform.claude.com/docs/en/models/overview),
  [current Claude thinking/sampling](https://platform.claude.com/docs/en/build-with-claude/thinking).
- [Gemini models](https://ai.google.dev/gemini-api/docs/models),
  [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing).
- [OpenRouter public models](https://openrouter.ai/docs/api/api-reference/models/list-all-models-and-their-properties).
- [Ollama compatibility](https://github.com/ollama/ollama/blob/main/docs/api/openai-compatibility.mdx),
  [Gemma 4](https://ollama.com/library/gemma4), [Qwen 3.8](https://ollama.com/library/qwen3.8).
