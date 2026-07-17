import fs from "fs/promises";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  executeCodeInterpreter,
  executeCommand,
  executeFileTransform,
  parseStructuredCommand,
} from "../../server/cliToolEngine.js";
import { dockerSandbox } from "../../server/dockerSandbox.js";
import { SANDBOX_DIR } from "../../server/sandboxPaths.js";

const cleanupPaths: string[] = [];

afterEach(async () => {
  await Promise.all(cleanupPaths.splice(0).map((target) => fs.rm(target, { recursive: true, force: true })));
});

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

describe("interpreter and transform containment", () => {
  it("rejects caller-directed package installation", async () => {
    await expect(
      executeCodeInterpreter("# pip: requests\nprint('no install')", "python3"),
    ).rejects.toThrow(/automatic package installation is disabled/i);
    await expect(
      executeCodeInterpreter("// npm: lodash\nconsole.log('no install')", "node"),
    ).rejects.toThrow(/automatic package installation is disabled/i);
  });

  it("rejects transform paths outside the application sandbox", async () => {
    await expect(
      executeFileTransform(
        path.resolve("outside-input.csv"),
        path.resolve("outside-output.json"),
        "csv-to-json",
      ),
    ).rejects.toThrow(/inside the sandbox directory/i);
  });

  it("transforms a contained file through a temporary output and atomic rename", async () => {
    const testDir = path.join(SANDBOX_DIR, `transform-test-${Date.now()}`);
    cleanupPaths.push(testDir);
    await fs.mkdir(testDir, { recursive: true });
    await fs.writeFile(path.join(testDir, "input.csv"), "name,value\nultra,1\n", "utf8");

    const result = await executeFileTransform(
      path.join(testDir, "input.csv"),
      path.join(testDir, "output.json"),
      "csv-to-json",
    );

    expect(JSON.parse(await fs.readFile(result.outputPath, "utf8"))).toEqual([
      { name: "ultra", value: "1" },
    ]);
    expect((await fs.readdir(testDir)).filter((name) => name.startsWith(".transform-"))).toEqual([]);
  });

  it("fails closed instead of executing interpreter code on the host", async () => {
    const previous = dockerSandbox.getConfig();
    dockerSandbox.updateConfig({ enabled: false });
    try {
      await expect(
        executeCodeInterpreter("print('must not run on host')", "python3"),
      ).rejects.toThrow(/requires the isolated Docker sandbox/i);
    } finally {
      dockerSandbox.updateConfig(previous);
    }
  });
});
