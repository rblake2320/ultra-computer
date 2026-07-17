import { describe, expect, it } from "vitest";
import {
  DockerSandbox,
  validateDockerSandboxConfig,
} from "../../server/dockerSandbox.js";

describe("Docker sandbox configuration", () => {
  it("accepts bounded production resource limits", () => {
    expect(validateDockerSandboxConfig({
      image: "ubuntu:24.04",
      cpuLimit: "2.5",
      memoryLimit: "2g",
    })).toMatchObject({
      image: "ubuntu:24.04",
      cpuLimit: "2.5",
      memoryLimit: "2g",
    });
  });

  it.each([
    { cpuLimit: "1; touch host-marker" },
    { cpuLimit: "65" },
    { memoryLimit: "512m --privileged" },
    { memoryLimit: "1m" },
    { image: "ubuntu;whoami" },
    { maxContainers: Number.NaN },
    { execTimeoutMs: Number.POSITIVE_INFINITY },
  ])("rejects hostile or unbounded config %#", (partial) => {
    expect(() => validateDockerSandboxConfig(partial)).toThrow();
  });

  it("does not mutate live configuration when an update is rejected", () => {
    const sandbox = new DockerSandbox({ cpuLimit: "1", memoryLimit: "512m" });
    expect(() => sandbox.updateConfig({ cpuLimit: "1; whoami" })).toThrow();
    expect(sandbox.getConfig()).toMatchObject({ cpuLimit: "1", memoryLimit: "512m" });
  });
});
