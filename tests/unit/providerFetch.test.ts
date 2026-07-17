import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { createGovernedProviderFetch } from "../../server/models/providerFetch.js";

describe("governed provider SDK fetch", () => {
  let server: Server;
  let url: string;
  const previousAllowlist = process.env.ULTRA_LOCAL_EGRESS_ALLOWLIST;

  beforeEach(async () => {
    process.env.ULTRA_LOCAL_EGRESS_ALLOWLIST = "127.0.0.1";
    server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      request.on("end", () => {
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({ method: request.method, body: Buffer.concat(chunks).toString() }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("test server did not bind");
    url = `http://127.0.0.1:${address.port}/v1/responses`;
  });

  afterEach(async () => {
    if (previousAllowlist === undefined) delete process.env.ULTRA_LOCAL_EGRESS_ALLOWLIST;
    else process.env.ULTRA_LOCAL_EGRESS_ALLOWLIST = previousAllowlist;
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  it("preserves SDK method, headers and body through governed egress", async () => {
    const providerFetch = createGovernedProviderFetch("provider:test");
    const response = await providerFetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer secret" },
      body: JSON.stringify({ model: "test" }),
    });

    expect(response.ok).toBe(true);
    await expect(response.json()).resolves.toEqual({
      method: "POST",
      body: JSON.stringify({ model: "test" }),
    });
  });

  it("rejects non-public provider targets unless explicitly allowed", async () => {
    delete process.env.ULTRA_LOCAL_EGRESS_ALLOWLIST;
    const providerFetch = createGovernedProviderFetch("provider:test");
    await expect(providerFetch(url, { method: "POST", body: "{}" }))
      .rejects.toThrow(/blocked non-public address/);
  });
});
