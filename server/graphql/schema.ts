/**
 * GraphQL schema built with graphql-js core (SDL-free, no codegen).
 * graphql-yoga v3 consumes this schema directly.
 */
import {
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLString,
  GraphQLBoolean,
  GraphQLInt,
  GraphQLID,
  GraphQLList,
  GraphQLNonNull,
} from "graphql";
import { GraphQLJSON } from "./scalars.js";
import { conversationService } from "../services/conversationService.js";
import { modelService } from "../services/modelService.js";
import { knowledgeService } from "../services/knowledgeService.js";

// Suppress strict graphql-js field type checking — we use `any` on parent resolvers
// because graphql-js generics are very noisy and the runtime is type-safe.
/* eslint-disable @typescript-eslint/no-explicit-any */

// ─── Message (defined first — no forward references) ─────────────────────────

export const MessageType = new GraphQLObjectType({
  name: "Message",
  description: "A message within a conversation.",
  fields: {
    id: { type: new GraphQLNonNull(GraphQLID) },
    conversationId: { type: new GraphQLNonNull(GraphQLString) },
    role: { type: new GraphQLNonNull(GraphQLString) },
    content: { type: new GraphQLNonNull(GraphQLString) },
    modelId: { type: GraphQLString },
    agentId: { type: GraphQLString },
    taskId: { type: GraphQLString },
    metadata: {
      type: GraphQLJSON,
      resolve: (parent: any) => {
        try { return JSON.parse(parent.metadata); } catch { return {}; }
      },
    },
    createdAt: {
      type: new GraphQLNonNull(GraphQLString),
      resolve: (parent: any) => new Date(parent.createdAt).toISOString(),
    },
  },
});

// ─── Conversation ─────────────────────────────────────────────────────────────

export const ConversationType = new GraphQLObjectType({
  name: "Conversation",
  description: "A conversation (session) in Ultra Computer.",
  fields: {
    id: { type: new GraphQLNonNull(GraphQLID) },
    title: { type: new GraphQLNonNull(GraphQLString) },
    status: { type: new GraphQLNonNull(GraphQLString) },
    orchestratorModelId: { type: GraphQLString },
    activeSkillIds: {
      type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(GraphQLString))),
      resolve: (parent: any) => {
        try { return JSON.parse(parent.activeSkillIds) as string[]; } catch { return []; }
      },
    },
    createdAt: {
      type: new GraphQLNonNull(GraphQLString),
      resolve: (parent: any) => new Date(parent.createdAt).toISOString(),
    },
    updatedAt: {
      type: new GraphQLNonNull(GraphQLString),
      resolve: (parent: any) => new Date(parent.updatedAt).toISOString(),
    },
    messages: {
      type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(MessageType))),
      resolve: (parent: any) => conversationService.getMessages(parent.id),
    },
  },
});

// ─── Model ────────────────────────────────────────────────────────────────────

export const ModelType = new GraphQLObjectType({
  name: "Model",
  description: "A registered LLM model. apiKey and oauthTokens are NEVER exposed.",
  fields: {
    id: { type: new GraphQLNonNull(GraphQLID) },
    name: { type: new GraphQLNonNull(GraphQLString) },
    provider: { type: new GraphQLNonNull(GraphQLString) },
    modelId: { type: new GraphQLNonNull(GraphQLString) },
    baseUrl: { type: GraphQLString },
    enabled: { type: new GraphQLNonNull(GraphQLBoolean) },
    capabilities: {
      type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(GraphQLString))),
      resolve: (parent: any) => {
        try { return JSON.parse(parent.capabilities) as string[]; } catch { return []; }
      },
    },
    contextWindow: { type: new GraphQLNonNull(GraphQLInt) },
    isDefault: { type: new GraphQLNonNull(GraphQLBoolean) },
    isOrchestrator: { type: new GraphQLNonNull(GraphQLBoolean) },
    speedTier: { type: new GraphQLNonNull(GraphQLString) },
    connectionStatus: { type: new GraphQLNonNull(GraphQLString) },
    notes: { type: GraphQLString },
    authMethod: { type: new GraphQLNonNull(GraphQLString) },
    createdAt: {
      type: new GraphQLNonNull(GraphQLString),
      resolve: (parent: any) => new Date(parent.createdAt).toISOString(),
    },
  },
});

// ─── KnowledgeEntry ───────────────────────────────────────────────────────────

export const KnowledgeEntryType = new GraphQLObjectType({
  name: "KnowledgeEntry",
  description: "An entry in the knowledge base.",
  fields: {
    id: { type: new GraphQLNonNull(GraphQLID) },
    name: { type: new GraphQLNonNull(GraphQLString) },
    description: { type: GraphQLString },
    content: { type: new GraphQLNonNull(GraphQLString) },
    contentType: { type: new GraphQLNonNull(GraphQLString) },
    category: { type: GraphQLString },
    tags: {
      type: new GraphQLList(new GraphQLNonNull(GraphQLString)),
      resolve: (parent: any) => {
        if (!parent.tags) return null;
        try { return JSON.parse(parent.tags) as string[]; } catch { return []; }
      },
    },
    sizeBytes: { type: new GraphQLNonNull(GraphQLInt) },
    tokenEstimate: { type: new GraphQLNonNull(GraphQLInt) },
    enabled: { type: new GraphQLNonNull(GraphQLBoolean) },
    priority: { type: new GraphQLNonNull(GraphQLInt) },
    tierPolicy: { type: new GraphQLNonNull(GraphQLString) },
    createdAt: {
      type: new GraphQLNonNull(GraphQLString),
      resolve: (parent: any) => new Date(parent.createdAt).toISOString(),
    },
    updatedAt: {
      type: new GraphQLNonNull(GraphQLString),
      resolve: (parent: any) => new Date(parent.updatedAt).toISOString(),
    },
  },
});

// ─── StreamEvent (used by subscriptions in commit 4) ─────────────────────────

export const StreamEventType = new GraphQLObjectType({
  name: "StreamEvent",
  description: "A streaming event from the conversation orchestrator.",
  fields: {
    type: { type: new GraphQLNonNull(GraphQLString) },
    data: {
      type: GraphQLJSON,
      resolve: (parent: any) => {
        const { type: _type, ...rest } = parent;
        return Object.keys(rest).length > 0 ? rest : null;
      },
    },
  },
});

// ─── Query ────────────────────────────────────────────────────────────────────

const QueryType = new GraphQLObjectType({
  name: "Query",
  fields: {
    conversations: {
      type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(ConversationType))),
      description: "List all conversations.",
      resolve: () => conversationService.list(),
    },
    conversation: {
      type: ConversationType,
      description: "Get a single conversation by ID.",
      args: { id: { type: new GraphQLNonNull(GraphQLID) } },
      resolve: (_root: any, args: any) => {
        try { return conversationService.get(args.id as string); } catch { return null; }
      },
    },
    models: {
      type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(ModelType))),
      description: "List all registered models.",
      resolve: () => modelService.list(),
    },
    model: {
      type: ModelType,
      description: "Get a single model by ID.",
      args: { id: { type: new GraphQLNonNull(GraphQLID) } },
      resolve: (_root: any, args: any) => {
        try { return modelService.get(args.id as string); } catch { return null; }
      },
    },
    knowledgeEntries: {
      type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(KnowledgeEntryType))),
      description: "List all knowledge base entries.",
      resolve: () => knowledgeService.list(),
    },
    knowledgeEntry: {
      type: KnowledgeEntryType,
      description: "Get a single knowledge entry by ID.",
      args: { id: { type: new GraphQLNonNull(GraphQLID) } },
      resolve: (_root: any, args: any) => {
        try { return knowledgeService.get(args.id as string); } catch { return null; }
      },
    },
    searchKnowledge: {
      type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(KnowledgeEntryType))),
      description: "Search knowledge entries by query string.",
      args: { query: { type: new GraphQLNonNull(GraphQLString) } },
      resolve: (_root: any, args: any) => knowledgeService.search(args.query as string),
    },
  },
});

// ─── Mutation ─────────────────────────────────────────────────────────────────

const MutationType = new GraphQLObjectType({
  name: "Mutation",
  fields: {
    createConversation: {
      type: new GraphQLNonNull(ConversationType),
      description: "Create a new conversation.",
      args: {
        title: { type: GraphQLString },
        orchestratorModelId: { type: GraphQLID },
      },
      resolve: (_root: any, args: any) =>
        conversationService.create({
          title: args.title ?? undefined,
          orchestratorModelId: args.orchestratorModelId ?? undefined,
        }),
    },
    updateConversation: {
      type: ConversationType,
      description: "Update a conversation.",
      args: {
        id: { type: new GraphQLNonNull(GraphQLID) },
        title: { type: GraphQLString },
        status: { type: GraphQLString },
        orchestratorModelId: { type: GraphQLID },
      },
      resolve: (_root: any, args: any) => {
        const input: Record<string, unknown> = {};
        if (args.title !== undefined) input.title = args.title;
        if (args.status !== undefined) input.status = args.status;
        if (args.orchestratorModelId !== undefined) input.orchestratorModelId = args.orchestratorModelId;
        try { return conversationService.update(args.id as string, input); } catch { return null; }
      },
    },
    deleteConversation: {
      type: new GraphQLNonNull(GraphQLBoolean),
      description: "Delete a conversation by ID.",
      args: { id: { type: new GraphQLNonNull(GraphQLID) } },
      resolve: (_root: any, args: any) => {
        try { conversationService.delete(args.id as string); return true; } catch { return false; }
      },
    },
    createKnowledgeEntry: {
      type: new GraphQLNonNull(KnowledgeEntryType),
      description: "Create a new knowledge base entry.",
      args: {
        name: { type: new GraphQLNonNull(GraphQLString) },
        content: { type: new GraphQLNonNull(GraphQLString) },
        description: { type: GraphQLString },
        contentType: { type: GraphQLString },
        category: { type: GraphQLString },
        tags: { type: GraphQLString },
        enabled: { type: GraphQLBoolean },
        priority: { type: GraphQLInt },
        tierPolicy: { type: GraphQLString },
      },
      resolve: (_root: any, args: any) => knowledgeService.create(args),
    },
    deleteKnowledgeEntry: {
      type: new GraphQLNonNull(GraphQLBoolean),
      description: "Delete a knowledge entry by ID.",
      args: { id: { type: new GraphQLNonNull(GraphQLID) } },
      resolve: (_root: any, args: any) => {
        try { knowledgeService.delete(args.id as string); return true; } catch { return false; }
      },
    },
    reseedKnowledge: {
      type: new GraphQLNonNull(GraphQLBoolean),
      description: "Clear all knowledge entries and re-seed from system defaults.",
      resolve: () => {
        const result = knowledgeService.reseed();
        return result.ok;
      },
    },
  },
});

// ─── Schema ───────────────────────────────────────────────────────────────────

export const schema = new GraphQLSchema({
  query: QueryType,
  mutation: MutationType,
  types: [ConversationType, MessageType, ModelType, KnowledgeEntryType, StreamEventType],
});
