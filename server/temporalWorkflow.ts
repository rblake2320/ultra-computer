/**
 * temporalWorkflow.ts
 *
 * Deterministic Temporal workflow for ultra-computer agent execution.
 *
 * Temporal workflows MUST be deterministic — no I/O, no random, no Date.now().
 * All side-effecting work happens in activities (temporalActivities.ts).
 *
 * Workflow run lifecycle:
 * 1. A proof client explicitly starts conversationRunWorkflow
 * 2. Temporal starts a workflow execution and persists event history
 * 3. Worker picks up the task and executes runOrchestratorActivity()
 * 4. Temporal can retry the whole activity. The application orchestrator is
 *    not yet decomposed into resumable activities, so this is not production
 *    crash-recovery proof.
 */

import { proxyActivities, sleep } from "@temporalio/workflow";
import type * as activities from "./temporalActivities.js";

const { runOrchestratorActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minutes",
  retry: {
    maximumAttempts: 5,
    initialInterval: "2s",
    maximumInterval: "60s",
    backoffCoefficient: 2,
    nonRetryableErrorTypes: [
      "PolicyDeniedError",
      "ValidationError",
      "AuthenticationError",
    ],
  },
});

export interface ConversationRunInput {
  conversationId: string;
  userMessage: string;
  messageId: string;
}

export async function conversationRunWorkflow(input: ConversationRunInput): Promise<string> {
  const result = await runOrchestratorActivity({
    conversationId: input.conversationId,
    userMessage: input.userMessage,
    messageId: input.messageId,
  });
  return result;
}

export { sleep };
