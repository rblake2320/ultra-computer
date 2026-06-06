import path from "path";
import { describe, expect, it } from "vitest";
import { isPathInside, resolveInside } from "../../server/pathSafety.js";

describe("path safety", () => {
  it("rejects sibling directories that share the sandbox prefix", () => {
    const base = path.resolve("/tmp/ultra-sandbox");
    expect(isPathInside(base, path.resolve("/tmp/ultra-sandbox2"))).toBe(false);
    expect(resolveInside(base, "../ultra-sandbox2/file.txt")).toBeNull();
  });

  it("allows the sandbox root and nested children", () => {
    const base = path.resolve("/tmp/ultra-sandbox");
    expect(isPathInside(base, base)).toBe(true);
    expect(resolveInside(base, "nested/file.txt")).toBe(path.resolve(base, "nested/file.txt"));
  });
});
