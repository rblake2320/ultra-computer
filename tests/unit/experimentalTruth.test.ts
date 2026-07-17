import express from "express";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { experimentalFeaturesEnabled, isSwarmPrompt, swarmPromptAllowed } from "../../server/experimentalFeatures.js";
import { prepareSkillScriptCopy } from "../../server/skillScriptActions.js";
import { registerAutonomyRoutes } from "../../server/autonomyRoutes.js";
import { registerMarketplaceRoutes } from "../../server/marketplaceRoutes.js";
import { registerNIPRoutes } from "../../server/nipRoutes.js";
import { nipEngine, type AgentCapabilityProfile } from "../../server/nipEngine.js";
import { swarmEngine } from "../../server/swarmEngine.js";
import { storage } from "../../server/storage.js";

describe("experimental surfaces report only real work", () => {
  let server: Server;
  let origin: string;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    registerAutonomyRoutes(app);
    registerMarketplaceRoutes(app);
    registerNIPRoutes(app);
    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not bind TCP");
    origin = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  });

  async function post(path: string, body: unknown): Promise<Response> {
    return fetch(`${origin}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("keeps prompt-triggered swarm execution behind ULTRA_EXPERIMENTAL", () => {
    expect(isSwarmPrompt("swarm: investigate this")).toBe(true);
    expect(experimentalFeaturesEnabled({ ULTRA_EXPERIMENTAL: "0" })).toBe(false);
    expect(swarmPromptAllowed("swarm: investigate this", { ULTRA_EXPERIMENTAL: "0" })).toBe(false);
    expect(swarmPromptAllowed("swarm: investigate this", { ULTRA_EXPERIMENTAL: "1" })).toBe(true);
  });

  it("labels the skill-script action as copy-only without claiming execution", () => {
    expect(prepareSkillScriptCopy({
      name: "Review me",
      language: "bash",
      content: "echo safe",
    } as any)).toEqual(expect.objectContaining({
      executed: false,
      operation: "copy_only",
      content: "echo safe",
    }));
  });

  it("rejects cron task types that have no execution adapter", async () => {
    const response = await post("/api/autonomy/cron", {
      name: "fake HTTP",
      description: "must not claim execution",
      cronExpression: "0 * * * *",
      timezone: "UTC",
      enabled: true,
      taskType: "http_call",
      taskConfig: { url: "https://example.test" },
    });
    expect(response.status).toBe(501);
    await expect(response.json()).resolves.toMatchObject({ supportedTaskTypes: ["health_check"] });
  });

  it("fails a swarm task and session when no real model can execute it", async () => {
    const session = swarmEngine.createSwarm({
      name: `truth-${crypto.randomUUID()}`,
      description: "failure propagation",
      defaultModelId: `missing-${crypto.randomUUID()}`,
    });
    const agent = swarmEngine.addAgent(session.config.id, {
      name: "Unavailable worker",
      role: "worker",
      modelId: session.config.defaultModelId,
    });
    const task = swarmEngine.addTask(session.config.id, { description: "Do real work" });

    await swarmEngine.runSwarm(session.config.id);

    expect(swarmEngine.getSwarm(session.config.id)?.status).toBe("failed");
    expect(swarmEngine.getSwarm(session.config.id)?.tasks.get(task.id)?.status).toBe("failed");
    expect(swarmEngine.getSwarm(session.config.id)?.agents.get(agent.id)?.status).not.toBe("completed");
    swarmEngine.deleteSwarm(session.config.id);
  });

  it("does not fabricate NIP negotiation or allow wildcard trust", async () => {
    const suffix = crypto.randomUUID();
    const organizationId = `org-${suffix}`;
    const party = nipEngine.registerTrustedParty({
      organizationId,
      organizationName: "Truth Test",
      accessTier: "verified",
      allowedScopes: ["research"],
      maxConcurrentSessions: 2,
    });
    nipEngine.approveTrustedParty(party.id, "local-owner");
    const profile = (role: string): AgentCapabilityProfile => ({
      agentId: `${role}-${suffix}`,
      agentName: role,
      organizationId,
      organizationName: "Truth Test",
      modelProvider: "local",
      modelId: "declared-only",
      modelTier: "standard",
      supportedTools: [],
      supportedProtocols: ["nip"],
      maxContextWindow: 4096,
      languages: ["en"],
      specializations: ["research"],
      trustScore: 0,
    });
    const session = nipEngine.createSession(profile("instructor"), profile("executor"), {
      objective: "research a topic",
      allowedActions: ["research"],
    });

    const response = await post(`/api/nip/sessions/${session.id}/negotiate`, {});
    expect(response.status).toBe(501);
    expect(nipEngine.getSession(session.id)).toMatchObject({ state: "negotiating" });
    expect(nipEngine.getConversation(session.id)).toHaveLength(1);

    const wildcard = await post("/api/nip/trusted-parties", {
      organizationId: `wild-${suffix}`,
      organizationName: "Wildcard",
      accessTier: "verified",
      allowedScopes: ["*"],
      maxConcurrentSessions: 1,
    });
    expect(wildcard.status).toBe(400);
  });

  it("keeps the marketplace local, blocks metric tampering, and disables installed instructions", async () => {
    const name = `Local truth ${crypto.randomUUID()}`;
    const created = await post("/api/marketplace/skills", {
      name,
      description: "local only",
      authorName: "self-declared owner",
      content: "# Inspect before enabling",
      skillType: "instruction",
    });
    expect(created.status).toBe(200);
    const skill = await created.json() as { id: string };

    const patched = await fetch(`${origin}/api/marketplace/skills/${skill.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ description: "updated", verified: true, installCount: 9999, ratingCount: 9999 }),
    });
    expect(patched.status).toBe(200);
    expect(storage.getMarketplaceSkill(skill.id)).toMatchObject({
      description: "updated",
      verified: false,
      installCount: 0,
      ratingCount: 0,
    });

    const installed = await post(`/api/marketplace/skills/${skill.id}/install`, {});
    expect(installed.status).toBe(200);
    const install = await installed.json() as { localSkillId: string };
    expect(storage.getSkill(install.localSkillId)?.enabled).toBe(false);

    const detail = await fetch(`${origin}/api/marketplace/skills/${skill.id}`);
    await expect(detail.json()).resolves.toMatchObject({
      registryScope: "local_only",
      authorIdentityVerified: false,
      contentSignatureVerified: false,
    });
  });
});
