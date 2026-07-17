import { describe, expect, it } from "vitest";
import { htmlToPlainText, safeEvalMath } from "../../server/tools.js";

describe("tool input security boundaries", () => {
  it("evaluates supported arithmetic without compiling source text", () => {
    expect(safeEvalMath("Math.sqrt(144) + Math.pow(2, 3) * 2")).toBe(28);
    expect(safeEvalMath("2 ** 3 ** 2")).toBe(512);
  });

  it("rejects code-shaped calculator input and non-finite results", () => {
    expect(() => safeEvalMath("globalThis.process.exit()"))
      .toThrow(/Unexpected token/);
    expect(() => safeEvalMath("Math.constructor('return process')()"))
      .toThrow(/Disallowed function/);
    expect(() => safeEvalMath("1 / 0")).toThrow(/finite/);
  });

  it("extracts remote HTML as inert text without leaking script or style bodies", () => {
    const markup = [
      "<style>.secret { display: block }</style>",
      "<p>Hello &amp; goodbye</p>",
      "<script>globalThis.compromised = true</script>",
      "<p>&lt;safe&gt; &#x1F642;</p>",
    ].join("");

    expect(htmlToPlainText(markup)).toBe("Hello & goodbye <safe> 🙂");
  });

  it("drops an unterminated active-content element instead of exposing its body", () => {
    expect(htmlToPlainText("before<script>alert('x')"))
      .toBe("before");
  });
});
