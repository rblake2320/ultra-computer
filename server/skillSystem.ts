/**
 * Skill System — Layer 6
 * Skills are .md instruction files that auto-activate based on semantic matching.
 * Loaded into the orchestrator context at the start of matching sessions.
 */

import { storage } from "./storage.js";
import type { Skill } from "@shared/schema";
import { v4 as uuidv4 } from "uuid";
import {
  embedText,
  cosineSimF32,
  serializeEmbedding,
  deserializeEmbedding,
  isEmbeddingAvailable,
  prewarmEmbeddingModel,
} from "./embeddingEngine.js";

// ─── TF-IDF Term Vectors ──────────────────────────────────────────────────────

type TermVector = Record<string, number>;

function tokenize(text: string): string[] {
  return text.toLowerCase().split(/[^a-z]+/).filter(t => t.length > 2);
}

function buildVector(terms: string[]): TermVector {
  const freq: TermVector = {};
  for (const t of terms) freq[t] = (freq[t] || 0) + 1;
  const magnitude = Math.sqrt(Object.values(freq).reduce((s, v) => s + v * v, 0));
  if (magnitude === 0) return {};
  const vec: TermVector = {};
  for (const [t, c] of Object.entries(freq)) vec[t] = c / magnitude;
  return vec;
}

function cosineSim(a: TermVector, b: TermVector): number {
  // Both vectors are already L2-normalised — dot product = cosine similarity
  let dot = 0;
  for (const [t, wa] of Object.entries(a)) {
    const wb = b[t];
    if (wb) dot += wa * wb;
  }
  return dot;
}

/** Text representation of a skill for embedding (name + keywords + description + content head). */
function skillToText(skill: Pick<Skill, "name" | "description" | "triggerKeywords" | "content">): string {
  let kws: string[] = [];
  try {
    kws = JSON.parse(skill.triggerKeywords || "[]");
    if (!Array.isArray(kws)) kws = [];
  } catch { kws = []; }
  return [
    skill.name,
    kws.join(" "),
    skill.description,
    (skill.content || "").slice(0, 400),
  ].join(" ");
}

/**
 * Build a TF-based term vector for a skill (synchronous fallback).
 * Used when the semantic embedding model is not yet loaded.
 * Weights: name (×4), trigger keywords (×3), description (×2), first 400 chars of content (×1).
 */
export function buildSkillVector(skill: Pick<Skill, "name" | "description" | "triggerKeywords" | "content">): string {
  const terms: string[] = [];
  tokenize(skill.name).forEach(w => { for (let i = 0; i < 4; i++) terms.push(w); });
  let kws: string[] = [];
  try {
    kws = JSON.parse(skill.triggerKeywords || "[]");
    if (!Array.isArray(kws)) kws = [];
  } catch { kws = []; }
  kws.flatMap(k => tokenize(k)).forEach(w => { for (let i = 0; i < 3; i++) terms.push(w); });
  tokenize(skill.description).forEach(w => { for (let i = 0; i < 2; i++) terms.push(w); });
  tokenize((skill.content || "").slice(0, 400)).forEach(w => terms.push(w));
  return JSON.stringify(buildVector(terms));
}

/**
 * Compute and persist a real semantic embedding for a skill.
 * Upgrades the `embeddings` field from TF-IDF JSON → base64 Float32Array.
 * No-op when the embedding model is not available.
 */
export async function upgradeSkillEmbedding(skillId: string, skill: Pick<Skill, "name" | "description" | "triggerKeywords" | "content">): Promise<void> {
  const vec = await embedText(skillToText(skill));
  if (!vec) return;
  storage.updateSkill(skillId, { embeddings: "f32:" + serializeEmbedding(vec) });
}

/**
 * Attempt to upgrade all skills to real embeddings in the background.
 * Called once after the embedding model finishes loading.
 */
async function upgradeAllSkillEmbeddings(): Promise<void> {
  const skills = storage.getSkills();
  let upgraded = 0;
  for (const skill of skills) {
    if (skill.embeddings?.startsWith("f32:")) continue; // already upgraded
    await upgradeSkillEmbedding(skill.id, skill);
    upgraded++;
  }
  if (upgraded > 0) console.log(`[skillSystem] Upgraded ${upgraded} skill(s) to semantic embeddings`);
}

// ─── Skill Matcher ────────────────────────────────────────────────────────────

class SkillMatcher {
  async matchSkills(userMessage: string, topK = 3): Promise<Skill[]> {
    const skills = storage.getSkills().filter(s => s.enabled);
    if (skills.length === 0) return [];

    // Try semantic embedding for the message (may be null if model not ready)
    const msgF32 = isEmbeddingAvailable() ? await embedText(userMessage) : null;
    const msgVec = buildVector(tokenize(userMessage));
    const hasMsg = Object.keys(msgVec).length > 0;

    const scored = skills.map(skill => {
      const emb = skill.embeddings;

      // Semantic path: both skill and message have real float32 embeddings
      if (emb?.startsWith("f32:") && msgF32) {
        const skillF32 = deserializeEmbedding(emb.slice(4));
        if (skillF32) return { skill, score: cosineSimF32(msgF32, skillF32) };
      }

      // TF-IDF path: skill has pre-computed term vector
      if (emb && !emb.startsWith("f32:") && hasMsg) {
        try {
          const skillVec = JSON.parse(emb) as TermVector;
          return { skill, score: cosineSim(msgVec, skillVec) };
        } catch { /* fall through */ }
      }

      // Legacy fallback: keyword intersection
      const msgWords = new Set(Object.keys(msgVec));
      let kws: string[] = [];
      try {
        kws = JSON.parse(skill.triggerKeywords || "[]");
        if (!Array.isArray(kws)) kws = [];
      } catch { kws = []; }
      const triggers = new Set([
        ...kws.map(k => k.toLowerCase()),
        ...skill.description.toLowerCase().split(/\W+/),
      ]);
      let matches = 0;
      for (const w of msgWords) if (triggers.has(w)) matches++;
      for (const nw of skill.name.toLowerCase().split(/\W+/)) {
        if (msgWords.has(nw)) matches += 2;
      }
      return { skill, score: matches };
    });

    return scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map(s => s.skill);
  }
}

export const skillMatcher = new SkillMatcher();

/** Fire-and-forget: wait for model load then upgrade all skill embeddings. */
export function scheduleEmbeddingUpgrade(): void {
  embedText("warmup").then(() => upgradeAllSkillEmbeddings()).catch(() => {});
}

// ─── Built-in Skills ──────────────────────────────────────────────────────────
export const BUILT_IN_SKILLS: Array<Omit<Skill, "id" | "createdAt" | "usageCount">> = [
  {
    name: "Deep Research",
    description: "Multi-round research methodology with source validation and citations.",
    content: `# Deep Research Skill

## When to activate
Activate when the user asks to research a topic, find information, compare options, or gather data.

## Methodology
1. **Scope** — Define what needs to be researched and what questions must be answered
2. **Primary search** — Find authoritative sources (official docs, papers, reputable news)
3. **Validation** — Cross-reference claims across multiple independent sources
4. **Synthesis** — Combine findings into a coherent, organized summary
5. **Citation** — Every factual claim must cite its source with URL when available

## Output format
- Start with an executive summary (2-3 sentences)
- Use headers to organize findings
- Include a Sources section at the end with numbered citations
- Flag any areas where sources conflicted or data was unavailable

## Quality bar
- Minimum 3 independent sources for any factual claim
- Distinguish between primary sources and secondary/opinion sources
- Always include publication date for time-sensitive information`,
    triggerKeywords: JSON.stringify(["research", "find", "gather", "investigate", "analyze", "study", "explore", "compare", "information", "sources"]),
    embeddings: null,
    isBuiltIn: true,
    enabled: true,
  },
  {
    name: "Research Report",
    description: "Structured document formatting with citations for formal research reports.",
    content: `# Research Report Skill

## When to activate
Activate when the user asks for a report, document, writeup, or formal analysis.

## Document structure
1. **Title** — Clear, descriptive
2. **Executive Summary** — 3-5 sentence overview of findings
3. **Background / Context** — Why this matters
4. **Findings** — Main body, organized with H2/H3 headers
5. **Analysis** — Interpretation of findings
6. **Recommendations** — Actionable next steps (if applicable)
7. **References** — Numbered list with URLs

## Formatting rules
- Use markdown headers (##, ###) for structure
- Use tables for comparisons
- Use bullet points for lists of 3+ items
- Bold key terms and findings
- Every claim needs a citation marker [^n]

## Tone
Professional but accessible. No jargon without explanation. Active voice preferred.`,
    triggerKeywords: JSON.stringify(["report", "document", "writeup", "analysis", "summary", "brief", "memo", "paper"]),
    embeddings: null,
    isBuiltIn: true,
    enabled: true,
  },
  {
    name: "Code Generation",
    description: "Production-quality code with tests, documentation, and security review.",
    content: `# Code Generation Skill

## When to activate
Activate for any code writing, debugging, refactoring, or technical implementation request.

## Standards
- Write production-quality code, not prototypes
- Include error handling and edge cases
- Add inline comments for complex logic
- Follow language-specific conventions and idioms
- TypeScript: use strict types, avoid 'any'
- Python: type hints, docstrings, PEP 8

## Output structure
1. Brief explanation of the approach
2. Complete, runnable code block
3. Usage example
4. Potential edge cases or limitations

## Security
- Never include secrets or credentials in code
- Use parameterized queries for DB operations
- Validate all inputs
- Note any security considerations

## Testing
If tests are requested or implied, write them alongside the implementation code.`,
    triggerKeywords: JSON.stringify(["code", "build", "implement", "function", "class", "api", "script", "program", "debug", "fix", "refactor", "typescript", "javascript", "python"]),
    embeddings: null,
    isBuiltIn: true,
    enabled: true,
  },
  {
    name: "Data Analysis",
    description: "Structured data analysis with statistical methods, visualization guidance, and insight extraction.",
    content: `# Data Analysis Skill

## When to activate
Activate for data analysis, statistics, CSV/JSON processing, metrics interpretation.

## Methodology
1. **Describe** — What does the data contain? What are the key fields?
2. **Clean** — Identify missing values, outliers, type issues
3. **Explore** — Distribution, central tendency, correlations
4. **Analyze** — Apply appropriate statistical or algorithmic methods
5. **Visualize** — Recommend chart types and provide code to generate them
6. **Interpret** — What do the numbers mean in context?

## Output
- Lead with the most important finding
- Use tables for structured comparisons
- Include code snippets for reproducibility
- Clearly state assumptions and limitations`,
    triggerKeywords: JSON.stringify(["data", "analyze", "statistics", "csv", "metrics", "chart", "graph", "numbers", "calculate", "compute", "visualize"]),
    embeddings: null,
    isBuiltIn: true,
    enabled: true,
  },
];

export function seedBuiltInSkills() {
  const existing = storage.getSkills().filter(s => s.isBuiltIn);
  for (const skill of BUILT_IN_SKILLS) {
    const exists = existing.find(e => e.name === skill.name);
    if (!exists) {
      const id = uuidv4();
      const embeddings = buildSkillVector(skill);
      storage.createSkill({ id, ...skill, embeddings });
    } else if (!exists.embeddings) {
      // Back-fill vectors for skills seeded before this feature shipped
      storage.updateSkill(exists.id, { embeddings: buildSkillVector(exists) });
    }
  }
}
