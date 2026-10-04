import { describe, expect, it } from "vitest";
import { validateTaskPlan } from "../../server/taskPlan.js";
const task = (id: string, dependsOn: string[] = []) => ({ id, dependsOn, title: "Produce result", description: "Return arithmetic result", taskType: "analyze", parallel: false });
const plan = (tasks: unknown[]) => ({ thinking: "Dependencies first", tasks, skillIds: [] });
describe("task graph admission", () => {
  it("admits an ordered graph", () => expect(validateTaskPlan(plan([task("a"), task("b", ["a"])] )).tasks).toHaveLength(2));
  it.each([
    ["duplicate IDs", [task("a"), task("a")]],
    ["missing dependencies", [task("a", ["missing"])]],
    ["cycles", [task("a", ["b"]), task("b", ["a"])]],
    ["too many tasks", Array.from({ length: 9 }, (_, i) => task(String(i)))],
    ["duplicate dependencies", [task("a"), task("b", ["a", "a"])]],
    ["wrong fields", [{ ...task("a"), parallel: "true" }]],
  ])("rejects %s before execution", (_name, tasks) => expect(() => validateTaskPlan(plan(tasks))).toThrow());
});
