import fs from "node:fs";
import dns from "node:dns/promises";
import http, { type Server } from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  governedFetch,
  isNonPublicAddress,
  NetworkSecurityError,
} from "../../server/governedFetch.js";
import { clearPolicyCacheForTests } from "../../server/policyEngine.js";

let server: Server | undefined;
let baseUrl = "";
const originalEnvironment = {
  nodeEnv: process.env.NODE_ENV,
  localAllowlist: process.env.ULTRA_LOCAL_EGRESS_ALLOWLIST,
  allowHttp: process.env.ULTRA_ALLOW_INSECURE_HTTP,
  auditFile: process.env.ULTRA_POLICY_AUDIT_FILE,
};

async function startServer(
  handler: http.RequestListener,
): Promise<string> {
  server = http.createServer(handler);
  await new Promise<void>((resolve, reject) => {
    server!.once("error", reject);
    server!.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind a TCP port");
  return `http://127.0.0.1:${address.port}`;
}

function restoreEnvironment(): void {
  const restore = (name: string, value: string | undefined) => {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  };
  restore("NODE_ENV", originalEnvironment.nodeEnv);
  restore("ULTRA_LOCAL_EGRESS_ALLOWLIST", originalEnvironment.localAllowlist);
  restore("ULTRA_ALLOW_INSECURE_HTTP", originalEnvironment.allowHttp);
  restore("ULTRA_POLICY_AUDIT_FILE", originalEnvironment.auditFile);
}

describe("governedFetch", () => {
  beforeEach(() => {
    process.env.NODE_ENV = "test";
    process.env.ULTRA_POLICY_AUDIT_FILE = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), "ultra-fetch-test-")),
      "policy.jsonl",
    );
    clearPolicyCacheForTests();
  });

  afterEach(async () => {
    server?.closeAllConnections();
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    }
    server = undefined;
    vi.restoreAllMocks();
    restoreEnvironment();
    clearPolicyCacheForTests();
  });

  it("blocks a hostname after real DNS resolution identifies a loopback address", async () => {
    await expect(governedFetch(
      "http://localhost:65534/",
      {},
      "dns-test",
      "network",
      "network:http_request",
    )).rejects.toThrow(/resolves to blocked non-public address/i);
  });

  it("allows an explicitly enabled local development server", async () => {
    process.env.ULTRA_LOCAL_EGRESS_ALLOWLIST = "127.0.0.1";
    baseUrl = await startServer((_req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ live: true }));
    });

    const response = await governedFetch(
      `${baseUrl}/health`,
      {},
      "local-live-test",
      "network",
      "network:http_request",
    );

    expect(await response.json()).toEqual({ live: true });
  });

  it("connects to the validated address without a second DNS lookup", async () => {
    process.env.ULTRA_LOCAL_EGRESS_ALLOWLIST = "pinned.test";
    let receivedHost = "";
    let receivedBody = "";
    baseUrl = await startServer(async (req, res) => {
      receivedHost = req.headers.host ?? "";
      for await (const chunk of req) receivedBody += chunk.toString();
      res.end("pinned");
    });
    const port = new URL(baseUrl).port;
    const lookup = vi.spyOn(dns, "lookup").mockResolvedValue([
      { address: "127.0.0.1", family: 4 },
    ]);

    const response = await governedFetch(
      `http://pinned.test:${port}/submit`,
      {
        method: "POST",
        body: new URLSearchParams({ proof: "dns-pinned" }),
      },
      "dns-pin-test",
      "network",
      "network:http_request",
    );

    expect(await response.text()).toBe("pinned");
    expect(receivedHost).toBe(`pinned.test:${port}`);
    expect(receivedBody).toBe("proof=dns-pinned");
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it("does not expand a local allowlist entry to other private hosts", async () => {
    process.env.ULTRA_LOCAL_EGRESS_ALLOWLIST = "localhost";

    await expect(governedFetch(
      "http://127.0.0.1:65534/",
      {},
      "allowlist-scope-test",
      "network",
      "network:http_request",
    )).rejects.toThrow(/blocked non-public address 127\.0\.0\.1/i);
  });

  it("enforces the request deadline against a real stalled server", async () => {
    process.env.ULTRA_LOCAL_EGRESS_ALLOWLIST = "127.0.0.1";
    baseUrl = await startServer((_req, res) => {
      setTimeout(() => res.end("too late"), 250);
    });

    await expect(governedFetch(
      baseUrl,
      {},
      "timeout-test",
      "network",
      "network:http_request",
      { timeoutMs: 30 },
    )).rejects.toThrow(/exceeded 30ms/i);
  });

  it("revalidates redirect protocols instead of following them implicitly", async () => {
    process.env.ULTRA_LOCAL_EGRESS_ALLOWLIST = "127.0.0.1";
    baseUrl = await startServer((_req, res) => {
      res.writeHead(302, { Location: "file:///etc/passwd" });
      res.end();
    });

    await expect(governedFetch(
      baseUrl,
      {},
      "redirect-test",
      "network",
      "network:http_request",
    )).rejects.toThrow(/protocol 'file:' is not allowed/i);
  });

  it("stops a real redirect loop at the configured hop limit", async () => {
    process.env.ULTRA_LOCAL_EGRESS_ALLOWLIST = "127.0.0.1";
    baseUrl = await startServer((_req, res) => {
      res.writeHead(302, { Location: "/again" });
      res.end();
    });

    await expect(governedFetch(
      baseUrl,
      {},
      "redirect-limit-test",
      "network",
      "network:http_request",
      { maxRedirects: 2 },
    )).rejects.toThrow(/exceeded 2 redirects/i);
  });

  it("rejects chunked responses that exceed the configured byte budget", async () => {
    process.env.ULTRA_LOCAL_EGRESS_ALLOWLIST = "127.0.0.1";
    baseUrl = await startServer((_req, res) => {
      res.write("12345678");
      res.end("abcdefgh");
    });

    const response = await governedFetch(
      baseUrl,
      {},
      "size-test",
      "network",
      "network:http_request",
      { maxResponseBytes: 10 },
    );
    await expect(response.text()).rejects.toThrow(/exceeded the 10-byte limit/i);
  });

  it("requires an explicit plain-HTTP exception in production", async () => {
    process.env.NODE_ENV = "production";
    process.env.ULTRA_LOCAL_EGRESS_ALLOWLIST = "127.0.0.1";
    delete process.env.ULTRA_ALLOW_INSECURE_HTTP;

    await expect(governedFetch(
      "http://127.0.0.1:65534/",
      {},
      "https-test",
      "network",
      "network:http_request",
    )).rejects.toThrow(/Plain HTTP egress is disabled in production/i);
  });
});

describe("non-public address classification", () => {
  it.each([
    "127.0.0.1",
    "10.0.0.8",
    "100.64.0.1",
    "169.254.169.254",
    "172.31.255.255",
    "192.168.1.1",
    "198.18.0.1",
    "::1",
    "::ffff:7f00:1",
    "fd00::1",
    "fe80::1",
  ])("blocks %s", (address) => {
    expect(isNonPublicAddress(address)).toBe(true);
  });

  it.each(["1.1.1.1", "8.8.8.8", "2606:4700:4700::1111"])(
    "accepts public address %s",
    (address) => {
      expect(isNonPublicAddress(address)).toBe(false);
    },
  );
});
