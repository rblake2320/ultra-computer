import fs from "node:fs";
import { load } from "js-yaml";
import { expect, it } from "vitest";

it("keeps the Scorecard publisher within upstream workflow restrictions", () => {
  const workflow = load(fs.readFileSync(".github/workflows/security.yml", "utf8")) as any;
  // Publication rejects top-level env/defaults and job-level env/defaults in
  // its own job, even when unrelated CI jobs pass. CPU setup belongs to audit.
  expect(workflow.env).toBeUndefined();
  expect(workflow.defaults).toBeUndefined();
  expect(workflow.jobs["dependency-audit"].env.ONNXRUNTIME_NODE_INSTALL).toBe("skip");
  const scorecard = workflow.jobs.scorecard;
  expect(scorecard.env).toBeUndefined();
  expect(scorecard.defaults).toBeUndefined();
  expect(scorecard.container).toBeUndefined();
  expect(scorecard.services).toBeUndefined();
  expect(scorecard["runs-on"]).toMatch(/^ubuntu-/);
  expect(scorecard.steps.every((step: any) => !step.run &&
    /^(actions\/checkout|actions\/upload-artifact|github\/codeql-action\/upload-sarif|ossf\/scorecard-action|step-security\/harden-runner)@/.test(step.uses))).toBe(true);
  expect(scorecard.steps.find((step: any) => step.uses.startsWith("ossf/scorecard-action@"))?.with.publish_results).toBe(true);
});
