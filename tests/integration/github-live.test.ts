/**
 * GitHub connector live integration test.
 * Evidence label: VERIFIED LIVE when passing with real GITHUB_TOKEN.
 *
 * Requires:
 *   GITHUB_TOKEN — a GitHub personal access token with read:user scope
 *   ULTRA_API_KEY — the server API key
 *
 * Run: GITHUB_TOKEN=ghp_... ULTRA_API_KEY=... npx vitest run tests/integration/github-live.test.ts
 */
import { describe, it, expect, beforeAll } from "vitest";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const ULTRA_API_KEY = process.env.ULTRA_API_KEY;
const BASE_URL = process.env.ULTRA_BASE_URL || "http://localhost:5000";

describe.skipIf(!GITHUB_TOKEN || !ULTRA_API_KEY)("GitHub connector — VERIFIED LIVE", () => {
  beforeAll(() => {
    if (!GITHUB_TOKEN) throw new Error("GITHUB_TOKEN required");
    if (!ULTRA_API_KEY) throw new Error("ULTRA_API_KEY required");
  });

  it("reads GitHub user via governed connector", async () => {
    const res = await fetch(`${BASE_URL}/api/connectors/github/tool`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ULTRA_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ tool: "get_user", params: {}, token: GITHUB_TOKEN }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("login");
  });
});
