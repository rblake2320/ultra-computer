import { describe, expect, it, vi } from "vitest";
import type { Memory, SkillScript } from "../../shared/schema";

vi.mock("../../server/storage.js", () => ({
  storage: {},
}));

const { buildSkillProposalCandidates } = await import("../../server/skillProposalEngine.js");
import type { SkillProposal } from "../../server/skillProposalEngine.js";

function memory(overrides: Partial<Memory> = {}): Memory {
  return {
    id: "mem-1",
    content: "When reviewing a pull request, first run tests, then inspect security-sensitive changes, and finally produce a risk-ranked summary.",
    summary: "Review pull requests with tests, security checks, and risk-ranked findings.",
    category: "engineering",
    importance: 0.91,
    embeddings: null,
    sessionId: null,
    sourceMessageId: null,
    createdAt: 1,
    lastAccessedAt: null,
    ...overrides,
  };
}

function script(overrides: Partial<SkillScript> = {}): SkillScript {
  return {
    id: "script-1",
    name: "Pull request review workflow",
    description: "Reviews pull requests with tests and security checks.",
    language: "markdown",
    content: "Run tests, inspect security-sensitive changes, and produce risk-ranked findings.",
    tags: "[]",
    version: 1,
    sourceConversationId: null,
    sourceToolCallId: null,
    filePath: null,
    usageCount: 0,
    isFavorite: false,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("skill proposal engine", () => {
  it("generates a reviewable skill proposal from high-signal procedural memory", () => {
    const proposals = buildSkillProposalCandidates([memory()], [], [], { now: 123 });

    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({
      status: "pending",
      language: "markdown",
      sourceMemoryIds: ["mem-1"],
      createdAt: 123,
      updatedAt: 123,
    });
    expect(proposals[0].content).toContain("## Governance");
    expect(proposals[0].content).toContain("configured sandbox");
    expect(proposals[0].triggerKeywords.length).toBeGreaterThan(2);
  });

  it("does not propose a skill when an existing script already covers the workflow", () => {
    const proposals = buildSkillProposalCandidates([memory()], [script()]);

    expect(proposals).toHaveLength(0);
  });

  it("does not duplicate a pending proposal for the same memory", () => {
    const existing: SkillProposal = {
      id: "proposal-1",
      title: "Skill: existing",
      description: "Existing proposal",
      language: "markdown",
      content: "# Existing",
      triggerKeywords: ["review"],
      sourceMemoryIds: ["mem-1"],
      evidence: ["existing"],
      confidence: 0.8,
      status: "pending",
      createdAt: 1,
      updatedAt: 1,
    };

    const proposals = buildSkillProposalCandidates([memory()], [], [existing]);

    expect(proposals).toHaveLength(0);
  });
});
