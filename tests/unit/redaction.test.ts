import { describe, expect, it } from "vitest";
import { sanitizeToolArgsForExposure } from "../../server/redaction.js";

describe("tool argument exposure", () => {
  it("always removes browser typing values from exposed arguments", () => {
    const raw = {
      action: "type",
      selector: "#ordinary-looking-field",
      value: "private text that does not match a token pattern",
    };

    const safe = sanitizeToolArgsForExposure("browser_action", raw);

    expect(safe).toEqual({
      action: "type",
      selector: "#ordinary-looking-field",
      value: "[REDACTED BROWSER INPUT]",
    });
    expect(raw.value).toBe("private text that does not match a token pattern");
  });

  it("redacts generic secret keys without mutating execution arguments", () => {
    const raw = { action: "click", apiKey: "plain-secret" };
    expect(sanitizeToolArgsForExposure("other_tool", raw)).toEqual({
      action: "click",
      apiKey: "[REDACTED]",
    });
    expect(raw.apiKey).toBe("plain-secret");
  });
});
