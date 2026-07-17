import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { isPathInside, resolveInside } from "../../server/pathSafety.js";

describe("path safety", () => {
  const cleanup: string[] = [];

  afterEach(() => {
    for (const dir of cleanup.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
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

  it("rejects a missing child below a symlinked ancestor", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ultra-path-root-"));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "ultra-path-outside-"));
    cleanup.push(root, outside);
    fs.symlinkSync(outside, path.join(root, "escape"), "junction");

    expect(resolveInside(root, "escape/not-created/output.txt")).toBeNull();
  });
});
