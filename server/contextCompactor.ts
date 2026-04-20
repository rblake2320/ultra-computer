/**
 * Context Compaction Engine
 *
 * Compresses long conversation histories to fit within model context windows.
 * Inspired by Hermes's context_compressor.py.
 *
 * Three-phase progressive compression:
 *   Phase 1 — LLM-based summarization of old messages (keep last 4 verbatim)
 *   Phase 2 — Truncate tool results to first 500 chars each
 *   Phase 3 — Drop all but system message + last 2 user/assistant pairs
 */

import { chat, type ChatMessage } from "./modelRouter.js";
import logger from "./logger.js";
const compactorLogger = logger.child({ module: "contextCompactor" });

// ─── Public Types ─────────────────────────────────────────────────────────────

export interface CompactionResult {
  compactedMessages: ChatMessage[];
  originalTokenEstimate: number;
  compactedTokenEstimate: number;
  compressionRatio: number;
}

// ─── Token Estimation ─────────────────────────────────────────────────────────

/**
 * Fast heuristic token estimator.
 * Rule of thumb: ~4 chars per token for typical English prose + code.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function estimateMessageTokens(msg: ChatMessage): number {
  // Add 4 tokens overhead per message for role + structure tokens
  return estimateTokens(msg.content ?? '') + 4;
}

function estimateConversationTokens(messages: ChatMessage[]): number {
  return messages.reduce((sum, m) => sum + estimateMessageTokens(m), 0);
}

// ─── Identify the "tail" to keep verbatim ────────────────────────────────────

/**
 * Split messages into:
 *   - systemMessages: all role==="system" messages (kept at head)
 *   - oldMessages:    early non-system messages to be summarized/dropped
 *   - tailMessages:   last `tailCount` non-system messages kept verbatim
 */
function splitMessages(
  messages: ChatMessage[],
  tailCount: number
): { systemMessages: ChatMessage[]; oldMessages: ChatMessage[]; tailMessages: ChatMessage[] } {
  const systemMessages = messages.filter((m) => m.role === "system");
  const nonSystem = messages.filter((m) => m.role !== "system");

  const tailStart = Math.max(0, nonSystem.length - tailCount);
  const oldMessages = nonSystem.slice(0, tailStart);
  const tailMessages = nonSystem.slice(tailStart);

  return { systemMessages, oldMessages, tailMessages };
}

// ─── Phase 1: LLM-based summarization ────────────────────────────────────────

/**
 * Summarize oldMessages into a single compact system message using the LLM.
 * Falls back to a simple text summary if the LLM call fails.
 */
async function summarizeOldMessages(
  oldMessages: ChatMessage[],
  modelId: string
): Promise<ChatMessage> {
  if (oldMessages.length === 0) {
    return { role: "system", content: "" };
  }

  // Build a readable transcript of the old messages
  const transcript = oldMessages
    .map((m) => {
      const roleLabel = m.role === "user" ? "User" : "Assistant";
      // Truncate very long individual messages for the summarization prompt itself
      const content = m.content ?? '';
      const excerpt = content.length > 2000 ? content.slice(0, 2000) + "…[truncated]" : content;
      return `${roleLabel}: ${excerpt}`;
    })
    .join("\n\n");

  const summaryPrompt: ChatMessage[] = [
    {
      role: "system",
      content:
        "You are a concise conversation summarizer. Your output will replace an earlier portion of a chat history to save context space. " +
        "Summarize the key facts, decisions, code written, and user goals from the conversation excerpt below. " +
        "Be thorough but extremely concise. Use bullet points. Preserve any code snippets, file names, or URLs that may still be relevant. " +
        "Output ONLY the summary — no preamble.",
    },
    {
      role: "user",
      content: `Summarize this earlier conversation history:\n\n${transcript}`,
    },
  ];

  try {
    const response = await chat(summaryPrompt, {
      modelId,
      taskType: "general",
      maxTokens: 800,
      temperature: 0.1,
    });

    return {
      role: "system",
      content: `[Compressed earlier conversation summary]\n${response.content}`,
    };
  } catch (err) {
    compactorLogger.error({ err }, "summarizeOldMessages failed");
    // Fallback: produce a minimal text summary without calling the LLM
    const fallback = oldMessages
      .map((m) => {
        const roleLabel = m.role === "user" ? "User" : "Asst";
        const content = m.content ?? '';
        return `${roleLabel}: ${content.slice(0, 150)}${content.length > 150 ? "…" : ""}`;
      })
      .join(" | ");

    return {
      role: "system",
      content: `[Earlier conversation (compressed)]: ${fallback}`,
    };
  }
}

// ─── Phase 2: Truncate tool results ──────────────────────────────────────────

const MAX_TOOL_RESULT_CHARS = 500;

/**
 * Find messages that look like tool-result injections and truncate their
 * verbose output sections to MAX_TOOL_RESULT_CHARS characters.
 *
 * The worker agent injects tool results as user messages with the pattern:
 *   "Tool execution results:\n\n[Tool: <name>] …\n<output>\n\n---\n\n…"
 */
function truncateToolResults(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((msg) => {
    if (msg.role !== "user") return msg;
    if (!msg.content.includes("[Tool:")) return msg;

    // Replace each tool output block with a truncated version
    let modified = msg.content;

    // Match blocks delimited by [Tool: ...] headers
    modified = modified.replace(
      /(\[Tool:[^\]]+\][^\n]*\n)([\s\S]*?)(?=\n\n---|\n\[Tool:|$)/g,
      (_, header, body: string) => {
        if (body.length <= MAX_TOOL_RESULT_CHARS) return header + body;
        return (
          header +
          body.slice(0, MAX_TOOL_RESULT_CHARS) +
          `\n…[output truncated — ${body.length - MAX_TOOL_RESULT_CHARS} chars omitted]`
        );
      }
    );

    return { ...msg, content: modified };
  });
}

// ─── Phase 3: Hard-drop to skeleton ──────────────────────────────────────────

/**
 * Emergency compaction: keep only system messages + last 2 user/assistant pairs.
 */
function hardDropToSkeleton(messages: ChatMessage[]): ChatMessage[] {
  const { systemMessages, tailMessages } = splitMessages(messages, 4);

  // Keep at most 2 user/assistant pairs (4 messages) from the tail
  const pairs = tailMessages.slice(-4);

  return [...systemMessages, ...pairs];
}

// ─── Main Export ─────────────────────────────────────────────────────────────

/**
 * Compact a conversation history to fit within `maxTokens`.
 *
 * @param messages    Full conversation history
 * @param maxTokens   Target token budget for the compacted history
 * @param modelId     Model to use for LLM-based summarization (Phase 1)
 */
export async function compactContext(
  messages: ChatMessage[],
  maxTokens: number,
  modelId: string
): Promise<CompactionResult> {
  const originalTokenEstimate = estimateConversationTokens(messages);

  // ── Fast path: already within budget ──────────────────────────────────────
  if (originalTokenEstimate <= maxTokens) {
    return {
      compactedMessages: messages,
      originalTokenEstimate,
      compactedTokenEstimate: originalTokenEstimate,
      compressionRatio: 1.0,
    };
  }

  let working = [...messages];

  // ── Phase 1: Summarize old messages (keep last 4 verbatim) ────────────────
  const TAIL_VERBATIM = 4;
  const { systemMessages, oldMessages, tailMessages } = splitMessages(working, TAIL_VERBATIM);

  if (oldMessages.length > 0) {
    const summaryMsg = await summarizeOldMessages(oldMessages, modelId);
    // Reassemble: original system messages + summary + tail
    working = summaryMsg.content
      ? [...systemMessages, summaryMsg, ...tailMessages]
      : [...systemMessages, ...tailMessages];
  }

  const afterPhase1 = estimateConversationTokens(working);

  if (afterPhase1 <= maxTokens) {
    return {
      compactedMessages: working,
      originalTokenEstimate,
      compactedTokenEstimate: afterPhase1,
      compressionRatio: afterPhase1 / originalTokenEstimate,
    };
  }

  // ── Phase 2: Truncate tool result outputs ─────────────────────────────────
  working = truncateToolResults(working);

  const afterPhase2 = estimateConversationTokens(working);

  if (afterPhase2 <= maxTokens) {
    return {
      compactedMessages: working,
      originalTokenEstimate,
      compactedTokenEstimate: afterPhase2,
      compressionRatio: afterPhase2 / originalTokenEstimate,
    };
  }

  // ── Phase 3: Hard-drop to skeleton ───────────────────────────────────────
  working = hardDropToSkeleton(working);

  const afterPhase3 = estimateConversationTokens(working);

  return {
    compactedMessages: working,
    originalTokenEstimate,
    compactedTokenEstimate: afterPhase3,
    compressionRatio: afterPhase3 / originalTokenEstimate,
  };
}
