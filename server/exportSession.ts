import type { Express } from "express";
import { storage } from "./storage.js";
import type { Task, AgentRun, Message, Conversation } from "@shared/schema";

function formatDate(timestamp: number | null | undefined): string {
  if (!timestamp) return "unknown";
  return new Date(timestamp).toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
}

function formatDuration(startedAt: number | null | undefined, completedAt: number | null | undefined): string {
  if (!startedAt) return "—";
  const end = completedAt ?? Date.now();
  const ms = end - startedAt;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

function taskStatusIcon(status: string): string {
  switch (status) {
    case "complete":
    case "completed": return "✓";
    case "failed": return "✗";
    case "running": return "↻";
    case "cancelled": return "⊘";
    default: return "○";
  }
}

function buildTaskGraph(tasks: Task[]): string {
  if (tasks.length === 0) return "_No tasks recorded._\n";

  const lines: string[] = [];

  // Separate root tasks from child tasks
  const roots = tasks.filter(t => !t.parentTaskId);
  const children = tasks.filter(t => !!t.parentTaskId);
  const childMap = new Map<string, Task[]>();
  for (const c of children) {
    const arr = childMap.get(c.parentTaskId!) ?? [];
    arr.push(c);
    childMap.set(c.parentTaskId!, arr);
  }

  function renderTask(task: Task, indent = 0): void {
    const prefix = "  ".repeat(indent) + "- ";
    const icon = taskStatusIcon(task.status);
    const duration =
      task.startedAt
        ? ` _(${formatDuration(task.startedAt, task.completedAt ?? undefined)})_`
        : "";
    lines.push(`${prefix}[${icon} ${task.status}] **${task.title}** — ${task.taskType}${duration}`);
    if (task.description && task.description !== task.title) {
      lines.push(`${"  ".repeat(indent + 1)}_${task.description.slice(0, 200).replace(/\n/g, " ")}_`);
    }
    const kids = childMap.get(task.id) ?? [];
    for (const k of kids) renderTask(k, indent + 1);
  }

  for (const root of roots) renderTask(root);
  // Orphaned children (parent deleted)
  for (const c of children) {
    if (!tasks.find(t => t.id === c.parentTaskId)) renderTask(c);
  }

  return lines.join("\n") + "\n";
}

function buildConversationSection(messages: Message[]): string {
  if (messages.length === 0) return "_No messages._\n";

  const parts: string[] = [];

  for (const msg of messages) {
    const roleLabel =
      msg.role === "user"
        ? "### User"
        : msg.role === "assistant"
        ? `### Assistant${msg.modelId ? ` _(model: ${msg.modelId})_` : ""}`
        : msg.role === "system"
        ? "### System"
        : msg.role === "tool"
        ? `### Tool Result${msg.taskId ? ` _(task: ${msg.taskId})_` : ""}`
        : `### ${msg.role.charAt(0).toUpperCase() + msg.role.slice(1)}`;

    const timestamp = `<sub>${formatDate(msg.createdAt)}</sub>`;
    parts.push(`${roleLabel} ${timestamp}\n\n${msg.content}`);
  }

  return parts.join("\n\n---\n\n") + "\n";
}

function buildAgentRunsSection(runs: AgentRun[], tasks: Task[]): string {
  if (runs.length === 0) return "_No agent runs recorded._\n";

  const taskMap = new Map(tasks.map(t => [t.id, t]));
  const parts: string[] = [];

  for (const run of runs) {
    const task = taskMap.get(run.taskId);
    const taskTitle = task?.title ?? run.taskId;
    const duration = formatDuration(run.startedAt, run.completedAt ?? undefined);

    let tokenUsage: { prompt?: number; completion?: number; total?: number } = {};
    try {
      tokenUsage = JSON.parse(run.tokenUsage || "{}");
    } catch {
      tokenUsage = {};
    }

    const tokenStr =
      tokenUsage.total != null
        ? `Prompt: ${tokenUsage.prompt ?? 0} | Completion: ${tokenUsage.completion ?? 0} | Total: ${tokenUsage.total}`
        : "No token data";

    const header = [
      `### Agent Run \`${run.id.slice(0, 8)}\` — Task: _${taskTitle}_`,
      `**Model:** \`${run.modelId}\` | **Status:** ${run.status} | **Duration:** ${duration} | **Level:** ${run.level}`,
      `**Tokens:** ${tokenStr}`,
    ].join("\n");

    const outputSection = run.output
      ? `\n**Output:**\n\n${run.output}`
      : "\n_No output recorded._";

    parts.push(`${header}${outputSection}`);
  }

  return parts.join("\n\n---\n\n") + "\n";
}

export function registerExportRoutes(app: Express): void {
  /**
   * GET /api/conversations/:id/export
   * Exports a conversation (session) as a well-formatted markdown document.
   * Sets Content-Type to text/markdown and Content-Disposition for download.
   */
  app.get("/api/conversations/:id/export", (req, res) => {
    const { id } = req.params;

    const conversation: Conversation | undefined = storage.getConversation(id);
    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    const messages = storage.getMessages(id);
    const tasks = storage.getTasks(id);
    const agentRuns = storage.getAgentRuns(id);

    const createdDate = formatDate(conversation.createdAt);
    const updatedDate = formatDate(conversation.updatedAt);
    const model = conversation.orchestratorModelId ?? "not configured";

    // ─── Build markdown document ───────────────────────────────────────────────
    const doc = [
      `# Session: ${conversation.title}`,
      "",
      `> **Created:** ${createdDate}  `,
      `> **Last Updated:** ${updatedDate}  `,
      `> **Status:** ${conversation.status}  `,
      `> **Orchestrator Model:** \`${model}\`  `,
      `> **Message Count:** ${messages.length}  `,
      `> **Task Count:** ${tasks.length}  `,
      "",
      "---",
      "",
      "## Task Graph",
      "",
      buildTaskGraph(tasks),
      "",
      "---",
      "",
      "## Conversation",
      "",
      buildConversationSection(messages),
      "",
      "---",
      "",
      "## Agent Runs",
      "",
      buildAgentRunsSection(agentRuns, tasks),
      "",
      "---",
      "",
      `_Exported from Ultra Computer on ${formatDate(Date.now())}_`,
    ].join("\n");

    // Sanitize filename
    const safeTitle = conversation.title
      .replace(/[^a-z0-9\-_ ]/gi, "")
      .replace(/\s+/g, "_")
      .slice(0, 60);
    const filename = `session_${safeTitle || id.slice(0, 8)}_${Date.now()}.md`;

    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(doc);
  });
}
