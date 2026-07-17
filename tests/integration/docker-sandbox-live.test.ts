import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { DockerSandbox } from "../../server/dockerSandbox.js";
import { SANDBOX_DIR } from "../../server/sandboxPaths.js";

const execFileAsync = promisify(execFile);
const runLive = process.env.RUN_DOCKER_SANDBOX_LIVE === "1";

describe.skipIf(!runLive)("Docker sandbox boundary — VERIFIED LIVE", () => {
  const cleanup: string[] = [];
  const sandboxes: DockerSandbox[] = [];

  afterEach(async () => {
    await Promise.all(sandboxes.splice(0).map((sandbox) => sandbox.shutdown()));
    await Promise.all(cleanup.splice(0).map((target) => fs.rm(target, { recursive: true, force: true })));
  });

  it("keeps hostile metadata in argv and enforces container isolation", async () => {
    const runDir = path.join(SANDBOX_DIR, `docker-live-${Date.now()}`);
    const hostMarker = path.join(process.cwd(), "docker-host-injection-marker");
    cleanup.push(runDir, hostMarker);
    await fs.mkdir(runDir, { recursive: true });
    await fs.rm(hostMarker, { force: true });

    const sandbox = new DockerSandbox({
      image: "redis:7-alpine",
      cpuLimit: "0.5",
      memoryLimit: "128m",
      networkEnabled: false,
      maxContainers: 1,
    });
    sandboxes.push(sandbox);
    const session = "live;touch docker-host-injection-marker";
    const result = await sandbox.exec(
      session,
      "printf sandbox-ok > /workspace/result.txt",
      runDir,
      10_000,
    );

    expect(result).toMatchObject({ exitCode: 0, timedOut: false });
    expect(await fs.readFile(path.join(runDir, "result.txt"), "utf8")).toBe("sandbox-ok");
    await expect(fs.stat(hostMarker)).rejects.toThrow();

    const status = sandbox.getStatus();
    expect(status.containers).toHaveLength(1);
    const { stdout } = await execFileAsync("docker", ["inspect", status.containers[0].containerId]);
    const inspected = JSON.parse(stdout)[0];
    expect(inspected.HostConfig).toMatchObject({
      ReadonlyRootfs: true,
      NetworkMode: "none",
      Memory: 128 * 1024 * 1024,
      NanoCpus: 500_000_000,
    });
    expect(inspected.HostConfig.CapDrop).toContain("ALL");
  }, 60_000);
});
