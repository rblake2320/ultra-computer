/**
 * Skill Chaining Pipeline
 *
 * Chains skills together into multi-step pipelines.
 * Examples:
 *   "Research & Report"    — research → write
 *   "Code & Test"          — code → bash test
 *   "Analyze & Visualize"  — analyze → code (chart)
 *
 * The integration agent wires detectChain() and buildChainPlan() into the
 * orchestrator's planning phase so that recognized compound requests bypass
 * the LLM-based DAG decomposition and use the pre-wired chain topology instead.
 */

import { v4 as uuidv4 } from "uuid";
import type { Skill } from "@shared/schema";

// ─── Public Types ─────────────────────────────────────────────────────────────

export interface SkillChain {
  id: string;
  name: string;
  /** Short description of what this chain produces */
  description: string;
  steps: SkillChainStep[];
}

export interface SkillChainStep {
  /** Logical step identifier — stable across runs */
  stepId: string;
  /** Which skill type this step exercises */
  skillId: string;
  /**
   * Where this step's input comes from:
   *   "user"       — the original user message
   *   <stepId>     — the output of a previous step
   */
  inputFrom: string;
  /** Optional instruction for transforming the upstream output for this step */
  transform?: string;
}

/**
 * Matches the orchestrator's internal PlanTask shape (orchestrator.ts line 57–64).
 * Defined here so skillChaining.ts has no import dependency on orchestrator.ts.
 */
export interface PlanTask {
  id: string;
  title: string;
  description: string;
  /** research | code | write | browse | analyze | general | speed */
  taskType: string;
  dependsOn: string[];
  parallel: boolean;
}

// ─── Built-In Chains ──────────────────────────────────────────────────────────

/**
 * Three pre-wired chains covering the most common compound workflows.
 *
 * stepId values are used both as dependency references within a chain and
 * as stable IDs that buildChainPlan() maps to real PlanTask IDs.
 */
export const BUILT_IN_CHAINS: SkillChain[] = [
  // ── Chain 1: Research & Report ───────────────────────────────────────────
  {
    id: "research-and-report",
    name: "Research & Report",
    description: "Deep research followed by a structured written report based on the findings.",
    steps: [
      {
        stepId: "step-research",
        skillId: "deep-research",
        inputFrom: "user",
        transform: undefined,
      },
      {
        stepId: "step-report",
        skillId: "research-report",
        inputFrom: "step-research",
        transform:
          "Take the research findings from the previous step and format them into a well-structured, " +
          "professional report with an executive summary, sections, and citations.",
      },
    ],
  },

  // ── Chain 2: Code & Test ─────────────────────────────────────────────────
  {
    id: "code-and-test",
    name: "Code & Test",
    description: "Write implementation code then automatically generate and run tests to verify correctness.",
    steps: [
      {
        stepId: "step-code",
        skillId: "code-generation",
        inputFrom: "user",
        transform: undefined,
      },
      {
        stepId: "step-test",
        skillId: "code-generation",
        inputFrom: "step-code",
        transform:
          "Using the code produced in the previous step, write a comprehensive test suite (unit tests " +
          "and integration tests). Then execute the tests using bash and report pass/fail results with " +
          "any required fixes applied.",
      },
    ],
  },

  // ── Chain 3: Analyze & Visualize ─────────────────────────────────────────
  {
    id: "analyze-and-visualize",
    name: "Analyze & Visualize",
    description: "Analyze data or a topic, then produce code that generates a chart or visualization of the findings.",
    steps: [
      {
        stepId: "step-analyze",
        skillId: "data-analysis",
        inputFrom: "user",
        transform: undefined,
      },
      {
        stepId: "step-visualize",
        skillId: "code-generation",
        inputFrom: "step-analyze",
        transform:
          "Based on the analysis results from the previous step, write Python or JavaScript code that " +
          "generates a clear, well-labeled chart or visualization (using matplotlib, Chart.js, or D3.js). " +
          "Execute the code and confirm the output file was created.",
      },
    ],
  },
];

// ─── Chain Detection ──────────────────────────────────────────────────────────

/**
 * Keyword triggers for each chain.
 * Uses a flat list of lowercase phrase fragments; any match returns the chain.
 *
 * Listed from most-specific to least-specific so that a "code and test" message
 * doesn't accidentally match "research and report".
 */
interface ChainSignal {
  chainId: string;
  /** Phrases — matched case-insensitively against the whole user message */
  phrases: string[];
}

const CHAIN_SIGNALS: ChainSignal[] = [
  {
    chainId: "code-and-test",
    phrases: [
      "code and test",
      "write tests",
      "write test",
      "generate tests",
      "unit test",
      "implement and test",
      "build and test",
    ],
  },
  {
    chainId: "analyze-and-visualize",
    phrases: [
      "analyze and chart",
      "analyze and visualize",
      "analyse and visualize",
      "analyse and chart",
      "visualize the data",
      "visualise the data",
      "create a chart",
      "create a visualization",
      "plot the data",
      "make a graph",
    ],
  },
  {
    chainId: "research-and-report",
    phrases: [
      "research and write",
      "research report",
      "research and report",
      "research and summarize",
      "research and document",
      "write a report on",
      "write a report about",
    ],
  },
];

/**
 * Attempt to detect a known chain from the user's message.
 *
 * @param userMessage      The raw user input
 * @param availableSkills  Skills currently loaded (reserved for future semantic matching)
 * @returns                Matching SkillChain or null
 */
export function detectChain(userMessage: string): SkillChain | null {
  const lower = userMessage.toLowerCase();

  for (const signal of CHAIN_SIGNALS) {
    const matched = signal.phrases.some((phrase) => lower.includes(phrase));
    if (matched) {
      const chain = BUILT_IN_CHAINS.find((c) => c.id === signal.chainId);
      if (chain) return chain;
    }
  }

  return null;
}

// ─── Chain → PlanTask Conversion ─────────────────────────────────────────────

/**
 * Convert a SkillChain into a flat PlanTask array with correct dependency wiring.
 *
 * Each step becomes one PlanTask whose `dependsOn` references the DB task IDs
 * of prior steps.  The IDs are freshly generated UUIDs so there are no
 * conflicts with tasks created by the normal LLM-based decomposer.
 *
 * @param chain        The chain to convert
 * @param userMessage  Original user request — used to populate descriptions
 * @returns            Ordered array of PlanTask objects ready for the orchestrator
 */
export function buildChainPlan(chain: SkillChain, userMessage: string): PlanTask[] {
  // Map stepId → freshly generated UUID for this plan invocation
  const stepIdToTaskId = new Map<string, string>();
  for (const step of chain.steps) {
    stepIdToTaskId.set(step.stepId, uuidv4());
  }

  const planTasks: PlanTask[] = chain.steps.map((step, index) => {
    const taskId = stepIdToTaskId.get(step.stepId);
    if (!taskId) throw new Error(`Missing taskId mapping for stepId '${step.stepId}'`);

    // Resolve dependency: "user" means no upstream task; any other value is a stepId
    const upstreamId = stepIdToTaskId.get(step.inputFrom);
    const dependsOn: string[] =
      step.inputFrom === "user"
        ? []
        : upstreamId
          ? [upstreamId]
          : [];

    // Build a clear task description
    const description = buildStepDescription(step, index, userMessage, chain);

    // Infer taskType from the skillId
    const taskType = inferTaskType(step.skillId);

    return {
      id: taskId,
      title: buildStepTitle(step, index, chain),
      description,
      taskType,
      dependsOn,
      // Steps in a chain are sequential by design — only first step can run immediately
      parallel: dependsOn.length === 0,
    };
  });

  return planTasks;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildStepTitle(step: SkillChainStep, index: number, chain: SkillChain): string {
  const stepNumber = index + 1;
  const skillLabel = skillIdToLabel(step.skillId);
  return `Step ${stepNumber}: ${skillLabel} (${chain.name})`;
}

function buildStepDescription(
  step: SkillChainStep,
  index: number,
  userMessage: string,
  chain: SkillChain
): string {
  const isFirstStep = step.inputFrom === "user";

  if (isFirstStep) {
    // First step always operates on the user message directly
    const skillLabel = skillIdToLabel(step.skillId);
    return `${skillLabel} task for the following request:\n\n${userMessage}`;
  }

  // Subsequent steps use the transform instruction + reference to upstream output
  const upstreamLabel = skillIdToLabel(
    chain.steps.find((s) => s.stepId === step.inputFrom)?.skillId ?? "previous step"
  );

  const transform = step.transform
    ? step.transform
    : `Process the output from the ${upstreamLabel} step and produce the next deliverable.`;

  return (
    `${transform}\n\n` +
    `Original user request for context:\n${userMessage}\n\n` +
    `The upstream result from "${upstreamLabel}" will be injected as dependency context.`
  );
}

/** Map internal skillId slugs to human-readable labels */
function skillIdToLabel(skillId: string): string {
  const map: Record<string, string> = {
    "deep-research": "Deep Research",
    "research-report": "Write Report",
    "code-generation": "Code Generation",
    "data-analysis": "Data Analysis",
  };
  return map[skillId] ?? capitalize(skillId.replace(/-/g, " "));
}

/** Map skillId to the orchestrator's TaskType enum */
function inferTaskType(skillId: string): string {
  const map: Record<string, string> = {
    "deep-research": "research",
    "research-report": "write",
    "code-generation": "code",
    "data-analysis": "analyze",
  };
  return map[skillId] ?? "general";
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
