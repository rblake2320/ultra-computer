import { describe, expect, it } from "vitest";
import type { Model } from "@shared/schema";
import {
  CONNECTION_TEST_MAX_OUTPUT_TOKENS,
  connectionTestRequest,
  resolveReasoningEffort,
  selectModelFromCandidates,
} from "../../server/modelRouter.js";

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
    authMethod: "none",
    oauthTokens: null,
    envVarName: null,
    connectionStatus: "connected",
    connectionError: null,
    lastTestedAt: null,
    lastTestLatency: null,
    createdAt: 1,
    ...overrides,
  };
}

describe("model router selection", () => {
  it("keeps connection probes above provider minimums while tightly bounded", () => {
    const request = connectionTestRequest({
      provider: "openai",
      modelId: "gpt-5.6-sol",
      capabilities: '["chat","reasoning"]',
    });

    expect(request).toMatchObject({
      model: "gpt-5.6-sol",
      maxOutputTokens: CONNECTION_TEST_MAX_OUTPUT_TOKENS,
      reasoningEffort: "medium",
    });
    expect(request.maxOutputTokens).toBeGreaterThanOrEqual(16);
    expect(request.maxOutputTokens).toBeLessThanOrEqual(64);
  });

  it("maps OpenAI reasoning models to medium unless the session explicitly overrides it", () => {
    const currentReasoningModel = model({
      modelId: "gpt-5.6-sol",
      capabilities: '["chat","reasoning"]',
    });

    expect(resolveReasoningEffort(currentReasoningModel)).toBe("medium");
    expect(resolveReasoningEffort(currentReasoningModel, "high")).toBe("high");
    expect(resolveReasoningEffort({
      ...currentReasoningModel,
      provider: "anthropic",
    })).toBeUndefined();
  });

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

  it("uses a chat-only model for analysis when no reasoning model is available", () => {
    const chatModel = model({ capabilities: '["chat"]' });
    expect(selectModelFromCandidates([chatModel], "analyze")?.id).toBe(chatModel.id);
  });

  it("excludes enabled models that have not passed a connection test", () => {
    const failed = model({ connectionStatus: "error", connectionError: "probe failed" });
    const unconfigured = model({ id: "configured-2", connectionStatus: "unconfigured" });

    expect(selectModelFromCandidates([failed, unconfigured], "general")).toBeNull();
  });

  it("excludes a connected env-var model when its credential is no longer present", () => {
    const envName = `ULTRA_TEST_MISSING_${crypto.randomUUID().replaceAll("-", "")}`;
    const missingCredential = model({ authMethod: "env_var", envVarName: envName });

    expect(selectModelFromCandidates([missingCredential], "general")).toBeNull();
  });
});
