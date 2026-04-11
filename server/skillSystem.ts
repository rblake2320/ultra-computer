/**
 * Skill System — Layer 6
 * Skills are .md instruction files that auto-activate based on semantic matching.
 * Loaded into the orchestrator context at the start of matching sessions.
 */

import { storage } from "./storage.js";
import type { Skill } from "@shared/schema";

// Simple keyword/cosine-sim-like matching without heavy embedding libs
class SkillMatcher {
  matchSkills(userMessage: string, topK = 3): Skill[] {
    const skills = storage.getSkills().filter(s => s.enabled);
    if (skills.length === 0) return [];

    const msgWords = new Set(userMessage.toLowerCase().split(/\W+/).filter(w => w.length > 2));
    
    const scored = skills.map(skill => {
      const keywords: string[] = JSON.parse(skill.triggerKeywords || "[]");
      const descWords = skill.description.toLowerCase().split(/\W+/);
      const allTriggers = new Set([...keywords.map(k => k.toLowerCase()), ...descWords]);
      
      let matches = 0;
      for (const word of msgWords) {
        if (allTriggers.has(word)) matches++;
      }
      // Boost by checking if skill name words appear in message
      const nameWords = skill.name.toLowerCase().split(/\W+/);
      for (const nw of nameWords) {
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
  if (existing.length >= BUILT_IN_SKILLS.length) return;

  for (const skill of BUILT_IN_SKILLS) {
    const exists = existing.find(e => e.name === skill.name);
    if (!exists) {
      const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      storage.createSkill({ id, ...skill });
    }
  }
}
