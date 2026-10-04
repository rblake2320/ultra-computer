import { spawnSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { expect, it } from "vitest";

it.each(["backup", "restore"])("refuses %s state paths under public assets before reading private configuration", operation => {
  const destination = path.resolve("dist/public/private-state-regression");
  const child = spawnSync(process.execPath, ["script/private-state.mjs", operation, destination], {
    cwd: process.cwd(), encoding: "utf8", timeout: 10000, windowsHide: true,
  });
  expect(child.status).toBe(1);
  expect(child.stderr).toContain("outside this checkout");
  expect(fs.existsSync(destination)).toBe(false);
});
