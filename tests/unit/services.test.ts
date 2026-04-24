import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the storage module before any service imports
vi.mock("../../server/storage.js", () => ({
  storage: {
    getConversations: vi.fn(() => []),
    getConversation: vi.fn(() => null),
    createConversation: vi.fn((input) => ({
      id: "test-id",
      title: input.title ?? "Test",
      status: input.status ?? "idle",
      orchestratorModelId: input.orchestratorModelId ?? null,
      activeSkillIds: input.activeSkillIds ?? "[]",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })),
    updateConversation: vi.fn((id, input) => ({ id, ...input, createdAt: Date.now(), updatedAt: Date.now() })),
    deleteConversation: vi.fn(),
    getMessages: vi.fn(() => []),
    getModels: vi.fn(() => []),
    getModel: vi.fn(() => null),
    createModel: vi.fn((input) => ({ ...input, createdAt: Date.now() })),
    updateModel: vi.fn((id, input) => ({ id, ...input, createdAt: Date.now() })),
    deleteModel: vi.fn(),
    getKnowledgeEntries: vi.fn(() => []),
    getKnowledgeEntry: vi.fn(() => null),
    createKnowledgeEntry: vi.fn((input) => ({
      id: "kb-1",
      ...input,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })),
    updateKnowledgeEntry: vi.fn((id, input) => ({ id, ...input, createdAt: Date.now(), updatedAt: Date.now() })),
    deleteKnowledgeEntry: vi.fn(),
    searchKnowledge: vi.fn(() => []),
  },
}));

// Mock knowledgeEngine since knowledgeService imports it
vi.mock("../../server/knowledgeEngine.js", () => ({
  knowledgeEngine: {
    getStats: vi.fn(() => ({ totalEntries: 0 })),
    generateSummary: vi.fn((content: string) => Promise.resolve(content.slice(0, 100))),
    buildContext: vi.fn(() => ({ entries: [], totalTokens: 0, truncated: false })),
    seedIfEmpty: vi.fn(),
    searchKnowledge: vi.fn(() => []),
  },
}));

// Mock orchestrator for conversationService
vi.mock("../../server/orchestrator.js", () => ({
  subscribeToConversation: vi.fn(),
  unsubscribeFromConversation: vi.fn(),
}));

// Mock modelConnections for modelService
vi.mock("../../server/modelConnections.js", () => ({
  connectModel: vi.fn(() => Promise.resolve({ ok: true })),
  disconnectModel: vi.fn(() => true),
  testConnection: vi.fn(() => Promise.resolve({ ok: true, latencyMs: 100 })),
  quickAdd: vi.fn(() => Promise.resolve({ model: { id: "m1" }, connected: true })),
  discoverEnvVars: vi.fn(() => []),
  getProviderCatalog: vi.fn(() => []),
}));

// ─── ConversationService ─────────────────────────────────────────────────────

describe("ConversationService", () => {
  it("list() returns empty array when no conversations", async () => {
    const { conversationService } = await import("../../server/services/conversationService.js");
    const result = conversationService.list();
    expect(result).toEqual([]);
  });

  it("get() throws when conversation not found", async () => {
    const { conversationService } = await import("../../server/services/conversationService.js");
    expect(() => conversationService.get("nonexistent")).toThrow("not found");
  });

  it("create() returns new conversation with provided title", async () => {
    const { conversationService } = await import("../../server/services/conversationService.js");
    const result = conversationService.create({ title: "Test Conv" });
    expect(result.title).toBe("Test Conv");
    expect(result.id).toBeDefined();
  });

  it("create() uses default title when none provided", async () => {
    const { conversationService } = await import("../../server/services/conversationService.js");
    const result = conversationService.create({});
    expect(result.title).toBe("New Session");
  });

  it("getMessages() delegates to storage", async () => {
    const { conversationService } = await import("../../server/services/conversationService.js");
    const msgs = conversationService.getMessages("conv-1");
    expect(Array.isArray(msgs)).toBe(true);
  });
});

// ─── ModelService ─────────────────────────────────────────────────────────────

describe("ModelService", () => {
  it("list() returns empty array when no models", async () => {
    const { modelService } = await import("../../server/services/modelService.js");
    const result = modelService.list();
    expect(Array.isArray(result)).toBe(true);
  });

  it("get() throws when model not found", async () => {
    const { modelService } = await import("../../server/services/modelService.js");
    expect(() => modelService.get("nonexistent")).toThrow();
  });

  it("disconnect() delegates to modelConnections", async () => {
    const { modelService } = await import("../../server/services/modelService.js");
    const ok = modelService.disconnect("model-id");
    expect(ok).toBe(true);
  });
});

// ─── KnowledgeService ─────────────────────────────────────────────────────────

describe("KnowledgeService", () => {
  it("list() returns empty array when no entries", async () => {
    const { knowledgeService } = await import("../../server/services/knowledgeService.js");
    const result = knowledgeService.list();
    expect(Array.isArray(result)).toBe(true);
  });

  it("get() throws when entry not found", async () => {
    const { knowledgeService } = await import("../../server/services/knowledgeService.js");
    expect(() => knowledgeService.get("nonexistent")).toThrow("not found");
  });

  it("create() stores and returns entry with name", async () => {
    const { knowledgeService } = await import("../../server/services/knowledgeService.js");
    const result = await knowledgeService.create({
      name: "Test Entry",
      description: "A test entry",
      content: "Content here",
      contentType: "text",
      category: "custom",
    });
    expect(result.name).toBe("Test Entry");
  });

  it("search() delegates to storage", async () => {
    const { knowledgeService } = await import("../../server/services/knowledgeService.js");
    const results = knowledgeService.search("test query");
    expect(Array.isArray(results)).toBe(true);
  });
});
