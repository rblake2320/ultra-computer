import { describe, expect, it } from "vitest";
import { CacheEngine, type CacheRequest } from "../../server/cacheEngine.js";
describe("semantic response contract isolation", () => {
  it("never crosses model, schema, sampling, route or instruction boundaries", () => {
    const cache = new CacheEngine({ exactCache: { enabled: false, maxEntries: 10, defaultTTLMs: 60_000 } });
    const request: CacheRequest = { model: "provider:owner-model:upstream", messages: [{ role: "user", content: "Return the number four as the answer." }], parameters: { temperature: 0 }, route: "chat/general" };
    cache.set(request, { content: "4", tokensIn: 1, tokensOut: 1, modelId: "owner-model" });
    expect(cache.get(request)?.tier).toBe("semantic");
    expect(cache.get({ ...request, model: "other-model" })).toBeNull();
    expect(cache.get({ ...request, parameters: { temperature: 1 } })).toBeNull();
    expect(cache.get({ ...request, parameters: { temperature: 0, responseFormat: { type: "json_schema" } } })).toBeNull();
    expect(cache.get({ ...request, route: "chat/analyze" })).toBeNull();
    expect(cache.get({ ...request, messages: [{ role: "system", content: "Answer in another format." }, ...request.messages] })).toBeNull();
    cache.shutdown();
  });
});
