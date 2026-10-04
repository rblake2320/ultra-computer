import { sqlite } from "./storage.js";
import type { QueuedTask } from "./taskQueue.js";

sqlite.exec(`CREATE TABLE IF NOT EXISTS execution_outbox (
  message_id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, user_message TEXT NOT NULL,
  estimated_duration TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending', created_at INTEGER NOT NULL
); CREATE INDEX IF NOT EXISTS idx_execution_outbox_state ON execution_outbox(state, created_at)`);

export function persistTaskAdmission(task: QueuedTask): void {
  sqlite.prepare("INSERT OR IGNORE INTO execution_outbox (message_id, conversation_id, user_message, estimated_duration, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(task.taskId, task.conversationId, task.userMessage, task.estimatedDuration, Date.now());
  const row = sqlite.prepare("SELECT conversation_id, user_message FROM execution_outbox WHERE message_id = ?").get(task.taskId) as { conversation_id: string; user_message: string };
  if (row.conversation_id !== task.conversationId || row.user_message !== task.userMessage) {
    throw new Error("Message admission identity conflicts with an existing request");
  }
}
export function unfinishedAdmissions(): QueuedTask[] {
  return sqlite.prepare("SELECT message_id AS taskId, conversation_id AS conversationId, user_message AS userMessage, estimated_duration AS estimatedDuration FROM execution_outbox WHERE state IN ('pending','queued') ORDER BY CASE state WHEN 'pending' THEN 0 ELSE 1 END, created_at LIMIT 100").all() as QueuedTask[];
}
export function updateAdmission(taskId: string, state: "queued" | "completed" | "failed"): void {
  sqlite.prepare("UPDATE execution_outbox SET state = ? WHERE message_id = ? AND state NOT IN ('completed','failed')").run(state, taskId);
}
export function admissionState(taskId: string): string | undefined {
  return (sqlite.prepare("SELECT state FROM execution_outbox WHERE message_id = ?").get(taskId) as { state: string } | undefined)?.state;
}
