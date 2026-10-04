import { z } from "zod";

const task = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(16_000),
  taskType: z.enum(["research", "code", "write", "browse", "analyze", "general", "speed"]),
  dependsOn: z.array(z.string()).max(7),
  parallel: z.boolean(),
}).strict();
const plan = z.object({
  thinking: z.string().max(4000), tasks: z.array(task).min(1).max(8),
  skillIds: z.array(z.string().min(1).max(128)).max(32),
}).strict();

/** Provider constraints are only a formatting aid; this check owns admission. */
export function validateTaskPlan(input: unknown): z.infer<typeof plan> {
  const result = plan.parse(input);
  const byId = new Map(result.tasks.map(t => [t.id, t]));
  if (byId.size !== result.tasks.length) throw new Error("Duplicate task ID");
  const visiting = new Set<string>();
  const visited = new Set<string>();
  function visit(id: string): void {
    if (visiting.has(id)) throw new Error("Cyclic task dependencies");
    if (visited.has(id)) return;
    const current = byId.get(id);
    if (!current) throw new Error("Missing task dependency");
    if (new Set(current.dependsOn).size !== current.dependsOn.length) throw new Error("Duplicate dependency");
    visiting.add(id);
    current.dependsOn.forEach(visit);
    visiting.delete(id);
    visited.add(id);
  }
  result.tasks.forEach(t => visit(t.id));
  return result;
}

export const TASK_PLAN_FORMAT = {
  type: "json_schema" as const, name: "task_plan", strict: true,
  schema: {
    type: "object", additionalProperties: false, required: ["thinking", "tasks", "skillIds"],
    properties: {
      thinking: { type: "string", maxLength: 4000 },
      skillIds: { type: "array", maxItems: 32, items: { type: "string", minLength: 1, maxLength: 128 } },
      tasks: { type: "array", minItems: 1, maxItems: 8, items: {
        type: "object", additionalProperties: false,
        required: ["id", "title", "description", "taskType", "dependsOn", "parallel"],
        properties: {
          id: { type: "string", pattern: "^[A-Za-z0-9_-]{1,64}$" },
          title: { type: "string", minLength: 1, maxLength: 200 },
          description: { type: "string", minLength: 1, maxLength: 16000 },
          taskType: { type: "string", enum: ["research", "code", "write", "browse", "analyze", "general", "speed"] },
          dependsOn: { type: "array", maxItems: 7, items: { type: "string" } },
          parallel: { type: "boolean" },
        },
      } },
    },
  },
};
