/**
 * Skill matching tests — proves the three-tier matching pipeline works.
 *
 * Tier 1 (semantic):  Float32 cosine similarity via all-MiniLM-L6-v2
 * Tier 2 (TF-IDF):   Pre-computed term vectors stored as JSON in embeddings col
 * Tier 3 (legacy):   Exact keyword / name-word intersection
 *
 * The HuggingFace model is not loaded in unit tests — we test the semantic tier
 * by injecting mock Float32Array embeddings directly into skill.embeddings and
 * providing a matching mock msgF32 via the embedText mock.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Skill } from "@shared/schema";

// ─── Mocks (must come before imports that trigger module load) ─────────────────

const mockSkills: Skill[] = [];

vi.mock("../../server/storage.js", () => ({
  storage: {
    getSkills: vi.fn(() => mockSkills),
    updateSkill: vi.fn(),
    createSkill: vi.fn(),
    incrementSkillUsage: vi.fn(),
  },
}));

// Controls whether the embedding model appears loaded
let _embeddingAvailable = false;
// Controls what embedText returns for the current message
let _mockMsgVec: Float32Array | null = null;

vi.mock("../../server/embeddingEngine.js", () => ({
  embedText: vi.fn(async () => _mockMsgVec),
  cosineSimF32: vi.fn((a: Float32Array, b: Float32Array) => {
    // Real dot product so scores are meaningful in tests
    let dot = 0;
    for (let i = 0; i < Math.min(a.length, b.length); i++) dot += a[i] * b[i];
    return dot;
  }),
  serializeEmbedding: vi.fn((vec: Float32Array) =>
    Buffer.from(vec.buffer).toString("base64"),
  ),
  deserializeEmbedding: vi.fn((s: string) => {
    const buf = Buffer.from(s, "base64");
    return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  }),
  isEmbeddingAvailable: vi.fn(() => _embeddingAvailable),
  prewarmEmbeddingModel: vi.fn(),
  MODEL_VERSION: "1",
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { skillMatcher, buildSkillVector, EMBEDDING_PREFIX } from "../../server/skillSystem.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeSkill(overrides: Partial<Skill>): Skill {
  return {
    id: "test-" + Math.random().toString(36).slice(2),
    name: "Test Skill",
    description: "A test skill",
    content: "",
    triggerKeywords: "[]",
    embeddings: null,
    isBuiltIn: false,
    enabled: true,
    createdAt: Date.now(),
    usageCount: 0,
    ...overrides,
  };
}

/** Build a normalised unit Float32Array of length 4 from plain numbers. */
function unitVec(...values: number[]): Float32Array {
  const mag = Math.sqrt(values.reduce((s, v) => s + v * v, 0));
  return new Float32Array(values.map(v => v / mag));
}

function serializeVec(vec: Float32Array): string {
  return Buffer.from(vec.buffer).toString("base64");
}

beforeEach(() => {
  mockSkills.length = 0;
  _embeddingAvailable = false;
  _mockMsgVec = null;
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Tier 3 — legacy keyword matching", () => {
  it("fires when a trigger keyword appears in the message", async () => {
    const skill = makeSkill({
      name: "Code Helper",
      description: "Helps with programming",
      triggerKeywords: JSON.stringify(["debug", "refactor"]),
      embeddings: null,
    });
    mockSkills.push(skill);

    const results = await skillMatcher.matchSkills("I need to debug this function");
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(skill.id);
  });

  it("fires when a name word appears in the message", async () => {
    const skill = makeSkill({
      name: "Data Analysis",
      description: "Analyse data",
      triggerKeywords: "[]",
      embeddings: null,
    });
    mockSkills.push(skill);

    const results = await skillMatcher.matchSkills("can you do some data analysis for me");
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(skill.id);
  });

  it("does NOT fire when there is no keyword or name overlap", async () => {
    const skill = makeSkill({
      name: "Data Analysis",
      description: "Analyse datasets",
      triggerKeywords: JSON.stringify(["analyze", "statistics"]),
      embeddings: null,
    });
    mockSkills.push(skill);

    // "crunch numbers" shares no tokens with trigger keywords or name
    const results = await skillMatcher.matchSkills("help me crunch some numbers");
    expect(results).toHaveLength(0);
  });

  it("returns empty when no skills are enabled", async () => {
    mockSkills.push(makeSkill({ enabled: false }));
    const results = await skillMatcher.matchSkills("debug my code");
    expect(results).toHaveLength(0);
  });
});

describe("Tier 2 — TF-IDF term vector matching", () => {
  it("fires on paraphrase when TF-IDF vector covers the query terms", async () => {
    // Skill whose content includes the words but they're NOT in triggerKeywords
    const skill = makeSkill({
      name: "Programming Helper",
      description: "Assists with software engineering tasks and writing functions",
      content: "Use this skill for programming tasks. Writing functions, building modules.",
      triggerKeywords: JSON.stringify(["refactor"]), // only "refactor" — NOT "writing" or "functions"
    });
    // Build real TF-IDF vector (includes terms from description + content)
    skill.embeddings = buildSkillVector(skill);
    mockSkills.push(skill);

    // "writing functions" shares terms with the description/content TF-IDF vector
    // but NOT with triggerKeywords — so only TF-IDF fires, not legacy
    const results = await skillMatcher.matchSkills("help me with writing functions");
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(skill.id);
  });

  it("ranks higher-overlap skill above lower-overlap skill", async () => {
    const highOverlap = makeSkill({
      name: "Code Writer",
      description: "Write production code functions and debug scripts",
      content: "Writing code, functions, scripts, debugging",
      triggerKeywords: JSON.stringify(["code", "write", "debug"]),
    });
    highOverlap.embeddings = buildSkillVector(highOverlap);

    const lowOverlap = makeSkill({
      name: "Research Assistant",
      description: "Gather and summarise information from multiple sources",
      triggerKeywords: JSON.stringify(["research", "information"]),
    });
    lowOverlap.embeddings = buildSkillVector(lowOverlap);

    mockSkills.push(highOverlap, lowOverlap);

    const results = await skillMatcher.matchSkills("write some code and debug it");
    expect(results[0].id).toBe(highOverlap.id);
  });

  it("buildSkillVector produces stable JSON output", () => {
    const skill = makeSkill({
      name: "Report Writer",
      description: "Writes formal reports with citations",
      triggerKeywords: JSON.stringify(["report", "document"]),
      content: "Use for report writing",
    });
    const v1 = buildSkillVector(skill);
    const v2 = buildSkillVector(skill);
    expect(v1).toBe(v2);
    // Must be valid JSON
    expect(() => JSON.parse(v1)).not.toThrow();
  });
});

describe("Tier 1 — semantic Float32 matching", () => {
  it("uses cosineSimF32 when skill has versioned f32 embedding and model is ready", async () => {
    _embeddingAvailable = true;

    // Two skills with orthogonal embeddings
    const matchingVec = unitVec(1, 0, 0, 0);
    const nonMatchingVec = unitVec(0, 1, 0, 0);

    const targetSkill = makeSkill({
      name: "Target",
      description: "Should match",
      embeddings: EMBEDDING_PREFIX + serializeVec(matchingVec),
    });
    const otherSkill = makeSkill({
      name: "Other",
      description: "Should not match",
      embeddings: EMBEDDING_PREFIX + serializeVec(nonMatchingVec),
    });

    // Message embedding points at target skill
    _mockMsgVec = unitVec(1, 0, 0, 0);
    mockSkills.push(targetSkill, otherSkill);

    const results = await skillMatcher.matchSkills("some message", 1);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(targetSkill.id);
  });

  it("falls back to TF-IDF when model is unavailable despite f32 prefix", async () => {
    _embeddingAvailable = false; // model not loaded
    _mockMsgVec = null;

    const skill = makeSkill({
      name: "Debug Helper",
      description: "Helps debugging software functions",
      content: "Use for debugging tasks",
      triggerKeywords: JSON.stringify(["debug"]),
      // Has f32 prefix but model is down — should fall back gracefully
      embeddings: EMBEDDING_PREFIX + serializeVec(unitVec(1, 0, 0, 0)),
    });
    mockSkills.push(skill);

    // Should still fire via legacy keyword intersection ("debug" in trigger)
    const results = await skillMatcher.matchSkills("help me debug this code");
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(skill.id);
  });

  it("stale f32 (no version tag) does not use semantic path", async () => {
    _embeddingAvailable = true;
    _mockMsgVec = unitVec(1, 0, 0, 0);

    const staleSkill = makeSkill({
      name: "Old Skill",
      description: "Has old embedding format without version",
      // Old format — no version number, should NOT hit semantic path
      embeddings: "f32:" + serializeVec(unitVec(1, 0, 0, 0)),
      triggerKeywords: JSON.stringify(["oldkeyword"]),
    });
    mockSkills.push(staleSkill);

    // No keyword overlap with message, and semantic path won't fire (stale format)
    const results = await skillMatcher.matchSkills("something completely unrelated");
    expect(results).toHaveLength(0);
  });
});

describe("EMBEDDING_PREFIX", () => {
  it("includes the current model version", () => {
    expect(EMBEDDING_PREFIX).toBe("f32:v1:");
  });

  it("stale detection: old f32: prefix does not match EMBEDDING_PREFIX", () => {
    expect("f32:some-base64".startsWith(EMBEDDING_PREFIX)).toBe(false);
  });

  it("current format matches EMBEDDING_PREFIX", () => {
    const emb = EMBEDDING_PREFIX + "somebase64data";
    expect(emb.startsWith(EMBEDDING_PREFIX)).toBe(true);
  });
});
