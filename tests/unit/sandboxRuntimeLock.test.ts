import fs from "node:fs";
import { expect, it } from "vitest";

it('pins every external Dockerfile base while permitting earlier local build stages', () => {
  for (const name of fs.readdirSync('.').filter(name => /^Dockerfile(?:\.|$)/.test(name))) {
    const stages = new Set<string>();
    const dockerfile = fs.readFileSync(name, 'utf8');
    for (const match of dockerfile.matchAll(/^FROM\s+(\S+)(?:\s+AS\s+(\S+))?\s*$/gmi)) {
      expect(stages.has(match[1].toLowerCase()) || match[1] === 'scratch' || /@sha256:[a-f0-9]{64}$/.test(match[1]), `${name}: ${match[1]}`).toBe(true);
      if (match[2]) stages.add(match[2].toLowerCase());
    }
  }
});

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
