/**
 * temporalActivities.ts
 *
 * Temporal activities wrapping the orchestrator steps.
 * Each activity is idempotent, has a timeout, and can be retried by Temporal.
 * Completed activities are NOT re-executed on workflow resume (event history).
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
 * Temporal will retry this on transient failure and resume from here after a crash.
 * On success, the workflow history records it as complete — it will not re-run.
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
