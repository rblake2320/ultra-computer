import { describe, expect, it } from "vitest";
import {
  collectNormalizedEvents,
  hasCapabilities,
  isTerminalModelEvent,
  matchCapabilities,
  modelEvents,
  normalizeCapabilities,
  normalizeUsage,
  ProviderAdapterError,
  type NormalizedModelEvent,
  type ProviderAdapter,
} from "../../server/models/index.js";

async function* eventStream(
  events: readonly NormalizedModelEvent[],
): AsyncIterable<NormalizedModelEvent> {
  yield* events;
}

describe("model capability matching", () => {
  it("normalizes legacy aliases, case, separators, and duplicates", () => {
    expect(
      normalizeCapabilities([
        " Tool_Use ",
        "FUNCTION CALLING",
        "analyze",
        "VISION",
        "future-modality",
      ]),
    ).toEqual(["future-modality", "reasoning", "tools", "vision"]);
  });

  it("matches all, any, and excluded capability requirements", () => {
    const result = matchCapabilities(
      ["chat", "tools", "vision"],
      {
        all: ["chat", "tool-use"],
        any: ["audio-input", "vision"],
        none: ["image-generation"],
      },
    );

    expect(result).toEqual({
      matches: true,
      available: ["chat", "tools", "vision"],
      missing: [],
      anySatisfied: true,
      missingAny: [],
      forbidden: [],
    });
    expect(hasCapabilities(["chat"], { all: ["chat"] })).toBe(true);
  });

  it("reports every reason a model is incompatible", () => {
    expect(
      matchCapabilities(
        ["chat", "image"],
        {
          all: ["chat", "tools"],
          any: ["vision", "audio-input"],
          none: ["image-generation"],
        },
      ),
    ).toMatchObject({
      matches: false,
      missing: ["tools"],
      anySatisfied: false,
      missingAny: ["audio-input", "vision"],
      forbidden: ["image-generation"],
    });
  });

  it("rejects empty capability identifiers", () => {
    expect(() => normalizeCapabilities(["chat", "  "])).toThrow(
      "Capability identifiers must not be empty",
    );
  });
});

describe("normalized model events", () => {
  it("collects text, reasoning, usage, and fragmented tool calls", async () => {
    const result = await collectNormalizedEvents(
      eventStream([
        modelEvents.started("openai", "model-next", "response-1"),
        modelEvents.reasoning("checking"),
        modelEvents.text("Hello"),
        modelEvents.text(" world"),
        modelEvents.toolCall(0, {
          id: "call-1",
          name: "weather",
          argumentsDelta: '{"city":',
        }),
        modelEvents.toolCall(0, { argumentsDelta: '"Chicago"}' }),
        modelEvents.usage({
          inputTokens: 10,
          outputTokens: 5,
          totalTokens: 15,
          reasoningTokens: 2,
        }),
        modelEvents.completed("tool_calls"),
      ]),
    );

    expect(result).toEqual({
      provider: "openai",
      model: "model-next",
      responseId: "response-1",
      text: "Hello world",
      reasoning: "checking",
      refusal: "",
      toolCalls: [
        {
          id: "call-1",
          name: "weather",
          arguments: '{"city":"Chicago"}',
        },
      ],
      usage: {
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
        reasoningTokens: 2,
      },
      finishReason: "tool_calls",
      completed: true,
    });
  });

  it("preserves normalized provider errors for retry policy", async () => {
    const errorEvent = modelEvents.error({
      code: "rate_limit",
      message: "Try later",
      retryable: true,
      status: 429,
    });
    const result = await collectNormalizedEvents(
      eventStream([
        errorEvent,
        modelEvents.text("must be ignored"),
        modelEvents.completed("stop"),
      ]),
    );

    expect(isTerminalModelEvent(errorEvent)).toBe(true);
    expect(result.completed).toBe(false);
    expect(result.text).toBe("");
    expect(result.finishReason).toBe("error");
    expect(result.error).toMatchObject({ code: "rate_limit", retryable: true });
  });

  it("rejects invalid token counts and tool-call indexes", () => {
    expect(() =>
      normalizeUsage({ inputTokens: -1, outputTokens: 1, totalTokens: 0 }),
    ).toThrow("inputTokens must be a non-negative safe integer");
    expect(() => modelEvents.toolCall(-1, {})).toThrow(
      "Tool-call index must be a non-negative safe integer",
    );
  });
});

describe("provider adapter contract", () => {
  it("supports a provider with generation but no discovery or streaming", async () => {
    const adapter: ProviderAdapter = {
      provider: "local-test",
      features: { discovery: false, streaming: false },
      async generate(request) {
        return {
          provider: "local-test",
          model: request.model,
          text: "ok",
          toolCalls: [],
          finishReason: "stop",
        };
      },
    };

    const response = await adapter.generate(
      {
        model: "future-model",
        messages: [{ role: "user", content: "hello" }],
      },
      { requestId: "request-1" },
    );

    expect(response.model).toBe("future-model");
    expect(adapter.stream).toBeUndefined();
    expect(adapter.listModels).toBeUndefined();
  });

  it("carries normalized provider failure metadata", () => {
    const error = new ProviderAdapterError(
      {
        code: "authentication_failed",
        message: "Provider rejected credentials",
        retryable: false,
        status: 401,
      },
      { cause: new Error("SDK error") },
    );

    expect(error.name).toBe("ProviderAdapterError");
    expect(error.details).toMatchObject({
      code: "authentication_failed",
      retryable: false,
      status: 401,
    });
    expect(error.cause).toBeInstanceOf(Error);
  });
});
