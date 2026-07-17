import { afterEach, describe, expect, it } from "vitest";
import { sqlite, storage } from "../../server/storage.js";
import { modelService } from "../../server/services/modelService.js";

const ids: string[] = [];

afterEach(() => {
  for (const id of ids.splice(0)) {
    sqlite.prepare("DELETE FROM models WHERE id = ?").run(id);
    sqlite.prepare("DELETE FROM connectors WHERE id = ?").run(id);
  }
});

describe("credential persistence boundaries", () => {
  it("encrypts connector configuration at rest and decrypts it only for server callers", () => {
    const id = `credential-connector-${crypto.randomUUID()}`;
    ids.push(id);
    const plaintext = JSON.stringify({ apiKey: "connector-secret", serverUrl: "https://example.test" });

    const created = storage.createConnector({
      id,
      name: "Credential test",
      type: "api_key",
      category: "custom",
      description: "test",
      status: "connected",
      config: plaintext,
      mcpServerUrl: null,
      scopes: "[]",
      logoUrl: null,
      lastSynced: null,
    });

    const raw = sqlite.prepare("SELECT config FROM connectors WHERE id = ?").get(id) as { config: string };
    expect(raw.config).toMatch(/^enc:/);
    expect(raw.config).not.toContain("connector-secret");
    expect(created.config).toBe(plaintext);
    expect(storage.getConnector(id)?.config).toBe(plaintext);
  });

  it("migrates legacy plaintext connector configuration on first read", () => {
    const id = `legacy-connector-${crypto.randomUUID()}`;
    ids.push(id);
    const plaintext = JSON.stringify({ accessToken: "legacy-secret" });
    sqlite.prepare(`
      INSERT INTO connectors
        (id, name, type, category, description, status, config, scopes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, "Legacy", "oauth", "custom", "test", "connected", plaintext, "[]", Date.now());

    expect(storage.getConnector(id)?.config).toBe(plaintext);
    const raw = sqlite.prepare("SELECT config FROM connectors WHERE id = ?").get(id) as { config: string };
    expect(raw.config).toMatch(/^enc:/);
    expect(raw.config).not.toContain("legacy-secret");
  });

  it("encrypts model keys while returning sanitized service responses", () => {
    const id = `credential-model-${crypto.randomUUID()}`;
    ids.push(id);
    const response = modelService.create({
      id,
      name: "Credential model",
      provider: "openai",
      modelId: "credential-test-model",
      baseUrl: null,
      apiKey: "model-secret",
      enabled: true,
      capabilities: "[\"chat\"]",
      contextWindow: 8192,
      isDefault: true,
      isOrchestrator: true,
      speedTier: "medium",
      notes: null,
      authMethod: "api_key",
      oauthTokens: null,
      envVarName: null,
      connectionStatus: "unconfigured",
      connectionError: null,
      lastTestedAt: null,
      lastTestLatency: null,
    });

    const raw = sqlite.prepare("SELECT api_key FROM models WHERE id = ?").get(id) as { api_key: string };
    expect(raw.api_key).toMatch(/^enc:/);
    expect(raw.api_key).not.toContain("model-secret");
    expect(response.apiKey).toBeNull();
    expect(response.oauthTokens).toBeNull();
    expect(storage.getModel(id)?.apiKey).toBe("model-secret");
  });

  it("never returns a submitted key from the quick-add response", async () => {
    const result = await modelService.quickAdd("openai", "gpt-5.6-sol", "api_key", {
      apiKey: "quick-add-secret",
      baseUrl: "http://127.0.0.1:1/v1",
    });
    expect(result.model).not.toBeNull();
    if (!result.model) return;
    ids.push(result.model.id);
    expect(result.model.apiKey).toBeNull();
    expect(result.model.oauthTokens).toBeNull();
    const raw = sqlite.prepare("SELECT api_key FROM models WHERE id = ?").get(result.model.id) as { api_key: string };
    expect(raw.api_key).toMatch(/^enc:/);
    expect(raw.api_key).not.toContain("quick-add-secret");
  });
});
