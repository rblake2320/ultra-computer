import { describe, expect, it } from "vitest";
import type { Model } from "@shared/schema";
import { selectModelFromCandidates } from "../../server/modelRouter.js";

function model(overrides: Partial<Model>): Model {
  return {
    id: "configured-1",
    name: "Configured model",
    provider: "openai",
    modelId: "upstream-1",
    baseUrl: null,
    apiKey: null,
    enabled: true,
    capabilities: '["chat"]',
    contextWindow: 128_000,
    isDefault: false,
    isOrchestrator: false,
    speedTier: "medium",
    notes: null,
    authMethod: "env_var",
    oauthTokens: null,
    envVarName: "OPENAI_API_KEY",
    connectionStatus: "unconfigured",
    connectionError: null,
    lastTestedAt: null,
    lastTestLatency: null,
    createdAt: 1,
    ...overrides,
  };
}

describe("model router selection", () => {
  it("treats configured IDs as authoritative before upstream model IDs", () => {
    const configured = model({ id: "same-value", modelId: "gpt-current" });
    const upstreamCollision = model({
      id: "configured-2",
      provider: "openai_compat",
      modelId: "same-value",
    });

    expect(selectModelFromCandidates(
      [upstreamCollision, configured],
      "general",
      "same-value",
    )?.id).toBe("same-value");
  });

  it("rejects an ambiguous upstream ID instead of silently choosing a provider", () => {
    const first = model({ id: "configured-1", modelId: "shared-upstream" });
    const second = model({
      id: "configured-2",
      provider: "openai_compat",
      modelId: "shared-upstream",
    });

    expect(() => selectModelFromCandidates(
      [first, second],
      "general",
      "shared-upstream",
    )).toThrow("ambiguous");
  });

  it("fails closed when a requested task capability is not declared", () => {
    const chatOnly = model({ capabilities: '["chat"]' });

    expect(() => selectModelFromCandidates(
      [chatOnly],
      "code",
      chatOnly.id,
    )).toThrow("missing capabilities: code");
    expect(selectModelFromCandidates([chatOnly], "code")).toBeNull();
  });

  it("normalizes legacy analyze capability to reasoning", () => {
    const reasoningModel = model({
      capabilities: '["chat","analyze"]',
      speedTier: "powerful",
    });

    expect(selectModelFromCandidates([reasoningModel], "analyze")?.id)
      .toBe(reasoningModel.id);
  });
});
