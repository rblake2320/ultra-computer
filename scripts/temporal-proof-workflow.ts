/**
 * Temporal durable execution proof — workflow definition.
 * Must be in a separate file from the runner (Temporal bundles this for V8 sandbox isolation).
 */

import { proxyActivities } from "@temporalio/workflow";

const { stepA, stepB, stepC } = proxyActivities<{
  stepA(id: string): Promise<string>;
  stepB(prev: string): Promise<string>;
  stepC(prev: string): Promise<string>;
}>({
  startToCloseTimeout: "30 seconds",
  retry: { maximumAttempts: 3 },
});

export async function durableProofWorkflow(id: string): Promise<string> {
  const a = await stepA(id);
  const b = await stepB(a);
  const c = await stepC(b);
  return c;
}
