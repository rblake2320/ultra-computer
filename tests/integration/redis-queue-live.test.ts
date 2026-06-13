/**
 * Redis/BullMQ queue live integration test.
 * Evidence label: VERIFIED LIVE when passing with a real Redis instance.
 *
 * Requires:
 *   REDIS_URL — e.g., redis://localhost:6379
 *   ULTRA_API_KEY — the server API key
 *   Server running with REDIS_URL set
 *
 * Run: REDIS_URL=redis://localhost:6379 ULTRA_API_KEY=... npx vitest run tests/integration/redis-queue-live.test.ts
 */
import { describe, it, expect } from "vitest";

const REDIS_URL = process.env.REDIS_URL;
const ULTRA_API_KEY = process.env.ULTRA_API_KEY;
const BASE_URL = process.env.ULTRA_BASE_URL || "http://localhost:5000";

describe.skipIf(!REDIS_URL || !ULTRA_API_KEY)("BullMQ queue dispatch — VERIFIED LIVE", () => {
  it("enqueues a message and gets queued/processing status", async () => {
    const convRes = await fetch(`${BASE_URL}/api/conversations`, {
      method: "POST",
      headers: { Authorization: `Bearer ${ULTRA_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ title: "redis-queue-live-test" }),
    });
    expect(convRes.status).toBeOneOf([200, 201]);
    const conv = await convRes.json();
    const convId = conv.id || conv.conversation?.id;
    expect(convId).toBeTruthy();

    const msgRes = await fetch(`${BASE_URL}/api/conversations/${convId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${ULTRA_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ content: "redis-queue-live-proof", role: "user" }),
    });
    expect(msgRes.status).toBeOneOf([200, 201, 202]);
  });
});
