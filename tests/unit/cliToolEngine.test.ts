import { describe, expect, it } from "vitest";
import {
  executeCommand,
  parseStructuredCommand,
} from "../../server/cliToolEngine.js";

describe("shell-free CLI execution", () => {
  it("parses quoted arguments without shell expansion", () => {
    expect(parseStructuredCommand('echo "hello world" plain')).toEqual({
      executable: "echo",
      args: ["hello world", "plain"],
    });
  });

  it.each(["echo safe | cat", "echo x > output.txt", "echo $(whoami)", "echo a && echo b"])(
    "rejects shell syntax: %s",
    (command) => {
      expect(() => parseStructuredCommand(command)).toThrow("Shell operator");
    },
  );

  it("rejects executables outside the fixed allowlist", () => {
    expect(() => parseStructuredCommand("powershell Get-ChildItem")).toThrow("not allowlisted");
  });

  it("executes internal and external commands without a shell", async () => {
    await expect(executeCommand('echo "ultra proof"')).resolves.toMatchObject({
      stdout: "ultra proof\n",
      exitCode: 0,
      timedOut: false,
    });
    const node = await executeCommand("node --version");
    expect(node.exitCode).toBe(0);
    expect(node.stdout).toMatch(/^v\d+\./);
  });

  it("does not accept a caller-controlled process working directory", async () => {
    await expect(executeCommand("echo x", { workDir: "nested" })).resolves.toMatchObject({
      exitCode: 1,
      stderr: expect.stringContaining("workDir is fixed"),
    });
  });
});
