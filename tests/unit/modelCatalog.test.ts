import { describe, expect, it } from "vitest";
import {
  parseAnthropicModelList,
  parseGoogleModelList,
  parseOllamaModelList,
  parseOpenAIModelList,
} from "../../server/models/catalogService.js";

describe("provider model catalog parsing", () => {
  it("records OpenAI-compatible discovery without inventing capabilities", () => {
    expect(parseOpenAIModelList("openai", {
      object: "list",
      data: [{ id: "future-model", created: 123, owned_by: "provider" }],
    })).toEqual([expect.objectContaining({
      provider: "openai",
      modelId: "future-model",
      capabilities: [],
      lifecycle: "unknown",
      source: "provider",
    })]);
  });

  it("uses Anthropic display names but leaves compatibility unclaimed", () => {
    expect(parseAnthropicModelList({
      data: [{
        id: "claude-future",
        display_name: "Claude Future",
        created_at: "2026-07-01T00:00:00Z",
        type: "model",
      }],
    })).toEqual([expect.objectContaining({
      modelId: "claude-future",
      displayName: "Claude Future",
      capabilities: [],
      lifecycle: "unknown",
    })]);
  });

  it("preserves Google token limits and preview lifecycle evidence", () => {
    expect(parseGoogleModelList({
      models: [{
        name: "models/gemini-future-preview",
        displayName: "Gemini Future",
        inputTokenLimit: 1_000_000,
        outputTokenLimit: 65_536,
        supportedGenerationMethods: ["generateContent", "countTokens"],
      }],
    })).toEqual([expect.objectContaining({
      modelId: "gemini-future-preview",
      lifecycle: "preview",
      contextWindow: 1_000_000,
      maxOutputTokens: 65_536,
      capabilities: [],
    })]);
  });

  it("accepts real Ollama tags responses without guessing model features", () => {
    expect(parseOllamaModelList({
      models: [{
        name: "qwen-next:latest",
        model: "qwen-next:latest",
        modified_at: "2026-07-16T00:00:00Z",
        size: 1234,
      }],
    })).toEqual([expect.objectContaining({
      provider: "ollama",
      modelId: "qwen-next:latest",
      lifecycle: "available",
      capabilities: [],
    })]);
  });

  it("rejects malformed provider responses instead of returning fake success", () => {
    expect(() => parseOpenAIModelList("openai", {})).toThrow("data array");
    expect(() => parseAnthropicModelList({ data: {} })).toThrow("data array");
    expect(() => parseGoogleModelList({ models: null })).toThrow("models array");
    expect(() => parseOllamaModelList({ models: "invalid" })).toThrow("models array");
  });
});
