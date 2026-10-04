import { expect, it } from "vitest";
import { sandboxContainerFilters } from "../../server/dockerSandbox.js";

it("scopes shutdown to the installation and process, and recovery to the installation", () => {
  expect(sandboxContainerFilters("owner-a", "process-a")).toEqual([
    "--filter", "label=ultra-computer=sandbox", "--filter", "label=ultra-owner=owner-a", "--filter", "label=ultra-process=process-a",
  ]);
  expect(sandboxContainerFilters("owner-a", null)).toEqual([
    "--filter", "label=ultra-computer=sandbox", "--filter", "label=ultra-owner=owner-a",
  ]);
});
