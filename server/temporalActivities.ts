/**
 * temporalActivities.ts
 *
 * Proof-only activity wrapping the entire orchestrator. The orchestrator has a
 * duplicate-admission gate, but it is not yet resumable at each side effect;
 * this activity must not be described as production crash recovery.
 */

import { runOrchestrator } from "./orchestrator.js";
import { workflowIdFromMessage } from "./durableExecution.js";

export interface OrchestratorActivityInput {
  conversationId: string;
  userMessage: string;
  messageId: string;
}

/**
 * Run the orchestrator as a Temporal activity.
 * The workflow records a successful whole run. A retry after partial execution
 * is intentionally not claimed as safe production resume semantics.
 */
export async function runOrchestratorActivity(input: OrchestratorActivityInput): Promise<string> {
  const { conversationId, userMessage, messageId } = input;
  await runOrchestrator(conversationId, userMessage, {
    workflowId: workflowIdFromMessage(messageId),
    idempotencyKey: `message:${messageId}`,
    messageId,
    executionMode: "temporal",
  });
  return `completed:${messageId}`;
}
