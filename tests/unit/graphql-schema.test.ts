import { describe, it, expect, vi } from "vitest";
import { graphql } from "graphql";

// Mock storage before importing schema
vi.mock("../../server/storage.js", () => ({
  storage: {
    getConversations: vi.fn(() => [
      {
        id: "c1",
        title: "Test",
        status: "idle",
        orchestratorModelId: null,
        activeSkillIds: "[]",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ]),
    getConversation: vi.fn(() => null),
    getMessages: vi.fn(() => []),
    getModels: vi.fn(() => []),
    getModel: vi.fn(() => null),
    getKnowledgeEntries: vi.fn(() => []),
    getKnowledgeEntry: vi.fn(() => null),
    searchKnowledge: vi.fn(() => []),
  },
}));

vi.mock("../../server/knowledgeEngine.js", () => ({
  knowledgeEngine: {
    getStats: vi.fn(() => ({})),
    generateSummary: vi.fn(() => Promise.resolve("")),
    buildContext: vi.fn(() => ({ entries: [], totalTokens: 0, truncated: false })),
    seedIfEmpty: vi.fn(),
    searchKnowledge: vi.fn(() => []),
  },
}));

vi.mock("../../server/orchestrator.js", () => ({
  subscribeToConversation: vi.fn(),
  unsubscribeFromConversation: vi.fn(),
}));

vi.mock("../../server/modelConnections.js", () => ({
  connectModel: vi.fn(() => Promise.resolve({ ok: true })),
  disconnectModel: vi.fn(() => true),
  testConnection: vi.fn(() => Promise.resolve({ ok: true })),
  quickAdd: vi.fn(() => Promise.resolve({ model: null })),
  discoverEnvVars: vi.fn(() => []),
  getProviderCatalog: vi.fn(() => []),
}));

describe("GraphQL Schema", () => {
  it("schema is valid and has Query type", async () => {
    const { schema } = await import("../../server/graphql/schema.js");
    expect(schema.getQueryType()).toBeTruthy();
    expect(schema.getQueryType()?.name).toBe("Query");
  });

  it("conversations query returns a list", async () => {
    const { schema } = await import("../../server/graphql/schema.js");
    const result = await graphql({
      schema,
      source: "{ conversations { id title status } }",
    });
    expect(result.errors).toBeUndefined();
    expect(Array.isArray(result.data?.conversations)).toBe(true);
    const conversations = result.data?.conversations as any[];
    expect(conversations.length).toBe(1);
    expect(conversations[0].id).toBe("c1");
    expect(conversations[0].title).toBe("Test");
  });

  it("Mutation type exists", async () => {
    const { schema } = await import("../../server/graphql/schema.js");
    expect(schema.getMutationType()).toBeTruthy();
    expect(schema.getMutationType()?.name).toBe("Mutation");
  });

  it("Subscription type exists", async () => {
    const { schema } = await import("../../server/graphql/schema.js");
    expect(schema.getSubscriptionType()).toBeTruthy();
    expect(schema.getSubscriptionType()?.name).toBe("Subscription");
  });

  it("models query returns empty array", async () => {
    const { schema } = await import("../../server/graphql/schema.js");
    const result = await graphql({
      schema,
      source: "{ models { id name provider } }",
    });
    expect(result.errors).toBeUndefined();
    expect(Array.isArray(result.data?.models)).toBe(true);
  });

  it("knowledgeEntries query returns empty array", async () => {
    const { schema } = await import("../../server/graphql/schema.js");
    const result = await graphql({
      schema,
      source: "{ knowledgeEntries { id name content } }",
    });
    expect(result.errors).toBeUndefined();
    expect(Array.isArray(result.data?.knowledgeEntries)).toBe(true);
  });
});
