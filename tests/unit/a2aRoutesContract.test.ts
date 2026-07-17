import express from "express";
import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  getAgent: vi.fn(),
  getAgentCard: vi.fn(),
  listRegisteredAgents: vi.fn(),
  discoverAgent: vi.fn(),
  unregisterAgent: vi.fn(),
}));

vi.mock("../../server/a2aProtocol.js", () => ({
  A2A_EXTERNAL_STATUS: {
    available: false,
    currentProtocolVersion: "1.0",
    legacyEngineVersion: "0.3.0",
    reason: "A2A v1 external interoperability is not implemented.",
  },
  handleA2ARequest: vi.fn(),
  ...mocks,
}));
vi.mock("../../server/mcpProtocol.js", () => ({
  validateMCPAuthHeader: vi.fn(() => false),
  handleMCPRequest: vi.fn(),
  listConnectedServers: vi.fn(() => []),
  connectToServer: vi.fn(),
  disconnectServer: vi.fn(),
  listRemoteTools: vi.fn(),
  callRemoteTool: vi.fn(),
}));
vi.mock("../../server/cliToolEngine.js", () => ({
  getInstalledTools: vi.fn(() => []),
  listToolDefinitions: vi.fn(() => []),
  executeTool: vi.fn(),
  executePipeline: vi.fn(),
}));

import { registerProtocolRoutes } from "../../server/protocolRoutes.js";

describe("A2A HTTP/UI route contract", () => {
  let server: Server;
  let origin: string;
  const endpoint = "https://agent.example.test/a2a";
  const agentCard = {
    protocolVersion: "0.3.0",
    name: "Remote Agent",
    description: "Real remote",
    url: endpoint,
    version: "1",
    preferredTransport: "JSONRPC",
    capabilities: { streaming: false, pushNotifications: false, stateTransitionHistory: false },
    defaultInputModes: ["text/plain"],
    defaultOutputModes: ["text/plain"],
    skills: [],
  };

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    registerProtocolRoutes(app);
    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not bind TCP");
    origin = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAgent.mockReturnValue(agentCard);
    mocks.getAgentCard.mockResolvedValue(agentCard);
    mocks.listRegisteredAgents.mockReturnValue([{ url: endpoint, card: agentCard }]);
    mocks.sendMessage.mockResolvedValue({
      kind: "task",
      id: "task-1",
      contextId: "context-1",
      status: { state: "completed" },
    });
  });

  it("fails the entire legacy A2A API surface closed before dispatch", async () => {
    const response = await fetch(
      `${origin}/api/protocols/a2a/agents/${encodeURIComponent(endpoint)}/send`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "hello from UI" }),
      },
    );
    expect(response.status).toBe(501);
    await expect(response.json()).resolves.toMatchObject({
      available: false,
      code: "A2A_V1_NOT_IMPLEMENTED",
      currentProtocolVersion: "1.0",
      legacyEngineVersion: "0.3.0",
    });
    expect(mocks.getAgent).not.toHaveBeenCalled();
    expect(mocks.sendMessage).not.toHaveBeenCalled();

    const discovery = await fetch(`${origin}/.well-known/agent-card.json`);
    expect(discovery.status).toBe(501);
  });

  it("returns the unavailable state consumed by the UI", async () => {
    const response = await fetch(`${origin}/api/protocols/dashboard`);
    expect(response.status).toBe(200);
    const body = await response.json() as any;
    expect(body.protocols.a2a).toMatchObject({
      available: false,
      currentProtocolVersion: "1.0",
      legacyEngineVersion: "0.3.0",
      agentCard: null,
      remoteAgents: [],
    });
    expect(mocks.getAgentCard).not.toHaveBeenCalled();
    expect(mocks.listRegisteredAgents).not.toHaveBeenCalled();
  });
});
