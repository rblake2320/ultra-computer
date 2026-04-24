import { storage } from "../storage.js";
import {
  subscribeToConversation,
  unsubscribeFromConversation,
  type OrchestratorEvent,
} from "../orchestrator.js";
import type { Conversation, Message, InsertConversation } from "@shared/schema";

export class ConversationService {
  list(): Conversation[] {
    return storage.getConversations();
  }

  get(id: string): Conversation {
    const conv = storage.getConversation(id);
    if (!conv) throw new Error(`Conversation ${id} not found`);
    return conv;
  }

  create(input: Partial<InsertConversation>): Conversation {
    return storage.createConversation({
      id: input.id ?? crypto.randomUUID(),
      title: input.title ?? "New Session",
      status: input.status ?? "idle",
      orchestratorModelId: input.orchestratorModelId ?? null,
      activeSkillIds: input.activeSkillIds ?? "[]",
    });
  }

  update(id: string, input: Record<string, unknown>): Conversation {
    const updated = storage.updateConversation(id, input as Partial<InsertConversation>);
    if (!updated) throw new Error(`Conversation ${id} not found`);
    return updated;
  }

  delete(id: string): void {
    storage.deleteConversation(id);
  }

  getMessages(conversationId: string): Message[] {
    return storage.getMessages(conversationId);
  }

  /**
   * Returns an AsyncGenerator that yields OrchestratorEvents for the given
   * conversation. Suitable for GraphQL subscriptions and gRPC streaming.
   */
  async *subscribe(conversationId: string): AsyncGenerator<OrchestratorEvent> {
    const queue: OrchestratorEvent[] = [];
    let resolve: (() => void) | null = null;
    let done = false;

    const handler: (event: OrchestratorEvent) => void = (event) => {
      queue.push(event);
      if (resolve) {
        resolve();
        resolve = null;
      }
    };

    subscribeToConversation(conversationId, handler);

    try {
      while (!done) {
        if (queue.length > 0) {
          const event = queue.shift()!;
          yield event;
          if (event.type === "done" || event.type === "error") {
            done = true;
          }
        } else {
          await new Promise<void>((r) => {
            resolve = r;
          });
        }
      }
    } finally {
      unsubscribeFromConversation(conversationId, handler);
    }
  }
}

export const conversationService = new ConversationService();
