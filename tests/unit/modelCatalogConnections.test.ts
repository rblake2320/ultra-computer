import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sqlite, storage } from "../../server/storage.js";
import { governedFetch } from "../../server/governedFetch.js";
import { ModelCatalogService } from "../../server/models/catalogService.js";
import { createFromPreset, getProviderCatalog } from "../../server/modelConnections.js";

vi.mock("../../server/governedFetch.js", () => ({ governedFetch: vi.fn() }));
const fetchMock = vi.mocked(governedFetch);
const service = new ModelCatalogService();
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
beforeEach(() => {
  sqlite.exec("DELETE FROM model_catalog; DELETE FROM models; DELETE FROM settings WHERE key LIKE 'model_catalog_sync:%'");
  fetchMock.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe("model catalog connection workflow", () => {
  it("uses the explicitly selected environment variable", async () => {
    vi.stubEnv("SELECTED_MODEL_KEY", "selected-test-key");
    fetchMock.mockResolvedValue(reply({ data: [{ id: "account-model" }] }));
    await service.sync("openai", { authMethod: "env_var", envVarName: "SELECTED_MODEL_KEY" } as any);
    expect(fetchMock.mock.calls[0][1]?.headers).toEqual(expect.objectContaining({ Authorization: "Bearer selected-test-key" }));
  });

  it("rejects an empty explicit key rather than falling back to a different credential", async () => {
    vi.stubEnv("OPENAI_API_KEY", "unselected-test-key");
    fetchMock.mockResolvedValue(reply({ data: [] }));
    await expect(service.sync("openai", { authMethod: "api_key", apiKey: "" } as any)).rejects.toThrow("Enter");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never transmits the application owner key as a provider key", async () => {
    vi.stubEnv("ULTRA_API_KEY", "owner-test-credential");
    fetchMock.mockResolvedValue(reply({ data: [] }));
    await expect(service.sync("openai", { apiKey: "owner-test-credential" })).rejects.toThrow("owner");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("makes a discovered installed model selectable and keeps it untested", async () => {
    fetchMock.mockResolvedValue(reply({ models: [{ name: "gemma4:latest", model: "gemma4:latest" }] }));
    await service.sync("ollama", { baseUrl: "http://127.0.0.1:11434/v1" });
    const model = createFromPreset("ollama", "gemma4:latest", "none", {});
    expect(model).toMatchObject({ modelId: "gemma4:latest", connectionStatus: "unconfigured", isDefault: false, isOrchestrator: false });
  });

  it("offers only the models returned by a complete sync, including an empty catalog", async () => {
    fetchMock.mockResolvedValueOnce(reply({ data: [{ id: "account-model" }] }));
    await service.sync("openai", { apiKey: "test-key" });
    expect(getProviderCatalog().find(p => p.id === "openai")?.models.map(m => m.modelId)).toEqual(["account-model"]);
    fetchMock.mockResolvedValueOnce(reply({ data: [] }));
    await service.sync("openai", { apiKey: "test-key" });
    expect(getProviderCatalog().find(p => p.id === "openai")?.models).toEqual([]);
    expect(createFromPreset("openai", "account-model", "api_key", { apiKey: "test-key" })).toBeNull();
  });

  it("fetches subsequent Google pages before retiring anything", async () => {
    fetchMock.mockResolvedValueOnce(reply({ models: [{ name: "models/page-one" }], nextPageToken: "page-two" }));
    fetchMock.mockResolvedValueOnce(reply({ models: [{ name: "models/page-two" }] }));
    const result = await service.sync("google", { apiKey: "test-key" });
    expect(result.discovered).toBe(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain("pageToken=page-two");
  });

  it("preserves the previous catalog when pagination fails", async () => {
    fetchMock.mockResolvedValueOnce(reply({ models: [{ name: "models/previous" }] }));
    await service.sync("google", { apiKey: "test-key" });
    fetchMock.mockResolvedValueOnce(reply({ models: [{ name: "models/new" }], nextPageToken: "page-two" }));
    fetchMock.mockResolvedValueOnce(reply({}, 401));
    await expect(service.sync("google", { apiKey: "test-key" })).rejects.toThrow("credential");
    expect(service.list("google").map(m => [m.modelId, m.retiredAt])).toEqual([["previous", null]]);
  });

  it("returns an actionable authentication error without copying provider response data", async () => {
    fetchMock.mockResolvedValue(reply({ error: { message: "private-provider-response" } }, 401));
    await expect(service.sync("openai", { apiKey: "test-key" })).rejects.toThrow("credential");
    expect(service.list("openai")).toEqual([]);
  });
});
