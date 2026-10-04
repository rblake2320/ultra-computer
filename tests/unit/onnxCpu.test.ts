import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";

it("executes real native CPU inference with the bundled provider", () => {
  const child = spawnSync(process.execPath, ["script/verify-onnx-cpu.mjs"], {
    cwd: process.cwd(), encoding: "utf8", timeout: 15000, windowsHide: true,
  });
  expect(child.status, child.stderr).toBe(0);
  expect(child.stdout).toContain("all nine expected values");
}, 20000);
