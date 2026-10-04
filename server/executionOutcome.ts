export class ExecutionFailure extends Error {
  readonly retryable = false;
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "ExecutionFailure";
  }
}

export function requiresActionEvidence(request: string): boolean {
  if (/\b(?:latest|current|today|installed)\b[\s\S]{0,60}\b(?:models?|versions?|releases?|prices?)\b|\b(?:models?|versions?|releases?|prices?)\b[\s\S]{0,60}\b(?:latest|current|today|installed)\b/i.test(request)) return true;
  if (/^(?:how\s+(?:do|can|should)\s+I|what\s+(?:is|are)|explain\b)/i.test(request.trim())) return false;
  return /\b(?:use|call|run|execute)\s+(?:the\s+)?(?:[a-z_]+\s+tool|bash|python|node|calculator)\b|\b(?:save|write|create|delete|modify|install|pull|download|fetch|search|research|check)\b[\s\S]{0,120}\b(?:file|files|script|models?|installed|latest|web|url|https?:|\.txt|\.json|\.py|\.ts)\b/i.test(request);
}

export function isTextOnlyRequest(request:string):boolean {
  return !requiresActionEvidence(request) && !/https?:\/\//i.test(request)
    && /^(?:summarize|translate|rewrite|explain|draft|classify|proofread|write\s+(?:a|an|the)\s+(?:poem|story|sentence|paragraph))\b/i.test(request.trim());
}

export function requireActionEvidence(request: string, calls: readonly {tool: string; result: {success: boolean}}[]): void {
  if (!requiresActionEvidence(request)) return;
  const explicit = /\b(?:use|call)\s+(?:the\s+)?([a-z_]+)\s+tool\b/i.exec(request)?.[1];
  if (!calls.some(c => c.result.success && (!explicit || c.tool === explicit))) {
    throw new ExecutionFailure('missing_action_evidence', 'The requested action produced no successful tool receipt. No action was verified. Select a connected model with tool support and retry.');
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
