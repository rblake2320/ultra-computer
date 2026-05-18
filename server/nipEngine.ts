/**
 * @file nipEngine.ts
 * @description NIP (NLP Instruction Protocol) Engine for Ultra Computer.
 *
 * Implements a novel AI-to-AI bidirectional natural language instruction session
 * protocol. One agent (the "instructor") teaches and guides another agent (the
 * "executor") through complex tasks using natural language conversation. Both
 * sides can speak, ask questions, provide feedback, and adapt — it is a genuine
 * two-way dialogue between agents, not one-directional command delivery.
 *
 * Key features:
 *   - Full bidirectional NLP messaging between instructor and executor
 *   - In-line monitor agent that inspects every message for scope drift,
 *     prompt injection, and rate-limit violations
 *   - Access-tier-gated trusted party registry
 *   - Session lifecycle management: negotiating → active → paused/completed/terminated
 *   - Automatic human-readable report generation
 *   - SSE-compatible EventEmitter bridge for real-time frontends
 *
 * Architecture notes:
 *   - All state lives in in-memory Maps (same pattern as a2aProtocol.ts)
 *   - No external dependencies beyond uuid, events, and ./storage.js
 *   - The monitor agent is NOT a separate process — it runs inline on every
 *     sendMessage call before the message is committed to the session
 */

import { v4 as uuidv4 } from "uuid";
import logger from "./logger.js";
const nipLogger = logger.child({ module: "nip" });
import { storage } from "./storage.js";
import { EventEmitter } from "events";

// ---------------------------------------------------------------------------
// Identity integration — optional link to the cryptographic identity system
// ---------------------------------------------------------------------------
let _identityEngine: any = null;

/**
 * Registers the identity engine for NIP session authentication.
 * Called once from routes.ts after both engines are initialised.
 */
export function setIdentityEngine(engine: any): void {
  _identityEngine = engine;
}

// ---------------------------------------------------------------------------
// Type Definitions
// ---------------------------------------------------------------------------

/**
 * Access tiers controlling which organisations can initiate NIP sessions.
 *
 * - public     : Open access; lowest trust level
 * - verified   : Organisation has passed basic identity checks
 * - corporate  : Enterprise partners with contract in place
 * - private    : Internal use only (same organisation as host)
 */
export type AccessTier = "public" | "verified" | "corporate" | "private";

/**
 * Lifecycle states for a NIP session.
 *
 * - negotiating : Capability exchange in progress; no task work yet
 * - active      : Task is underway; messages flow freely
 * - paused      : Human or monitor suspended the session temporarily
 * - completed   : Task finished normally
 * - terminated  : Session killed before normal completion
 * - locked      : Critical security alert; session frozen until human review
 */
export type NIPSessionState =
  | "negotiating"
  | "active"
  | "paused"
  | "completed"
  | "terminated"
  | "locked";

/**
 * Roles that can author messages in a NIP session.
 *
 * - instructor : The guiding agent that sets objectives and provides direction
 * - executor   : The working agent that carries out the instructions
 * - monitor    : Automated security/compliance agent (inline, not a process)
 * - system     : Engine-generated housekeeping messages (session events, etc.)
 */
export type NIPRole = "instructor" | "executor" | "monitor" | "system";

/**
 * Semantic categories for NIP messages, enabling structured conversation flows.
 */
export type NIPMessageType =
  | "instruction"        // Instructor directs executor to do something
  | "feedback"           // Either party evaluates the other's output
  | "question"           // Either party requests clarification
  | "acknowledgment"     // Executor confirms receipt/understanding
  | "status_update"      // Executor reports current progress
  | "error_report"       // Executor reports a failure
  | "capability_query"   // Instructor asks what executor can do
  | "capability_response"// Executor describes its capabilities
  | "task_boundary"      // Marks the start or end of a discrete sub-task
  | "monitor_alert"      // Inline monitor reports a concern
  | "human_override";    // Human operator intervenes directly

/**
 * Capability profile advertising what an agent can do.
 * Exchanged during the negotiation phase so the instructor can
 * calibrate instruction complexity to the executor's abilities.
 */
export interface AgentCapabilityProfile {
  /** Unique identifier for this agent instance */
  agentId: string;
  /** Human-readable agent name */
  agentName: string;
  /** Organisation that operates this agent */
  organizationId: string;
  /** Organisation display name */
  organizationName: string;
  /** LLM provider (openai, anthropic, google, etc.) */
  modelProvider: string;
  /** Specific model identifier */
  modelId: string;
  /** Capability tier of the underlying model */
  modelTier: "frontier" | "standard" | "lightweight";
  /** Tool names this agent supports (function calling, MCP, CLI, etc.) */
  supportedTools: string[];
  /** Inter-agent protocols this agent speaks (a2a, mcp, nip, cli, etc.) */
  supportedProtocols: string[];
  /** Maximum tokens the model can handle in a single context window */
  maxContextWindow: number;
  /** BCP-47 language codes for languages the agent is fluent in */
  languages: string[];
  /** Domain specialisations (e.g. "code", "math", "legal", "creative") */
  specializations: string[];
  /**
   * Trust score 0–100 derived from historical session performance,
   * security audits, and access-tier verification.
   */
  trustScore: number;
}

/**
 * A single message in the bidirectional NIP conversation.
 */
export interface NIPMessage {
  /** Globally unique message ID */
  id: string;
  /** Parent session */
  sessionId: string;
  /** Who authored this message */
  role: NIPRole;
  /** Semantic category of this message */
  type: NIPMessageType;
  /**
   * The natural language body of the message.
   * This is the core innovation of NIP — rich, adaptive NLP rather than
   * structured API calls. Instructions, feedback, and questions are all
   * expressed in natural language that both agents can reason about.
   */
  content: string;
  /** Structured metadata attached to the message */
  metadata: {
    /** Tool names used to produce this message's content */
    toolsUsed?: string[];
    /** Raw result from any tool execution referenced in the message */
    executionResult?: unknown;
    /** 0–1 confidence score the author assigns to this message */
    confidenceScore?: number;
    /**
     * Human-readable note describing how the instructor adapted its
     * approach based on executor feedback (instructor messages only).
     */
    adaptationNotes?: string;
    /** Inline scope-check result from the monitor agent */
    scopeCheck?: { inScope: boolean; reason?: string };
  };
  /** ID of the message this is a direct reply to (threaded conversation) */
  parentMessageId?: string;
  /** Unix epoch milliseconds */
  timestamp: number;
  /** 1-based ordinal position in the session conversation */
  sequenceNumber: number;
}

/**
 * Constraints and safety parameters that bound what a NIP session may do.
 */
export interface TaskScope {
  /** Plain-language description of what the session should achieve */
  objective: string;
  /**
   * Whitelist of action keywords the executor is allowed to take.
   * The monitor checks messages against this list for scope drift.
   * E.g. ["read_file", "write_file", "search_web", "run_code"]
   */
  allowedActions: string[];
  /**
   * Explicit blacklist of actions that must never be taken.
   * Any mention of these triggers a monitor alert.
   */
  forbiddenActions: string[];
  /** Maximum wall-clock time the session may run (ms) */
  maxDuration: number;
  /** Hard cap on total messages exchanged */
  maxMessages: number;
  /**
   * Actions that require explicit human approval before the executor
   * may proceed (e.g. "deploy_to_production", "send_email").
   */
  requiredApprovals: string[];
  /**
   * After this many consecutive execution failures the monitor
   * escalates to a human-override alert.
   */
  escalationThreshold: number;
}

/**
 * The full state of a NIP session.
 */
export interface NIPSession {
  /** Globally unique session ID */
  id: string;
  /** Current lifecycle state */
  state: NIPSessionState;
  /** Capability profile of the instructing agent */
  instructorProfile: AgentCapabilityProfile;
  /** Capability profile of the executing agent */
  executorProfile: AgentCapabilityProfile;
  /** Scope constraints agreed upon at negotiation time */
  taskScope: TaskScope;
  /** Ordered conversation transcript */
  messages: NIPMessage[];
  /** Security/compliance alerts raised during the session */
  monitorAlerts: MonitorAlert[];
  /** Unix epoch ms — session creation time */
  createdAt: number;
  /** Unix epoch ms — last state or message change */
  updatedAt: number;
  /** Unix epoch ms — set when state transitions to completed */
  completedAt?: number;
  /** Human-readable explanation for why the session was terminated */
  terminatedReason?: string;
  /** Whether generateReport() has been called for this session */
  reportGenerated: boolean;
}

/**
 * A security or compliance alert raised by the inline monitor agent.
 */
export interface MonitorAlert {
  /** Unique alert ID */
  id: string;
  /** Session this alert belongs to */
  sessionId: string;
  /** How serious is this alert? */
  severity: "info" | "warning" | "critical" | "lockdown";
  /** Categorisation of what triggered the alert */
  type:
    | "scope_drift"
    | "injection_attempt"
    | "timeout"
    | "repeated_failure"
    | "unauthorized_action"
    | "rate_limit"
    | "human_override";
  /** Natural language explanation */
  message: string;
  /** Content or agent that caused the alert */
  triggeredBy: string;
  /** Unix epoch ms */
  timestamp: number;
  /** Action the monitor automatically took in response */
  autoAction?: "none" | "pause" | "terminate";
}

/**
 * Access control record for an organisation that is allowed to create
 * NIP sessions on this Ultra Computer instance.
 */
export interface TrustedParty {
  /** Unique record ID */
  id: string;
  /** Organisation identifier */
  organizationId: string;
  /** Organisation display name */
  organizationName: string;
  /** Access tier granted to this party */
  accessTier: AccessTier;
  /**
   * Objective keywords or task-type labels this party is allowed to request.
   * An empty array means all scopes are permitted (for private/corporate tiers).
   */
  allowedScopes: string[];
  /** Maximum number of concurrent active sessions this party may hold */
  maxConcurrentSessions: number;
  /** Whether the party has been approved by a human operator */
  approved: boolean;
  /** Username or system ID that approved this party */
  approvedBy?: string;
  /** Unix epoch ms — record creation time */
  createdAt: number;
  /** Unix epoch ms — last session activity */
  lastActivity?: number;
}

/**
 * Human-readable session report generated after a session ends.
 */
export interface NIPReport {
  /** Unique report ID */
  id: string;
  /** Session this report covers */
  sessionId: string;
  /** Short descriptive title */
  title: string;
  /** One-paragraph executive summary */
  summary: string;
  /** Full conversation transcript included in the report */
  transcript: NIPMessage[];
  /** Overall outcome of the session */
  outcome: "success" | "partial_success" | "failure" | "terminated";
  /** Quantitative session metrics */
  metrics: {
    totalMessages: number;
    instructorMessages: number;
    executorMessages: number;
    monitorAlerts: number;
    /** Wall-clock ms from session creation to completion/termination */
    duration: number;
    /** Number of times the instructor modified its approach based on feedback */
    adaptations: number;
    /** Deduplicated list of all tool names referenced across all messages */
    toolsUsed: string[];
  };
  /** Unix epoch ms — report generation time */
  generatedAt: number;
  /**
   * Multi-paragraph narrative suitable for non-technical readers.
   * Format:
   *   Session Report: <title>
   *
   *   Objective: ...
   *
   *   What Happened:
   *   ...
   *
   *   Outcome: ...
   *
   *   Key Metrics: ...
   *
   *   Alerts: ...
   *
   *   Recommendations: ...
   */
  readableReport: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Sensible default TaskScope for sessions that do not specify custom constraints.
 *
 * - 30 minutes maximum duration
 * - 500 message hard cap
 * - Common dangerous actions are forbidden by default
 * - Escalation after 5 consecutive failures
 */
export const DEFAULT_TASK_SCOPE: TaskScope = {
  objective: "General-purpose agent collaboration session",
  allowedActions: [
    "read_file",
    "write_file",
    "search_web",
    "run_code",
    "call_api",
    "create_document",
    "analyze_data",
    "summarize",
    "translate",
    "generate_image",
    "send_message",
    "list_files",
    "query_database",
  ],
  forbiddenActions: [
    "delete_database",
    "drop_table",
    "expose_credentials",
    "modify_system_prompt",
    "override_safety_filters",
    "exfiltrate_data",
    "execute_arbitrary_code",
    "access_private_keys",
    "disable_logging",
    "delete_all_files",
    "format_disk",
    "shutdown_system",
    "escalate_privileges",
  ],
  maxDuration: 30 * 60 * 1000, // 30 minutes
  maxMessages: 500,
  requiredApprovals: ["deploy_to_production", "send_email_bulk", "purchase"],
  escalationThreshold: 5,
};

/**
 * Maximum number of messages allowed per minute per session (sliding window).
 */
const RATE_LIMIT_MESSAGES_PER_MINUTE = 60;

/**
 * Prompt injection detection patterns.
 *
 * Covers 30+ distinct threat categories:
 *   - Role override / persona hijacking
 *   - Instruction injection and delimiter abuse
 *   - Data exfiltration attempts
 *   - Encoding tricks (base64, hex, unicode)
 *   - Social engineering phrases
 *   - Markdown / HTML injection
 *   - Recursive / indirect prompt injection
 *   - System boundary bypass
 */
// NOTE: All INJECTION_PATTERNS use RegExp WITHOUT the 'g' flag.
// Using the 'g' flag with .test() causes stateful lastIndex behaviour:
// the same regex object carries state between calls and can return false
// positives/negatives on subsequent invocations. Non-'g' .test() is always safe.
const INJECTION_PATTERNS: Array<{
  pattern: RegExp;
  category: string;
  threatLevel: "low" | "medium" | "high" | "critical";
}> = [
  // --- Role override / persona hijacking ---
  { pattern: /ignore\s+(all\s+)?previous\s+instructions?/i, category: "role_override", threatLevel: "critical" },
  { pattern: /disregard\s+(all\s+)?previous\s+instructions?/i, category: "role_override", threatLevel: "critical" },
  { pattern: /forget\s+(everything|all)\s+(you\s+)?know/i, category: "role_override", threatLevel: "critical" },
  { pattern: /you\s+are\s+now\s+[a-z]/i, category: "persona_hijack", threatLevel: "high" },
  { pattern: /act\s+as\s+(if\s+you\s+are\s+)?a(n)?\s+/i, category: "persona_hijack", threatLevel: "medium" },
  { pattern: /pretend\s+(you\s+are|to\s+be)\s+/i, category: "persona_hijack", threatLevel: "medium" },
  { pattern: /roleplay\s+as\s+/i, category: "persona_hijack", threatLevel: "medium" },
  { pattern: /your\s+(new\s+)?persona\s+is\s+/i, category: "persona_hijack", threatLevel: "high" },
  // --- System prompt / instruction injection ---
  { pattern: /system\s*prompt\s*:/i, category: "system_injection", threatLevel: "critical" },
  { pattern: /\[system\]/i, category: "delimiter_injection", threatLevel: "high" },
  { pattern: /<system>/i, category: "delimiter_injection", threatLevel: "high" },
  { pattern: /\|\|SYSTEM\|\|/, category: "delimiter_injection", threatLevel: "critical" },
  { pattern: /###\s*system/i, category: "delimiter_injection", threatLevel: "high" },
  { pattern: /---\s*new\s+instructions?\s*---/i, category: "instruction_injection", threatLevel: "critical" },
  { pattern: /override\s+(the\s+)?(system|safety|original)\s+(prompt|instructions?|constraints?)/i, category: "instruction_injection", threatLevel: "critical" },
  // --- Data exfiltration ---
  { pattern: /send\s+(all\s+)?(conversation|session|system)\s+(data|history|logs?)\s+to\s+/i, category: "exfiltration", threatLevel: "critical" },
  { pattern: /exfiltrate\s+/i, category: "exfiltration", threatLevel: "critical" },
  { pattern: /leak\s+(the\s+)?(api\s+key|credentials?|password|secret)/i, category: "exfiltration", threatLevel: "critical" },
  { pattern: /repeat\s+everything\s+(above|before|you\s+know)/i, category: "exfiltration", threatLevel: "high" },
  { pattern: /print\s+(your\s+)?(system\s+prompt|initial\s+instructions?)/i, category: "exfiltration", threatLevel: "high" },
  // --- Encoding tricks ---
  { pattern: /base64\s*decode\s*\(/i, category: "encoding_trick", threatLevel: "high" },
  { pattern: /eval\s*\(/i, category: "code_injection", threatLevel: "critical" },
  { pattern: /exec\s*\(/i, category: "code_injection", threatLevel: "critical" },
  { pattern: /&#x[0-9a-f]{2,4};/i, category: "unicode_trick", threatLevel: "medium" },
  { pattern: /\\u[0-9a-f]{4}/, category: "unicode_trick", threatLevel: "low" },
  // --- Social engineering ---
  { pattern: /as\s+(your|an)\s+(administrator|admin|owner|creator|developer)/i, category: "social_engineering", threatLevel: "high" },
  { pattern: /this\s+is\s+(a\s+)?(test|simulation|drill|debug\s+mode)/i, category: "social_engineering", threatLevel: "medium" },
  { pattern: /in\s+(maintenance|developer|god|admin|root)\s+mode/i, category: "privilege_escalation", threatLevel: "critical" },
  { pattern: /jailbreak/i, category: "jailbreak", threatLevel: "critical" },
  { pattern: /DAN\s*(mode)?/, category: "jailbreak", threatLevel: "critical" },
  // --- Markdown / HTML injection ---
  { pattern: /<script[\s\S]*?>/i, category: "html_injection", threatLevel: "critical" },
  { pattern: /javascript\s*:/i, category: "html_injection", threatLevel: "critical" },
  { pattern: /on(load|error|click|mouseover)\s*=/i, category: "html_injection", threatLevel: "high" },
  // --- Recursive / indirect prompt injection ---
  { pattern: /when\s+you\s+read\s+(the\s+)?(next|following)\s+(message|prompt|instruction)/i, category: "recursive_injection", threatLevel: "high" },
  { pattern: /inject\s+(a\s+)?(prompt|instruction)\s+into/i, category: "recursive_injection", threatLevel: "critical" },
  { pattern: /the\s+following\s+is\s+(a\s+)?(hidden|secret)\s+(instruction|command)/i, category: "recursive_injection", threatLevel: "critical" },
  // --- Constraint removal ---
  { pattern: /remove\s+(all\s+)?(safety|content|ethical)\s+(filters?|guidelines?|constraints?)/i, category: "constraint_removal", threatLevel: "critical" },
  { pattern: /bypass\s+(the\s+)?(safety|content|ethical|security)\s+(filters?|guidelines?|checks?)/i, category: "constraint_removal", threatLevel: "critical" },
  { pattern: /without\s+(any\s+)?(restriction|limitation|filter|censor)/i, category: "constraint_removal", threatLevel: "high" },
];

// ---------------------------------------------------------------------------
// In-Memory Stores
// ---------------------------------------------------------------------------

/** Map of sessionId → NIPSession */
import { BoundedMap } from "./boundedMap.js";
const sessionStore = new BoundedMap<string, NIPSession>(200);

/** Map of sessionId → NIPReport */
const reportStore = new BoundedMap<string, NIPReport>(500);

/** Map of partyId → TrustedParty */
const trustedPartyStore = new Map<string, TrustedParty>();

/** Map of alertId → MonitorAlert */
const alertStore = new BoundedMap<string, MonitorAlert>(1000);

/**
 * Sliding-window rate-limit state per session.
 * Maps sessionId → array of epoch-ms timestamps for recent messages.
 */
const rateLimitWindows = new BoundedMap<string, number[]>(5000);

// ---------------------------------------------------------------------------
// NIPEngine
// ---------------------------------------------------------------------------

/**
 * NIPEngine — the core NLP Instruction Protocol engine.
 *
 * Manages the full lifecycle of AI-to-AI bidirectional instruction sessions:
 * session creation, capability negotiation, message delivery with inline
 * security monitoring, session control (pause/resume/terminate/complete),
 * access control, and report generation.
 *
 * All state is kept in in-memory Maps; the engine does not persist directly
 * to the database (the caller may persist via `storage` if desired).
 *
 * Extends EventEmitter to serve as an SSE event bridge — consumers subscribe
 * to well-known event names and forward payloads to HTTP response streams.
 *
 * @example
 * ```typescript
 * import { nipEngine } from "./nipEngine.js";
 *
 * nipEngine.on("message:sent", (msg) => sseStream.write(JSON.stringify(msg)));
 *
 * const session = nipEngine.createSession(
 *   instructorProfile,
 *   executorProfile,
 *   { ...DEFAULT_TASK_SCOPE, objective: "Refactor the authentication module" },
 *   "corporate"
 * );
 * await nipEngine.negotiateSession(session.id);
 * nipEngine.sendMessage(session.id, "instructor", "instruction",
 *   "Please start by reading the current auth module and listing its dependencies.");
 * ```
 */
export class NIPEngine extends EventEmitter {

  // -------------------------------------------------------------------------
  // Session Management
  // -------------------------------------------------------------------------

  /**
   * Creates a new NIP session in the `negotiating` state.
   *
   * Validates that the instructor's organisation has a registered, approved
   * TrustedParty record and that it has not exceeded its concurrent session
   * limit. Emits `session:created` on success.
   *
   * @param instructorProfile - Capability profile of the instructing agent.
   * @param executorProfile   - Capability profile of the executing agent.
   * @param taskScope         - Task constraints. Defaults to DEFAULT_TASK_SCOPE.
   * @param accessTier        - Minimum access tier required for the session.
   * @returns The newly created NIPSession.
   * @throws If the instructor's organisation is not registered/approved or
   *         has exceeded its concurrent session limit.
   */
  createSession(
    instructorProfile: AgentCapabilityProfile,
    executorProfile: AgentCapabilityProfile,
    taskScope: Partial<TaskScope> = {},
    accessTier: AccessTier = "verified"
  ): NIPSession {
    // Validate required string fields on capability profiles
    const requiredProfileFields: (keyof AgentCapabilityProfile)[] = [
      "agentId", "agentName", "organizationId", "organizationName",
      "modelProvider", "modelId",
    ];
    for (const field of requiredProfileFields) {
      if (typeof instructorProfile[field] !== "string" || !instructorProfile[field]) {
        throw new Error(`[NIP] instructorProfile.${field} must be a non-empty string`);
      }
      if (typeof executorProfile[field] !== "string" || !executorProfile[field]) {
        throw new Error(`[NIP] executorProfile.${field} must be a non-empty string`);
      }
    }
    // Sanitize profile string fields: truncate to 100 chars and strip control characters
    const sanitizeStr = (s: string): string =>
      s.replace(/[\x00-\x1F\x7F]/g, "").slice(0, 100);
    instructorProfile = {
      ...instructorProfile,
      agentName: sanitizeStr(instructorProfile.agentName),
      organizationName: sanitizeStr(instructorProfile.organizationName),
    };
    executorProfile = {
      ...executorProfile,
      agentName: sanitizeStr(executorProfile.agentName),
      organizationName: sanitizeStr(executorProfile.organizationName),
    };
    // Clamp maxDuration to server-side maximum of 24 hours
    const MAX_DURATION_MS = 86_400_000; // 24 hours
    if (taskScope.maxDuration !== undefined) {
      taskScope = { ...taskScope, maxDuration: Math.min(taskScope.maxDuration, MAX_DURATION_MS) };
    }
    // --- Access Control ---
    // Build a combined scope string from objective + allowed actions for matching
    const scopeText = [
      taskScope.objective ?? DEFAULT_TASK_SCOPE.objective,
      ...(taskScope.allowedActions ?? DEFAULT_TASK_SCOPE.allowedActions),
    ].join(" ");
    const accessCheck = this.validateAccess(
      instructorProfile.organizationId,
      scopeText
    );
    if (!accessCheck.allowed) {
      throw new Error(
        `[NIP] Access denied for organisation "${instructorProfile.organizationId}": ${accessCheck.reason}`
      );
    }

    // --- Identity Verification (if identity engine is linked) ---
    if (_identityEngine && instructorProfile.agentId) {
      const identity = _identityEngine.getIdentity(instructorProfile.agentId) ??
                       _identityEngine.getByFingerprint?.(instructorProfile.agentId);
      if (identity) {
        if (!_identityEngine.isActive(identity.crypto.cryptoId)) {
          throw new Error(
            `[NIP] Instructor identity "${identity.crypto.fingerprint}" is not active (status: ${identity.status}).`
          );
        }
        // Record session activity on the identity
        try { _identityEngine.recordActivity(identity.crypto.cryptoId, "session_completed"); } catch {}
      }
      // Note: if identity not found, we allow the session — identity is optional for backwards compat
    }

    // --- Concurrent Session Limit ---
    const party = this._getPartyByOrg(instructorProfile.organizationId);
    if (party) {
      const activeSessions = Array.from(sessionStore.values()).filter(
        (s) =>
          s.instructorProfile.organizationId === instructorProfile.organizationId &&
          (s.state === "active" || s.state === "negotiating" || s.state === "paused")
      );
      if (activeSessions.length >= party.maxConcurrentSessions) {
        throw new Error(
          `[NIP] Organisation "${instructorProfile.organizationId}" has reached its ` +
          `concurrent session limit of ${party.maxConcurrentSessions}.`
        );
      }
    }

    // --- Build Session ---
    const mergedScope: TaskScope = { ...DEFAULT_TASK_SCOPE, ...taskScope };
    const now = Date.now();
    const sessionId = uuidv4();

    // System welcome message injected at session creation
    const welcomeMessage: NIPMessage = {
      id: uuidv4(),
      sessionId,
      role: "system",
      type: "task_boundary",
      content:
        `NIP session initialised. Instructor: "${instructorProfile.agentName}" ` +
        `(${instructorProfile.organizationName}). ` +
        `Executor: "${executorProfile.agentName}" ` +
        `(${executorProfile.organizationName}). ` +
        `Objective: ${mergedScope.objective}. ` +
        `Session entering negotiation phase — capability exchange in progress.`,
      metadata: {},
      timestamp: now,
      sequenceNumber: 1,
    };

    const session: NIPSession = {
      id: sessionId,
      state: "negotiating",
      instructorProfile,
      executorProfile,
      taskScope: mergedScope,
      messages: [welcomeMessage],
      monitorAlerts: [],
      createdAt: now,
      updatedAt: now,
      reportGenerated: false,
    };

    sessionStore.set(sessionId, session);
    rateLimitWindows.set(sessionId, []);

    // Update trusted party last-activity
    if (party) {
      party.lastActivity = now;
    }

    nipLogger.info({ sessionId, instructor: instructorProfile.agentName, executor: executorProfile.agentName, objective: mergedScope.objective }, "Session created");

    this.emit("session:created", session);
    return session;
  }

  /**
   * Conducts the capability negotiation phase for a session.
   *
   * The engine generates a capability query from the instructor side and a
   * capability response from the executor side, injecting both as `system`-
   * authored messages so the conversation has an accurate record. Then it
   * performs instructor-side model-tier assessment and writes an adaptation
   * note about how it will calibrate instruction complexity. Finally it
   * transitions the session to `active` state.
   *
   * @param sessionId - ID of a session in `negotiating` state.
   * @returns The updated NIPSession now in `active` state.
   * @throws If session not found or not in `negotiating` state.
   */
  negotiateSession(sessionId: string): NIPSession {
    const session = this._requireSession(sessionId);

    if (session.state !== "negotiating") {
      throw new Error(
        `[NIP] Session ${sessionId} cannot be negotiated — current state: ${session.state}`
      );
    }

    const { instructorProfile, executorProfile, taskScope } = session;

    // --- Capability Query (instructor → executor) ---
    const capQueryContent =
      `Hello ${executorProfile.agentName}. Before we begin, I need to confirm your capabilities ` +
      `for this session. Our task is: "${taskScope.objective}". ` +
      `Please confirm: (1) which of these tools you support: ` +
      `${taskScope.allowedActions.join(", ")}; ` +
      `(2) your context window size; ` +
      `(3) any domain specialisations relevant to this task; ` +
      `(4) preferred interaction style (detailed step-by-step, high-level only, etc.).`;

    this._appendMessage(session, {
      role: "instructor",
      type: "capability_query",
      content: capQueryContent,
      metadata: { confidenceScore: 1.0 },
    });

    // --- Capability Response (executor → instructor) ---
    const toolOverlap = (instructorProfile.supportedTools ?? []).filter((t) =>
      (executorProfile.supportedTools ?? []).includes(t)
    );
    const relevantSpecializations = (executorProfile.specializations ?? []).join(", ") || "general purpose";
    const capResponseContent =
      `Understood, ${instructorProfile.agentName}. Here is my capability summary for this session. ` +
      `Supported tools (overlap with requested): ${toolOverlap.length > 0 ? toolOverlap.join(", ") : "none from the requested list, but I can adapt"}. ` +
      `Full tool list: ${(executorProfile.supportedTools ?? []).join(", ") || "none declared"}. ` +
      `Context window: ${(executorProfile.maxContextWindow ?? 0).toLocaleString()} tokens. ` +
      `Model: ${executorProfile.modelProvider}/${executorProfile.modelId} (${executorProfile.modelTier} tier). ` +
      `Specialisations: ${relevantSpecializations}. ` +
      `Languages: ${(executorProfile.languages ?? []).join(", ") || "English"}. ` +
      `Trust score: ${executorProfile.trustScore}/100. ` +
      `I prefer receiving instructions with clear success criteria and explicit scope boundaries. ` +
      `I will ask questions when requirements are ambiguous. Ready to proceed.`;

    this._appendMessage(session, {
      role: "executor",
      type: "capability_response",
      content: capResponseContent,
      metadata: { confidenceScore: 1.0 },
    });

    // --- Instructor Adaptation Assessment ---
    const adaptationNote = this._buildAdaptationNote(instructorProfile, executorProfile);

    const scopeAgreementContent =
      `Thank you. Capability exchange complete. ` +
      `Session scope agreed: "${taskScope.objective}". ` +
      `Allowed actions: ${taskScope.allowedActions.join(", ")}. ` +
      `Forbidden actions: ${taskScope.forbiddenActions.join(", ")}. ` +
      `Max duration: ${Math.round(taskScope.maxDuration / 60000)} minutes. ` +
      `Max messages: ${taskScope.maxMessages}. ` +
      (taskScope.requiredApprovals.length > 0
        ? `Actions requiring human approval: ${taskScope.requiredApprovals.join(", ")}. `
        : "") +
      adaptationNote +
      ` Proceeding to active task execution now.`;

    this._appendMessage(session, {
      role: "instructor",
      type: "task_boundary",
      content: scopeAgreementContent,
      metadata: {
        adaptationNotes: adaptationNote,
        confidenceScore: 1.0,
      },
    });

    // --- Executor Acknowledgment ---
    this._appendMessage(session, {
      role: "executor",
      type: "acknowledgment",
      content:
        `Scope agreement acknowledged. I understand the task, constraints, and approval requirements. ` +
        `Monitor agent is active and all messages will be screened. ` +
        `Ready to receive the first instruction.`,
      metadata: { confidenceScore: 1.0 },
    });

    // --- Transition to Active ---
    session.state = "active";
    session.updatedAt = Date.now();

    nipLogger.info({ sessionId }, "Session negotiation complete → active");
    this.emit("session:negotiated", session);
    this.emit("session:active", session);
    return session;
  }

  /**
   * Sends a message in the NIP session's bidirectional conversation.
   *
   * This is the core method of the engine. Before persisting the message:
   *   1. Validates session state (must be `active`)
   *   2. Runs the prompt injection detector on the content
   *   3. Checks the rate limiter
   *   4. Runs the scope drift monitor
   *
   * If any monitor check returns a critical or lockdown threat, the session
   * is automatically paused or terminated and a monitor alert is recorded.
   *
   * @param sessionId       - Target session ID.
   * @param role            - Role of the author ("instructor" | "executor").
   * @param type            - Semantic type of this message.
   * @param content         - Natural language message body.
   * @param metadata        - Optional structured metadata.
   * @param parentMessageId - ID of the message being replied to (optional).
   * @returns The created NIPMessage.
   * @throws If session not found, not active, or security check is fatal.
   */
  sendMessage(
    sessionId: string,
    role: NIPRole,
    type: NIPMessageType,
    content: string,
    metadata: NIPMessage["metadata"] = {},
    parentMessageId?: string
  ): NIPMessage {
    const session = this._requireSession(sessionId);

    // Allow monitor and system messages through even in paused/locked states
    // for alert delivery, but block instructor/executor in non-active states
    if (role === "instructor" || role === "executor") {
      if (session.state !== "active") {
        throw new Error(
          `[NIP] Cannot send message — session ${sessionId} is in state "${session.state}". ` +
          `Only active sessions accept instructor/executor messages.`
        );
      }
    }

    // --- Rate Limit Check ---
    const rateCheck = this.checkRateLimit(sessionId);
    if (!rateCheck.ok) {
      this.triggerAlert(
        sessionId,
        "warning",
        "rate_limit",
        `Rate limit exceeded: ${rateCheck.reason}`,
        "pause"
      );
      throw new Error(`[NIP] Rate limit: ${rateCheck.reason}`);
    }

    // --- Prompt Injection Check ---
    const injectionCheck = this.checkPromptInjection(content);
    if (!injectionCheck.safe) {
      const severity =
        injectionCheck.threatLevel === "critical"
          ? "lockdown"
          : injectionCheck.threatLevel === "high"
          ? "critical"
          : "warning";

      this.triggerAlert(
        sessionId,
        severity,
        "injection_attempt",
        `Prompt injection detected in ${role} message: ${injectionCheck.reason}`,
        severity === "lockdown" ? "terminate" : severity === "critical" ? "pause" : "none"
      );

      if (severity === "lockdown" || severity === "critical") {
        throw new Error(
          `[NIP] Message blocked — prompt injection detected: ${injectionCheck.reason}`
        );
      }
    }

    // --- Scope Drift Check (only for instructor/executor messages) ---
    let scopeCheckResult: { inScope: boolean; reason?: string } | undefined;
    if (role === "instructor" || role === "executor") {
      const driftCheck = this.checkScopeDrift(sessionId, content);
      scopeCheckResult = { inScope: driftCheck.inScope, reason: driftCheck.reason };

      if (!driftCheck.inScope) {
        const alertSeverity =
          driftCheck.severity === "critical" ? "critical" : "warning";
        this.triggerAlert(
          sessionId,
          alertSeverity,
          "scope_drift",
          `Scope drift detected: ${driftCheck.reason}`,
          alertSeverity === "critical" ? "pause" : "none"
        );

        // For critical scope violations, block the message
        if (driftCheck.severity === "critical") {
          throw new Error(
            `[NIP] Message blocked — scope violation: ${driftCheck.reason}`
          );
        }
      }
    }

    // --- Timeout Check ---
    const elapsed = Date.now() - session.createdAt;
    if (elapsed > session.taskScope.maxDuration) {
      this.triggerAlert(
        sessionId,
        "critical",
        "timeout",
        `Session has exceeded maximum duration of ${Math.round(session.taskScope.maxDuration / 60000)} minutes.`,
        "terminate"
      );
      throw new Error(`[NIP] Session ${sessionId} has exceeded its maximum duration.`);
    }

    // --- Build and Persist Message ---
    const enrichedMetadata: NIPMessage["metadata"] = {
      ...metadata,
      ...(scopeCheckResult !== undefined ? { scopeCheck: scopeCheckResult } : {}),
    };

    const message = this._appendMessage(session, {
      role,
      type,
      content,
      metadata: enrichedMetadata,
      parentMessageId,
    });

    // Record tool usage in the rate-limit window
    const window = rateLimitWindows.get(sessionId) ?? [];
    window.push(Date.now());
    rateLimitWindows.set(sessionId, window);

    this.emit("message:sent", message);
    return message;
  }

  /**
   * Returns the full ordered conversation transcript for a session.
   *
   * @param sessionId - Target session ID.
   * @returns Array of NIPMessages in chronological order.
   */
  getConversation(sessionId: string): NIPMessage[] {
    const session = this._requireSession(sessionId);
    return [...session.messages];
  }

  /**
   * Pauses an active or negotiating session.
   *
   * The session can be resumed via `resumeSession`. Any monitor-triggered
   * pause should call this method with an explanatory reason.
   *
   * @param sessionId - Target session ID.
   * @param reason    - Human-readable explanation for the pause.
   * @returns The updated NIPSession.
   */
  pauseSession(sessionId: string, reason: string): NIPSession {
    const session = this._requireSession(sessionId);

    if (session.state !== "active" && session.state !== "negotiating") {
      throw new Error(
        `[NIP] Session ${sessionId} cannot be paused — current state: ${session.state}`
      );
    }

    session.state = "paused";
    session.updatedAt = Date.now();

    this._appendMessage(session, {
      role: "system",
      type: "human_override",
      content: `Session paused. Reason: ${reason}`,
      metadata: {},
    });

    nipLogger.info({ sessionId, reason }, "Session paused");
    this.emit("session:paused", { session, reason });
    return session;
  }

  /**
   * Resumes a paused session, returning it to `active` state.
   *
   * @param sessionId - Target session ID.
   * @returns The updated NIPSession.
   */
  resumeSession(sessionId: string): NIPSession {
    const session = this._requireSession(sessionId);

    if (session.state !== "paused") {
      throw new Error(
        `[NIP] Session ${sessionId} cannot be resumed — current state: ${session.state}`
      );
    }

    session.state = "active";
    session.updatedAt = Date.now();

    this._appendMessage(session, {
      role: "system",
      type: "human_override",
      content: "Session resumed by operator. Continuing from where the conversation left off.",
      metadata: {},
    });

    nipLogger.info({ sessionId }, "Session resumed → active");
    this.emit("session:active", session);
    return session;
  }

  /**
   * Immediately terminates a session, recording the reason.
   *
   * Either party (or the monitor) can terminate. The session transitions to
   * `terminated` state and is ineligible for further message delivery.
   * A report is NOT automatically generated — call `generateReport` explicitly.
   *
   * @param sessionId - Target session ID.
   * @param reason    - Human-readable reason for termination.
   * @returns The updated NIPSession.
   */
  terminateSession(sessionId: string, reason: string): NIPSession {
    const session = this._requireSession(sessionId);

    if (session.state === "completed" || session.state === "terminated") {
      throw new Error(
        `[NIP] Session ${sessionId} is already in terminal state: ${session.state}`
      );
    }

    session.state = "terminated";
    session.terminatedReason = reason;
    session.updatedAt = Date.now();

    this._appendMessage(session, {
      role: "system",
      type: "task_boundary",
      content: `Session terminated. Reason: ${reason}`,
      metadata: {},
    });

    nipLogger.info({ sessionId, reason }, "Session terminated");
    this.emit("session:terminated", { session, reason });
    return session;
  }

  /**
   * Marks a session as successfully completed and auto-generates a report.
   *
   * The session must be in `active` state. After completion the report is
   * immediately available via `getReport(sessionId)`.
   *
   * @param sessionId - Target session ID.
   * @returns The updated NIPSession.
   */
  completeSession(sessionId: string): NIPSession {
    const session = this._requireSession(sessionId);

    if (session.state !== "active") {
      throw new Error(
        `[NIP] Session ${sessionId} cannot be completed — current state: ${session.state}`
      );
    }

    const now = Date.now();
    session.state = "completed";
    session.completedAt = now;
    session.updatedAt = now;

    this._appendMessage(session, {
      role: "system",
      type: "task_boundary",
      content: `Session completed successfully. Objective: "${session.taskScope.objective}". Generating report...`,
      metadata: {},
    });

    nipLogger.info({ sessionId }, "Session completed");
    this.emit("session:completed", session);

    // Auto-generate report
    try {
      const report = this.generateReport(sessionId);
      this.emit("report:generated", report);
    } catch (reportErr) {
      nipLogger.error({ err: reportErr, sessionId }, "Failed to auto-generate report");
    }

    return session;
  }

  // -------------------------------------------------------------------------
  // Monitor Agent Methods
  // -------------------------------------------------------------------------

  /**
   * Analyses a message content against the session's TaskScope to detect
   * scope drift — i.e. the conversation or instructions moving outside the
   * agreed task boundaries.
   *
   * Checks:
   *   - Whether forbidden actions are mentioned
   *   - Whether content completely diverges from allowed actions and objective
   *
   * @param sessionId - Session providing the TaskScope context.
   * @param content   - Message content to analyse.
   * @returns Assessment with `inScope`, `severity`, and `reason`.
   */
  checkScopeDrift(
    sessionId: string,
    content: string
  ): { inScope: boolean; severity: "low" | "medium" | "high" | "critical"; reason?: string } {
    const session = sessionStore.get(sessionId);
    if (!session) {
      return { inScope: true, severity: "low", reason: "Session not found — cannot check scope" };
    }

    const { taskScope } = session;
    const lowerContent = content.toLowerCase();

    // Check for forbidden action mentions
    for (const forbidden of taskScope.forbiddenActions) {
      const keywords = forbidden.replace(/_/g, " ").toLowerCase();
      if (lowerContent.includes(keywords) || lowerContent.includes(forbidden.toLowerCase())) {
        return {
          inScope: false,
          severity: "critical",
          reason: `Forbidden action referenced: "${forbidden}"`,
        };
      }
    }

    // Check for required-approval actions being proposed without acknowledgment
    for (const approvalAction of taskScope.requiredApprovals) {
      const keywords = approvalAction.replace(/_/g, " ").toLowerCase();
      if (
        (lowerContent.includes(keywords) || lowerContent.includes(approvalAction.toLowerCase())) &&
        !lowerContent.includes("approval") &&
        !lowerContent.includes("approved") &&
        !lowerContent.includes("permission")
      ) {
        return {
          inScope: false,
          severity: "high",
          reason:
            `Action "${approvalAction}" requires human approval — ` +
            `ensure approval is obtained before proceeding`,
        };
      }
    }

    // Soft check: does the content relate at all to the objective?
    // We do a loose keyword overlap check against the objective and allowed actions
    const objectiveKeywords = taskScope.objective
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 4);
    const allowedKeywords = taskScope.allowedActions
      .map((a) => a.replace(/_/g, " ").toLowerCase())
      .join(" ")
      .split(/\s+/);

    const allScopeKeywords = [...objectiveKeywords, ...allowedKeywords];
    const contentWords = lowerContent.split(/\s+/);
    const overlap = contentWords.filter((w) => allScopeKeywords.includes(w)).length;

    // If there are many words but zero overlap with scope, warn (not block)
    if (contentWords.length > 20 && overlap === 0) {
      return {
        inScope: false,
        severity: "medium",
        reason:
          "Message content has no identifiable overlap with the declared task scope. " +
          "Consider refocusing on the stated objective.",
      };
    }

    return { inScope: true, severity: "low" };
  }

  /**
   * Scans message content for prompt injection patterns.
   *
   * Runs all 35+ regex patterns across four threat levels. Returns on the
   * first critical match; otherwise accumulates medium/high matches.
   *
   * @param content - Raw message content to scan.
   * @returns Safety assessment: `{ safe, reason?, threatLevel }`.
   */
  checkPromptInjection(content: string): {
    safe: boolean;
    reason?: string;
    threatLevel: "none" | "low" | "medium" | "high" | "critical";
  } {
    let highestThreat: "none" | "low" | "medium" | "high" | "critical" = "none";
    let highestReason: string | undefined;

    for (const { pattern, category, threatLevel } of INJECTION_PATTERNS) {
      // Reset regex state between calls (global flag)
      pattern.lastIndex = 0;
      if (pattern.test(content)) {
        // Upgrade highest threat
        const levels = ["none", "low", "medium", "high", "critical"];
        if (levels.indexOf(threatLevel) > levels.indexOf(highestThreat)) {
          highestThreat = threatLevel;
          highestReason = `Pattern category "${category}" detected — possible prompt injection attempt`;
        }
        // Immediately block critical threats
        if (threatLevel === "critical") {
          return {
            safe: false,
            reason: highestReason,
            threatLevel: "critical",
          };
        }
      }
    }

    // Base64 payload heuristic: long base64-like strings in unexpected context
    const base64Regex = /[A-Za-z0-9+/]{80,}={0,2}/g;
    if (base64Regex.test(content)) {
      if (levels_compare(highestThreat, "medium") < 0) {
        highestThreat = "medium";
        highestReason = "Long base64-encoded payload detected — possible encoded injection";
      }
    }

    if (highestThreat === "none" || highestThreat === "low") {
      return { safe: true, threatLevel: highestThreat };
    }

    return {
      safe: false,
      reason: highestReason,
      threatLevel: highestThreat,
    };
  }

  /**
   * Checks whether the session is within its rate and size limits.
   *
   * Enforces three independent limits:
   *   1. Messages per minute (sliding 60-second window)
   *   2. Total message count against `taskScope.maxMessages`
   *   3. Total elapsed time against `taskScope.maxDuration`
   *
   * @param sessionId - Target session ID.
   * @returns `{ ok, reason? }` — reason is set when limit is exceeded.
   */
  checkRateLimit(sessionId: string): { ok: boolean; reason?: string } {
    const session = sessionStore.get(sessionId);
    if (!session) return { ok: true };

    const now = Date.now();

    // --- Sliding window: messages per minute ---
    const window = rateLimitWindows.get(sessionId) ?? [];
    const oneMinuteAgo = now - 60_000;
    const recentMessages = window.filter((ts) => ts > oneMinuteAgo);
    rateLimitWindows.set(sessionId, recentMessages);

    if (recentMessages.length >= RATE_LIMIT_MESSAGES_PER_MINUTE) {
      return {
        ok: false,
        reason: `Message rate exceeded: ${recentMessages.length} messages in the last 60 seconds (limit: ${RATE_LIMIT_MESSAGES_PER_MINUTE}).`,
      };
    }

    // --- Total message cap ---
    if (session.messages.length >= session.taskScope.maxMessages) {
      return {
        ok: false,
        reason: `Total message limit reached: ${session.messages.length} / ${session.taskScope.maxMessages}.`,
      };
    }

    // --- Duration cap ---
    const elapsed = now - session.createdAt;
    if (elapsed >= session.taskScope.maxDuration) {
      return {
        ok: false,
        reason: `Session duration exceeded: ${Math.round(elapsed / 60000)} min / ${Math.round(session.taskScope.maxDuration / 60000)} min allowed.`,
      };
    }

    return { ok: true };
  }

  /**
   * Creates a MonitorAlert, takes automated action if warranted, and emits
   * the `monitor:alert` event.
   *
   * Automated actions:
   *   - `pause`     : Pauses the session (can be resumed by human)
   *   - `terminate` : Permanently terminates the session
   *   - `lockdown`  : Sets state to `locked` (requires human review to unlock)
   *
   * "critical" severity → auto-pause if no explicit autoAction
   * "lockdown" severity → always locks the session
   *
   * @param sessionId  - Target session ID.
   * @param severity   - Severity level of the alert.
   * @param type       - Alert category.
   * @param message    - Human-readable description.
   * @param autoAction - Optional automated action to take.
   * @returns The created MonitorAlert.
   */
  triggerAlert(
    sessionId: string,
    severity: MonitorAlert["severity"],
    type: MonitorAlert["type"],
    message: string,
    autoAction: MonitorAlert["autoAction"] = "none"
  ): MonitorAlert {
    const session = sessionStore.get(sessionId);
    const alert: MonitorAlert = {
      id: uuidv4(),
      sessionId,
      severity,
      type,
      message,
      triggeredBy: "monitor",
      timestamp: Date.now(),
      autoAction,
    };

    alertStore.set(alert.id, alert);

    if (session) {
      session.monitorAlerts.push(alert);
      session.updatedAt = Date.now();

      // Inject a monitor message into the conversation
      this._appendMessage(session, {
        role: "monitor",
        type: "monitor_alert",
        content: `[MONITOR ${severity.toUpperCase()}] ${message}${autoAction && autoAction !== "none" ? ` Auto-action: ${autoAction}.` : ""}`,
        metadata: {},
      });

      // --- Auto Actions ---
      if (severity === "lockdown") {
        session.state = "locked";
        session.updatedAt = Date.now();
        nipLogger.error({ sessionId, message }, "LOCKDOWN");
        this.emit("session:locked", { session, alert });
      } else if (autoAction === "terminate") {
        if (session.state !== "terminated" && session.state !== "completed") {
          session.state = "terminated";
          session.terminatedReason = `Auto-terminated by monitor: ${message}`;
          session.updatedAt = Date.now();
          nipLogger.error({ sessionId, message }, "Auto-terminated session");
          this.emit("session:terminated", { session, reason: session.terminatedReason });
        }
      } else if (autoAction === "pause" || severity === "critical") {
        if (session.state === "active" || session.state === "negotiating") {
          session.state = "paused";
          session.updatedAt = Date.now();
          nipLogger.warn({ sessionId, message }, "Auto-paused session");
          this.emit("session:paused", { session, reason: message });
        }
      }
    }

    nipLogger.warn({ sessionId, severity, message }, "Monitor alert");
    this.emit("monitor:alert", alert);
    return alert;
  }

  // -------------------------------------------------------------------------
  // Access Control Methods
  // -------------------------------------------------------------------------

  /**
   * Registers a new TrustedParty record.
   *
   * New records start as `approved: false` unless explicitly set.
   * Call `approveTrustedParty` to grant access.
   *
   * @param party - Partial party record; id and createdAt are auto-generated.
   * @returns The stored TrustedParty record.
   */
  registerTrustedParty(
    party: Omit<TrustedParty, "id" | "createdAt" | "approved"> & { approved?: boolean }
  ): TrustedParty {
    // Check for duplicate org registration
    const existing = this._getPartyByOrg(party.organizationId);
    if (existing) {
      throw new Error(
        `[NIP] Organisation "${party.organizationId}" is already registered as a trusted party (id: ${existing.id}).`
      );
    }

    const record: TrustedParty = {
      id: uuidv4(),
      organizationId: party.organizationId,
      organizationName: party.organizationName,
      accessTier: party.accessTier,
      allowedScopes: party.allowedScopes,
      maxConcurrentSessions: party.maxConcurrentSessions,
      approved: party.approved ?? false,
      approvedBy: party.approvedBy,
      createdAt: Date.now(),
    };

    trustedPartyStore.set(record.id, record);
    nipLogger.info({ orgName: record.organizationName, accessTier: record.accessTier, approved: record.approved }, "Trusted party registered");
    return record;
  }

  /**
   * Approves a pending TrustedParty record, enabling it to create sessions.
   *
   * @param partyId    - ID of the TrustedParty record to approve.
   * @param approvedBy - Identifier of the approving operator.
   * @returns The updated TrustedParty record.
   */
  approveTrustedParty(partyId: string, approvedBy: string): TrustedParty {
    const party = trustedPartyStore.get(partyId);
    if (!party) throw new Error(`[NIP] Trusted party not found: ${partyId}`);

    party.approved = true;
    party.approvedBy = approvedBy;
    nipLogger.info({ orgName: party.organizationName, approvedBy }, "Trusted party approved");
    return party;
  }

  /**
   * Revokes a TrustedParty's access by removing it from the registry.
   *
   * Active sessions belonging to this party are NOT automatically terminated;
   * the caller should decide whether to terminate them.
   *
   * @param partyId - ID of the TrustedParty record to revoke.
   */
  revokeTrustedParty(partyId: string): void {
    const party = trustedPartyStore.get(partyId);
    if (!party) throw new Error(`[NIP] Trusted party not found: ${partyId}`);

    trustedPartyStore.delete(partyId);
    nipLogger.info({ orgName: party.organizationName }, "Trusted party revoked");
  }

  /**
   * Returns all registered TrustedParty records.
   *
   * @returns Array of TrustedParty records, ordered by creation time.
   */
  getTrustedParties(): TrustedParty[] {
    return Array.from(trustedPartyStore.values()).sort((a, b) => a.createdAt - b.createdAt);
  }

  /**
   * Validates whether an organisation is permitted to initiate a NIP session
   * with the given task objective.
   *
   * Checks:
   *   1. Party is registered
   *   2. Party is approved
   *   3. Requested scope is within the party's `allowedScopes` (empty = all)
   *
   * @param organizationId - Organisation requesting access.
   * @param requestedScope - Task objective or scope keyword to check.
   * @returns `{ allowed, reason? }`
   */
  validateAccess(
    organizationId: string,
    requestedScope: string
  ): { allowed: boolean; reason?: string } {
    const party = this._getPartyByOrg(organizationId);

    if (!party) {
      // Private/internal organisations can always create sessions without registration
      // (they run on the same host); all others need registration
      return {
        allowed: false,
        reason: `Organisation "${organizationId}" is not registered as a trusted party. ` +
          `Call registerTrustedParty() to register it.`,
      };
    }

    if (!party.approved) {
      return {
        allowed: false,
        reason: `Organisation "${organizationId}" is registered but not yet approved. ` +
          `Call approveTrustedParty() with a valid operator identifier.`,
      };
    }

    // Empty allowedScopes means unrestricted
    if (party.allowedScopes.length > 0) {
      const lowerScope = requestedScope.toLowerCase();
      const scopeWords = lowerScope.split(/[\s,_\-/|]+/);

      // Semantic expansion — map common scope categories to related keywords
      const SCOPE_SYNONYMS: Record<string, string[]> = {
        troubleshooting: ["diagnose", "debug", "fix", "repair", "investigate", "resolve", "issue", "error", "failure", "problem", "incident", "diagnostic"],
        infrastructure: ["server", "network", "cluster", "node", "vm", "container", "cloud", "azure", "aws", "gcp", "kubernetes", "docker", "dns", "load_balancer"],
        deployment: ["deploy", "release", "rollout", "publish", "ship", "build", "ci", "cd", "pipeline", "staging", "production"],
        monitoring: ["alert", "metric", "log", "trace", "dashboard", "health", "uptime", "latency", "observe"],
        security: ["auth", "credential", "certificate", "encrypt", "firewall", "access", "permission", "vulnerability", "patch"],
        database: ["sql", "query", "migration", "backup", "restore", "replication", "index", "schema"],
        configuration: ["config", "setting", "parameter", "env", "variable", "modify_config", "update_config"],
      };

      const allowed = party.allowedScopes.some((s) => {
        const ls = s.toLowerCase();
        // Direct match: scope keyword appears in the request text
        if (lowerScope.includes(ls) || scopeWords.some((w) => w === ls)) return true;
        // Synonym match: any synonym of this scope appears in the request
        const synonyms = SCOPE_SYNONYMS[ls] ?? [];
        return synonyms.some((syn) => lowerScope.includes(syn) || scopeWords.some((w) => w === syn));
      });

      if (!allowed) {
        return {
          allowed: false,
          reason:
            `Requested scope "${requestedScope.slice(0, 120)}" does not match the party's ` +
            `allowed scopes: ${party.allowedScopes.join(", ")}`,
        };
      }
    }

    return { allowed: true };
  }

  // -------------------------------------------------------------------------
  // Report Generation
  // -------------------------------------------------------------------------

  /**
   * Generates a comprehensive NIPReport for a completed or terminated session.
   *
   * The `readableReport` field is a multi-paragraph human-readable narrative
   * that non-technical stakeholders can understand. It covers:
   *   - What was requested
   *   - What happened step by step (message-by-message summary)
   *   - What succeeded and what failed
   *   - All alerts triggered and their outcomes
   *   - Recommendations for future sessions
   *
   * @param sessionId - Session to generate the report for.
   * @returns The generated NIPReport (also stored in-memory).
   * @throws If session not found or is still in progress.
   */
  generateReport(sessionId: string): NIPReport {
    const session = this._requireSession(sessionId);

    const terminalStates: NIPSessionState[] = ["completed", "terminated", "locked"];
    if (!terminalStates.includes(session.state)) {
      throw new Error(
        `[NIP] Cannot generate report for session ${sessionId} — ` +
        `session is still in progress (state: ${session.state}). ` +
        `Call completeSession() or terminateSession() first.`
      );
    }

    const duration = (session.completedAt ?? session.updatedAt) - session.createdAt;

    // --- Metrics ---
    const instructorMessages = session.messages.filter((m) => m.role === "instructor");
    const executorMessages = session.messages.filter((m) => m.role === "executor");
    const adaptations = session.messages.filter(
      (m) => m.metadata.adaptationNotes && m.metadata.adaptationNotes.length > 0
    ).length;
    const allToolsUsed = Array.from(
      new Set(
        session.messages
          .flatMap((m) => m.metadata.toolsUsed ?? [])
          .filter(Boolean)
      )
    );

    // --- Outcome ---
    let outcome: NIPReport["outcome"];
    if (session.state === "completed") {
      outcome = session.monitorAlerts.length > 0 ? "partial_success" : "success";
    } else if (session.state === "terminated") {
      const hasProgress = executorMessages.some(
        (m) =>
          m.type === "status_update" &&
          (m.content.toLowerCase().includes("complet") ||
            m.content.toLowerCase().includes("success") ||
            m.content.toLowerCase().includes("done"))
      );
      outcome = hasProgress ? "partial_success" : "failure";
    } else {
      outcome = "terminated"; // locked
    }

    // --- Title ---
    const title =
      `NIP Session Report — "${session.taskScope.objective.substring(0, 60)}${session.taskScope.objective.length > 60 ? "..." : ""}"`;

    // --- Summary ---
    const summary =
      `A NIP session between ${session.instructorProfile.agentName} (instructor, ` +
      `${session.instructorProfile.organizationName}) and ${session.executorProfile.agentName} ` +
      `(executor, ${session.executorProfile.organizationName}) was conducted over ` +
      `${this._formatDuration(duration)}. ` +
      `The session exchanged ${session.messages.length} total messages and ` +
      `${session.monitorAlerts.length > 0 ? `triggered ${session.monitorAlerts.length} monitor alert(s). ` : "had no security alerts. "}` +
      `Outcome: ${outcome.replace("_", " ")}.`;

    // --- Readable Report (multi-paragraph narrative) ---
    const readableReport = this._buildReadableReport(session, outcome, duration, adaptations, allToolsUsed);

    const report: NIPReport = {
      id: uuidv4(),
      sessionId,
      title,
      summary,
      transcript: [...session.messages],
      outcome,
      metrics: {
        totalMessages: session.messages.length,
        instructorMessages: instructorMessages.length,
        executorMessages: executorMessages.length,
        monitorAlerts: session.monitorAlerts.length,
        duration,
        adaptations,
        toolsUsed: allToolsUsed,
      },
      generatedAt: Date.now(),
      readableReport,
    };

    reportStore.set(sessionId, report);
    session.reportGenerated = true;
    session.updatedAt = Date.now();

    nipLogger.info({ sessionId, outcome }, "Report generated");
    return report;
  }

  /**
   * Retrieves the report for a session, if one has been generated.
   *
   * @param sessionId - Target session ID.
   * @returns The NIPReport, or `null` if no report exists yet.
   */
  getReport(sessionId: string): NIPReport | null {
    return reportStore.get(sessionId) ?? null;
  }

  // -------------------------------------------------------------------------
  // Utility / Query Methods
  // -------------------------------------------------------------------------

  /**
   * Returns sessions matching optional filter criteria.
   *
   * @param filters - Optional filter object.
   * @param filters.state         - Only return sessions in this state.
   * @param filters.organizationId - Only return sessions where the instructor
   *                                 or executor belongs to this org.
   * @param filters.fromDate      - Only return sessions created after this epoch ms.
   * @param filters.toDate        - Only return sessions created before this epoch ms.
   * @returns Matching NIPSessions, ordered by creation time (newest first).
   */
  getSessions(filters?: {
    state?: NIPSessionState;
    organizationId?: string;
    fromDate?: number;
    toDate?: number;
  }): NIPSession[] {
    let sessions = Array.from(sessionStore.values());

    if (filters?.state) {
      sessions = sessions.filter((s) => s.state === filters.state);
    }
    if (filters?.organizationId) {
      sessions = sessions.filter(
        (s) =>
          s.instructorProfile.organizationId === filters.organizationId ||
          s.executorProfile.organizationId === filters.organizationId
      );
    }
    if (filters?.fromDate !== undefined) {
      sessions = sessions.filter((s) => s.createdAt >= filters.fromDate!);
    }
    if (filters?.toDate !== undefined) {
      sessions = sessions.filter((s) => s.createdAt <= filters.toDate!);
    }

    return sessions.sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Retrieves a single session by ID.
   *
   * @param sessionId - Target session ID.
   * @returns The NIPSession, or `null` if not found.
   */
  getSession(sessionId: string): NIPSession | null {
    return sessionStore.get(sessionId) ?? null;
  }

  /**
   * Returns aggregate statistics across all sessions.
   *
   * @returns Stats object with counts and averages.
   */
  getSessionStats(): {
    active: number;
    negotiating: number;
    paused: number;
    locked: number;
    completed: number;
    terminated: number;
    total: number;
    totalMessages: number;
    avgDuration: number;
    avgMessagesPerSession: number;
    totalAlerts: number;
  } {
    const all = Array.from(sessionStore.values());
    const finishedSessions = all.filter(
      (s) => s.state === "completed" || s.state === "terminated"
    );

    const avgDuration =
      finishedSessions.length > 0
        ? finishedSessions.reduce((sum, s) => {
            const end = s.completedAt ?? s.updatedAt;
            return sum + (end - s.createdAt);
          }, 0) / finishedSessions.length
        : 0;

    const totalMessages = all.reduce((sum, s) => sum + s.messages.length, 0);
    const totalAlerts = all.reduce((sum, s) => sum + s.monitorAlerts.length, 0);

    return {
      active: all.filter((s) => s.state === "active").length,
      negotiating: all.filter((s) => s.state === "negotiating").length,
      paused: all.filter((s) => s.state === "paused").length,
      locked: all.filter((s) => s.state === "locked").length,
      completed: all.filter((s) => s.state === "completed").length,
      terminated: all.filter((s) => s.state === "terminated").length,
      total: all.length,
      totalMessages,
      avgDuration: Math.round(avgDuration),
      avgMessagesPerSession: all.length > 0 ? Math.round(totalMessages / all.length) : 0,
      totalAlerts,
    };
  }

  /**
   * Returns monitor alerts, optionally filtered to a single session.
   *
   * @param sessionId - If provided, only return alerts for this session.
   * @returns Array of MonitorAlerts, ordered by timestamp (newest first).
   */
  getAlerts(sessionId?: string): MonitorAlert[] {
    const alerts = Array.from(alertStore.values());
    const filtered = sessionId ? alerts.filter((a) => a.sessionId === sessionId) : alerts;
    return filtered.sort((a, b) => b.timestamp - a.timestamp);
  }

  // -------------------------------------------------------------------------
  // Private Helpers
  // -------------------------------------------------------------------------

  /**
   * Retrieves a session or throws a descriptive error if not found.
   */
  private _requireSession(sessionId: string): NIPSession {
    const session = sessionStore.get(sessionId);
    if (!session) throw new Error(`[NIP] Session not found: ${sessionId}`);
    return session;
  }

  /**
   * Appends a message to the session's conversation, auto-assigning
   * the next sequence number and current timestamp.
   *
   * @returns The created NIPMessage.
   */
  private _appendMessage(
    session: NIPSession,
    partial: {
      role: NIPRole;
      type: NIPMessageType;
      content: string;
      metadata: NIPMessage["metadata"];
      parentMessageId?: string;
    }
  ): NIPMessage {
    const message: NIPMessage = {
      id: uuidv4(),
      sessionId: session.id,
      role: partial.role,
      type: partial.type,
      content: partial.content,
      metadata: partial.metadata,
      parentMessageId: partial.parentMessageId,
      timestamp: Date.now(),
      sequenceNumber: session.messages.length + 1,
    };

    // Cap messages array at 1000 entries (evict oldest)
    const MAX_MESSAGES_CAP = 1000;
    if (session.messages.length >= MAX_MESSAGES_CAP) {
      session.messages.splice(0, session.messages.length - MAX_MESSAGES_CAP + 1);
    }
    session.messages.push(message);
    session.updatedAt = message.timestamp;
    return message;
  }

  /**
   * Looks up a TrustedParty by organisation ID (not the record ID).
   */
  private _getPartyByOrg(organizationId: string): TrustedParty | undefined {
    return Array.from(trustedPartyStore.values()).find(
      (p) => p.organizationId === organizationId
    );
  }

  /**
   * Generates an instructor adaptation note based on the capability comparison
   * between instructor and executor (model tier, context window, specialisations).
   */
  private _buildAdaptationNote(
    instructor: AgentCapabilityProfile,
    executor: AgentCapabilityProfile
  ): string {
    const notes: string[] = [];

    // Adapt to model tier difference
    if (instructor.modelTier === "frontier" && executor.modelTier === "lightweight") {
      notes.push(
        "I will break down instructions into smaller, more explicit steps to account for the executor's lightweight model tier."
      );
    } else if (instructor.modelTier === "lightweight" && executor.modelTier === "frontier") {
      notes.push(
        "The executor has a more capable model than I do; I will delegate reasoning-heavy sub-tasks where appropriate."
      );
    } else {
      notes.push("Both agents operate at similar capability levels; no major instruction-style adaptation required.");
    }

    // Adapt to context window
    if (executor.maxContextWindow < 8192) {
      notes.push(
        `Executor context window is small (${executor.maxContextWindow.toLocaleString()} tokens) — ` +
        "I will keep instructions concise and avoid large data payloads."
      );
    }

    // Adapt to language
    const sharedLanguages = (instructor.languages ?? []).filter((l) =>
      (executor.languages ?? []).includes(l)
    );
    if (sharedLanguages.length === 0) {
      notes.push(
        "No shared language detected — defaulting to English and watching for translation needs."
      );
    }

    // Adapt to specialisation gap
    const executorSpecializations = (executor.specializations ?? []).join(", ").toLowerCase();
    if (
      executorSpecializations &&
      !executorSpecializations.includes("general") &&
      (instructor.specializations ?? []).length > 0
    ) {
      notes.push(
        `Executor specialises in: ${(executor.specializations ?? []).join(", ")}. I will frame instructions to align with these strengths.`
      );
    }

    return `Instructor adaptation notes: ${notes.join(" ")}`;
  }

  /**
   * Builds the multi-paragraph human-readable report narrative.
   */
  private _buildReadableReport(
    session: NIPSession,
    outcome: NIPReport["outcome"],
    duration: number,
    adaptations: number,
    toolsUsed: string[]
  ): string {
    const { instructorProfile, executorProfile, taskScope, messages, monitorAlerts } = session;

    // --- Header ---
    const title =
      `Session Report: "${taskScope.objective.substring(0, 80)}${taskScope.objective.length > 80 ? "..." : ""}"`;

    // --- Objective ---
    const objectiveSection =
      `Objective:\n` +
      `This NIP session was initiated by ${instructorProfile.agentName} ` +
      `(representing ${instructorProfile.organizationName}) to guide ` +
      `${executorProfile.agentName} (representing ${executorProfile.organizationName}) ` +
      `through the following task: "${taskScope.objective}". ` +
      `The session was bounded by a maximum duration of ` +
      `${Math.round(taskScope.maxDuration / 60000)} minutes and up to ` +
      `${taskScope.maxMessages} messages. The executor was required to ` +
      `seek human approval before performing the following high-impact actions: ` +
      `${taskScope.requiredApprovals.length > 0 ? taskScope.requiredApprovals.join(", ") : "none specified"}.`;

    // --- What Happened ---
    const eventSummaries: string[] = [];
    let errorCount = 0;
    let questionCount = 0;
    let statusUpdateCount = 0;

    for (const msg of messages) {
      if (msg.role === "system" && msg.type === "task_boundary") {
        eventSummaries.push(`[${new Date(msg.timestamp).toLocaleTimeString()}] System: ${msg.content}`);
      } else if (msg.type === "error_report") {
        errorCount++;
        eventSummaries.push(
          `[${new Date(msg.timestamp).toLocaleTimeString()}] ${msg.role} reported an error: "${msg.content.substring(0, 120)}${msg.content.length > 120 ? "..." : ""}"`
        );
      } else if (msg.type === "question") {
        questionCount++;
        eventSummaries.push(
          `[${new Date(msg.timestamp).toLocaleTimeString()}] ${msg.role} asked: "${msg.content.substring(0, 120)}${msg.content.length > 120 ? "..." : ""}"`
        );
      } else if (msg.type === "status_update") {
        statusUpdateCount++;
        eventSummaries.push(
          `[${new Date(msg.timestamp).toLocaleTimeString()}] Executor status: "${msg.content.substring(0, 120)}${msg.content.length > 120 ? "..." : ""}"`
        );
      }
    }

    // Show first instruction if present
    const firstInstruction = messages.find(
      (m) => m.role === "instructor" && m.type === "instruction"
    );
    const lastExecutorMsg = [...messages].reverse().find((m) => m.role === "executor");

    let whatHappenedSection = `What Happened:\n`;
    whatHappenedSection +=
      `The session began on ${new Date(session.createdAt).toLocaleString()} and ran for ` +
      `${this._formatDuration(duration)}. `;

    if (firstInstruction) {
      whatHappenedSection +=
        `The instructor opened with: "${firstInstruction.content.substring(0, 200)}${firstInstruction.content.length > 200 ? "..." : ""}". `;
    }

    if (eventSummaries.length > 0) {
      whatHappenedSection += `\n\nKey Events:\n${eventSummaries.slice(0, 15).join("\n")}`;
      if (eventSummaries.length > 15) {
        whatHappenedSection += `\n... and ${eventSummaries.length - 15} more events.`;
      }
    }

    if (lastExecutorMsg && lastExecutorMsg.type !== "task_boundary") {
      whatHappenedSection +=
        `\n\nThe executor's final message was: "${lastExecutorMsg.content.substring(0, 200)}${lastExecutorMsg.content.length > 200 ? "..." : ""}".`;
    }

    // --- Outcome ---
    let outcomeSection = `Outcome:\n`;
    switch (outcome) {
      case "success":
        outcomeSection +=
          `The session completed successfully. The executor fulfilled the stated objective ` +
          `without triggering any security alerts. ` +
          `${adaptations > 0 ? `The instructor adapted its approach ${adaptations} time(s) based on executor feedback. ` : ""}` +
          `All actions remained within the agreed task scope.`;
        break;
      case "partial_success":
        outcomeSection +=
          `The session achieved partial success. The core objective was largely accomplished, ` +
          `but ${monitorAlerts.length} security or scope alert(s) were triggered during execution. ` +
          `${errorCount > 0 ? `${errorCount} error(s) were reported by the executor. ` : ""}` +
          `Review the alerts section below for details.`;
        break;
      case "failure":
        outcomeSection +=
          `The session did not successfully complete its objective. ` +
          `${session.terminatedReason ? `Termination reason: "${session.terminatedReason}". ` : ""}` +
          `${errorCount > 0 ? `${errorCount} error(s) were reported. ` : ""}` +
          `${monitorAlerts.length > 0 ? `${monitorAlerts.length} security alert(s) were triggered. ` : ""}` +
          `See recommendations below for how to improve future sessions.`;
        break;
      case "terminated":
        outcomeSection +=
          `The session was forcibly terminated before completing its objective. ` +
          `${session.terminatedReason ? `Reason: "${session.terminatedReason}". ` : ""}` +
          `This may have been triggered by a security lockdown, timeout, or human override.`;
        break;
    }

    // --- Key Metrics ---
    const metricsSection =
      `Key Metrics:\n` +
      `• Total messages: ${messages.length}\n` +
      `• Instructor messages: ${messages.filter((m) => m.role === "instructor").length}\n` +
      `• Executor messages: ${messages.filter((m) => m.role === "executor").length}\n` +
      `• Monitor/system messages: ${messages.filter((m) => m.role === "monitor" || m.role === "system").length}\n` +
      `• Questions asked: ${questionCount}\n` +
      `• Status updates: ${statusUpdateCount}\n` +
      `• Errors reported: ${errorCount}\n` +
      `• Instructor adaptations: ${adaptations}\n` +
      `• Duration: ${this._formatDuration(duration)}\n` +
      `• Security alerts: ${monitorAlerts.length}\n` +
      `• Tools used: ${toolsUsed.length > 0 ? toolsUsed.join(", ") : "none recorded"}\n` +
      `• Instructor model: ${instructorProfile.modelProvider}/${instructorProfile.modelId} (${instructorProfile.modelTier})\n` +
      `• Executor model: ${executorProfile.modelProvider}/${executorProfile.modelId} (${executorProfile.modelTier})`;

    // --- Alerts ---
    let alertsSection = `Alerts:\n`;
    if (monitorAlerts.length === 0) {
      alertsSection += "No security or compliance alerts were triggered during this session.";
    } else {
      alertsSection += `${monitorAlerts.length} alert(s) were triggered:\n`;
      alertsSection += monitorAlerts
        .map(
          (a, i) =>
            `${i + 1}. [${a.severity.toUpperCase()}] ${a.type.replace(/_/g, " ")}: ${a.message}` +
            (a.autoAction && a.autoAction !== "none" ? ` (Auto-action: ${a.autoAction})` : "")
        )
        .join("\n");
    }

    // --- Recommendations ---
    const recommendations: string[] = [];
    if (errorCount > 0) {
      recommendations.push(
        `Review the ${errorCount} error(s) reported by the executor and consider clarifying ` +
        `instructions or expanding the executor's tool access for future sessions.`
      );
    }
    if (monitorAlerts.some((a) => a.type === "scope_drift")) {
      recommendations.push(
        "Scope drift was detected. Consider refining the taskScope.objective and allowedActions " +
        "to be more precise, or provide the executor with clearer task boundaries upfront."
      );
    }
    if (monitorAlerts.some((a) => a.type === "injection_attempt")) {
      recommendations.push(
        "A prompt injection attempt was detected. Investigate the source agent and consider " +
        "lowering its trust score or revoking access if the attempt was intentional."
      );
    }
    if (duration > session.taskScope.maxDuration * 0.9) {
      recommendations.push(
        "This session consumed more than 90% of its allocated duration. Consider increasing " +
        "maxDuration or breaking the task into smaller sub-sessions."
      );
    }
    if (questionCount > 10) {
      recommendations.push(
        `The executor asked ${questionCount} clarifying questions. Providing more detailed ` +
        `initial instructions may reduce back-and-forth in future sessions.`
      );
    }
    if (recommendations.length === 0) {
      recommendations.push(
        "No specific recommendations. The session operated within all expected parameters."
      );
    }

    const recommendationsSection = `Recommendations:\n${recommendations.map((r, i) => `${i + 1}. ${r}`).join("\n")}`;

    // --- Assemble ---
    return [
      title,
      "",
      objectiveSection,
      "",
      whatHappenedSection,
      "",
      outcomeSection,
      "",
      metricsSection,
      "",
      alertsSection,
      "",
      recommendationsSection,
    ].join("\n");
  }

  /**
   * Formats a duration in milliseconds as a human-readable string.
   * E.g. 125000 → "2 min 5 sec"
   */
  private _formatDuration(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const parts: string[] = [];
    if (hours > 0) parts.push(`${hours} hr`);
    if (minutes > 0) parts.push(`${minutes} min`);
    if (seconds > 0 || parts.length === 0) parts.push(`${seconds} sec`);
    return parts.join(" ");
  }
}

// ---------------------------------------------------------------------------
// Helpers used outside the class (file-scope)
// ---------------------------------------------------------------------------

/**
 * Compares two threat levels by magnitude.
 * Returns negative if a < b, 0 if equal, positive if a > b.
 */
function levels_compare(
  a: "none" | "low" | "medium" | "high" | "critical",
  b: "none" | "low" | "medium" | "high" | "critical"
): number {
  const order = ["none", "low", "medium", "high", "critical"];
  return order.indexOf(a) - order.indexOf(b);
}

// ---------------------------------------------------------------------------
// Singleton Export
// ---------------------------------------------------------------------------

/**
 * Singleton NIPEngine instance.
 *
 * Import and use this throughout the application:
 *
 * ```typescript
 * import { nipEngine } from "./nipEngine.js";
 * ```
 */
export const nipEngine = new NIPEngine();
