import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
const dir = fs.mkdtempSync(path.resolve("data/model-enhancements-"));
process.env.DATABASE_PATH = path.join(dir, "proof.db");
process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString("hex");
process.env.ULTRA_LOCAL_EGRESS_ALLOWLIST = "127.0.0.1";
const { storage, sqlite } = await import("../server/storage.js");
const { chat, testModelConnection } = await import("../server/modelRouter.js");
const { TASK_PLAN_FORMAT, validateTaskPlan } = await import("../server/taskPlan.js");
const { privateTraceExporter } = await import("../server/telemetry.js");
const model = storage.createModel({ id: crypto.randomUUID(), name: "Local schema acceptance", provider: "ollama", modelId: process.env.E2E_OLLAMA_MODEL ?? "gemma3:270m", baseUrl: "http://127.0.0.1:11434/v1", authMethod: "none", capabilities: '["chat","structured-output"]' });
const results: unknown[] = [];
try {
  const probe = await testModelConnection(model.id);
  if (!probe.ok) throw new Error(`Local model probe failed: ${probe.error}`);
  storage.updateModel(model.id, { connectionStatus: "connected" });
  const response = await chat([
    { role: "system", content: "Return a JSON task plan matching the provided schema. Use exactly two tasks: t1 computes 2+2; t2 writes the result and depends on t1. Include thinking and an empty skillIds array." },
    { role: "user", content: "Compute 2 + 2 then write the result." },
  ], { modelId: model.id, taskType: "analyze", maxTokens: 1500, temperature: 0, responseFormat: TASK_PLAN_FORMAT, bypassCache: true });
  fs.writeFileSync(path.join(dir, "synthetic-provider-plan.json"), response.content);
  const plan = validateTaskPlan(JSON.parse(response.content));
  if (plan.tasks.length !== 2 || !plan.tasks.find(t => t.id === "t2")?.dependsOn.includes("t1")) throw new Error("Provider returned the wrong independent dependency contract");
  results.push({ scenario: "real-provider-constrained-task-plan", status: "Worked", model: model.modelId, tasks: plan.tasks.map(t => ({ id: t.id, dependsOn: t.dependsOn })) });
  const messages = [{ role: "user" as const, content: "Return the number four as the answer." }];
  const plain = await chat(messages, { modelId: model.id, maxTokens: 128, temperature: 0 });
  const typed = await chat(messages, { modelId: model.id, maxTokens: 128, temperature: 0, responseFormat: { type: "json_schema", name: "numeric_answer", strict: true, schema: { type: "object", additionalProperties: false, properties: { answer: { type: "integer", enum: [4] } }, required: ["answer"] } } });
  if (JSON.parse(typed.content).answer !== 4 || plain.content === typed.content) throw new Error("Response format cache contract failed");
  results.push({ scenario: "plain-and-schema-cache-isolation", status: "Worked", answer: 4 });
  // Real provider rejection exercises a failed span, rather than fabricating a span status.
  storage.updateModel(model.id, { modelId: "ultra-model-that-is-not-installed" });
  await chat(messages, { modelId: model.id, bypassCache: true }).then(() => { throw new Error("Expected missing-model rejection"); }, () => {});
  await new Promise(resolve => setTimeout(resolve, 20));
  const spans = privateTraceExporter.read() as { name: string; outcome: string }[];
  if (!spans.some(s => s.name === "model.generate" && s.outcome === "failed")) throw new Error("Real provider failure was not recorded");
  results.push({ scenario: "real-provider-failure-trace", status: "Worked", failedSpans: spans.filter(s => s.outcome === "failed").length });
} catch (error) {
  results.push({ scenario: "model-enhancements", status: "Failed", error: error instanceof Error ? error.message : String(error) });
  process.exitCode = 1;
} finally {
  fs.writeFileSync(path.join(dir, "receipt.json"), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
  sqlite.close();
}
