import { useQuery, useMutation, useSubscription } from "urql";

// ─── Conversations ─────────────────────────────────────────────────────────────

const CONVERSATIONS_QUERY = `
  query Conversations {
    conversations {
      id title status orchestratorModelId createdAt updatedAt
    }
  }
`;

export function useConversationsGQL() {
  return useQuery({ query: CONVERSATIONS_QUERY });
}

const CONVERSATION_QUERY = `
  query Conversation($id: ID!) {
    conversation(id: $id) {
      id title status orchestratorModelId createdAt updatedAt
      messages { id role content modelId createdAt }
    }
  }
`;

export function useConversationGQL(id: string) {
  return useQuery({ query: CONVERSATION_QUERY, variables: { id } });
}

const CREATE_CONVERSATION_MUTATION = `
  mutation CreateConversation($title: String, $orchestratorModelId: ID) {
    createConversation(title: $title, orchestratorModelId: $orchestratorModelId) {
      id title status createdAt
    }
  }
`;

export function useCreateConversationGQL() {
  return useMutation(CREATE_CONVERSATION_MUTATION);
}

const CONVERSATION_STREAM_SUB = `
  subscription ConversationStream($id: ID!) {
    conversationStream(id: $id) {
      type data
    }
  }
`;

export function useConversationStreamGQL(id: string) {
  return useSubscription({ query: CONVERSATION_STREAM_SUB, variables: { id } });
}

// ─── Models ───────────────────────────────────────────────────────────────────

const MODELS_QUERY = `
  query Models {
    models {
      id name provider modelId enabled speedTier connectionStatus isDefault isOrchestrator contextWindow
    }
  }
`;

export function useModelsGQL() {
  return useQuery({ query: MODELS_QUERY });
}

// ─── Knowledge ────────────────────────────────────────────────────────────────

const KNOWLEDGE_QUERY = `
  query Knowledge {
    knowledgeEntries {
      id name description category enabled priority tierPolicy sizeBytes tokenEstimate createdAt
    }
  }
`;

export function useKnowledgeGQL() {
  return useQuery({ query: KNOWLEDGE_QUERY });
}

const SEARCH_KNOWLEDGE_MUTATION = `
  mutation SearchKnowledge($query: String!, $limit: Int) {
    searchKnowledge(query: $query, limit: $limit) {
      id name description category priority
    }
  }
`;

export function useSearchKnowledgeGQL() {
  return useMutation(SEARCH_KNOWLEDGE_MUTATION);
}
