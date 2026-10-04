import { expect, it } from "vitest";
import { sandboxContainerFilters, sandboxUserArgs } from "../../server/dockerSandbox.js";

it("scopes shutdown to the installation and process, and recovery to the installation", () => {
  expect(sandboxContainerFilters("owner-a", "process-a")).toEqual([
    "--filter", "label=ultra-computer=sandbox", "--filter", "label=ultra-owner=owner-a", "--filter", "label=ultra-process=process-a",
  ]);
  expect(sandboxContainerFilters("owner-a", null)).toEqual([
    "--filter", "label=ultra-computer=sandbox", "--filter", "label=ultra-owner=owner-a",
  ]);
});
it("matches POSIX script ownership without changing private file permissions", () => {
  expect(sandboxUserArgs("linux", 1001, 1001)).toEqual(["--user", "1001:1001"]);
  expect(sandboxUserArgs("win32", 1001, 1001)).toEqual([]);
  expect(() => sandboxUserArgs("linux", -1, 1001)).toThrow(/file owner/);
});
