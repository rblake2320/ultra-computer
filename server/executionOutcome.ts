export class ExecutionFailure extends Error {
  readonly retryable = false;
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "ExecutionFailure";
  }
}

export function requireProviderCompletion(hasAnswer: boolean, toolCalls: number, finishReason?: string, completed = true): void {
  if (!completed || (finishReason && ["length", "content_filter", "cancelled", "error"].includes(finishReason))) {
    throw new ExecutionFailure("incomplete_provider_output", `Provider did not finish successfully (${finishReason || "missing completion event"}).`);
  }
  if (!hasAnswer && !toolCalls) throw new ExecutionFailure("empty_provider_output", "Provider returned no answer or tool call.");
}

export function requireFinalAnswer(output: string, exhausted = false): string {
  if (exhausted) throw new ExecutionFailure("iteration_limit", "Agent reached its iteration limit before finishing the task.");
  if (!output.trim()) throw new ExecutionFailure("empty_output", "Model returned no final answer. Choose a model that supports this task and retry.");
  if (/\[(?:FAILED:|LLM call failed|Agent reached max iterations)/i.test(output)) {
    throw new ExecutionFailure("failed_output", "Agent returned a failure diagnostic instead of a final answer.");
  }
  return output;
}
