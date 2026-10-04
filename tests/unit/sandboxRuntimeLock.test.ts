import fs from "node:fs";
import { expect, it } from "vitest";

it("installs the sandbox interpreter from an integrity-locked dependency graph", () => {
  const dockerfile = fs.readFileSync("Dockerfile.sandbox", "utf8");
  expect(dockerfile).toContain("COPY sandbox-runtime/package.json sandbox-runtime/package-lock.json");
  expect(dockerfile).toContain("npm ci --omit=dev --ignore-scripts");
  expect(dockerfile).not.toMatch(/npm install.*(?:--global|-g)/);
  const lock = JSON.parse(fs.readFileSync("sandbox-runtime/package-lock.json", "utf8"));
  expect(lock.packages["node_modules/tsx"].version).toBe("4.23.1");
  expect(lock.packages["node_modules/esbuild"].version).toBe("0.28.1");
  for (const [name, entry] of Object.entries(lock.packages) as [string, any][]) {
    if (name) expect(entry.integrity, name).toMatch(/^sha512-/);
  }
});
