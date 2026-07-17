import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  governedFetch: vi.fn(),
  getConnector: vi.fn(),
  connectToServer: vi.fn(),
  callRemoteTool: vi.fn(),
  disconnectServer: vi.fn(),
}));

vi.mock("../../server/governedFetch.js", () => ({ governedFetch: mocks.governedFetch }));
vi.mock("../../server/policyEngine.js", () => ({
  evaluatePolicy: () => ({ allowed: true, reason: "test", domain: "network", action: "test" }),
  writePolicyAudit: vi.fn(),
}));
vi.mock("../../server/storage.js", () => ({
  storage: {
    getConnector: mocks.getConnector,
    getConnectors: vi.fn(() => []),
    createConnector: vi.fn(),
    updateConnector: vi.fn(),
  },
}));
vi.mock("../../server/mcpProtocol.js", () => ({
  connectToServer: mocks.connectToServer,
  callRemoteTool: mocks.callRemoteTool,
  disconnectServer: mocks.disconnectServer,
}));

import {
  callMCPTool,
  validateConnectorKey,
  validateMCPConnection,
} from "../../server/connectorRegistry.js";

describe("connector runtime truthfulness", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fails closed when live credential validation is not implemented", async () => {
    await expect(validateConnectorKey("telegram", "secret")).resolves.toEqual({
      valid: false,
      error: "Live credential validation is not implemented for connector 'telegram'",
    });
    expect(mocks.governedFetch).not.toHaveBeenCalled();
  });

  it("does not accept arbitrary non-auth provider failures as valid", async () => {
    mocks.governedFetch.mockResolvedValue(new Response("bad request", { status: 400 }));
    await expect(validateConnectorKey("github", "secret")).resolves.toEqual({
      valid: false,
      error: "Provider validation failed with HTTP 400",
    });
  });

  it("requires Linear to return a real authenticated viewer", async () => {
    mocks.governedFetch.mockResolvedValue(new Response(JSON.stringify({ data: { viewer: null } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    await expect(validateConnectorKey("linear", "secret")).resolves.toEqual({
      valid: false,
      error: "Linear did not confirm an authenticated viewer",
    });
  });

  it("validates MCP credentials with an initialize session and closes it", async () => {
    mocks.connectToServer.mockResolvedValue({ id: "session-1" });
    await expect(validateMCPConnection("mcp_custom", "https://mcp.example.test", "token"))
      .resolves.toEqual({ valid: true });
    expect(mocks.connectToServer).toHaveBeenCalledWith(expect.objectContaining({
      url: "https://mcp.example.test",
      transport: "streamable-http",
      headers: { Authorization: "Bearer token" },
    }));
    expect(mocks.disconnectServer).toHaveBeenCalledWith("session-1");
  });

  it("rejects generic calls for connectors without implemented provider operations", async () => {
    mocks.getConnector.mockReturnValue({
      id: "github",
      name: "GitHub",
      type: "api_key",
      status: "connected",
      config: JSON.stringify({ apiKey: "secret" }),
    });
    await expect(callMCPTool("github", "get_user", {})).rejects.toThrow(
      "Provider operations for this connector are not implemented",
    );
    expect(mocks.connectToServer).not.toHaveBeenCalled();
  });
});
