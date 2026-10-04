import { describe, expect, it } from "vitest";
import { requireFinalAnswer, requireProviderCompletion } from "../../server/executionOutcome.js";

describe("execution outcome boundary", () => {
  it.each(["", "  ", "[Agent reached max iterations]", "[LLM call failed after retries: network]", "[FAILED: error]"])("rejects a diagnostic or empty result: %s", output => {
    expect(() => requireFinalAnswer(output)).toThrow();
  });
  it("rejects exhausted work even if the last tool request contains text", () => {
    expect(() => requireFinalAnswer("a tool request", true)).toThrow(/iteration limit/);
  });
  it("accepts a final answer", () => expect(requireFinalAnswer("2 + 2 = 4.")).toBe("2 + 2 = 4."));
  it.each(["length", "content_filter", "cancelled", "error"])("rejects an incomplete provider result even with output: %s", reason => {
    expect(() => requireProviderCompletion(true, 0, reason)).toThrow(/did not finish/);
  });
  it("rejects missing completion and reasoning-only results", () => {
    expect(() => requireProviderCompletion(true, 0, undefined, false)).toThrow(/missing completion/);
    expect(() => requireProviderCompletion(false, 0, "stop")).toThrow(/no answer/);
  });
  it("allows a finished native tool call before the final answer", () => {
    expect(() => requireProviderCompletion(false, 1, "tool_calls")).not.toThrow();
  });
});
