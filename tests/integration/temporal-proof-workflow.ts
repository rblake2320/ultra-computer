import { proxyActivities } from "@temporalio/workflow";
import type * as activities from "./temporal-proof-activities.js";

const { stepA, stepB, stepC } = proxyActivities<typeof activities>({
  startToCloseTimeout: "30 seconds",
  retry: { maximumAttempts: 3 },
});

export async function durableProofWorkflow(id: string): Promise<string> {
  const a = await stepA(id);
  const b = await stepB(a);
  return stepC(b);
}
