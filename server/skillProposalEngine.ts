/**
 * Skill Proposal Engine
 *
 * Turns curated memory into reviewable skill-script proposals. This fills the
 * "memory -> reusable skill" step without auto-promoting unreviewed behavior.
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { storage } from "./storage.js";
import type { Memory, SkillScript } from "@shared/schema";

const DATA_DIR = path.resolve(process.cwd(), "data/learning");
const PROPOSALS_FILE = path.join(DATA_DIR, "skill-proposals.json");

export type SkillProposalStatus = "pending" | "promoted" | "rejected";

export interface SkillProposal {
  id: string;
  title: string;
  description: string;
  language: "markdown";
  content: string;
  triggerKeywords: string[];
  sourceMemoryIds: string[];
  evidence: string[];
  confidence: number;
  status: SkillProposalStatus;
  createdAt: number;
  updatedAt: number;
  promotedScriptId?: string;
  rejectedReason?: string;
}

export interface ProposalBuildOptions {
  minImportance?: number;
  limit?: number;
  now?: number;
}

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readProposals(): SkillProposal[] {
  ensureDataDir();
  try {
    if (!fs.existsSync(PROPOSALS_FILE)) return [];
    return JSON.parse(fs.readFileSync(PROPOSALS_FILE, "utf-8")) as SkillProposal[];
  } catch {
    return [];
  }
}

function writeProposals(proposals: SkillProposal[]): void {
  ensureDataDir();
  const tmp = `${PROPOSALS_FILE}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(proposals, null, 2), "utf-8");
    fs.renameSync(tmp, PROPOSALS_FILE);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    throw err;
  }
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function words(value: string): string[] {
  const stopwords = new Set([
    "about", "after", "again", "always", "before", "being", "could", "every",
    "from", "have", "into", "should", "that", "their", "there", "these",
    "this", "through", "when", "where", "with", "would",
  ]);
  return normalize(value)
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stopwords.has(word));
}

function proceduralSignalScore(content: string): number {
  const signals = [
    /\b(always|usually|whenever|when|if)\b/i,
    /\b(workflow|process|procedure|checklist|steps?|routine|playbook)\b/i,
    /\b(review|deploy|test|verify|generate|create|fix|triage|investigate)\b/i,
    /\b(first|then|next|finally)\b/i,
  ];
  return signals.reduce((score, signal) => score + (signal.test(content) ? 1 : 0), 0) / signals.length;
}

function titleFromMemory(memory: Memory): string {
  const source = memory.summary || memory.content;
  const clean = source
    .replace(/\s+/g, " ")
    .replace(/^(remember|note|user prefers|preference):?\s*/i, "")
    .trim();
  const clipped = clean.length > 72 ? `${clean.slice(0, 69).trim()}...` : clean;
  return `Skill: ${clipped || memory.category || "reusable workflow"}`;
}

function evidenceFromMemory(memory: Memory): string[] {
  const chunks = memory.content
    .split(/(?:\r?\n|[.;])+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 18)
    .slice(0, 4);
  return chunks.length > 0 ? chunks : [memory.summary || memory.content.slice(0, 240)];
}

function triggerKeywords(memory: Memory, title: string): string[] {
  const sourceWords = words(`${title} ${memory.summary || ""} ${memory.content}`);
  return Array.from(new Set(sourceWords)).slice(0, 8);
}

function stepsFromEvidence(evidence: string[]): string[] {
  const actionLines = evidence
    .map((line) => line.replace(/^[-*\d.)\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, 5);

  if (actionLines.length >= 2) return actionLines;

  return [
    "Review the source memory and confirm the workflow still applies.",
    "Identify the user intent, inputs, constraints, and expected output.",
    "Execute the workflow inside the configured sandbox or approved connector scope.",
    "Verify the result, record failures, and suggest a refinement when the workflow changes.",
  ];
}

function buildContent(title: string, memory: Memory, evidence: string[]): string {
  const steps = stepsFromEvidence(evidence)
    .map((step, index) => `${index + 1}. ${step}`)
    .join("\n");
  const evidenceBlock = evidence.map((item) => `- ${item}`).join("\n");

  return `# ${title}

## When to Use
Use this skill when a task matches the source memory category \`${memory.category}\` or the trigger keywords below.

## Trigger Keywords
${triggerKeywords(memory, title).map((keyword) => `- ${keyword}`).join("\n")}

## Procedure
${steps}

## Evidence
${evidenceBlock}

## Governance
- Keep execution inside the configured sandbox or an explicitly approved connector.
- Treat this as a proposed skill until a human reviews and promotes it.
- Version every promoted change and record observed failures as skill-improvement feedback.
`;
}

function hasExistingCoverage(title: string, keywords: string[], scripts: SkillScript[]): boolean {
  const normalizedTitle = normalize(title.replace(/^skill:\s*/i, ""));
  return scripts.some((script) => {
    const haystack = normalize(`${script.name} ${script.description} ${script.tags} ${script.content}`);
    if (normalizedTitle.length > 10 && haystack.includes(normalizedTitle.slice(0, 40))) {
      return true;
    }
    const matches = keywords.filter((keyword) => haystack.includes(normalize(keyword))).length;
    return keywords.length >= 3 && matches >= Math.min(4, keywords.length);
  });
}

function pendingCoversMemory(memoryId: string, proposals: SkillProposal[]): boolean {
  return proposals.some(
    (proposal) =>
      proposal.status === "pending" &&
      proposal.sourceMemoryIds.includes(memoryId)
  );
}

export function buildSkillProposalCandidates(
  memories: Memory[],
  scripts: SkillScript[],
  existingProposals: SkillProposal[] = [],
  options: ProposalBuildOptions = {}
): SkillProposal[] {
  const minImportance = options.minImportance ?? 0.72;
  const limit = options.limit ?? 10;
  const now = options.now ?? Date.now();

  return memories
    .filter((memory) => memory.importance >= minImportance)
    .map((memory) => ({ memory, signalScore: proceduralSignalScore(`${memory.summary || ""}\n${memory.content}`) }))
    .filter(({ memory, signalScore }) => signalScore >= 0.25 || memory.importance >= 0.9)
    .sort((a, b) => (b.memory.importance + b.signalScore) - (a.memory.importance + a.signalScore))
    .flatMap(({ memory, signalScore }) => {
      if (pendingCoversMemory(memory.id, existingProposals)) return [];

      const title = titleFromMemory(memory);
      const evidence = evidenceFromMemory(memory);
      const keywords = triggerKeywords(memory, title);
      if (hasExistingCoverage(title, keywords, scripts)) return [];

      const confidence = Math.min(0.95, Math.max(0.35, memory.importance * 0.7 + signalScore * 0.3));
      const proposal: SkillProposal = {
        id: crypto.randomUUID(),
        title,
        description: `Memory-derived skill proposal from ${memory.category || "general"} knowledge.`,
        language: "markdown",
        content: buildContent(title, memory, evidence),
        triggerKeywords: keywords,
        sourceMemoryIds: [memory.id],
        evidence,
        confidence: Number(confidence.toFixed(2)),
        status: "pending",
        createdAt: now,
        updatedAt: now,
      };

      return [proposal];
    })
    .slice(0, limit);
}

export function getSkillProposals(status?: SkillProposalStatus): SkillProposal[] {
  const proposals = readProposals();
  return status ? proposals.filter((proposal) => proposal.status === status) : proposals;
}

export function generateSkillProposals(options: ProposalBuildOptions = {}): SkillProposal[] {
  const existing = readProposals();
  const candidates = buildSkillProposalCandidates(
    storage.getMemories(1000),
    storage.getSkillScripts(),
    existing,
    options
  );
  if (candidates.length > 0) {
    writeProposals([...existing, ...candidates]);
  }
  return candidates;
}

export function promoteSkillProposal(id: string): { promoted: boolean; reason: string; scriptId?: string } {
  const proposals = readProposals();
  const idx = proposals.findIndex((proposal) => proposal.id === id);
  if (idx === -1) return { promoted: false, reason: "Proposal not found." };

  const proposal = proposals[idx];
  if (proposal.status !== "pending") {
    return { promoted: false, reason: `Proposal is already ${proposal.status}.` };
  }

  const scriptId = crypto.randomUUID();
  const script = storage.createSkillScript({
    id: scriptId,
    name: proposal.title.replace(/^Skill:\s*/i, ""),
    description: proposal.description,
    language: proposal.language,
    content: proposal.content,
    tags: JSON.stringify(["self-evolving", "memory-derived", "proposal", ...proposal.triggerKeywords.slice(0, 5)]),
    version: 1,
    sourceConversationId: null,
    sourceToolCallId: null,
    filePath: null,
    isFavorite: false,
  });

  storage.createSkillScriptVersion({
    id: crypto.randomUUID(),
    scriptId: script.id,
    version: 1,
    content: proposal.content,
    changeNote: `Promoted from memory-derived proposal ${proposal.id}`,
  });

  proposals[idx] = {
    ...proposal,
    status: "promoted",
    promotedScriptId: script.id,
    updatedAt: Date.now(),
  };
  writeProposals(proposals);

  return { promoted: true, reason: "Proposal promoted to skill script.", scriptId: script.id };
}

export function rejectSkillProposal(id: string, reason?: string): { rejected: boolean; reason: string } {
  const proposals = readProposals();
  const idx = proposals.findIndex((proposal) => proposal.id === id);
  if (idx === -1) return { rejected: false, reason: "Proposal not found." };

  const proposal = proposals[idx];
  if (proposal.status !== "pending") {
    return { rejected: false, reason: `Proposal is already ${proposal.status}.` };
  }

  proposals[idx] = {
    ...proposal,
    status: "rejected",
    rejectedReason: reason,
    updatedAt: Date.now(),
  };
  writeProposals(proposals);
  return { rejected: true, reason: "Proposal rejected." };
}
