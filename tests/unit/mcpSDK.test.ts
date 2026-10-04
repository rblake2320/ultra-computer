import http from "node:http";
import { once } from "node:events";
import { afterEach, describe, expect, it } from "vitest";
import { McpServer, fromJsonSchema, createMcpHandler } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { callRemoteTool, connectToServer, readRemoteResource, shutdownMCPClients } from "../../server/mcpProtocol.js";

const servers: http.Server[] = [];
const prior = process.env.ULTRA_LOCAL_EGRESS_ALLOWLIST;
afterEach(async () => {
  await shutdownMCPClients();
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); })));
  if (prior === undefined) delete process.env.ULTRA_LOCAL_EGRESS_ALLOWLIST; else process.env.ULTRA_LOCAL_EGRESS_ALLOWLIST = prior;
});
async function listen(handler: http.RequestListener): Promise<string> {
  process.env.ULTRA_LOCAL_EGRESS_ALLOWLIST = "127.0.0.1";
  const server = http.createServer(handler); servers.push(server);
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  return `http://127.0.0.1:${(server.address() as { port: number }).port}/mcp`;
}
describe("maintained MCP SDK receiving-side contracts", () => {
  it("negotiates 2026-07-28, receives calculator output and reads a resource", async () => {
    const received: string[] = [];
    const handler = createMcpHandler(() => {
      const server = new McpServer({ name: "independent-sdk-contract", version: "1" });
      server.registerTool("sum", { inputSchema: fromJsonSchema<{ a: number; b: number }>({ type: "object", properties: { a: { type: "number" }, b: { type: "number" } }, required: ["a", "b"], additionalProperties: false }) }, async ({ a, b }) => ({ content: [{ type: "text", text: String(a + b) }] }));
      server.registerResource("proof", "proof://result", { mimeType: "text/plain" }, async () => ({ contents: [{ uri: "proof://result", text: "receiving-side-resource" }] }));
      return server;
    }, { legacy: "reject", responseMode: "sse" });
    const nodeHandler = toNodeHandler(handler);
    const url = await listen(async (req, res) => {
      if (req.method !== "POST") { res.writeHead(405).end(); return; }
      const chunks = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const body = JSON.parse(Buffer.concat(chunks).toString()); received.push(body.method);
      await nodeHandler(req, res, body);
    });
    const connection = await connectToServer({ name: "modern", url, transport: "streamable-http" });
    expect(connection.protocolVersion).toBe("2026-07-28");
    expect((await callRemoteTool(connection.id, "sum", { a: 2, b: 2 })).content).toEqual([{ type: "text", text: "4" }]);
    expect((await readRemoteResource(connection.id, "proof://result")).contents[0].text).toBe("receiving-side-resource");
    const bad = await callRemoteTool(connection.id, "sum", { a: "bad", b: 2 }).catch(() => ({ isError: true }));
    expect(bad.isError).toBe(true);
    expect(received).toContain("server/discover");
    expect(received).not.toContain("initialize");
    await handler.close();
  });
  it("refuses redirects before credentials can reach another origin", async () => {
    let destinationCalls = 0;
    const destination = await listen((_req, res) => { destinationCalls++; res.writeHead(200).end(); });
    const origin = await listen((_req, res) => { res.writeHead(307, { location: destination }).end(); });
    await expect(connectToServer({ name: "redirect", url: origin, transport: "streamable-http", headers: { Authorization: "Bearer synthetic-credential" } })).rejects.toThrow("MCP connection failed");
    expect(destinationCalls).toBe(0);
  });
});
