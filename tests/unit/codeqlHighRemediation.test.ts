import { describe, expect, it, vi } from "vitest";
import {
  getMCPBearerToken,
  validateMCPAuthHeader,
} from "../../server/mcpProtocol.js";
import { IdentityEngine } from "../../server/identityEngine.js";
import { normalizeJobTimeout } from "../../server/cronScheduler.js";
import { normalizeCommandTimeout } from "../../server/cliToolEngine.js";
import { swarmEngine } from "../../server/swarmEngine.js";

describe("CodeQL high-severity remediation boundaries", () => {
  it("parses only the canonical fixed-size MCP bearer header", () => {
    const token = getMCPBearerToken();
    expect(validateMCPAuthHeader(`Bearer ${token}`)).toBe(true);
    expect(validateMCPAuthHeader(`bearer ${token}`)).toBe(true);
    expect(validateMCPAuthHeader(`Bearer  ${token}`)).toBe(false);
    expect(validateMCPAuthHeader(`Bearer\t${token}`)).toBe(false);
    expect(validateMCPAuthHeader(`Bearer ${" ".repeat(100_000)}`)).toBe(false);
  });

  it("rejects markup in identity display names instead of partially sanitizing it", () => {
    const identities = new IdentityEngine();
    expect(() => identities.registerIdentity("<script<script>>name</script>")).toThrow(
      /may only contain letters/i,
    );
    expect(() => identities.registerIdentity("<b>Alice</b>")).toThrow(
      /may only contain letters/i,
    );
    expect(identities.registerIdentity("Alice Example").displayName).toBe("Alice Example");
  });

  it("bounds caller-controlled timer durations", () => {
    expect(normalizeJobTimeout(Number.POSITIVE_INFINITY)).toBe(300_000);
    expect(normalizeJobTimeout(-10)).toBe(1);
    expect(normalizeJobTimeout(3.9)).toBe(3);
    expect(normalizeJobTimeout(10 ** 12)).toBe(3_600_000);

    expect(normalizeCommandTimeout(Number.NaN)).toBe(30_000);
    expect(normalizeCommandTimeout(-10)).toBe(1);
    expect(normalizeCommandTimeout(3.9)).toBe(3);
    expect(normalizeCommandTimeout(10 ** 12)).toBe(300_000);
  });

  it("bounds blackboard topic depth before subscriber traversal", () => {
    const swarm = swarmEngine.createSwarm({ name: `topic-bound-${Date.now()}` });
    const callback = vi.fn();
    try {
      expect(() => swarmEngine.subscribeToBB(
        swarm.config.id,
        Array.from({ length: 65 }, () => "x").join("."),
        callback,
      )).toThrow(/at most 64 segments/i);
      expect(() => swarmEngine.writeBlackboard(swarm.config.id, "agent", {
        topic: "x".repeat(513),
        key: "key",
        content: "content",
      })).toThrow(/1-512 characters/i);
    } finally {
      swarmEngine.deleteSwarm(swarm.config.id);
    }
  });
});
