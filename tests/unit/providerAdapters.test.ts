import http, { type IncomingMessage, type ServerResponse } from "node:http";
import { once } from "node:events";
import { afterEach, describe, expect, it } from "vitest";
import {
  AnthropicAdapter,
  collectNormalizedEvents,
  OpenAICompatibleAdapter,
  OpenAIResponsesAdapter,
  type ModelRequest,
} from "../../server/models/index.js";
import { connectionTestRequest } from "../../server/modelRouter.js";

interface CapturedRequest {
  method: string;
  path: string;
  headers: http.IncomingHttpHeaders;
  body: Record<string, unknown>;
}

const servers: http.Server[] = [];

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

async function contractServer(
  handler: (
    request: CapturedRequest,
    response: ServerResponse,
  ) => void | Promise<void>,
): Promise<{ baseURL: string; requests: CapturedRequest[] }> {
  const requests: CapturedRequest[] = [];
  const server = http.createServer(async (request, response) => {
    const captured: CapturedRequest = {
      method: request.method ?? "GET",
      path: request.url ?? "/",
      headers: request.headers,
      body: await readJson(request),
    };
    requests.push(captured);
    await handler(captured, response);
  });
  servers.push(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Contract server did not bind");
  return { baseURL: `http://127.0.0.1:${address.port}`, requests };
}

function json(response: ServerResponse, payload: unknown): void {
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify(payload));
}

function baseRequest(overrides: Partial<ModelRequest> = {}): ModelRequest {
  return {
    model: "future-model",
    messages: [{ role: "user", content: "Use the lookup tool." }],
    maxOutputTokens: 256,
    tools: [{
      name: "lookup",
      description: "Look up a value",
      inputSchema: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
    }],
    ...overrides,
  };
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map(async (server) => {
    server.close();
    await once(server, "close");
  }));
});

describe("provider adapter protocol contracts", () => {
  it("serializes the real connection probe within OpenAI Responses limits", async () => {
    const fixture = await contractServer((_request, response) => {
      json(response, {
        id: "resp_probe",
        object: "response",
        created_at: 1,
        status: "completed",
        error: null,
        incomplete_details: null,
        instructions: null,
        metadata: {},
        model: "future-model",
        output_text: "pong",
        output: [],
        usage: {
          input_tokens: 6,
          output_tokens: 1,
          total_tokens: 7,
          input_tokens_details: { cached_tokens: 0 },
          output_tokens_details: { reasoning_tokens: 0 },
        },
      });
    });
    const adapter = new OpenAIResponsesAdapter({
      apiKey: "contract-test-key",
      baseURL: `${fixture.baseURL}/v1`,
    });

    await adapter.generate(connectionTestRequest({ modelId: "future-model" }), {
      requestId: "connection-probe-contract",
    });

    expect(fixture.requests).toHaveLength(1);
    expect(fixture.requests[0]).toMatchObject({
      path: "/v1/responses",
      body: {
        model: "future-model",
        max_output_tokens: 64,
        store: false,
      },
    });
  });

  it("uses OpenAI Responses natively with multimodal input and tool calls", async () => {
    const fixture = await contractServer((_request, response) => {
      json(response, {
        id: "resp_1",
        object: "response",
        created_at: 1,
        status: "completed",
        error: null,
        incomplete_details: null,
        instructions: null,
        metadata: {},
        model: "future-model",
        output_text: "",
        output: [{
          type: "function_call",
          id: "fc_1",
          call_id: "call_1",
          name: "lookup",
          arguments: "{\"query\":\"status\"}",
          status: "completed",
        }],
        usage: {
          input_tokens: 12,
          output_tokens: 4,
          total_tokens: 16,
          input_tokens_details: { cached_tokens: 2 },
          output_tokens_details: { reasoning_tokens: 1 },
        },
      });
    });
    const adapter = new OpenAIResponsesAdapter({
      apiKey: "contract-test-key",
      baseURL: `${fixture.baseURL}/v1`,
    });

    const result = await adapter.generate(baseRequest({
      reasoningEffort: "medium",
      messages: [{
        role: "user",
        content: [
          { type: "text", text: "Read this image." },
          { type: "image", base64: "aW1hZ2U=", mediaType: "image/png" },
        ],
      }],
    }), { requestId: "request-1" });

    expect(result.toolCalls).toEqual([{
      id: "call_1",
      name: "lookup",
      arguments: "{\"query\":\"status\"}",
    }]);
    expect(result.usage).toEqual(expect.objectContaining({
      inputTokens: 12,
      outputTokens: 4,
      cachedInputTokens: 2,
      reasoningTokens: 1,
    }));
    expect(fixture.requests).toHaveLength(1);
    const request = fixture.requests[0];
    expect(request.path).toBe("/v1/responses");
    expect(request.headers.authorization).toBe("Bearer contract-test-key");
    expect(request.body).toMatchObject({
      model: "future-model",
      max_output_tokens: 256,
      reasoning: { effort: "medium" },
      store: false,
      tools: [{ type: "function", name: "lookup" }],
    });
    expect(request.body).not.toHaveProperty("temperature");
    expect(JSON.stringify(request.body)).toContain("data:image/png;base64,aW1hZ2U=");
  });

  it("keeps explicitly compatible endpoints on Chat Completions", async () => {
    const fixture = await contractServer((_request, response) => {
      json(response, {
        id: "chatcmpl_1",
        object: "chat.completion",
        created: 1,
        model: "compat-model",
        choices: [{
          index: 0,
          finish_reason: "stop",
          message: { role: "assistant", content: "real protocol response" },
        }],
        usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
      });
    });
    const adapter = new OpenAICompatibleAdapter("custom", {
      apiKey: "compat-key",
      baseURL: `${fixture.baseURL}/v1`,
    });

    const result = await adapter.generate(baseRequest({
      model: "compat-model",
      tools: undefined,
    }), { requestId: "request-2" });

    expect(result.text).toBe("real protocol response");
    expect(fixture.requests[0].path).toBe("/v1/chat/completions");
    expect(fixture.requests[0].body).not.toHaveProperty("temperature");
  });

  it("normalizes native OpenAI Responses SSE text, reasoning, tools, and usage", async () => {
    const fixture = await contractServer((_request, response) => {
      response.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
      });
      const responseObject = {
        id: "resp_stream",
        object: "response",
        created_at: 1,
        status: "completed",
        error: null,
        incomplete_details: null,
        instructions: null,
        metadata: {},
        model: "future-model",
        output_text: "done",
        output: [{
          type: "function_call",
          id: "fc_stream",
          call_id: "call_stream",
          name: "lookup",
          arguments: "{\"query\":\"status\"}",
          status: "completed",
        }],
        usage: {
          input_tokens: 9,
          output_tokens: 4,
          total_tokens: 13,
          input_tokens_details: { cached_tokens: 1 },
          output_tokens_details: { reasoning_tokens: 2 },
        },
      };
      const events = [
        {
          type: "response.created",
          sequence_number: 0,
          response: { ...responseObject, status: "in_progress", output: [], usage: null },
        },
        {
          type: "response.reasoning_summary_text.delta",
          sequence_number: 1,
          output_index: 0,
          item_id: "reasoning_1",
          summary_index: 0,
          delta: "checked ",
        },
        {
          type: "response.output_text.delta",
          sequence_number: 2,
          output_index: 1,
          item_id: "message_1",
          content_index: 0,
          delta: "done",
          logprobs: [],
        },
        {
          type: "response.output_item.added",
          sequence_number: 3,
          output_index: 2,
          item: responseObject.output[0],
        },
        {
          type: "response.function_call_arguments.delta",
          sequence_number: 4,
          output_index: 2,
          item_id: "fc_stream",
          delta: "{\"query\":\"status\"}",
        },
        {
          type: "response.completed",
          sequence_number: 5,
          response: responseObject,
        },
      ];
      for (const event of events) {
        response.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      }
      response.write("data: [DONE]\n\n");
      response.end();
    });
    const adapter = new OpenAIResponsesAdapter({
      apiKey: "contract-test-key",
      baseURL: `${fixture.baseURL}/v1`,
    });

    const collected = await collectNormalizedEvents(
      adapter.stream!(baseRequest(), { requestId: "request-openai-stream" }),
    );

    expect(collected.text).toBe("done");
    expect(collected.reasoning).toBe("checked ");
    expect(collected.finishReason).toBe("tool_calls");
    expect(collected.toolCalls).toEqual([{
      id: "call_stream",
      name: "lookup",
      arguments: "{\"query\":\"status\"}",
    }]);
    expect(collected.usage).toEqual(expect.objectContaining({
      inputTokens: 9,
      outputTokens: 4,
      reasoningTokens: 2,
    }));
  });

  it("translates Anthropic system caching, images, and native tools", async () => {
    const fixture = await contractServer((_request, response) => {
      json(response, {
        id: "msg_1",
        type: "message",
        role: "assistant",
        model: "claude-future",
        content: [{
          type: "tool_use",
          id: "toolu_1",
          name: "lookup",
          input: { query: "status" },
        }],
        stop_reason: "tool_use",
        stop_sequence: null,
        usage: {
          input_tokens: 11,
          output_tokens: 5,
          cache_creation_input_tokens: 7,
          cache_read_input_tokens: 3,
        },
      });
    });
    const adapter = new AnthropicAdapter({
      apiKey: "anthropic-contract-key",
      baseURL: fixture.baseURL,
    });

    const result = await adapter.generate(baseRequest({
      model: "claude-future",
      messages: [
        { role: "system", content: "Be precise." },
        {
          role: "user",
          content: [
            { type: "text", text: "Inspect this." },
            { type: "image", url: "https://example.com/image.png" },
          ],
        },
      ],
    }), { requestId: "request-3" });

    expect(result.finishReason).toBe("tool_calls");
    expect(result.toolCalls).toEqual([{
      id: "toolu_1",
      name: "lookup",
      arguments: "{\"query\":\"status\"}",
    }]);
    const request = fixture.requests[0];
    expect(request.path).toBe("/v1/messages");
    expect(request.headers["x-api-key"]).toBe("anthropic-contract-key");
    expect(request.headers["anthropic-version"]).toBeTruthy();
    expect(request.body).toMatchObject({
      model: "claude-future",
      system: [{
        type: "text",
        text: "Be precise.",
        cache_control: { type: "ephemeral" },
      }],
      tools: [{
        name: "lookup",
        input_schema: { type: "object" },
      }],
    });
    expect(request.body).not.toHaveProperty("temperature");
    expect(JSON.stringify(request.body)).toContain("https://example.com/image.png");
  });

  it("normalizes a real Anthropic SSE stream including incremental tool JSON", async () => {
    const fixture = await contractServer((_request, response) => {
      response.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
      });
      const events = [
        ["message_start", {
          type: "message_start",
          message: {
            id: "msg_stream",
            type: "message",
            role: "assistant",
            model: "claude-future",
            content: [],
            stop_reason: null,
            stop_sequence: null,
            usage: { input_tokens: 8, output_tokens: 1 },
          },
        }],
        ["content_block_start", {
          type: "content_block_start",
          index: 0,
          content_block: {
            type: "tool_use",
            id: "toolu_stream",
            name: "lookup",
            input: {},
          },
        }],
        ["content_block_delta", {
          type: "content_block_delta",
          index: 0,
          delta: { type: "input_json_delta", partial_json: "{\"query\":" },
        }],
        ["content_block_delta", {
          type: "content_block_delta",
          index: 0,
          delta: { type: "input_json_delta", partial_json: "\"status\"}" },
        }],
        ["content_block_stop", { type: "content_block_stop", index: 0 }],
        ["message_delta", {
          type: "message_delta",
          delta: { stop_reason: "tool_use", stop_sequence: null },
          usage: { output_tokens: 5 },
        }],
        ["message_stop", { type: "message_stop" }],
      ] as const;
      for (const [name, data] of events) {
        response.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
      }
      response.end();
    });
    const adapter = new AnthropicAdapter({
      apiKey: "anthropic-contract-key",
      baseURL: fixture.baseURL,
    });

    const collected = await collectNormalizedEvents(
      adapter.stream!(baseRequest({ model: "claude-future" }), { requestId: "request-4" }),
    );

    expect(collected.completed).toBe(true);
    expect(collected.finishReason).toBe("tool_calls");
    expect(collected.toolCalls).toEqual([{
      id: "toolu_stream",
      name: "lookup",
      arguments: "{\"query\":\"status\"}",
    }]);
  });

  it("rejects unsupported Anthropic file input instead of silently flattening it", async () => {
    const adapter = new AnthropicAdapter({
      apiKey: "unused",
      baseURL: "http://127.0.0.1:1",
    });
    await expect(adapter.generate(baseRequest({
      messages: [{
        role: "user",
        content: [{
          type: "file",
          base64: "ZmlsZQ==",
          mediaType: "application/octet-stream",
        }],
      }],
    }), { requestId: "request-5" })).rejects.toThrow("does not support file content");
  });
});
