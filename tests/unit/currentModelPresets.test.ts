import { describe, expect, it } from "vitest";
import { PROVIDER_REGISTRY } from "../../server/modelConnections.js";

describe("current provider model presets", () => {
  it("offers the current GPT-5.6 family without stale GPT-5.4 defaults", () => {
    const openAIModels = PROVIDER_REGISTRY.openai.models;

    expect(openAIModels.map((model) => model.modelId)).toEqual(expect.arrayContaining([
      "gpt-5.6-sol",
      "gpt-5.6-terra",
      "gpt-5.6-luna",
    ]));
    expect(openAIModels.find((model) => model.recommended)?.modelId).toBe("gpt-5.6-sol");
    expect(openAIModels.some((model) => model.modelId.startsWith("gpt-5.4"))).toBe(false);
  });

  it("uses the current GPT-5.6 Sol slug for the OpenRouter fallback", () => {
    const openRouterModels = PROVIDER_REGISTRY.openrouter.models;

    expect(openRouterModels.some((model) => model.modelId === "openai/gpt-5.6-sol")).toBe(true);
    expect(openRouterModels.some((model) => model.modelId === "openai/gpt-5.4")).toBe(false);
  });
});
