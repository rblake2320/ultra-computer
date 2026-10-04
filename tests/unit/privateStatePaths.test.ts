import { spawnSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { expect, it } from "vitest";

it.each(["backup", "restore"])("refuses %s state paths under public assets before reading private configuration", operation => {
  const absolute = path.resolve("dist/public/private-state-regression");
  const destination = process.platform === "win32" ? absolute.toLowerCase() : absolute;
  const child = spawnSync(process.execPath, ["script/private-state.mjs", operation, destination], {
    cwd: process.cwd(), encoding: "utf8", timeout: 10000, windowsHide: true,
  });
  expect(child.status).toBe(1);
  expect(child.stderr).toContain("outside this checkout");
  expect(fs.existsSync(destination)).toBe(false);
}, 15000);

it("refuses an outside directory linked back into the checkout", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ultra-archive-path-"));
  const link = path.join(directory, "checkout");
  try {
    fs.symlinkSync(process.cwd(), link, process.platform === "win32" ? "junction" : "dir");
    const child = spawnSync(process.execPath, ["script/private-state.mjs", "backup", path.join(link, "private-state-regression")], {
      encoding: "utf8", timeout: 10000, windowsHide: true,
    });
    expect(child.status).toBe(1);
    expect(child.stderr).toContain("outside this checkout");
  } finally { fs.unlinkSync(link); fs.rmdirSync(directory); }
}, 15000);
