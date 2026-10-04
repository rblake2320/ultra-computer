import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ governedFetch: vi.fn() }));

vi.mock("../../server/governedFetch.js", () => ({ governedFetch: mocks.governedFetch }));
vi.mock("../../server/storage.js", () => ({ storage: {} }));
vi.mock("../../server/tools.js", () => ({ TOOL_SCHEMAS: [], executeTool: vi.fn() }));

import {
  callRemoteTool,
  connectToServer,
  disconnectServer,
  listConnectedServers,
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
      if (options.method === "GET") return new Response(null, { status: 405 });
      const request = JSON.parse(String(options.body));
      if (request.method === "server/discover") return new Response(JSON.stringify({ jsonrpc: "2.0", id: request.id, error: { code: -32601, message: "Method not found" } }), { headers: { "content-type": "application/json" } });
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
      headers: { Authorization: "Bearer private-test-token", "MCP-Protocol-Version": "wrong", "Mcp-Session-Id": "wrong" },
    });
    const result = await callRemoteTool(connection.id, "lookup", { id: 7 });
    expect(result.content).toEqual([{ type: "text", text: "real result" }]);

    const toolCall = mocks.governedFetch.mock.calls.find(([, options]) =>
      options.body && JSON.parse(String(options.body)).method === "tools/call");
    expect(toolCall).toBeDefined();
    const headers = new Headers(toolCall?.[1].headers);
    expect(headers.get("mcp-session-id")).toBe("remote-session");
    expect(headers.get("mcp-protocol-version")).toBe("2025-11-25");
    expect(JSON.stringify(listConnectedServers())).not.toContain("private-test-token");
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
    const original = mocks.governedFetch.getMockImplementation()!;
    mocks.governedFetch.mockImplementation(async (url: string, options: RequestInit) => {
      if (options.body && JSON.parse(String(options.body)).method === "initialize") {
        return rpcResponse(options, { protocolVersion: "2099-01-01", capabilities: {}, serverInfo: { name: "bad", version: "1" } });
      }
      return original(url, options);
    });
    await expect(connectToServer({
      url: "https://mcp.example.test/mcp",
      name: "old",
      transport: "streamable-http",
    })).rejects.toThrow("MCP connection failed");
  });

  it("does not downgrade an authentication failure to a legacy handshake", async () => {
    mocks.governedFetch.mockResolvedValue(new Response(null, { status: 401 }));
    await expect(connectToServer({ url: "https://mcp.example.test/mcp", name: "auth", transport: "streamable-http" })).rejects.toThrow("MCP connection failed");
    expect(mocks.governedFetch.mock.calls.some(([, options]) => options.body && JSON.parse(String(options.body)).method === "initialize")).toBe(false);
  });
});
