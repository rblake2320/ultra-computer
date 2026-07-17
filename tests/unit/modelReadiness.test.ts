import { describe, expect, it } from "vitest";
import type { Model } from "@shared/schema";
import { isModelRoutable, modelRoutabilityIssue } from "../../server/modelReadiness.js";

function model(overrides: Partial<Model> = {}): Model {
  return {
    id: "readiness-model",
    name: "Readiness model",
    provider: "openai",
    modelId: "readiness-upstream",
    baseUrl: null,
    apiKey: "secret-in-memory",
    enabled: true,
    capabilities: '["chat"]',
    contextWindow: 8192,
    isDefault: false,
    isOrchestrator: false,
    speedTier: "medium",
    notes: null,
    authMethod: "api_key",
    oauthTokens: null,
    envVarName: null,
    connectionStatus: "connected",
    connectionError: null,
    lastTestedAt: Date.now(),
    lastTestLatency: 1,
    createdAt: Date.now(),
    ...overrides,
  };
}

describe("model routability", () => {
  it("accepts a connected enabled model with live credentials", () => {
    expect(isModelRoutable(model())).toBe(true);
  });

  it("rejects failed, disconnected, and disabled records", () => {
    expect(modelRoutabilityIssue(model({ connectionStatus: "error" }))).toContain("error");
    expect(modelRoutabilityIssue(model({ connectionStatus: "disconnected" }))).toContain("disconnected");
    expect(modelRoutabilityIssue(model({ enabled: false }))).toBe("disabled");
  });

  it("rejects missing and expired credentials even after an earlier successful probe", () => {
    expect(modelRoutabilityIssue(model({ apiKey: null }))).toBe("API key is missing");
    expect(modelRoutabilityIssue(model({
      authMethod: "oauth",
      apiKey: null,
      oauthTokens: JSON.stringify({ access_token: "expired", expires_at: Date.now() - 1 }),
    }))).toContain("expired");
  });
});
