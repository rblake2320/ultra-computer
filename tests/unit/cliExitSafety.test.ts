import fs from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";

it("keeps fetch-based CLIs on natural exits so Windows async handles can drain", () => {
  const unsafe = fs.readdirSync("script").filter(name => /\.(mjs|ts)$/.test(name)).filter(name => {
    const source = fs.readFileSync(path.join("script", name), "utf8");
    return /\bfetch\s*\(/.test(source) && /\bprocess\.exit\s*\(/.test(source);
  });
  expect(unsafe).toEqual([]);
});
