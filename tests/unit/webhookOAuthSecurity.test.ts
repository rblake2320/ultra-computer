import crypto from "node:crypto";
import express from "express";
import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createAuthMiddleware } from "../../server/authMiddleware.js";
import { verifyGenericWebhookSignature } from "../../server/messagingRoutes.js";

const servers = new Set<Server>();
const originalApiKey = process.env.ULTRA_API_KEY;

async function listen(app: express.Express): Promise<string> {
  const server = createServer(app);
  servers.add(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("server did not bind");
  return `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
  if (originalApiKey === undefined) delete process.env.ULTRA_API_KEY;
  else process.env.ULTRA_API_KEY = originalApiKey;
  await Promise.all([...servers].map(server => new Promise<void>(resolve => server.close(() => resolve()))));
  servers.clear();
});

describe("externally initiated callback authentication", () => {
  it("allows only route-verified callbacks through the owner gate", async () => {
    process.env.ULTRA_API_KEY = "unit-owner-key-that-is-long-enough";
    const app = express();
    app.use(createAuthMiddleware());
    app.get("/api/connectors/oauth/callback", (_req, res) => res.sendStatus(204));
    app.post("/api/messaging/webhook/gmail", (_req, res) => res.sendStatus(204));
    app.get("/api/models", (_req, res) => res.sendStatus(204));
    const base = await listen(app);

    expect((await fetch(`${base}/api/connectors/oauth/callback`)).status).toBe(204);
    expect((await fetch(`${base}/api/messaging/webhook/gmail`, { method: "POST" })).status).toBe(204);
    expect((await fetch(`${base}/api/models`)).status).toBe(401);
  });
});

describe("generic webhook HMAC", () => {
  it("accepts a current body-bound signature", () => {
    const secret = "a-sufficiently-long-webhook-secret";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const body = Buffer.from('{"event":"ready"}');
    const signature = `sha256=${crypto.createHmac("sha256", secret)
      .update(timestamp).update(".").update(body).digest("hex")}`;

    expect(verifyGenericWebhookSignature(secret, timestamp, body, signature)).toBeNull();
  });

  it("rejects altered bodies and replayed timestamps", () => {
    const secret = "a-sufficiently-long-webhook-secret";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const body = Buffer.from("original");
    const signature = `sha256=${crypto.createHmac("sha256", secret)
      .update(timestamp).update(".").update(body).digest("hex")}`;

    expect(verifyGenericWebhookSignature(secret, timestamp, Buffer.from("altered"), signature))
      .toBe("Invalid webhook signature");
    expect(verifyGenericWebhookSignature(secret, "1", body, signature))
      .toBe("Webhook timestamp is invalid or expired");
  });
});
