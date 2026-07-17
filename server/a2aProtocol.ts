/**
 * @file a2aProtocol.ts
 * @description A2A (Agent-to-Agent) Protocol v0.3.0 implementation for Ultra Computer.
 *
 * Implements Google's open A2A protocol over JSON-RPC 2.0 / HTTP, providing:
 *   - Server side: exposes Ultra Computer as a discoverable A2A agent
 *   - Client side: allows Ultra Computer to discover and communicate with remote A2A agents
 *
 * Spec reference: https://google.github.io/A2A/
 */

import { v4 as uuidv4 } from "uuid";
import { storage } from "./storage.js";
import { runOrchestrator, subscribeToConversation, unsubscribeFromConversation } from "./orchestrator.js";
import { governedFetch } from "./governedFetch.js";

// ---------------------------------------------------------------------------
// A2A Type Definitions
// ---------------------------------------------------------------------------

/**
 * Text part of an A2A message.
 * The simplest and most common content kind.
 */
export interface TextPart {
  kind: "text";
  text: string;
}

/**
 * Structured data part of an A2A message.
 * Used for passing JSON-serialisable objects.
 */
export interface DataPart {
  kind: "data";
  data: object;
}

/**
 * File attachment part of an A2A message.
 * The file bytes must be base64-encoded.
 */
export interface FilePart {
  kind: "file";
  file: {
    name: string;
    mimeType: string;
    /** Base64-encoded file content */
    bytes: string;
  };
}

/** Union of all valid A2A message parts */
export type A2APart = TextPart | DataPart | FilePart;

/**
 * A single A2A message exchanged between agents.
 * Mirrors the A2A spec's `Message` object.
 */
export interface A2AMessage {
  /** Unique message identifier */
  messageId: string;
  /** Sender role: "user" for requests, "agent" for responses */
  role: "user" | "agent";
  /** Ordered array of content parts */
  parts: A2APart[];
  /** ISO-8601 timestamp when the message was created */
  timestamp?: string;
  /** Optional task context */
  taskId?: string;
}

/**
 * Task lifecycle states defined by the A2A spec.
 */
export type A2ATaskState =
  | "submitted"
  | "working"
  | "completed"
  | "failed"
  | "canceled";

/**
 * An artifact produced by agent processing — the output of a task.
 */
export interface A2AArtifact {
  /** Artifact identifier */
  artifactId: string;
  /** Human-readable artifact name */
  name?: string;
  /** Ordered content parts making up the artifact */
  parts: A2APart[];
}

/**
 * A2A Task — tracks a unit of work processed by an agent.
 * Tasks progress through states: submitted → working → completed | failed | canceled.
 */
export interface A2ATask {
  /** Unique task identifier */
  taskId: string;
  /** Current lifecycle state */
  state: A2ATaskState;
  /** The originating message that triggered this task */
  message?: A2AMessage;
  /** Output artifacts produced once the task completes */
  artifacts?: A2AArtifact[];
  /** Human-readable error description when state === "failed" */
  error?: string;
  /** ISO-8601 creation timestamp */
  createdAt: string;
  /** ISO-8601 timestamp of the last state change */
  updatedAt: string;
}

/**
 * A2A Agent Card — the discovery document advertised at `/.well-known/agent-card.json`.
 * Remote agents fetch this to understand capabilities before communicating.
 */
export interface AgentCard {
  protocolVersion: string;
  name: string;
  description: string;
  url: string;
  version: string;
  capabilities: {
    streaming: boolean;
    pushNotifications: boolean;
    stateTransitionHistory: boolean;
  };
  defaultInputModes: string[];
  defaultOutputModes: string[];
  skills: AgentSkill[];
  securitySchemes?: Record<string, SecurityScheme>;
}

/** A skill entry inside an AgentCard */
export interface AgentSkill {
  id: string;
  name: string;
  description: string;
  tags?: string[];
  inputModes?: string[];
  outputModes?: string[];
}

/** HTTP bearer-token security scheme */
export interface SecurityScheme {
  type: "http" | "apiKey" | "oauth2";
  scheme?: string;
  description?: string;
}

// ---------------------------------------------------------------------------
// JSON-RPC 2.0 Types
// ---------------------------------------------------------------------------

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number | null;
  method: string;
  params?: unknown;
}

interface JsonRpcSuccess<T = unknown> {
  jsonrpc: "2.0";
  id: string | number | null;
  result: T;
}

interface JsonRpcError {
  jsonrpc: "2.0";
  id: string | number | null;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}

type JsonRpcResponse<T = unknown> = JsonRpcSuccess<T> | JsonRpcError;

/** Standard JSON-RPC 2.0 error codes, extended with A2A-specific codes */
const RPC_ERROR = {
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  TASK_NOT_FOUND: -32000,
  TASK_CANCELED: -32001,
} as const;

// ---------------------------------------------------------------------------
// In-Memory Stores
// ---------------------------------------------------------------------------

/** Maximum entries kept in the task and agent in-memory registries. */
const MAX_REGISTRY_SIZE = 10_000;

/**
 * Evict the oldest (first-inserted) entries from a Map when it exceeds maxSize.
 * Map iteration order is insertion order, so the first entry is the oldest.
 */
function evictIfNeeded<K, V>(map: Map<K, V>, maxSize: number): void {
  while (map.size > maxSize) {
    const oldestKey = map.keys().next().value;
    if (oldestKey !== undefined) map.delete(oldestKey);
    else break;
  }
}

/**
 * In-memory task registry.
 * Maps taskId → A2ATask for all tasks handled in this process lifetime.
 */
const taskRegistry = new Map<string, A2ATask>();

/**
 * In-memory remote agent registry.
 * Maps agent base-URL → AgentCard for all agents discovered so far.
 */
const agentRegistry = new Map<string, AgentCard>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Constructs a JSON-RPC 2.0 success response envelope.
 */
function rpcSuccess<T>(id: string | number | null, result: T): JsonRpcSuccess<T> {
  return { jsonrpc: "2.0", id, result };
}

/**
 * Constructs a JSON-RPC 2.0 error response envelope.
 */
function rpcError(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown
): JsonRpcError {
  return { jsonrpc: "2.0", id, error: { code, message, ...(data !== undefined ? { data } : {}) } };
}

/**
 * Returns the current ISO-8601 timestamp string.
 */
function now(): string {
  return new Date().toISOString();
}

/**
 * Creates and registers a new A2ATask in the submitted state.
 */
function createTask(message?: A2AMessage): A2ATask {
  const taskId = uuidv4();
  const ts = now();
  const task: A2ATask = {
    taskId,
    state: "submitted",
    message,
    artifacts: [],
    createdAt: ts,
    updatedAt: ts,
  };
  taskRegistry.set(taskId, task);
  evictIfNeeded(taskRegistry, MAX_REGISTRY_SIZE);
  return task;
}

/**
 * Transitions a task to a new state and updates its timestamp.
 * Throws if the task is not found.
 */
function transitionTask(
  taskId: string,
  state: A2ATaskState,
  updates: Partial<Pick<A2ATask, "artifacts" | "error">> = {}
): A2ATask {
  const task = taskRegistry.get(taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);
  Object.assign(task, { state, updatedAt: now(), ...updates });
  return task;
}

/**
 * Converts a plain-text string from the orchestrator into an A2AMessage
 * with a single TextPart, assigned the "agent" role.
 */
function textToAgentMessage(text: string, taskId?: string): A2AMessage {
  return {
    messageId: uuidv4(),
    role: "agent",
    parts: [{ kind: "text", text }],
    timestamp: now(),
    ...(taskId ? { taskId } : {}),
  };
}

/**
 * Extracts the concatenated text from all TextParts of a message.
 */
function extractTextFromParts(parts: A2APart[]): string {
  return parts
    .filter((p): p is TextPart => p.kind === "text")
    .map((p) => p.text)
    .join("\n");
}

// ---------------------------------------------------------------------------
// A2A Server — Agent Card
// ---------------------------------------------------------------------------

/**
 * Returns Ultra Computer's AgentCard, suitable for serving at
 * `/.well-known/agent-card.json`.
 *
 * Skills are read live from the database so the card always reflects
 * the current set of installed skills.
 *
 * @param baseUrl - The publicly accessible base URL of this Ultra Computer instance.
 */
export async function getAgentCard(baseUrl: string = process.env.BASE_URL ?? "http://localhost:5000"): Promise<AgentCard> {
  // Read skills from the DB; fall back to empty array on error
  let skills: AgentSkill[] = [];
  try {
    const dbSkills = storage.getSkills();
    skills = dbSkills
      .filter((s) => s.enabled)
      .map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        tags: (() => {
          try {
            return JSON.parse(s.triggerKeywords) as string[];
          } catch {
            return [];
          }
        })(),
        inputModes: ["text/plain", "application/json"],
        outputModes: ["text/plain", "application/json"],
      }));
  } catch (err) {
    console.error("[A2A] Failed to load skills from DB:", err);
  }

  return {
    protocolVersion: "0.3.0",
    name: "Ultra Computer",
    description:
      "Ultra Computer — an autonomous AI agent platform with tool use, memory, " +
      "skill chaining, and multi-agent orchestration capabilities.",
    url: baseUrl,
    version: "1.0.0",
    capabilities: {
      streaming: true,
      pushNotifications: false,
      stateTransitionHistory: false,
    },
    defaultInputModes: ["text/plain", "application/json"],
    defaultOutputModes: ["text/plain", "application/json"],
    skills,
    securitySchemes: {
      apiKey: {
        type: "http",
        scheme: "bearer",
        description: "Bearer API key passed in the Authorization header.",
      },
    },
  };
}

// ---------------------------------------------------------------------------
// A2A Server — message/send handler
// ---------------------------------------------------------------------------

/**
 * Processes an incoming `message/send` JSON-RPC call.
 *
 * Creates a task, runs it through a lightweight orchestration loop that
 * extracts the user text and generates a response, then returns the
 * completed task with output artifacts.
 *
 * @param params - The `params` field of the JSON-RPC request.
 * @param rpcId  - The JSON-RPC request id, used to form the response.
 */
async function handleMessageSend(
  params: unknown,
  rpcId: string | number | null
): Promise<JsonRpcResponse<A2ATask>> {
  // Validate params
  if (!params || typeof params !== "object") {
    return rpcError(rpcId, RPC_ERROR.INVALID_PARAMS, "params must be an object");
  }

  const p = params as Record<string, unknown>;
  const message = p.message as A2AMessage | undefined;

  if (!message || !Array.isArray(message.parts)) {
    return rpcError(rpcId, RPC_ERROR.INVALID_PARAMS, "params.message with parts array is required");
  }

  // Validate A2A message schema
  if (message.role !== "user" && message.role !== "agent") {
    return rpcError(rpcId, RPC_ERROR.INVALID_PARAMS, "message.role must be \"user\" or \"agent\"");
  }
  if (!message.messageId || typeof message.messageId !== "string") {
    return rpcError(rpcId, RPC_ERROR.INVALID_PARAMS, "message.messageId (string) is required");
  }
  for (const part of message.parts) {
    if (!part || typeof (part as A2APart).kind !== "string") {
      return rpcError(rpcId, RPC_ERROR.INVALID_PARAMS, "each message part must have a kind field");
    }
  }

  // Create and register the task
  const task = createTask(message);

  try {
    // Transition to working
    transitionTask(task.taskId, "working");

    // Extract user text to process (truncate to 500 chars for echo safety)
    const rawUserText = extractTextFromParts(message.parts);
    const userText = rawUserText.slice(0, 500);

    // Process the message through the orchestrator.
    let responseText = "";
    try {
      // runOrchestrator is conversation-centric, so we create a temporary
      // synthetic conversation ID scoped to this A2A task
      const synthConvId = `a2a-${task.taskId}`;

      // Wrap in AbortController for timeout (30 seconds)
      const orchController = new AbortController();
      const orchTimeout = setTimeout(() => orchController.abort(), 30_000);

      // Collect streamed events until the orchestrator signals completion
      await new Promise<void>((resolve, reject) => {
        orchController.signal.addEventListener("abort", () => {
          unsubscribeFromConversation(synthConvId, cb);
          reject(new Error("Orchestrator timed out after 30 seconds"));
        }, { once: true });
        const chunks: string[] = [];

        // eslint-disable-next-line prefer-const
        let cb: (event: { type: string; content?: string; error?: string }) => void;
        cb = (event: { type: string; content?: string; error?: string }) => {
          if (event.type === "token" && event.content) {
            chunks.push(event.content);
          } else if (event.type === "done") {
            responseText = chunks.join("");
            unsubscribeFromConversation(synthConvId, cb);
            resolve();
          } else if (event.type === "error") {
            unsubscribeFromConversation(synthConvId, cb);
            reject(new Error(event.error ?? "Orchestrator error"));
          }
        };

        subscribeToConversation(synthConvId, cb);
        runOrchestrator(synthConvId, userText).catch((err: unknown) => {
          clearTimeout(orchTimeout);
          unsubscribeFromConversation(synthConvId, cb);
          reject(err);
        });
      });
      clearTimeout(orchTimeout);
    } catch (orchErr) {
      console.error("[A2A] Orchestrator error — failing task:", orchErr);
      const message = orchErr instanceof Error ? orchErr.message : String(orchErr);
      throw new Error(`Orchestrator failed to process this message: ${message}. No response was generated.`);
    }

    // Build output artifact
    const artifact: A2AArtifact = {
      artifactId: uuidv4(),
      name: "response",
      parts: [{ kind: "text", text: responseText }],
    };

    // Mark task complete
    const completedTask = transitionTask(task.taskId, "completed", {
      artifacts: [artifact],
    });

    return rpcSuccess(rpcId, completedTask);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const failedTask = transitionTask(task.taskId, "failed", { error: errorMsg });
    return rpcSuccess(rpcId, failedTask);
  }
}

// ---------------------------------------------------------------------------
// A2A Server — message/stream handler
// ---------------------------------------------------------------------------

/**
 * Processes an incoming `message/stream` JSON-RPC call.
 *
 * Returns an async generator that yields SSE-formatted event strings.
 * Each yielded string is a complete SSE event (ending with "\n\n") and
 * callers should write them directly to an HTTP response stream.
 *
 * Yields: task-status update events and token delta events, then a final
 * task-completion event.
 *
 * @param params - The `params` field of the JSON-RPC request.
 */
export async function* handleMessageStream(
  params: unknown
): AsyncGenerator<string> {
  if (!params || typeof params !== "object") {
    yield `data: ${JSON.stringify({ error: "Invalid params" })}\n\n`;
    return;
  }

  const p = params as Record<string, unknown>;
  const message = p.message as A2AMessage | undefined;

  if (!message || !Array.isArray(message.parts)) {
    yield `data: ${JSON.stringify({ error: "params.message with parts array is required" })}\n\n`;
    return;
  }

  const task = createTask(message);

  // Emit initial task-status event
  yield `event: task-status\ndata: ${JSON.stringify({ taskId: task.taskId, state: "submitted" })}\n\n`;

  transitionTask(task.taskId, "working");
  yield `event: task-status\ndata: ${JSON.stringify({ taskId: task.taskId, state: "working" })}\n\n`;

  try {
    const userText = extractTextFromParts(message.parts);
    const chunks: string[] = [];

    try {
      const synthConvId = `a2a-stream-${task.taskId}`;

      // Buffer events via a promise-queue so we can yield them in order
      const eventQueue: Array<{ type: string; content?: string; error?: string }> = [];
      let done = false;
      let resolveNext: (() => void) | null = null;

      const cb = (event: { type: string; content?: string; error?: string }) => {
        eventQueue.push(event);
        if (resolveNext) {
          const r = resolveNext;
          resolveNext = null;
          r();
        }
        if (event.type === "done" || event.type === "error") {
          done = true;
        }
      };

      subscribeToConversation(synthConvId, cb);
      runOrchestrator(synthConvId, userText).catch((err: unknown) => {
        eventQueue.push({ type: "error", error: String(err) });
        done = true;
        if (resolveNext) { resolveNext(); resolveNext = null; }
        unsubscribeFromConversation(synthConvId, cb);
      });

      while (!done || eventQueue.length > 0) {
        if (eventQueue.length === 0) {
          await new Promise<void>((res) => { resolveNext = res; });
        }
        const evt = eventQueue.shift();
        if (!evt) continue;

        if (evt.type === "token" && evt.content) {
          chunks.push(evt.content);
          yield `event: token\ndata: ${JSON.stringify({ taskId: task.taskId, delta: evt.content })}\n\n`;
        } else if (evt.type === "done") {
          unsubscribeFromConversation(synthConvId, cb);
          break;
        } else if (evt.type === "error") {
          unsubscribeFromConversation(synthConvId, cb);
          throw new Error(evt.error ?? "Orchestrator stream error");
        }
      }
    } catch (orchErr) {
      console.error("[A2A] Orchestrator stream error — failing task:", orchErr);
      const message = orchErr instanceof Error ? orchErr.message : String(orchErr);
      throw new Error(`Orchestrator failed to process this message: ${message}. No response was generated.`);
    }

    const responseText = chunks.join("");
    const artifact: A2AArtifact = {
      artifactId: uuidv4(),
      name: "response",
      parts: [{ kind: "text", text: responseText }],
    };

    transitionTask(task.taskId, "completed", { artifacts: [artifact] });
    yield `event: task-status\ndata: ${JSON.stringify({ taskId: task.taskId, state: "completed", artifact })}\n\n`;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    transitionTask(task.taskId, "failed", { error: errorMsg });
    yield `event: task-status\ndata: ${JSON.stringify({ taskId: task.taskId, state: "failed", error: errorMsg })}\n\n`;
  }

  // Signal stream end
  yield `event: done\ndata: {}\n\n`;
}

// ---------------------------------------------------------------------------
// A2A Server — tasks/get handler
// ---------------------------------------------------------------------------

/**
 * Handles `tasks/get` — retrieves a task by ID.
 *
 * @param params - Expected to contain `{ taskId: string }`.
 * @param rpcId  - JSON-RPC request id.
 */
async function handleTasksGet(
  params: unknown,
  rpcId: string | number | null
): Promise<JsonRpcResponse<A2ATask>> {
  if (!params || typeof params !== "object") {
    return rpcError(rpcId, RPC_ERROR.INVALID_PARAMS, "params must be an object");
  }

  const { taskId } = params as { taskId?: string };
  if (!taskId) {
    return rpcError(rpcId, RPC_ERROR.INVALID_PARAMS, "params.taskId is required");
  }

  const task = taskRegistry.get(taskId);
  if (!task) {
    return rpcError(rpcId, RPC_ERROR.TASK_NOT_FOUND, `Task not found: ${taskId}`);
  }

  return rpcSuccess(rpcId, task);
}

// ---------------------------------------------------------------------------
// A2A Server — tasks/cancel handler
// ---------------------------------------------------------------------------

/**
 * Handles `tasks/cancel` — attempts to cancel a running task.
 *
 * Tasks already in a terminal state (completed, failed, canceled) cannot
 * be canceled and will return an error.
 *
 * @param params - Expected to contain `{ taskId: string }`.
 * @param rpcId  - JSON-RPC request id.
 */
async function handleTasksCancel(
  params: unknown,
  rpcId: string | number | null
): Promise<JsonRpcResponse<A2ATask>> {
  if (!params || typeof params !== "object") {
    return rpcError(rpcId, RPC_ERROR.INVALID_PARAMS, "params must be an object");
  }

  const { taskId } = params as { taskId?: string };
  if (!taskId) {
    return rpcError(rpcId, RPC_ERROR.INVALID_PARAMS, "params.taskId is required");
  }

  const task = taskRegistry.get(taskId);
  if (!task) {
    return rpcError(rpcId, RPC_ERROR.TASK_NOT_FOUND, `Task not found: ${taskId}`);
  }

  const terminalStates: A2ATaskState[] = ["completed", "failed", "canceled"];
  if (terminalStates.includes(task.state)) {
    return rpcError(
      rpcId,
      RPC_ERROR.TASK_CANCELED,
      `Task ${taskId} is already in terminal state: ${task.state}`
    );
  }

  const canceledTask = transitionTask(taskId, "canceled");
  return rpcSuccess(rpcId, canceledTask);
}

// ---------------------------------------------------------------------------
// A2A Server — JSON-RPC 2.0 Dispatcher
// ---------------------------------------------------------------------------

/**
 * Main entry point for incoming A2A JSON-RPC 2.0 requests.
 *
 * Parse and dispatch the request to the appropriate handler based on `method`.
 * For `message/stream`, the caller must handle the response differently —
 * use `handleMessageStream` directly and pipe the generator to an SSE response.
 *
 * Supported methods:
 *   - `message/send`   → process message, return completed task
 *   - `message/stream` → returns a sentinel; use `handleMessageStream` for SSE
 *   - `tasks/get`      → retrieve task by ID
 *   - `tasks/cancel`   → cancel an in-progress task
 *
 * @param body - Parsed JSON body of the HTTP request.
 */
export async function handleA2ARequest(body: unknown): Promise<JsonRpcResponse> {
  // Validate that this is a JSON-RPC 2.0 request
  if (
    !body ||
    typeof body !== "object" ||
    (body as Record<string, unknown>).jsonrpc !== "2.0"
  ) {
    return rpcError(null, RPC_ERROR.INVALID_REQUEST, "Invalid JSON-RPC 2.0 request");
  }

  const req = body as JsonRpcRequest;
  const id = req.id ?? null;

  if (typeof req.method !== "string") {
    return rpcError(id, RPC_ERROR.INVALID_REQUEST, "method must be a string");
  }

  switch (req.method) {
    case "message/send":
      return handleMessageSend(req.params, id);

    case "message/stream":
      // For streaming, callers must detect this sentinel and use handleMessageStream.
      // We return a special result so HTTP route handlers know to switch to SSE mode.
      return rpcSuccess(id, { streaming: true, note: "Use SSE endpoint or handleMessageStream()" });

    case "tasks/get":
      return handleTasksGet(req.params, id);

    case "tasks/cancel":
      return handleTasksCancel(req.params, id);

    default:
      return rpcError(id, RPC_ERROR.METHOD_NOT_FOUND, `Method not found: ${req.method}`);
  }
}

// ---------------------------------------------------------------------------
// A2A Client — Remote Agent Discovery
// ---------------------------------------------------------------------------

/**
 * Fetches and parses an AgentCard from a remote agent's well-known URL.
 * Automatically registers the agent in the in-memory registry on success.
 *
 * @param baseUrl - Base URL of the remote agent (e.g. "https://agent.example.com").
 * @returns The parsed AgentCard from the remote agent.
 * @throws If the network request fails or the response is not a valid AgentCard.
 */
export async function discoverAgent(baseUrl: string): Promise<AgentCard> {
  const normalizedBase = baseUrl.replace(/\/$/, "");
  const cardUrl = `${normalizedBase}/.well-known/agent-card.json`;

  const resp = await governedFetch(cardUrl, {
    headers: { Accept: "application/json" },
  }, `a2a-discovery:${normalizedBase}`, "network", "network:http_request");

  if (!resp.ok) {
    throw new Error(
      `Failed to fetch agent card from ${cardUrl}: HTTP ${resp.status} ${resp.statusText}`
    );
  }

  const card = (await resp.json()) as AgentCard;

  // Basic validation
  if (!card.protocolVersion || !card.name) {
    throw new Error(`Invalid AgentCard received from ${cardUrl}: missing required fields`);
  }

  // Register in the local registry
  agentRegistry.set(normalizedBase, card);
  evictIfNeeded(agentRegistry, MAX_REGISTRY_SIZE);
  console.log(`[A2A Client] Discovered and registered agent: ${card.name} at ${normalizedBase}`);

  return card;
}

// ---------------------------------------------------------------------------
// A2A Client — Send Message
// ---------------------------------------------------------------------------

/**
 * Sends a message to a remote A2A agent using `message/send` (non-streaming).
 *
 * @param agentUrl - Base URL of the target remote agent.
 * @param message  - The A2A message to send. A messageId will be generated if absent.
 * @param taskId   - Optional existing taskId to associate this message with.
 * @returns The A2ATask returned by the remote agent.
 * @throws If the HTTP request fails or the remote returns a JSON-RPC error.
 */
export async function sendMessage(
  agentUrl: string,
  message: Omit<A2AMessage, "messageId"> & { messageId?: string },
  taskId?: string
): Promise<A2ATask> {
  const normalizedBase = agentUrl.replace(/\/$/, "");

  const fullMessage: A2AMessage = {
    messageId: message.messageId ?? uuidv4(),
    role: message.role ?? "user",
    parts: message.parts,
    timestamp: message.timestamp ?? now(),
    ...(taskId ? { taskId } : {}),
  };

  const rpcBody: JsonRpcRequest = {
    jsonrpc: "2.0",
    id: uuidv4(),
    method: "message/send",
    params: { message: fullMessage },
  };

  const resp = await governedFetch(normalizedBase, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(rpcBody),
  }, taskId ?? fullMessage.messageId, "network", "network:http_request");

  if (!resp.ok) {
    throw new Error(`Remote agent request failed: HTTP ${resp.status} ${resp.statusText}`);
  }

  const rpcResp = (await resp.json()) as JsonRpcResponse<A2ATask>;

  if ("error" in rpcResp) {
    throw new Error(
      `Remote agent returned error [${rpcResp.error.code}]: ${rpcResp.error.message}`
    );
  }

  return (rpcResp as JsonRpcSuccess<A2ATask>).result;
}

// ---------------------------------------------------------------------------
// A2A Client — Stream Message
// ---------------------------------------------------------------------------

/**
 * Sends a message to a remote A2A agent using `message/stream` (SSE streaming).
 *
 * Parses the SSE stream and yields parsed event objects as they arrive.
 * Each yielded value has `{ event, data }` where `event` is the SSE event name
 * and `data` is the parsed JSON payload.
 *
 * @param agentUrl - Base URL of the target remote agent.
 * @param message  - The A2A message to send.
 * @param taskId   - Optional existing taskId to associate this message with.
 */
export async function* streamMessage(
  agentUrl: string,
  message: Omit<A2AMessage, "messageId"> & { messageId?: string },
  taskId?: string
): AsyncGenerator<{ event: string; data: unknown }> {
  const normalizedBase = agentUrl.replace(/\/$/, "");

  const fullMessage: A2AMessage = {
    messageId: message.messageId ?? uuidv4(),
    role: message.role ?? "user",
    parts: message.parts,
    timestamp: message.timestamp ?? now(),
    ...(taskId ? { taskId } : {}),
  };

  const rpcBody: JsonRpcRequest = {
    jsonrpc: "2.0",
    id: uuidv4(),
    method: "message/stream",
    params: { message: fullMessage },
  };

  const resp = await governedFetch(normalizedBase, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify(rpcBody),
  }, taskId ?? fullMessage.messageId, "network", "network:http_request");

  if (!resp.ok) {
    throw new Error(`Remote agent stream request failed: HTTP ${resp.status} ${resp.statusText}`);
  }

  if (!resp.body) {
    throw new Error("Remote agent returned no response body for stream request");
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  // SSE parsing state
  let currentEvent = "message";
  let currentData = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete lines
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? ""; // Keep incomplete last line in buffer

      for (const line of lines) {
        if (line.startsWith("event:")) {
          currentEvent = line.slice("event:".length).trim();
        } else if (line.startsWith("data:")) {
          currentData += line.slice("data:".length).trim();
        } else if (line === "") {
          // Blank line = end of SSE event
          if (currentData) {
            let parsedData: unknown = currentData;
            try {
              parsedData = JSON.parse(currentData);
            } catch {
              // Keep as string if not valid JSON
            }
            yield { event: currentEvent, data: parsedData };

            // Stop on done event
            if (currentEvent === "done") {
              return;
            }
          }
          // Reset for next event
          currentEvent = "message";
          currentData = "";
        }
      }
    }
  } finally {
    reader.cancel().catch(() => {/* ignore cancel errors */});
  }
}

// ---------------------------------------------------------------------------
// A2A Client — Task Operations
// ---------------------------------------------------------------------------

/**
 * Retrieves the current status of a task from a remote A2A agent.
 *
 * @param agentUrl - Base URL of the remote agent that owns the task.
 * @param taskId   - ID of the task to retrieve.
 * @returns The current A2ATask object from the remote agent.
 */
export async function getTask(agentUrl: string, taskId: string): Promise<A2ATask> {
  const normalizedBase = agentUrl.replace(/\/$/, "");

  const rpcBody: JsonRpcRequest = {
    jsonrpc: "2.0",
    id: uuidv4(),
    method: "tasks/get",
    params: { taskId },
  };

  const resp = await governedFetch(normalizedBase, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(rpcBody),
  }, taskId, "network", "network:http_request");

  if (!resp.ok) {
    throw new Error(`tasks/get request failed: HTTP ${resp.status} ${resp.statusText}`);
  }

  const rpcResp = (await resp.json()) as JsonRpcResponse<A2ATask>;
  if ("error" in rpcResp) {
    throw new Error(`Remote error [${rpcResp.error.code}]: ${rpcResp.error.message}`);
  }

  return (rpcResp as JsonRpcSuccess<A2ATask>).result;
}

/**
 * Requests cancellation of a task on a remote A2A agent.
 *
 * @param agentUrl - Base URL of the remote agent that owns the task.
 * @param taskId   - ID of the task to cancel.
 * @returns The updated A2ATask (state should be "canceled").
 */
export async function cancelTask(agentUrl: string, taskId: string): Promise<A2ATask> {
  const normalizedBase = agentUrl.replace(/\/$/, "");

  const rpcBody: JsonRpcRequest = {
    jsonrpc: "2.0",
    id: uuidv4(),
    method: "tasks/cancel",
    params: { taskId },
  };

  const resp = await governedFetch(normalizedBase, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(rpcBody),
  }, taskId, "network", "network:http_request");

  if (!resp.ok) {
    throw new Error(`tasks/cancel request failed: HTTP ${resp.status} ${resp.statusText}`);
  }

  const rpcResp = (await resp.json()) as JsonRpcResponse<A2ATask>;
  if ("error" in rpcResp) {
    throw new Error(`Remote error [${rpcResp.error.code}]: ${rpcResp.error.message}`);
  }

  return (rpcResp as JsonRpcSuccess<A2ATask>).result;
}

// ---------------------------------------------------------------------------
// In-Memory Agent Registry — CRUD
// ---------------------------------------------------------------------------

/**
 * Manually registers a remote agent in the local in-memory registry.
 * Useful when you already have an AgentCard (e.g. from a static config)
 * and don't need to perform network discovery.
 *
 * @param baseUrl   - The canonical base URL of the remote agent.
 * @param agentCard - The AgentCard to associate with this URL.
 */
export function registerAgent(baseUrl: string, agentCard: AgentCard): void {
  const normalized = baseUrl.replace(/\/$/, "");
  agentRegistry.set(normalized, agentCard);
  evictIfNeeded(agentRegistry, MAX_REGISTRY_SIZE);
  console.log(`[A2A Registry] Registered agent: ${agentCard.name} at ${normalized}`);
}

/**
 * Removes a remote agent from the local in-memory registry.
 *
 * @param baseUrl - The base URL of the agent to remove.
 * @returns `true` if the agent was found and removed, `false` otherwise.
 */
export function unregisterAgent(baseUrl: string): boolean {
  const normalized = baseUrl.replace(/\/$/, "");
  const existed = agentRegistry.has(normalized);
  agentRegistry.delete(normalized);
  if (existed) {
    console.log(`[A2A Registry] Unregistered agent at ${normalized}`);
  }
  return existed;
}

/**
 * Retrieves a single registered agent's card by base URL.
 *
 * @param baseUrl - The base URL of the agent to look up.
 * @returns The AgentCard, or `undefined` if not registered.
 */
export function getAgent(baseUrl: string): AgentCard | undefined {
  return agentRegistry.get(baseUrl.replace(/\/$/, ""));
}

/**
 * Returns all agents currently registered in the local in-memory registry.
 *
 * @returns Array of `{ url, card }` entries.
 */
export function listRegisteredAgents(): Array<{ url: string; card: AgentCard }> {
  return Array.from(agentRegistry.entries()).map(([url, card]) => ({ url, card }));
}

// ---------------------------------------------------------------------------
// Named re-exports for clarity
// ---------------------------------------------------------------------------

export {
  // Alias listRegisteredAgents as listAgents for convenience
  listRegisteredAgents as listAgents,
};
