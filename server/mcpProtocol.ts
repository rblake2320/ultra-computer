/**
 * MCP Protocol Implementation — Ultra Computer
 *
 * Implements the Model Context Protocol (MCP) specification version 2025-06-18
 * using JSON-RPC 2.0 as the transport envelope.
 *
 * This module provides BOTH sides of the protocol:
 *   - MCP SERVER: Exposes Ultra Computer's tools, resources, and prompts to
 *     any MCP-compatible client (e.g. Claude Desktop, Cursor, other LLM hosts).
 *   - MCP CLIENT: Connects to remote MCP servers and proxies their capabilities
 *     back into Ultra Computer's agent runtime.
 *
 * Reference: https://spec.modelcontextprotocol.io/specification/2025-06-18/
 */

import { v4 as uuidv4 } from "uuid";
import { storage } from "./storage.js";
import { TOOL_SCHEMAS, executeTool } from "./tools.js";

// ─── MCP Protocol Version ─────────────────────────────────────────────────────

const MCP_PROTOCOL_VERSION = "2025-06-18";
const SERVER_NAME = "ultra-computer";
const SERVER_VERSION = "1.0.0";

// ─── JSON-RPC 2.0 Types ───────────────────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: JsonRpcError;
}

interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

/** Standard JSON-RPC 2.0 error codes */
const RPC_ERRORS = {
  PARSE_ERROR: { code: -32700, message: "Parse error" },
  INVALID_REQUEST: { code: -32600, message: "Invalid Request" },
  METHOD_NOT_FOUND: { code: -32601, message: "Method not found" },
  INVALID_PARAMS: { code: -32602, message: "Invalid params" },
  INTERNAL_ERROR: { code: -32603, message: "Internal error" },
} as const;

// ─── MCP Shared Types ─────────────────────────────────────────────────────────

/** An MCP Tool exposed by a server */
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, { type: string; description?: string; enum?: string[] }>;
    required?: string[];
  };
}

/** An MCP Resource exposed by a server */
export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

/** An MCP Resource Template (URI template pattern) */
interface MCPResourceTemplate {
  uriTemplate: string;
  name: string;
  description?: string;
  mimeType?: string;
}

/** An MCP Prompt exposed by a server */
interface MCPPrompt {
  name: string;
  description?: string;
  arguments?: Array<{ name: string; description?: string; required?: boolean }>;
}

/** Content block returned from tool calls and resource reads */
interface MCPTextContent {
  type: "text";
  text: string;
}

interface MCPImageContent {
  type: "image";
  data: string;
  mimeType: string;
}

type MCPContent = MCPTextContent | MCPImageContent;

// ─── MCP Client (Registry) Types ─────────────────────────────────────────────

/** Status of a remote MCP server connection */
type MCPConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

/** Represents a live connection to a remote MCP server */
export interface MCPServerConnection {
  /** Unique ID assigned locally (UUID) */
  id: string;
  /** Human-readable name from the connection config */
  name: string;
  /** Base URL of the remote MCP server */
  url: string;
  /** Transport type used */
  transport: "streamable-http" | "sse";
  /** Server capabilities returned during initialize handshake */
  capabilities: {
    tools?: Record<string, unknown>;
    resources?: Record<string, unknown>;
    prompts?: Record<string, unknown>;
    logging?: Record<string, unknown>;
    experimental?: Record<string, unknown>;
  };
  /** Cached tool list for this server */
  tools: MCPTool[];
  /** Cached resource list for this server */
  resources: MCPResource[];
  /** Connection health */
  status: MCPConnectionStatus;
  /** When the connection was established */
  connectedAt: number;
  /** Custom HTTP headers forwarded on every request */
  headers?: Record<string, string>;
  /** Running request counter for generating unique IDs */
  _requestCounter: number;
}

/** Config required to connect to a remote MCP server */
interface MCPServerConfig {
  url: string;
  transport: "streamable-http" | "sse";
  name: string;
  headers?: Record<string, string>;
}

// ─── Server Registry ──────────────────────────────────────────────────────────

/**
 * In-memory registry of all active remote MCP server connections.
 * Keys are the server connection IDs (UUIDs).
 */
const serverRegistry = new Map<string, MCPServerConnection>();

// ─── MCP Tool Schema Conversion ───────────────────────────────────────────────

/**
 * Converts the internal ToolSchema format (OpenAI function-calling style) used
 * by tools.ts into the MCP inputSchema format.
 *
 * The key differences:
 *   - MCP uses `inputSchema` (not `parameters`)
 *   - MCP inputSchema is a full JSON Schema object
 */
function toMCPTool(schema: (typeof TOOL_SCHEMAS)[number]): MCPTool {
  return {
    name: schema.name,
    description: schema.description,
    inputSchema: {
      type: "object",
      properties: schema.parameters.properties as MCPTool["inputSchema"]["properties"],
      required: schema.parameters.required?.length ? schema.parameters.required : undefined,
    },
  };
}

/** All Ultra Computer tools converted to MCP format, computed once at startup */
const UC_MCP_TOOLS: MCPTool[] = TOOL_SCHEMAS.map(toMCPTool);

// ─── Built-in Resource Definitions ───────────────────────────────────────────

/**
 * Static set of URI templates that clients can use to construct resource URIs.
 * These map to the resource handler in handleResourceRead().
 */
const RESOURCE_TEMPLATES: MCPResourceTemplate[] = [
  {
    uriTemplate: "skill://{id}",
    name: "Skill by ID",
    description: "Load the content of an Ultra Computer skill by its database ID",
    mimeType: "text/plain",
  },
  {
    uriTemplate: "memory://{category}",
    name: "Memory by Category",
    description: "Retrieve stored memory items filtered by category (general, important, etc.)",
    mimeType: "application/json",
  },
  {
    uriTemplate: "conversation://{id}",
    name: "Conversation by ID",
    description: "Retrieve a conversation and its messages by conversation ID",
    mimeType: "application/json",
  },
  {
    uriTemplate: "file://{path}",
    name: "Sandbox File",
    description: "Read a file from the agent sandbox by path",
    mimeType: "text/plain",
  },
  {
    uriTemplate: "model://{id}",
    name: "Model Config",
    description: "Get the configuration and capabilities of a registered LLM model",
    mimeType: "application/json",
  },
];

/**
 * Builds the dynamic list of concrete resources from the current storage state.
 * Called fresh on every resources/list request so the listing is always current.
 */
async function buildResourceList(): Promise<MCPResource[]> {
  const resources: MCPResource[] = [];

  try {
    // Skills
    const skills = storage.getSkills();
    for (const skill of skills) {
      resources.push({
        uri: `skill://${skill.id}`,
        name: `Skill: ${skill.name}`,
        description: skill.description,
        mimeType: "text/plain",
      });
    }

    // Memory categories — emit one resource per distinct category
    const memories = storage.getMemories(200);
    const categories = new Set(memories.map((m) => m.category));
    for (const cat of categories) {
      resources.push({
        uri: `memory://${cat}`,
        name: `Memory: ${cat}`,
        description: `All stored memory items in the "${cat}" category`,
        mimeType: "application/json",
      });
    }

    // Conversations (most recent 20)
    const conversations = storage.getConversations().slice(0, 20);
    for (const conv of conversations) {
      resources.push({
        uri: `conversation://${conv.id}`,
        name: `Conversation: ${conv.title}`,
        description: `Messages from conversation created at ${new Date(conv.createdAt).toISOString()}`,
        mimeType: "application/json",
      });
    }

    // Models
    const models = storage.getModels();
    for (const model of models) {
      resources.push({
        uri: `model://${model.id}`,
        name: `Model: ${model.name}`,
        description: `${model.provider} model — ${model.modelId}`,
        mimeType: "application/json",
      });
    }
  } catch (err) {
    console.error("[mcpProtocol] Failed to build resource list:", err);
  }

  return resources;
}

/**
 * Reads a single resource by URI and returns its content.
 * Handles all URI schemes defined in RESOURCE_TEMPLATES.
 *
 * @param uri - Full resource URI, e.g. "skill://abc123" or "memory://general"
 * @returns Content array (MCP ResourceContents format)
 */
async function handleResourceRead(uri: string): Promise<{ uri: string; mimeType: string; text?: string; blob?: string }> {
  const url = new URL(uri);
  const scheme = url.protocol.replace(":", "");
  const id = decodeURIComponent(url.hostname + (url.pathname !== "/" ? url.pathname : ""));

  switch (scheme) {
    case "skill": {
      const skill = storage.getSkill(id);
      if (!skill) throw new Error(`Skill not found: ${id}`);
      return {
        uri,
        mimeType: "text/plain",
        text: `# ${skill.name}\n\n${skill.description}\n\n---\n\n${skill.content}`,
      };
    }

    case "memory": {
      const category = id;
      const memories = storage.getMemories(200).filter((m) => m.category === category);
      return {
        uri,
        mimeType: "application/json",
        text: JSON.stringify(
          memories.map((m) => ({
            id: m.id,
            content: m.content,
            summary: m.summary,
            importance: m.importance,
            createdAt: new Date(m.createdAt).toISOString(),
          })),
          null,
          2
        ),
      };
    }

    case "conversation": {
      const conv = storage.getConversation(id);
      if (!conv) throw new Error(`Conversation not found: ${id}`);
      const msgs = storage.getMessages(id);
      return {
        uri,
        mimeType: "application/json",
        text: JSON.stringify(
          {
            id: conv.id,
            title: conv.title,
            status: conv.status,
            createdAt: new Date(conv.createdAt).toISOString(),
            messages: msgs.map((m) => ({
              id: m.id,
              role: m.role,
              content: m.content,
              createdAt: new Date(m.createdAt).toISOString(),
            })),
          },
          null,
          2
        ),
      };
    }

    case "file": {
      // Delegate to the read_file tool so sandbox path restrictions are enforced
      const result = await executeTool("read_file", { filename: id });
      if (!result.success) throw new Error(result.error || `Could not read file: ${id}`);
      return { uri, mimeType: "text/plain", text: result.output };
    }

    case "model": {
      const model = storage.getModel(id);
      if (!model) throw new Error(`Model not found: ${id}`);
      return {
        uri,
        mimeType: "application/json",
        text: JSON.stringify(
          {
            id: model.id,
            name: model.name,
            provider: model.provider,
            modelId: model.modelId,
            enabled: model.enabled,
            capabilities: JSON.parse((model.capabilities as string) || "[]"),
            contextWindow: model.contextWindow,
            isDefault: model.isDefault,
            isOrchestrator: model.isOrchestrator,
            speedTier: model.speedTier,
          },
          null,
          2
        ),
      };
    }

    default:
      throw new Error(`Unknown resource URI scheme: ${scheme}://`);
  }
}

// ─── Built-in Prompt Templates ────────────────────────────────────────────────

/** Static prompt templates exposed via prompts/list */
const UC_PROMPTS: MCPPrompt[] = [
  {
    name: "summarize_conversation",
    description: "Summarize a conversation by its ID into bullet points",
    arguments: [
      { name: "conversation_id", description: "The ID of the conversation to summarize", required: true },
      { name: "style", description: "Summary style: 'brief' | 'detailed' | 'action-items'", required: false },
    ],
  },
  {
    name: "code_review",
    description: "Review code from a sandbox file and suggest improvements",
    arguments: [
      { name: "file_path", description: "Path to the file in the sandbox to review", required: true },
      { name: "focus", description: "Review focus: 'bugs' | 'performance' | 'security' | 'style' | 'all'", required: false },
    ],
  },
  {
    name: "search_and_summarize",
    description: "Search the web for a topic and return a structured summary",
    arguments: [
      { name: "query", description: "The web search query", required: true },
      { name: "num_results", description: "Number of results to include (1-10, default 5)", required: false },
    ],
  },
  {
    name: "task_planner",
    description: "Generate a step-by-step plan for completing a complex task",
    arguments: [
      { name: "goal", description: "The high-level goal to plan for", required: true },
      { name: "constraints", description: "Any constraints or restrictions (optional)", required: false },
    ],
  },
  {
    name: "memory_recall",
    description: "Search and surface relevant memories for a given topic",
    arguments: [
      { name: "topic", description: "The topic or question to search memories for", required: true },
      { name: "category", description: "Limit to a specific memory category (optional)", required: false },
    ],
  },
];

/**
 * Resolves a prompt template with provided arguments, returning a
 * ready-to-use messages array in MCP prompt format.
 */
async function resolvePrompt(
  name: string,
  args: Record<string, string>
): Promise<{ description: string; messages: Array<{ role: "user" | "assistant"; content: MCPContent }> }> {
  switch (name) {
    case "summarize_conversation": {
      const convId = args.conversation_id;
      if (!convId) throw new Error("conversation_id is required");
      const style = args.style || "brief";
      const conv = storage.getConversation(convId);
      if (!conv) throw new Error(`Conversation not found: ${convId}`);
      const msgs = storage.getMessages(convId);
      const transcript = msgs
        .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
        .join("\n\n");
      return {
        description: `Summarize conversation "${conv.title}"`,
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Please provide a ${style} summary of the following conversation:\n\n${transcript}`,
            },
          },
        ],
      };
    }

    case "code_review": {
      const filePath = args.file_path;
      if (!filePath) throw new Error("file_path is required");
      const focus = args.focus || "all";
      const result = await executeTool("read_file", { filename: filePath });
      if (!result.success) throw new Error(`Cannot read file: ${result.error}`);
      return {
        description: `Code review of ${filePath}`,
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Please review the following code with a focus on ${focus}. Provide concrete, actionable suggestions.\n\nFile: ${filePath}\n\n\`\`\`\n${result.output}\n\`\`\``,
            },
          },
        ],
      };
    }

    case "search_and_summarize": {
      const query = args.query;
      if (!query) throw new Error("query is required");
      const numResults = args.num_results || "5";
      const searchResult = await executeTool("search_web", { query, num_results: numResults });
      return {
        description: `Search and summarize: ${query}`,
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Based on these web search results, provide a structured summary for: "${query}"\n\n${searchResult.output}`,
            },
          },
        ],
      };
    }

    case "task_planner": {
      const goal = args.goal;
      if (!goal) throw new Error("goal is required");
      const constraints = args.constraints ? `\n\nConstraints: ${args.constraints}` : "";
      return {
        description: `Task plan for: ${goal}`,
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Create a detailed, step-by-step plan to accomplish the following goal. Each step should be concrete and actionable.\n\nGoal: ${goal}${constraints}`,
            },
          },
        ],
      };
    }

    case "memory_recall": {
      const topic = args.topic;
      if (!topic) throw new Error("topic is required");
      let memories = storage.searchMemories(topic, 10);
      if (args.category) {
        memories = memories.filter((m) => m.category === args.category);
      }
      const memoryText = memories.length > 0
        ? memories.map((m) => `- [${m.category}] ${m.content}`).join("\n")
        : "(No relevant memories found)";
      return {
        description: `Memory recall for: ${topic}`,
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Based on these stored memories, provide context relevant to: "${topic}"\n\nMemories:\n${memoryText}`,
            },
          },
        ],
      };
    }

    default:
      throw new Error(`Unknown prompt: ${name}`);
  }
}

// ─── JSON-RPC Helpers ─────────────────────────────────────────────────────────

/** Build a well-formed JSON-RPC 2.0 success response */
function rpcOk(id: string | number | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

/** Build a well-formed JSON-RPC 2.0 error response */
function rpcError(
  id: string | number | null,
  error: { code: number; message: string },
  data?: unknown
): JsonRpcResponse {
  return {
    jsonrpc: "2.0",
    id: id ?? null,
    error: { ...error, ...(data !== undefined ? { data } : {}) },
  };
}

// ─── MCP SERVER: Main Request Dispatcher ─────────────────────────────────────

/**
 * handleMCPRequest — JSON-RPC 2.0 dispatcher for the Ultra Computer MCP server.
 *
 * Accepts a parsed JSON-RPC request body (or raw string) and dispatches it to
 * the appropriate handler. Returns a JSON-RPC 2.0 response object ready for
 * serialization.
 *
 * Supports all required MCP lifecycle and capability methods:
 *   initialize, notifications/initialized, ping
 *   tools/list, tools/call
 *   resources/list, resources/read, resources/templates/list
 *   prompts/list, prompts/get
 *
 * @param jsonRpcBody - Parsed JSON-RPC 2.0 request, or raw JSON string
 * @returns JsonRpcResponse ready to be JSON.stringify'd
 */
export async function handleMCPRequest(
  jsonRpcBody: JsonRpcRequest | string | unknown
): Promise<JsonRpcResponse> {
  // Parse if given a raw string
  let req: JsonRpcRequest;
  try {
    req = typeof jsonRpcBody === "string"
      ? (JSON.parse(jsonRpcBody) as JsonRpcRequest)
      : (jsonRpcBody as JsonRpcRequest);
  } catch {
    return rpcError(null, RPC_ERRORS.PARSE_ERROR);
  }

  // Basic JSON-RPC validation
  if (req.jsonrpc !== "2.0" || typeof req.method !== "string") {
    return rpcError(req.id ?? null, RPC_ERRORS.INVALID_REQUEST);
  }

  const id = req.id ?? null;
  const params = (req.params || {}) as Record<string, unknown>;

  try {
    switch (req.method) {
      // ── Lifecycle ──────────────────────────────────────────────────────────

      case "initialize":
        return rpcOk(id, {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: {
            tools: {},
            resources: { subscribe: false, listChanged: false },
            prompts: { listChanged: false },
            logging: {},
          },
          serverInfo: {
            name: SERVER_NAME,
            version: SERVER_VERSION,
          },
          instructions:
            "Ultra Computer MCP server. Use tools/list to discover available tools, " +
            "resources/list for available data resources, and prompts/list for reusable prompt templates.",
        });

      case "notifications/initialized":
        // Client acknowledging successful initialization — no response body needed
        // For notifications (no id), we return a minimal response that callers can ignore
        return rpcOk(id, null);

      case "ping":
        // Health check — MCP spec requires returning empty object
        return rpcOk(id, {});

      // ── Tools ──────────────────────────────────────────────────────────────

      case "tools/list":
        return rpcOk(id, { tools: UC_MCP_TOOLS });

      case "tools/call": {
        const toolName = params.name as string;
        const toolArgs = (params.arguments || {}) as Record<string, string>;

        if (!toolName) {
          return rpcError(id, RPC_ERRORS.INVALID_PARAMS, "tools/call requires 'name'");
        }

        // Find the tool in our registry
        const knownTool = TOOL_SCHEMAS.find((t) => t.name === toolName);
        if (!knownTool) {
          return rpcOk(id, {
            content: [{ type: "text", text: `Unknown tool: ${toolName}` }],
            isError: true,
          });
        }

        // Execute the tool via the existing executor
        const result = await executeTool(toolName, toolArgs);

        if (result.success) {
          return rpcOk(id, {
            content: [{ type: "text", text: result.output }],
          });
        } else {
          return rpcOk(id, {
            content: [
              {
                type: "text",
                text: result.error
                  ? `Error: ${result.error}${result.output ? `\n\n${result.output}` : ""}`
                  : result.output || "Tool execution failed",
              },
            ],
            isError: true,
          });
        }
      }

      // ── Resources ──────────────────────────────────────────────────────────

      case "resources/list": {
        const resources = await buildResourceList();
        return rpcOk(id, { resources });
      }

      case "resources/read": {
        const uri = params.uri as string;
        if (!uri) {
          return rpcError(id, RPC_ERRORS.INVALID_PARAMS, "resources/read requires 'uri'");
        }

        let parsed: URL;
        try {
          parsed = new URL(uri);
        } catch {
          return rpcError(id, RPC_ERRORS.INVALID_PARAMS, `Invalid URI: ${uri}`);
        }

        // Validate URI scheme
        const scheme = parsed.protocol.replace(":", "");
        const validSchemes = ["skill", "memory", "conversation", "file", "model"];
        if (!validSchemes.includes(scheme)) {
          return rpcError(
            id,
            RPC_ERRORS.INVALID_PARAMS,
            `Unsupported URI scheme: ${scheme}. Use one of: ${validSchemes.join(", ")}`
          );
        }

        try {
          const contents = await handleResourceRead(uri);
          return rpcOk(id, { contents: [contents] });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          return rpcError(id, RPC_ERRORS.INTERNAL_ERROR, message);
        }
      }

      case "resources/templates/list":
        return rpcOk(id, { resourceTemplates: RESOURCE_TEMPLATES });

      // ── Prompts ────────────────────────────────────────────────────────────

      case "prompts/list":
        return rpcOk(id, { prompts: UC_PROMPTS });

      case "prompts/get": {
        const promptName = params.name as string;
        const promptArgs = (params.arguments || {}) as Record<string, string>;

        if (!promptName) {
          return rpcError(id, RPC_ERRORS.INVALID_PARAMS, "prompts/get requires 'name'");
        }

        const prompt = UC_PROMPTS.find((p) => p.name === promptName);
        if (!prompt) {
          return rpcError(id, RPC_ERRORS.INVALID_PARAMS, `Unknown prompt: ${promptName}`);
        }

        // Check required arguments
        const missingArgs = (prompt.arguments || [])
          .filter((a) => a.required && !promptArgs[a.name])
          .map((a) => a.name);

        if (missingArgs.length > 0) {
          return rpcError(
            id,
            RPC_ERRORS.INVALID_PARAMS,
            `Missing required arguments: ${missingArgs.join(", ")}`
          );
        }

        try {
          const resolved = await resolvePrompt(promptName, promptArgs);
          return rpcOk(id, resolved);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          return rpcError(id, RPC_ERRORS.INTERNAL_ERROR, message);
        }
      }

      // ── Unknown Method ─────────────────────────────────────────────────────

      default:
        return rpcError(id, RPC_ERRORS.METHOD_NOT_FOUND, `Method '${req.method}' is not supported`);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[mcpProtocol] Unhandled error in method '${req.method}':`, err);
    return rpcError(id, RPC_ERRORS.INTERNAL_ERROR, message);
  }
}

// ─── MCP CLIENT: Remote Server Communication ──────────────────────────────────

/**
 * Sends a single JSON-RPC 2.0 request to a remote MCP server and returns the
 * parsed response. Handles both streamable-http and sse transports uniformly
 * (both use HTTP POST; SSE streaming is handled at the session level, not per-request).
 *
 * @param connection - The connected server to send the request to
 * @param method     - JSON-RPC method name
 * @param params     - Method parameters
 * @returns Parsed JSON-RPC result (throws on error)
 */
async function sendRemoteRequest(
  connection: MCPServerConnection,
  method: string,
  params?: Record<string, unknown>
): Promise<unknown> {
  connection._requestCounter++;
  const requestId = `${connection.id}-${connection._requestCounter}`;

  const body: JsonRpcRequest = {
    jsonrpc: "2.0",
    id: requestId,
    method,
    ...(params ? { params } : {}),
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch(connection.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "User-Agent": `${SERVER_NAME}/${SERVER_VERSION} MCP-Client`,
        ...connection.headers,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText} from ${connection.url}`);
    }

    const contentType = response.headers.get("content-type") || "";

    let rpcResponse: JsonRpcResponse;

    if (contentType.includes("text/event-stream")) {
      // SSE transport: parse the first data: event from the stream
      const text = await response.text();
      const dataLine = text.split("\n").find((line) => line.startsWith("data:"));
      if (!dataLine) throw new Error("No data event received in SSE stream");
      rpcResponse = JSON.parse(dataLine.replace(/^data:\s*/, "")) as JsonRpcResponse;
    } else {
      rpcResponse = (await response.json()) as JsonRpcResponse;
    }

    if (rpcResponse.error) {
      throw new Error(
        `RPC error ${rpcResponse.error.code}: ${rpcResponse.error.message}` +
          (rpcResponse.error.data ? ` — ${JSON.stringify(rpcResponse.error.data)}` : "")
      );
    }

    return rpcResponse.result;
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

/**
 * Sends a notification (one-way message, no response expected) to a remote
 * MCP server. Used for lifecycle notifications like notifications/initialized.
 */
async function sendRemoteNotification(
  connection: MCPServerConnection,
  method: string,
  params?: Record<string, unknown>
): Promise<void> {
  const body = {
    jsonrpc: "2.0" as const,
    method,
    ...(params ? { params } : {}),
    // No id — this is a notification
  };

  try {
    await fetch(connection.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": `${SERVER_NAME}/${SERVER_VERSION} MCP-Client`,
        ...connection.headers,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    // Notifications are fire-and-forget; swallow errors
  }
}

/**
 * Looks up a server connection by ID. Throws if not found or not connected.
 */
function getConnection(serverId: string): MCPServerConnection {
  const conn = serverRegistry.get(serverId);
  if (!conn) throw new Error(`No MCP server registered with ID: ${serverId}`);
  if (conn.status !== "connected") {
    throw new Error(`MCP server '${conn.name}' (${serverId}) is not connected (status: ${conn.status})`);
  }
  return conn;
}

// ─── MCP CLIENT: Public API ───────────────────────────────────────────────────

/**
 * connectToServer — Establish a connection to a remote MCP server.
 *
 * Performs the MCP initialization handshake:
 *   1. POST initialize → receive server capabilities and protocol version
 *   2. POST notifications/initialized → inform server we are ready
 *   3. Fetch the server's tool and resource lists for caching
 *   4. Store the connection in the in-memory registry
 *
 * @param config - Connection configuration
 * @returns The populated MCPServerConnection stored in the registry
 */
export async function connectToServer(config: MCPServerConfig): Promise<MCPServerConnection> {
  const id = uuidv4();

  // Create a provisional connection entry
  const conn: MCPServerConnection = {
    id,
    name: config.name,
    url: config.url,
    transport: config.transport,
    capabilities: {},
    tools: [],
    resources: [],
    status: "connecting",
    connectedAt: Date.now(),
    headers: config.headers,
    _requestCounter: 0,
  };

  serverRegistry.set(id, conn);

  try {
    // Step 1: initialize handshake
    const initResult = await sendRemoteRequest(conn, "initialize", {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {
        roots: { listChanged: false },
        sampling: {},
      },
      clientInfo: {
        name: SERVER_NAME,
        version: SERVER_VERSION,
      },
    }) as {
      protocolVersion?: string;
      capabilities?: MCPServerConnection["capabilities"];
      serverInfo?: { name: string; version: string };
    };

    conn.capabilities = initResult.capabilities || {};

    // Step 2: send initialized notification
    await sendRemoteNotification(conn, "notifications/initialized");

    // Mark as connected before fetching tools/resources
    conn.status = "connected";

    // Step 3: pre-fetch tools and resources for local caching
    try {
      conn.tools = await listRemoteTools(id);
    } catch (err) {
      console.warn(`[mcpProtocol] Could not pre-fetch tools from '${config.name}':`, err);
    }

    try {
      conn.resources = await listRemoteResources(id);
    } catch (err) {
      console.warn(`[mcpProtocol] Could not pre-fetch resources from '${config.name}':`, err);
    }

    console.log(
      `[mcpProtocol] Connected to MCP server '${config.name}' (${id}) ` +
        `— ${conn.tools.length} tools, ${conn.resources.length} resources`
    );

    return conn;
  } catch (err) {
    conn.status = "error";
    serverRegistry.set(id, conn); // persist the error state
    throw new Error(
      `Failed to connect to MCP server '${config.name}' at ${config.url}: ${(err as Error).message}`
    );
  }
}

/**
 * disconnectServer — Remove a server connection from the registry.
 *
 * Marks the connection as disconnected and removes it from the registry.
 * Any in-flight requests to this server will fail naturally (no graceful drain).
 *
 * @param serverId - ID returned from connectToServer
 */
export function disconnectServer(serverId: string): void {
  const conn = serverRegistry.get(serverId);
  if (!conn) return;

  conn.status = "disconnected";
  serverRegistry.delete(serverId);

  console.log(`[mcpProtocol] Disconnected from MCP server '${conn.name}' (${serverId})`);
}

/**
 * listConnectedServers — Return all currently connected MCP servers.
 *
 * Returns a snapshot of the registry, safe to iterate. Only includes servers
 * with status === "connected".
 */
export function listConnectedServers(): MCPServerConnection[] {
  return Array.from(serverRegistry.values()).filter((c) => c.status === "connected");
}

/**
 * listRemoteTools — Fetch the tool list from a connected remote MCP server.
 *
 * Updates the cached tool list on the connection object as a side effect.
 *
 * @param serverId - ID of the connected server
 * @returns Array of MCPTool from the remote server
 */
export async function listRemoteTools(serverId: string): Promise<MCPTool[]> {
  const conn = getConnection(serverId);
  const result = (await sendRemoteRequest(conn, "tools/list")) as { tools?: MCPTool[] };
  const tools = result.tools || [];
  conn.tools = tools; // update cache
  return tools;
}

/**
 * callRemoteTool — Invoke a tool on a connected remote MCP server.
 *
 * @param serverId  - ID of the connected server
 * @param toolName  - Name of the tool to call
 * @param args      - Tool arguments (key-value pairs)
 * @returns Tool result content from the remote server
 */
export async function callRemoteTool(
  serverId: string,
  toolName: string,
  args: Record<string, unknown>
): Promise<{ content: MCPContent[]; isError?: boolean }> {
  const conn = getConnection(serverId);
  const result = (await sendRemoteRequest(conn, "tools/call", {
    name: toolName,
    arguments: args,
  })) as { content?: MCPContent[]; isError?: boolean };

  return {
    content: result.content || [],
    isError: result.isError,
  };
}

/**
 * listRemoteResources — Fetch the resource list from a connected remote MCP server.
 *
 * Updates the cached resource list on the connection as a side effect.
 *
 * @param serverId - ID of the connected server
 * @returns Array of MCPResource from the remote server
 */
export async function listRemoteResources(serverId: string): Promise<MCPResource[]> {
  const conn = getConnection(serverId);
  const result = (await sendRemoteRequest(conn, "resources/list")) as { resources?: MCPResource[] };
  const resources = result.resources || [];
  conn.resources = resources; // update cache
  return resources;
}

/**
 * readRemoteResource — Read a resource from a connected remote MCP server by URI.
 *
 * @param serverId - ID of the connected server
 * @param uri      - Full resource URI (e.g. "file:///path/to/file")
 * @returns The resource contents from the remote server
 */
export async function readRemoteResource(
  serverId: string,
  uri: string
): Promise<{ contents: Array<{ uri: string; mimeType?: string; text?: string; blob?: string }> }> {
  const conn = getConnection(serverId);
  const result = (await sendRemoteRequest(conn, "resources/read", { uri })) as {
    contents?: Array<{ uri: string; mimeType?: string; text?: string; blob?: string }>;
  };
  return { contents: result.contents || [] };
}

/**
 * listRemotePrompts — Fetch the prompt list from a connected remote MCP server.
 *
 * @param serverId - ID of the connected server
 * @returns Array of MCPPrompt definitions from the remote server
 */
export async function listRemotePrompts(serverId: string): Promise<MCPPrompt[]> {
  const conn = getConnection(serverId);
  const result = (await sendRemoteRequest(conn, "prompts/list")) as { prompts?: MCPPrompt[] };
  return result.prompts || [];
}

/**
 * getRemotePrompt — Resolve a named prompt on a connected remote MCP server.
 *
 * @param serverId - ID of the connected server
 * @param name     - Name of the prompt to retrieve
 * @param args     - Argument values to fill into the prompt template
 * @returns Resolved prompt messages and description from the remote server
 */
export async function getRemotePrompt(
  serverId: string,
  name: string,
  args: Record<string, string>
): Promise<{
  description?: string;
  messages: Array<{ role: "user" | "assistant"; content: MCPContent }>;
}> {
  const conn = getConnection(serverId);
  const result = (await sendRemoteRequest(conn, "prompts/get", {
    name,
    arguments: args,
  })) as {
    description?: string;
    messages?: Array<{ role: "user" | "assistant"; content: MCPContent }>;
  };

  return {
    description: result.description,
    messages: result.messages || [],
  };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

export {
  handleMCPRequest as default,
  type MCPServerConnection,
  type MCPTool,
  type MCPResource,
};
