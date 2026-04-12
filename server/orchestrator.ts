/**
 * Ultra Computer Orchestrator
 * Layer 1: Intent Parsing & Task Decomposition (DAG)
 * Layer 3: Sub-Agent Spawning & Execution (2-level hierarchy)
 * Layer 5: Memory read/write (orchestrator-only)
 *
 * Architectural invariants enforced:
 * - Two-level max (level 0 = orchestrator, level 1 = workers)
 * - Workers are stateless — context injected at spawn time
 * - Filesystem-based IPC for large payloads
 * - Parallel execution via Promise.all on independent DAG nodes
 */

import { v4 as uuidv4 } from "uuid";
import fs from "fs";
import path from "path";
import { storage } from "./storage.js";
import { chat, chatStream, selectModelForTask, type ChatMessage, type TaskType } from "./modelRouter.js";
import { skillMatcher } from "./skillSystem.js";
import { memoryManager } from "./memoryManager.js";
import { TOOL_SCHEMAS, executeTool, dockerSandbox, type ToolResult } from "./tools.js";
import { compactContext } from "./contextCompactor.js";
import { detectChain, buildChainPlan } from "./skillChaining.js";
import { withRetryAndFallback } from "./errorRecovery.js";
import { analyzeTaskComplexity, routeToOptimalModel } from "./modelSpeedRouter.js";
import { logExecution } from "./selfLearning.js";
import { knowledgeEngine } from "./knowledgeEngine.js";
import { swarmEngine } from "./swarmEngine.js";
import type { Task } from "@shared/schema";

// IPC directory for filesystem-based inter-agent communication
const IPC_DIR = path.join(process.cwd(), "ipc");
try {
  if (!fs.existsSync(IPC_DIR)) fs.mkdirSync(IPC_DIR, { recursive: true });
} catch (err) {
  console.error("[orchestrator] Failed to create IPC directory:", err);
}

// SSE event emitter — wires to Express SSE endpoints
type SSECallback = (event: OrchestratorEvent) => void;
const sseListeners = new Map<string, SSECallback[]>();

export function subscribeToConversation(conversationId: string, cb: SSECallback) {
  if (!sseListeners.has(conversationId)) sseListeners.set(conversationId, []);
  sseListeners.get(conversationId)!.push(cb);
}
export function unsubscribeFromConversation(conversationId: string, cb: SSECallback) {
  const list = sseListeners.get(conversationId) || [];
  const filtered = list.filter(l => l !== cb);
  if (filtered.length === 0) {
    sseListeners.delete(conversationId); // clean up empty listener arrays
  } else {
    sseListeners.set(conversationId, filtered);
  }
}
function emit(conversationId: string, event: OrchestratorEvent) {
  for (const cb of sseListeners.get(conversationId) || []) cb(event);
}

export type OrchestratorEvent =
  | { type: "status"; status: string; message?: string }
  | { type: "plan"; tasks: PlanTask[] }
  | { type: "task_update"; task: Task }
  | { type: "agent_token"; taskId: string; token: string; agentRunId: string }
  | { type: "agent_complete"; taskId: string; result: string; agentRunId: string; tokenCount?: number }
  | { type: "tool_call"; taskId: string; agentRunId: string; toolName: string; args: Record<string, string>; callId: string }
  | { type: "tool_result"; taskId: string; agentRunId: string; toolName: string; result: ToolResult; callId: string }
  | { type: "message"; role: string; content: string; messageId: string }
  | { type: "memory_update"; summary: string }
  | { type: "done"; summary: string }
  | { type: "error"; error: string };

interface PlanTask {
  id: string;
  title: string;
  description: string;
  taskType: TaskType;
  dependsOn: string[];
  parallel: boolean;
}

interface TaskPlan {
  thinking: string;
  tasks: PlanTask[];
  skillIds: string[];
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────
export async function runOrchestrator(conversationId: string, userMessage: string) {
  const conv = storage.getConversation(conversationId);
  if (!conv) throw new Error("Conversation not found");

  storage.updateConversation(conversationId, { status: "planning" });
  emit(conversationId, { type: "status", status: "planning", message: "Analyzing your request..." });

  try {
    // 1. Recall relevant memory
    const memories = memoryManager.recallForPrompt(userMessage);
    emit(conversationId, { type: "status", status: "planning", message: "Loading memory context..." });

    // 2. Match skills
    const matchedSkills = skillMatcher.matchSkills(userMessage);
    const skillContext = matchedSkills.map(s => `### Skill: ${s.name}\n${s.content}`).join("\n\n");
    matchedSkills.forEach(s => storage.incrementSkillUsage(s.id));

    // 3. Get orchestrator model
    const orchModel = storage.getOrchestratorModel() || storage.getDefaultModel();
    if (!orchModel) {
      throw new Error("No model configured. Please add a model in the Models page first.");
    }

    // 4. Check for swarm mode — triggered by "swarm:" prefix or swarm-related keywords
    const isSwarmMode = userMessage.toLowerCase().startsWith("swarm:") ||
      (userMessage.toLowerCase().includes("use swarm") && userMessage.toLowerCase().includes("agents"));

    if (isSwarmMode) {
      console.log(`[orchestrator] Swarm mode detected for conversation ${conversationId}`);
      emit(conversationId, { type: "status", status: "running", message: "Running in swarm mode..." });

      // Strip the swarm: prefix if present
      const swarmPrompt = userMessage.replace(/^swarm:\s*/i, "");

      // Create a swarm session, add default agents, decompose tasks, and run
      const swarm = swarmEngine.createSwarm({
        name: `Session ${conversationId.slice(0, 8)}`,
        description: swarmPrompt.slice(0, 200),
        conversationId,
        defaultModelId: orchModel.id,
        mode: "collaborative",
        enableRoleNegotiation: true,
        enableDeadlockDetection: true,
        enableDynamicSpawning: true,
        enableStigmergy: true,
        enableHandoffs: true,
        consensusStrategy: "weighted_majority",
      });

      const swarmId = swarm.config.id;

      // Add a research agent, analyst, and writer by default
      swarmEngine.addAgent(swarmId, {
        name: "Researcher",
        role: "research",
        instructions: "You are a thorough research agent. Find information, verify facts, and compile data.",
        modelId: orchModel.id,
        tools: ["search_web", "fetch_url", "read_file", "write_file"],
        canSpawn: true,
        capabilityProfile: { speed: 0.6, accuracy: 0.8, cost: 0.5, specialties: ["research", "data-gathering", "fact-checking"] },
      });
      swarmEngine.addAgent(swarmId, {
        name: "Analyst",
        role: "analysis",
        instructions: "You are an analytical agent. Examine data, identify patterns, and draw conclusions.",
        modelId: orchModel.id,
        tools: ["calculator", "bash", "read_file", "write_file"],
        canSpawn: true,
        capabilityProfile: { speed: 0.5, accuracy: 0.9, cost: 0.6, specialties: ["analysis", "patterns", "data-science"] },
      });
      swarmEngine.addAgent(swarmId, {
        name: "Writer",
        role: "writing",
        instructions: "You are a skilled writer. Produce clear, well-structured, comprehensive output.",
        modelId: orchModel.id,
        tools: ["write_file", "read_file"],
        canSpawn: false,
        capabilityProfile: { speed: 0.7, accuracy: 0.7, cost: 0.4, specialties: ["writing", "synthesis", "formatting"] },
      });

      // Add the main task with high priority for stigmergy
      swarmEngine.addTask(swarmId, {
        description: swarmPrompt,
        priority: 80,
        taskType: "general",
      });

      // Run the swarm (auto-assigns tasks via Contract Net Protocol, runs deadlock detection)
      const swarmResults = await swarmEngine.runSwarm(swarmId);

      // Synthesize results from all completed tasks
      const allResults = Array.from(swarmResults.values()).filter(Boolean);
      const finalResponse = allResults.length === 1
        ? allResults[0]
        : allResults.length === 0
          ? "The swarm completed but produced no results."
          : allResults.join("\n\n---\n\n");

      // Save assistant message
      const msgId = uuidv4();
      storage.createMessage({
        id: msgId,
        conversationId,
        role: "assistant",
        content: finalResponse,
        modelId: orchModel.id,
        metadata: JSON.stringify({ swarmId, mode: "swarm", stats: swarmEngine.getStats(swarmId) }),
      });
      emit(conversationId, { type: "message", role: "assistant", content: finalResponse, messageId: msgId });

      await memoryManager.extractAndStore(userMessage, finalResponse, conversationId);
      emit(conversationId, { type: "memory_update", summary: "Memory updated with swarm session context." });

      storage.updateConversation(conversationId, { status: "idle" });
      emit(conversationId, { type: "done", summary: `Swarm completed with ${swarmResults.size} result(s).` });
      return;
    }

    // 4. Decompose into task graph (check for skill chain shortcut first)
    let plan;
    const skillList = storage.getSkills();
    const detectedChain = detectChain(userMessage, skillList);
    if (detectedChain) {
      console.log(`[orchestrator] Skill chain detected: ${detectedChain.name}`);
      const chainTasks = buildChainPlan(detectedChain, userMessage);
      // Cast taskType from string to TaskType since the chain uses string literals that
      // match valid TaskType values (research, code, write, analyze, general).
      plan = {
        thinking: `Using skill chain: ${detectedChain.name}`,
        tasks: chainTasks.map(t => ({ ...t, taskType: t.taskType as TaskType })),
        skillIds: [],
      } as TaskPlan;
    } else {
      plan = await decomposeIntoDAG(userMessage, memories, skillContext, orchModel.id, conversationId);
    }
    emit(conversationId, { type: "plan", tasks: plan.tasks });

    // 5. Guard against empty task list (LLM returned 0 tasks)
    if (!plan.tasks || plan.tasks.length === 0) {
      plan.tasks = [{
        id: "t1",
        title: "Execute request",
        description: userMessage,
        taskType: "general",
        dependsOn: [],
        parallel: false,
      }];
    }

    // Persist tasks to DB
    const taskMap = new Map<string, string>(); // planId → dbTaskId
    for (const pt of plan.tasks) {
      const dbId = uuidv4();
      taskMap.set(pt.id, dbId);
      const resolvedDeps = pt.dependsOn.map(d => taskMap.get(d) || d).filter(Boolean);
      // Use modelSpeedRouter to pick the optimal model for this task
      let assignedModelId = orchModel.id;
      try {
        const allModels = storage.getModels();
        const complexity = analyzeTaskComplexity(pt.description, pt.taskType);
        const routing = routeToOptimalModel(complexity, allModels);
        assignedModelId = routing.modelId;
        console.log(`[orchestrator] Task "${pt.title}" → model ${routing.modelId}: ${routing.reason}`);
      } catch {
        // Fall back to default model selection
        assignedModelId = selectModelForTask(pt.taskType as TaskType)?.id || orchModel.id;
      }

      const t = storage.createTask({
        id: dbId,
        conversationId,
        parentTaskId: null,
        title: pt.title,
        description: pt.description,
        taskType: pt.taskType,
        status: "pending",
        dependsOn: JSON.stringify(resolvedDeps),
        assignedModelId,
      });
      emit(conversationId, { type: "task_update", task: t });
    }

    storage.updateConversation(conversationId, { status: "running", activeSkillIds: JSON.stringify(matchedSkills.map(s => s.id)) });
    emit(conversationId, { type: "status", status: "running", message: "Executing task graph..." });

    // 6. Execute DAG with parallel scheduling
    const allDbTasks = storage.getTasks(conversationId);
    const results = await executeDAG(allDbTasks, conversationId, memories, skillContext);

    // 7. Synthesize final response
    emit(conversationId, { type: "status", status: "synthesizing", message: "Synthesizing results..." });
    const finalResponse = await synthesizeResults(
      userMessage,
      results,
      memories,
      matchedSkills.map(s => s.name),
      orchModel.id,
      conversationId
    );

    // 7b. Mark synthesis agent as complete
    emit(conversationId, { type: "agent_complete", agentRunId: "synthesis", tokenCount: finalResponse.length });

    // 8. Save assistant message
    const msgId = uuidv4();
    storage.createMessage({
      id: msgId,
      conversationId,
      role: "assistant",
      content: finalResponse,
      modelId: orchModel.id,
      metadata: JSON.stringify({ skillIds: matchedSkills.map(s => s.id) }),
    });
    emit(conversationId, { type: "message", role: "assistant", content: finalResponse, messageId: msgId });

    // 9. Update memory with this exchange
    await memoryManager.extractAndStore(userMessage, finalResponse, conversationId);
    emit(conversationId, { type: "memory_update", summary: "Memory updated with session context." });

    storage.updateConversation(conversationId, { status: "idle" });
    emit(conversationId, { type: "done", summary: `Completed ${plan.tasks.length} task(s).` });

  } catch (err: any) {
    storage.updateConversation(conversationId, { status: "error" });
    emit(conversationId, { type: "error", error: err.message || "Unknown error" });
    throw err;
  }
}

// ─── Step 1: DAG Decomposition ────────────────────────────────────────────────
async function decomposeIntoDAG(
  userMessage: string,
  memories: string,
  skillContext: string,
  modelId: string,
  conversationId: string
): Promise<TaskPlan> {
  const systemPrompt = `You are Ultra Computer's orchestration planning engine.
Your job is to decompose a user request into a structured parallel task graph (DAG).

Rules:
1. Identify tasks that can run in parallel vs must run sequentially
2. Assign each task a type: research | code | write | browse | analyze | general | speed
3. Specify dependencies using task IDs (tasks must complete before dependents start)
4. Keep tasks focused and atomic — one output per task
5. Maximum 8 tasks for a single request
6. Output ONLY valid JSON, no markdown fences

Output format:
{
  "thinking": "brief reasoning about decomposition",
  "tasks": [
    {
      "id": "t1",
      "title": "Short task title",
      "description": "What this task must produce",
      "taskType": "research",
      "dependsOn": [],
      "parallel": true
    }
  ],
  "skillIds": []
}

${memories ? `\nUser memory context:\n${memories}` : ""}
${skillContext ? `\nActive skills:\n${skillContext}` : ""}`;

  const msgs: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: `Decompose this request into a task graph:\n\n${userMessage}` },
  ];

  const { result: response } = await withRetryAndFallback(
    (mid) => chat(msgs, { modelId: mid, taskType: "analyze", maxTokens: 2000, temperature: 0.2 }),
    modelId
  );

  try {
    // Extract JSON from response
    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found in orchestrator response");
    return JSON.parse(jsonMatch[0]) as TaskPlan;
  } catch {
    // Fallback: single task
    return {
      thinking: "Fallback: single task execution",
      tasks: [{
        id: "t1",
        title: "Execute request",
        description: userMessage,
        taskType: "general",
        dependsOn: [],
        parallel: false,
      }],
      skillIds: [],
    };
  }
}

// ─── Step 2: DAG Executor ─────────────────────────────────────────────────────
async function executeDAG(
  allTasks: Task[],
  conversationId: string,
  memories: string,
  skillContext: string
): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  const completed = new Set<string>();
  const running = new Set<string>();
  const pending = new Set(allTasks.map(t => t.id));

  const maxIterationsConfig = storage.getSetting("max_dag_iterations");
  const maxIterations = maxIterationsConfig ? parseInt(maxIterationsConfig, 10) || 20 : 20;
  let iter = 0;

  while (pending.size > 0 && iter < maxIterations) {
    iter++;

    // Find tasks whose dependencies are all complete
    const ready = allTasks.filter(t => {
      if (!pending.has(t.id) || running.has(t.id)) return false;
      let deps: string[] = [];
      try { deps = JSON.parse(t.dependsOn) as string[]; } catch { deps = []; }
      return deps.every(dep => completed.has(dep));
    });

    if (ready.length === 0) {
      // Deadlock or all running — wait for a running task
      if (running.size > 0) {
        await new Promise(r => setTimeout(r, 200));
        continue;
      }
      break;
    }

    // Spawn all ready tasks in parallel
    const executions = ready.map(async (task) => {
      running.add(task.id);
      pending.delete(task.id);

      storage.updateTask(task.id, { status: "running", startedAt: Date.now() });
      const runningTask = storage.getTask(task.id);
      if (runningTask) emit(conversationId, { type: "task_update", task: runningTask });

      try {
        const depContext = buildDependencyContext(task, results);
        const result = await runWorkerAgent(task, conversationId, memories, skillContext, depContext);
        results.set(task.id, result);

        storage.updateTask(task.id, { status: "complete", result, completedAt: Date.now() });
        const completedTask = storage.getTask(task.id);
        if (completedTask) emit(conversationId, { type: "task_update", task: completedTask });

        completed.add(task.id);
        running.delete(task.id);
      } catch (err: any) {
        storage.updateTask(task.id, { status: "failed", error: err.message, completedAt: Date.now() });
        const failedTask = storage.getTask(task.id);
        if (failedTask) emit(conversationId, { type: "task_update", task: failedTask });
        results.set(task.id, `[FAILED: ${err.message}]`);
        completed.add(task.id);
        running.delete(task.id);
      }
    });

    await Promise.all(executions);
  }

  return results;
}

function buildDependencyContext(task: Task, results: Map<string, string>): string {
  let deps: string[] = [];
  try { deps = JSON.parse(task.dependsOn); } catch { deps = []; }
  if (deps.length === 0) return "";
  const parts = deps.map(depId => {
    const r = results.get(depId);
    return r ? `[Upstream task result]:\n${r}` : "";
  }).filter(Boolean);
  return parts.length > 0 ? `\nContext from completed upstream tasks:\n${parts.join("\n\n")}` : "";
}

// ─── Worker Agent (Level 1 — Stateless, with Tool-Calling Loop) ──────────────
// The agent iterates: LLM → detect tool calls → execute tools → feed results back → repeat.
// Stops when the LLM returns a final answer with no tool calls, or after MAX_TOOL_ITERATIONS.

// Configurable via settings — default 10
function getMaxToolIterations(): number {
  const val = storage.getSetting("max_tool_iterations");
  return val ? parseInt(val, 10) || 10 : 10;
}

async function runWorkerAgent(
  task: Task,
  conversationId: string,
  memories: string,
  skillContext: string,
  depContext: string
): Promise<string> {
  const agentRunId = uuidv4();
  const ipcPath = path.join(IPC_DIR, `${agentRunId}.json`);
  const toolCallLog: Array<{ callId: string; tool: string; args: Record<string, string>; result: ToolResult }> = [];

  // Use modelSpeedRouter to find the optimal model for this task's complexity
  let model = task.assignedModelId
    ? (storage.getModel(task.assignedModelId) || selectModelForTask(task.taskType as TaskType))
    : selectModelForTask(task.taskType as TaskType);

  // Override with speed-router if multiple models available and no explicit assignment
  if (!task.assignedModelId) {
    const allEnabledModels = storage.getModels().filter(m => m.enabled);
    if (allEnabledModels.length > 1) {
      try {
        const complexity = analyzeTaskComplexity(task.description, task.taskType);
        const routingDecision = routeToOptimalModel(complexity, allEnabledModels);
        const routedModel = storage.getModel(routingDecision.modelId);
        if (routedModel) {
          model = routedModel;
          console.log(`[orchestrator] Task '${task.title}' routed to ${routedModel.name} — ${routingDecision.reason}`);
        }
      } catch { /* fallback to selectModelForTask result */ }
    }
  }

  if (!model) throw new Error("No model available for task");

  // Inject knowledge base context based on model speed tier
  const speedTier = (model.speedTier || "medium") as "fast" | "medium" | "powerful";
  const contextWindow = model.contextWindow || 8192;
  const kbResult = knowledgeEngine.buildContext(speedTier, contextWindow, task.description);
  if (kbResult.includedEntries.length > 0) {
    console.log(`[orchestrator] KB injected ${kbResult.includedEntries.length} entries (~${kbResult.tokenEstimate} tokens) for ${model.name} [${speedTier}]`);
  }

  const systemPrompt = buildWorkerSystemPrompt(task, skillContext, kbResult.contextBlock);
  const inputContext = buildWorkerInputContext(task, memories, depContext);

  storage.createAgentRun({
    id: agentRunId,
    taskId: task.id,
    conversationId,
    level: 1,
    modelId: model.id,
    systemPrompt,
    inputContext,
    ipcPath,
    status: "running",
  });

  const agentRunStart = Date.now();

  // Write input to IPC file (filesystem-based IPC) — async to avoid blocking event loop
  fs.promises.writeFile(ipcPath, JSON.stringify({
    taskId: task.id,
    agentRunId,
    input: inputContext,
    toolCalls: [],
    status: "started",
    startedAt: agentRunStart,
  })).catch(err => console.error("[orchestrator] IPC write error:", err));

  // Build the conversation history for the tool-calling loop
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: inputContext },
  ];

  let finalOutput = "";
  let iteration = 0;
  // Accumulate token usage across all LLM iterations
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  const MAX_TOOL_ITERATIONS = getMaxToolIterations();

  while (iteration < MAX_TOOL_ITERATIONS) {
    iteration++;

    // Context compaction: keep conversation within model context window budget
    const contextWindowTokens = (model.contextWindow || 8192);
    const contextBudget = Math.max(2000, contextWindowTokens - 2000); // reserve 2000 for response
    const tokenEstimate = messages.reduce((sum, m) => sum + Math.ceil(m.content.length / 4) + 4, 0);
    let workingMessages = messages;
    if (tokenEstimate > contextBudget && messages.length > 3) {
      try {
        const { compactedMessages } = await compactContext(messages, contextBudget, model.id);
        workingMessages = compactedMessages;
      } catch { /* use original messages if compaction fails */ }
    }

    // Call LLM with error recovery (retry + model fallback)
    let llmResponse = "";
    let usedModelId = model.id;
    try {
      const streamResult = await withRetryAndFallback(
        async (mid) => {
          let resp = "";
          for await (const token of chatStream(workingMessages, {
            modelId: mid,
            taskType: task.taskType as TaskType,
            maxTokens: 4096,
          })) {
            resp += token;
            emit(conversationId, { type: "agent_token", taskId: task.id, token, agentRunId });
          }
          return resp;
        },
        model.id
      );
      llmResponse = streamResult.result;
      usedModelId = streamResult.usedModelId;
      // Estimate token usage for this iteration (approx 4 chars per token)
      const promptChars = workingMessages.reduce((s, m) => s + m.content.length, 0);
      totalPromptTokens += Math.ceil(promptChars / 4);
      totalCompletionTokens += Math.ceil(llmResponse.length / 4);
    } catch (llmErr: any) {
      // All retries + fallbacks exhausted
      llmResponse = `[LLM call failed after retries: ${llmErr.message}]`;
      break;
    }

    // Parse tool calls from the response
    const parsedCalls = parseToolCalls(llmResponse);

    if (parsedCalls.length === 0) {
      // No tool calls detected — this is the final answer
      finalOutput = llmResponse;
      break;
    }

    // Execute each tool call and collect results
    const toolResultParts: string[] = [];

    for (const call of parsedCalls) {
      const callId = uuidv4().slice(0, 8);

      // Emit tool call event to UI
      emit(conversationId, {
        type: "tool_call",
        taskId: task.id,
        agentRunId,
        toolName: call.name,
        args: call.args,
        callId,
      });

      // Execute the tool — pass sessionId explicitly for container isolation
      const result = await executeTool(call.name, call.args, agentRunId);

      // Emit tool result event to UI
      emit(conversationId, {
        type: "tool_result",
        taskId: task.id,
        agentRunId,
        toolName: call.name,
        result,
        callId,
      });

      toolCallLog.push({ callId, tool: call.name, args: call.args, result });

      // Format result for the LLM
      const statusIcon = result.success ? "✓" : "✗";
      toolResultParts.push(
        `[Tool: ${call.name}] ${statusIcon} (${result.durationMs}ms)\n` +
        (result.error ? `Error: ${result.error}\n` : "") +
        result.output.slice(0, 15_000) +
        (result.artifacts?.length ? `\nArtifacts: ${result.artifacts.map(a => a.path).join(", ")}` : "")
      );
    }

    // Append the assistant's response (with tool calls) and tool results to conversation
    messages.push({ role: "assistant", content: llmResponse });
    messages.push({
      role: "user",
      content: `Tool execution results:\n\n${toolResultParts.join("\n\n---\n\n")}\n\nContinue working on the task. If you need more tools, call them. If you're done, provide your final answer.`,
    });

    // Compact context if history grows too large (>20 messages or >50k chars)
    const totalChars = messages.reduce((sum, m) => sum + m.content.length, 0);
    if (messages.length > 20 || totalChars > 50_000) {
      try {
        const compacted = await compactContext(messages, 12_000, model.id);
        messages.length = 0;
        messages.push(...compacted.compactedMessages);
        console.log(`[orchestrator] Context compacted: ${compacted.originalTokenEstimate} → ${compacted.compactedTokenEstimate} tokens (${(compacted.compressionRatio * 100).toFixed(0)}%)`);
      } catch (compactErr) {
        // Non-critical — continue without compaction
      }
    }
  }

  // If we exhausted iterations without a clean finish, use the last response
  if (!finalOutput) {
    finalOutput = messages.filter(m => m.role === "assistant").pop()?.content || "[Agent reached max iterations]";
  }

  // Write final IPC file — async to avoid blocking event loop
  fs.promises.writeFile(ipcPath, JSON.stringify({
    taskId: task.id,
    agentRunId,
    input: inputContext,
    output: finalOutput,
    toolCalls: toolCallLog,
    status: "complete",
    completedAt: Date.now(),
  })).catch(err => console.error("[orchestrator] IPC write error:", err));

  const totalTokens = totalPromptTokens + totalCompletionTokens;
  const tokenUsageJson = JSON.stringify({
    prompt: totalPromptTokens,
    completion: totalCompletionTokens,
    total: totalTokens,
  });

  storage.updateAgentRun(agentRunId, {
    output: finalOutput,
    toolCalls: JSON.stringify(toolCallLog),
    status: "complete",
    completedAt: Date.now(),
    tokenUsage: tokenUsageJson,
  });

  // Log execution for self-learning / continuous improvement
  const outcome = (finalOutput.includes("[FAILED:") || finalOutput.includes("[LLM call failed"))
    ? "failure"
    : "success";
  logExecution({
    conversationId,
    taskType: task.taskType ?? "general",
    taskDescription: task.description,
    skillsUsed: [],
    modelUsed: model.id,
    outcome,
    durationMs: Date.now() - agentRunStart,
    retryCount: 0,
    inputTokenEstimate: totalPromptTokens,
    outputTokenEstimate: totalCompletionTokens,
    toolCallCount: toolCallLog.length,
  });

  emit(conversationId, {
    type: "agent_complete",
    taskId: task.id,
    result: finalOutput,
    agentRunId,
    tokenCount: totalTokens,
  });

  // Clean up Docker container for this agent session
  dockerSandbox.removeContainer(agentRunId).catch(() => {});

  return finalOutput;
}

// ─── Parse tool calls from LLM output ─────────────────────────────────────────
// The LLM uses a structured format:
//   <tool_call>
//   {"name": "bash", "args": {"command": "ls -la"}}
//   </tool_call>
// Multiple tool calls can appear in a single response.

interface ParsedToolCall {
  name: string;
  args: Record<string, string>;
}

function parseToolCalls(text: string): ParsedToolCall[] {
  const calls: ParsedToolCall[] = [];

  // Pattern 1: <tool_call>JSON</tool_call>
  const xmlPattern = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g;
  let match;
  while ((match = xmlPattern.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (parsed.name && parsed.args) {
        calls.push({ name: parsed.name, args: parsed.args });
      }
    } catch { /* skip malformed */ }
  }

  // Pattern 2: ```tool_call\nJSON\n```
  const fencePattern = /```tool_call\s*\n([\s\S]*?)\n\s*```/g;
  while ((match = fencePattern.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (parsed.name && parsed.args) {
        calls.push({ name: parsed.name, args: parsed.args });
      }
    } catch { /* skip malformed */ }
  }

  // Pattern 3: TOOL_CALL: {"name": ..., "args": ...}
  const linePattern = /TOOL_CALL:\s*(\{[\s\S]*?\})(?:\n|$)/g;
  while ((match = linePattern.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (parsed.name && parsed.args) {
        calls.push({ name: parsed.name, args: parsed.args });
      }
    } catch { /* skip malformed */ }
  }

  return calls;
}

function buildWorkerSystemPrompt(task: Task, skillContext: string, knowledgeContext?: string): string {
  const toolList = TOOL_SCHEMAS.map(t => `- **${t.name}**: ${t.description}`).join("\n");
  const toolSchemaBlock = TOOL_SCHEMAS.map(t =>
    `${t.name}: parameters = ${JSON.stringify(t.parameters.properties)}, required = [${t.parameters.required.join(", ")}]`
  ).join("\n");

  // Load relevant saved scripts from the library
  const savedScripts = storage.getSkillScripts().filter(s => s.usageCount > 0 || s.isFavorite);
  const scriptLibraryContext = savedScripts.length > 0
    ? `\n## Saved Scripts Library\nYou have access to pre-saved scripts from the library. You can use these directly with bash or write_file instead of writing from scratch:\n\n${savedScripts.slice(0, 10).map(s => `### ${s.name} (${s.language})\n\`\`\`${s.language}\n${s.content.slice(0, 500)}${s.content.length > 500 ? '\n... (truncated)' : ''}\n\`\`\``).join("\n\n")}`
    : "";

  // Knowledge base context — injected as a stable prefix for cache reuse
  const kbBlock = knowledgeContext ? `\n${knowledgeContext}\n` : "";

  return `You are a specialized worker agent in the Ultra Computer system.
Your single responsibility: complete the assigned task and produce a focused, high-quality result.

Task type: ${task.taskType}
Task title: ${task.title}

## Available Tools
You have access to real tools that execute in a Linux sandbox. Use them to ACT, not just reason.

${toolList}

## How to Call Tools
To use a tool, include a tool_call block in your response:

<tool_call>
{"name": "tool_name", "args": {"param1": "value1", "param2": "value2"}}
</tool_call>

You can make multiple tool calls in a single response. After each round of tool execution, you will receive the results and can continue working.

## Tool Schemas
${toolSchemaBlock}

## Rules
- You are STATELESS. You only have the context provided to you — no memory, no history.
- Do NOT ask clarifying questions. Execute the task fully.
- USE TOOLS when the task involves: running code, fetching URLs, writing files, doing math, or any action that benefits from real execution rather than just reasoning.
- For code tasks: write the code to a file with write_file, then execute it with bash.
- For research tasks: use fetch_url to read real web pages and extract data.
- Be thorough and produce production-quality output.
- When you are finished and have your final answer, respond WITHOUT any <tool_call> blocks.

${skillContext ? `Active skills to follow:\n${skillContext}` : ""}${scriptLibraryContext}${kbBlock}`;
}

function buildWorkerInputContext(task: Task, memories: string, depContext: string): string {
  return `## Task
${task.description}

${memories ? `## Relevant user context (from memory)\n${memories}\n` : ""}
${depContext ? `${depContext}\n` : ""}
## Instructions
Complete this task fully. Use the available tools whenever they would produce a better result than pure reasoning:
- **bash**: run scripts, install packages, execute code
- **write_file** / **read_file** / **list_files** / **search_files**: sandbox file I/O
- **fetch_url**: read a specific URL (HTML, JSON, etc.)
- **search_web**: search the web for current information via DuckDuckGo
- **browse_url** / **browser_action**: headless browser for JS-rendered pages and interactions
- **generate_image**: create images from text prompts (requires image model)
- **calculator**: evaluate math expressions safely

Write code and run it. Fetch real data. Produce a complete, standalone result.`;
}

// ─── Step 3: Synthesize Final Response ────────────────────────────────────────
async function synthesizeResults(
  originalRequest: string,
  results: Map<string, string>,
  memories: string,
  skillNames: string[],
  modelId: string,
  conversationId: string
): Promise<string> {
  if (results.size === 1) {
    return results.values().next().value ?? "";
  }

  const resultsSummary = Array.from(results.entries())
    .map(([id, result]) => `[Task ${id}]:\n${result}`)
    .join("\n\n---\n\n");

  const msgs: ChatMessage[] = [
    {
      role: "system",
      content: `You are Ultra Computer's synthesis engine.
You receive outputs from multiple parallel worker agents and synthesize them into a single, coherent, complete response for the user.
- Integrate all results naturally, removing redundancy
- Preserve all important details, code, citations, and data
- Format the response clearly with appropriate markdown
- If results conflict, present both perspectives
${skillNames.length > 0 ? `- Skills active: ${skillNames.join(", ")}` : ""}`,
    },
    {
      role: "user",
      content: `Original user request:\n${originalRequest}\n\nWorker agent outputs:\n${resultsSummary}`,
    },
  ];

  let synthesis = "";
  try {
    const synthResult = await withRetryAndFallback(
      async (mid) => {
        let resp = "";
        for await (const token of chatStream(msgs, { modelId: mid, taskType: "write", maxTokens: 8192 })) {
          resp += token;
          emit(conversationId, { type: "agent_token", taskId: "synthesis", token, agentRunId: "synthesis" });
        }
        return resp;
      },
      modelId
    );
    synthesis = synthResult.result;
  } catch {
    // Fallback: concatenate task results directly
    synthesis = Array.from(results.values()).join("\n\n---\n\n");
  }

  return synthesis;
}
