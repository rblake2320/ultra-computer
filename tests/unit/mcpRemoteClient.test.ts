import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ governedFetch: vi.fn() }));

vi.mock("../../server/governedFetch.js", () => ({ governedFetch: mocks.governedFetch }));
vi.mock("../../server/storage.js", () => ({ storage: {} }));
vi.mock("../../server/tools.js", () => ({ TOOL_SCHEMAS: [], executeTool: vi.fn() }));

import {
  callRemoteTool,
  connectToServer,
  disconnectServer,
} from "../../server/mcpProtocol.js";

function rpcResponse(options: RequestInit | undefined, result: unknown, headers?: HeadersInit): Response {
  const request = JSON.parse(String(options?.body));
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }), {
    status: 200,
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("MCP Streamable HTTP client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.governedFetch.mockImplementation(async (_url: string, options: RequestInit) => {
      const request = JSON.parse(String(options.body));
      if (request.method === "initialize") {
        return rpcResponse(options, {
          protocolVersion: "2025-11-25",
          capabilities: { tools: {} },
          serverInfo: { name: "test", version: "1" },
        }, { "mcp-session-id": "remote-session" });
      }
      if (request.method === "notifications/initialized") return new Response(null, { status: 202 });
      if (request.method === "tools/list") return rpcResponse(options, { tools: [] });
      if (request.method === "resources/list") return rpcResponse(options, { resources: [] });
      if (request.method === "tools/call") {
        return rpcResponse(options, { content: [{ type: "text", text: "real result" }] });
      }
      throw new Error(`Unexpected method ${request.method}`);
    });
  });

  it("uses JSON-RPC tools/call and carries the negotiated session id", async () => {
    const connection = await connectToServer({
      url: "https://mcp.example.test/mcp",
      name: "test",
      transport: "streamable-http",
    });
    const result = await callRemoteTool(connection.id, "lookup", { id: 7 });
    expect(result.content).toEqual([{ type: "text", text: "real result" }]);

    const toolCall = mocks.governedFetch.mock.calls.find(([, options]) =>
      JSON.parse(String(options.body)).method === "tools/call");
    expect(toolCall).toBeDefined();
    expect(toolCall?.[1].headers).toMatchObject({
      "Mcp-Session-Id": "remote-session",
      "MCP-Protocol-Version": "2025-11-25",
    });
    expect(JSON.parse(String(toolCall?.[1].body))).toMatchObject({
      jsonrpc: "2.0",
      method: "tools/call",
      params: { name: "lookup", arguments: { id: 7 } },
    });
    disconnectServer(connection.id);
  });

  it("rejects the legacy SSE transport instead of pretending POST is SSE", async () => {
    await expect(connectToServer({
      url: "https://mcp.example.test/sse",
      name: "legacy",
      transport: "sse",
    })).rejects.toThrow("Legacy MCP SSE transport is not implemented");
    expect(mocks.governedFetch).not.toHaveBeenCalled();
  });

  it("rejects an initialize response that does not negotiate the supported version", async () => {
    mocks.governedFetch.mockImplementationOnce(async (_url: string, options: RequestInit) =>
      rpcResponse(options, { protocolVersion: "2024-11-05", capabilities: {} }));
    await expect(connectToServer({
      url: "https://mcp.example.test/mcp",
      name: "old",
      transport: "streamable-http",
    })).rejects.toThrow("Unsupported MCP protocol version");
  });
});
