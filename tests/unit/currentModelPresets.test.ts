import { describe, expect, it } from "vitest";
import { PROVIDER_REGISTRY } from "../../server/modelConnections.js";

describe("current provider model presets", () => {
  it("offers the current GPT-6 family with native tool and reasoning metadata", () => {
    const openAIModels = PROVIDER_REGISTRY.openai.models;

    expect(openAIModels.map((model) => model.modelId)).toEqual(expect.arrayContaining([
      "gpt-6.1-sol",
      "gpt-6-astra",
      "gpt-6-luna",
    ]));
    expect(openAIModels.find((model) => model.recommended)?.modelId).toBe("gpt-6.1-sol");
    expect(openAIModels.every(model => model.capabilities.includes("tools") && model.capabilities.includes("reasoning"))).toBe(true);
    expect(openAIModels.some((model) => model.modelId.startsWith("gpt-5") || model.modelId === "o4-mini")).toBe(false);
  });

  it("uses current provider-verified OpenRouter slugs", () => {
    const openRouterModels = PROVIDER_REGISTRY.openrouter.models;

    expect(openRouterModels.some((model) => model.modelId === "openai/gpt-6.1-sol")).toBe(true);
    expect(openRouterModels.some((model) => model.modelId === "openai/gpt-5.4")).toBe(false);
  });

  it("offers current Claude, Gemini, and local suggestions", () => {
    expect(PROVIDER_REGISTRY.anthropic.models.map(m => m.modelId)).toContain("claude-sonnet-5-5");
    expect(PROVIDER_REGISTRY.google.models.map(m => m.modelId)).toContain("gemini-3.8-flash");
    expect(PROVIDER_REGISTRY.ollama.models.map(m => m.modelId)).toEqual(expect.arrayContaining(["gemma4:latest", "qwen3.8:27b"]));
  });
});
