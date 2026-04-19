/**
 * awaySummary.ts
 *
 * Away Summary Generator for Ultra Computer.
 * Inspired by Claude Code's away summary feature, this module generates
 * concise summaries of what happened while the user was away — including
 * agent actions, swarm progress, completed tasks, errors, and key decisions.
 *
 * Features:
 *   - Track all significant events during user absence
 *   - Generate structured summaries grouped by category
 *   - Priority-ranked event reporting (errors first, then completions, then info)
 *   - Configurable summary depth (brief, standard, detailed)
 *   - Integration with conversations, swarms, and autonomy systems
 *
 * @module awaySummary
 */

import { v4 as uuidv4 } from "uuid";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Event categories for away summary. */
export type EventCategory =
  | "error"
  | "task_completed"
  | "task_started"
  | "swarm_update"
  | "agent_action"
  | "memory_update"
  | "system_alert"
  | "user_mention"
  | "decision_made"
  | "file_changed"
  | "deployment"
  | "security_event";

/** Priority levels for events. */
export enum EventPriority {
  Critical = 1,
  High = 2,
  Medium = 3,
  Low = 4,
  Info = 5,
}

/** A tracked event during user absence. */
export interface AwayEvent {
  id: string;
  category: EventCategory;
  priority: EventPriority;
  title: string;
  description: string;
  timestamp: string;
  /** Source system that generated this event. */
  source: string;
  /** Related entity IDs (conversation, swarm, agent, etc.). */
  relatedIds: Record<string, string>;
  /** Whether this event requires user attention. */
  requiresAttention: boolean;
  /** Whether the user has acknowledged this event. */
  acknowledged: boolean;
}

/** Summary depth options. */
export type SummaryDepth = "brief" | "standard" | "detailed";

/** A generated away summary. */
export interface AwaySummary {
  id: string;
  /** When the user went away. */
  awayFrom: string;
  /** When the summary was generated. */
  generatedAt: string;
  /** Duration away in seconds. */
  durationSeconds: number;
  /** Total events during absence. */
  totalEvents: number;
  /** Events requiring attention. */
  attentionRequired: number;
  /** Summary depth used. */
  depth: SummaryDepth;
  /** Grouped event summaries. */
  sections: SummarySection[];
  /** One-line executive summary. */
  executiveSummary: string;
  /** Key metrics during absence. */
  metrics: AwayMetrics;
}

/** A section in the away summary. */
export interface SummarySection {
  category: EventCategory;
  title: string;
  eventCount: number;
  priority: EventPriority;
  items: SummaryItem[];
}

/** A single item in a summary section. */
export interface SummaryItem {
  eventId: string;
  title: string;
  description: string;
  timestamp: string;
  requiresAttention: boolean;
}

/** Key metrics during absence. */
export interface AwayMetrics {
  tasksCompleted: number;
  tasksStarted: number;
  tasksFailed: number;
  errorsEncountered: number;
  filesChanged: number;
  swarmSessionsActive: number;
  tokensConsumed: number;
  costUsd: number;
}

// ---------------------------------------------------------------------------
// Category Configuration
// ---------------------------------------------------------------------------

const CATEGORY_CONFIG: Record<EventCategory, { title: string; defaultPriority: EventPriority }> = {
  error: { title: "Errors & Failures", defaultPriority: EventPriority.Critical },
  security_event: { title: "Security Events", defaultPriority: EventPriority.Critical },
  task_completed: { title: "Completed Tasks", defaultPriority: EventPriority.Medium },
  task_started: { title: "Tasks In Progress", defaultPriority: EventPriority.Low },
  swarm_update: { title: "Swarm Activity", defaultPriority: EventPriority.Medium },
  agent_action: { title: "Agent Actions", defaultPriority: EventPriority.Low },
  memory_update: { title: "Memory & Knowledge Updates", defaultPriority: EventPriority.Info },
  system_alert: { title: "System Alerts", defaultPriority: EventPriority.High },
  user_mention: { title: "User Mentions", defaultPriority: EventPriority.High },
  decision_made: { title: "Decisions Made", defaultPriority: EventPriority.Medium },
  file_changed: { title: "File Changes", defaultPriority: EventPriority.Low },
  deployment: { title: "Deployments", defaultPriority: EventPriority.High },
};

// ---------------------------------------------------------------------------
// Away Summary Engine
// ---------------------------------------------------------------------------

export class AwaySummaryEngine {
  private events: AwayEvent[] = [];
  private maxEvents = 5000;
  private userLastSeen: string | null = null;
  private isUserAway = false;
  private summaryHistory: AwaySummary[] = [];
  private maxSummaryHistory = 50;

  // -----------------------------------------------------------------------
  // User Presence Tracking
  // -----------------------------------------------------------------------

  /** Mark the user as present (online). */
  markUserPresent(): void {
    this.userLastSeen = new Date().toISOString();
    this.isUserAway = false;
  }

  /** Mark the user as away. */
  markUserAway(): void {
    this.userLastSeen = this.userLastSeen || new Date().toISOString();
    this.isUserAway = true;
  }

  /** Check if the user is currently away. */
  getUserStatus(): { isAway: boolean; lastSeen: string | null; awayDurationSeconds: number } {
    const awayDuration = this.userLastSeen
      ? Math.floor((Date.now() - new Date(this.userLastSeen).getTime()) / 1000)
      : 0;

    return {
      isAway: this.isUserAway,
      lastSeen: this.userLastSeen,
      awayDurationSeconds: this.isUserAway ? awayDuration : 0,
    };
  }

  // -----------------------------------------------------------------------
  // Event Tracking
  // -----------------------------------------------------------------------

  /** Record an event that happened during user absence (or anytime). */
  recordEvent(
    category: EventCategory,
    title: string,
    description: string,
    source: string,
    options: {
      priority?: EventPriority;
      relatedIds?: Record<string, string>;
      requiresAttention?: boolean;
    } = {}
  ): AwayEvent {
    const event: AwayEvent = {
      id: uuidv4(),
      category,
      priority: options.priority || CATEGORY_CONFIG[category].defaultPriority,
      title,
      description,
      timestamp: new Date().toISOString(),
      source,
      relatedIds: options.relatedIds || {},
      requiresAttention: options.requiresAttention ?? (options.priority === EventPriority.Critical || options.priority === EventPriority.High),
      acknowledged: false,
    };

    this.events.push(event);

    // Enforce max events
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }

    return event;
  }

  /** Acknowledge an event. */
  acknowledgeEvent(eventId: string): boolean {
    const event = this.events.find((e) => e.id === eventId);
    if (event) {
      event.acknowledged = true;
      return true;
    }
    return false;
  }

  /** Acknowledge all events. */
  acknowledgeAll(): number {
    let count = 0;
    for (const event of this.events) {
      if (!event.acknowledged) {
        event.acknowledged = true;
        count++;
      }
    }
    return count;
  }

  // -----------------------------------------------------------------------
  // Summary Generation
  // -----------------------------------------------------------------------

  /**
   * Generate an away summary for the period since the user was last seen.
   */
  generateSummary(depth: SummaryDepth = "standard"): AwaySummary {
    const now = new Date().toISOString();
    const awayFrom = this.userLastSeen || now;
    const awayFromTime = new Date(awayFrom).getTime();
    const durationSeconds = Math.floor((Date.now() - awayFromTime) / 1000);

    // Filter events during absence
    const awayEvents = this.events.filter(
      (e) => new Date(e.timestamp).getTime() >= awayFromTime
    );

    // Group by category
    const grouped = new Map<EventCategory, AwayEvent[]>();
    for (const event of awayEvents) {
      if (!grouped.has(event.category)) {
        grouped.set(event.category, []);
      }
      grouped.get(event.category)!.push(event);
    }

    // Build sections sorted by priority
    const sections: SummarySection[] = [];
    const maxItemsPerSection = depth === "brief" ? 3 : depth === "standard" ? 10 : 50;

    for (const [category, events] of grouped.entries()) {
      const config = CATEGORY_CONFIG[category];
      const sortedEvents = events.sort((a, b) => a.priority - b.priority);
      const topEvents = sortedEvents.slice(0, maxItemsPerSection);

      sections.push({
        category,
        title: config.title,
        eventCount: events.length,
        priority: Math.min(...events.map((e) => e.priority)) as EventPriority,
        items: topEvents.map((e) => ({
          eventId: e.id,
          title: e.title,
          description: depth === "brief" ? e.title : e.description,
          timestamp: e.timestamp,
          requiresAttention: e.requiresAttention,
        })),
      });
    }

    // Sort sections by priority (critical first)
    sections.sort((a, b) => a.priority - b.priority);

    // Calculate metrics
    const metrics: AwayMetrics = {
      tasksCompleted: (grouped.get("task_completed") || []).length,
      tasksStarted: (grouped.get("task_started") || []).length,
      tasksFailed: (grouped.get("error") || []).filter((e) => e.title.toLowerCase().includes("task")).length,
      errorsEncountered: (grouped.get("error") || []).length,
      filesChanged: (grouped.get("file_changed") || []).length,
      swarmSessionsActive: new Set((grouped.get("swarm_update") || []).map((e) => e.relatedIds["swarmId"]).filter(Boolean)).size,
      tokensConsumed: 0, // Will be populated by integration with tokenBudget
      costUsd: 0,
    };

    const attentionRequired = awayEvents.filter((e) => e.requiresAttention && !e.acknowledged).length;

    // Generate executive summary
    const executiveSummary = this.buildExecutiveSummary(metrics, attentionRequired, durationSeconds);

    const summary: AwaySummary = {
      id: uuidv4(),
      awayFrom,
      generatedAt: now,
      durationSeconds,
      totalEvents: awayEvents.length,
      attentionRequired,
      depth,
      sections,
      executiveSummary,
      metrics,
    };

    // Store in history
    this.summaryHistory.push(summary);
    if (this.summaryHistory.length > this.maxSummaryHistory) {
      this.summaryHistory.shift();
    }

    return summary;
  }

  /**
   * Get unacknowledged events that require attention.
   */
  getAttentionItems(): AwayEvent[] {
    return this.events.filter((e) => e.requiresAttention && !e.acknowledged)
      .sort((a, b) => a.priority - b.priority);
  }

  /**
   * Get summary history.
   */
  getSummaryHistory(limit: number = 10): AwaySummary[] {
    return this.summaryHistory.slice(-limit);
  }

  /**
   * Get overall statistics.
   */
  getStats(): {
    totalEvents: number;
    unacknowledged: number;
    attentionRequired: number;
    summariesGenerated: number;
    eventsByCategory: Record<string, number>;
  } {
    const eventsByCategory: Record<string, number> = {};
    for (const event of this.events) {
      eventsByCategory[event.category] = (eventsByCategory[event.category] || 0) + 1;
    }

    return {
      totalEvents: this.events.length,
      unacknowledged: this.events.filter((e) => !e.acknowledged).length,
      attentionRequired: this.events.filter((e) => e.requiresAttention && !e.acknowledged).length,
      summariesGenerated: this.summaryHistory.length,
      eventsByCategory,
    };
  }

  // -----------------------------------------------------------------------
  // Internal Helpers
  // -----------------------------------------------------------------------

  private buildExecutiveSummary(metrics: AwayMetrics, attentionRequired: number, durationSeconds: number): string {
    const parts: string[] = [];
    const hours = Math.floor(durationSeconds / 3600);
    const minutes = Math.floor((durationSeconds % 3600) / 60);

    const timeStr = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
    parts.push(`While you were away for ${timeStr}:`);

    if (metrics.errorsEncountered > 0) {
      parts.push(`${metrics.errorsEncountered} error(s) occurred`);
    }
    if (metrics.tasksCompleted > 0) {
      parts.push(`${metrics.tasksCompleted} task(s) completed`);
    }
    if (metrics.tasksStarted > 0) {
      parts.push(`${metrics.tasksStarted} task(s) started`);
    }
    if (metrics.swarmSessionsActive > 0) {
      parts.push(`${metrics.swarmSessionsActive} swarm session(s) active`);
    }
    if (metrics.filesChanged > 0) {
      parts.push(`${metrics.filesChanged} file(s) changed`);
    }
    if (attentionRequired > 0) {
      parts.push(`${attentionRequired} item(s) require your attention`);
    }

    if (parts.length === 1) {
      parts.push("no significant activity");
    }

    return parts.join(" — ");
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export const awaySummaryEngine = new AwaySummaryEngine();
