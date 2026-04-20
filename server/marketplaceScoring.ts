/**
 * Marketplace Quality Scoring Pipeline
 *
 * Computes a composite quality score (0–100) for each marketplace skill
 * based on real signal, not hardcoded seeds. Scores drive featured/verified
 * badges and ranking.
 *
 * ┌──────────────────────────────────────────────────────────────────┐
 * │  Signal              │ Weight │ Description                      │
 * ├──────────────────────┼────────┼──────────────────────────────────┤
 * │  Install velocity    │  25%   │ Installs/day over 7d window      │
 * │  Bayesian rating     │  25%   │ Wilson-adjusted avg (anti-gaming)│
 * │  Rating consensus    │  10%   │ Low variance = strong agreement  │
 * │  Fork lineage depth  │  10%   │ Originals > forks > fork-of-fork│
 * │  Version frequency   │  15%   │ Active maintenance signal        │
 * │  Content richness    │  15%   │ Length, headings, code blocks    │
 * └──────────────────────┴────────┴──────────────────────────────────┘
 *
 * Tier thresholds (applied after scoring):
 *   platinum ≥ 80   →  featured = true,  verified = true
 *   gold     ≥ 60   →  featured = false, verified = true
 *   silver   ≥ 40   →  featured = false, verified = false
 *   bronze   ≥ 20   →  featured = false, verified = false
 *   unranked < 20   →  featured = false, verified = false
 */

import { storage } from "./storage.js";
import logger from "./logger.js";
const scoringLogger = logger.child({ module: "scoring" });
import type { MarketplaceSkill, MarketplaceVersion, MarketplaceRating } from "@shared/schema";

// ─── Constants ──────────────────────────────────────────────────────────────
const WEIGHTS = {
  installVelocity: 0.25,
  ratingBayesian: 0.25,
  ratingConsensus: 0.10,
  forkLineage: 0.10,
  versionFrequency: 0.15,
  contentRichness: 0.15,
};

const BAYESIAN_PRIOR_MEAN = 3.0;   // global prior rating
const BAYESIAN_PRIOR_COUNT = 5;    // equivalent sample size for the prior

const TIER_THRESHOLDS = {
  platinum: 80,
  gold: 60,
  silver: 40,
  bronze: 20,
};

// ─── Individual Signal Scorers (each returns 0–100) ─────────────────────────

/**
 * Install Velocity — installs per day over a simulated 7d window.
 * Since we don't have daily snapshots, we approximate from total installs
 * and skill age. Capped at 50 installs/day for normalization.
 */
function scoreInstallVelocity(skill: MarketplaceSkill): { velocity: number; score: number } {
  const ageMs = Math.max(Date.now() - skill.publishedAt, 86_400_000); // min 1 day
  const ageDays = ageMs / 86_400_000;
  // Use a recency-weighted window: more recent installs count more
  // For simplicity with current data: installs / age, but with sqrt decay
  // to favor skills that sustain velocity over time
  const velocity = skill.installCount / Math.sqrt(ageDays);
  // Normalize: 0 velocity → 0, 50+ velocity → 100
  const normalized = Math.min(velocity / 50, 1) * 100;
  return { velocity: +(velocity).toFixed(2), score: normalized };
}

/**
 * Bayesian Rating — protects against low-sample-size inflation.
 * A skill with 1 rating of 5.0 won't outscore a skill with 100 ratings at 4.5.
 *
 * Formula: (C × m + Σ ratings) / (C + n)
 *   C = prior weight (BAYESIAN_PRIOR_COUNT)
 *   m = prior mean  (BAYESIAN_PRIOR_MEAN)
 *   n = actual rating count
 */
function scoreRatingBayesian(skill: MarketplaceSkill): { bayesian: number; score: number } {
  const C = BAYESIAN_PRIOR_COUNT;
  const m = BAYESIAN_PRIOR_MEAN;
  const n = skill.ratingCount;
  const sum = skill.ratingSum;
  // When n === 0, the formula naturally gives (C * m) / C = m (the prior mean).
  // No special guard needed; do NOT short-circuit to 0 when there are no ratings.
  const bayesian = (C * m + sum) / (C + n);
  // Map 0–5 bayesian → 0–100
  const score = (bayesian / 5) * 100;
  return { bayesian: +bayesian.toFixed(2), score };
}

/**
 * Rating Consensus — low variance means strong agreement.
 * Fetches individual ratings to compute actual variance.
 * Perfect consensus (all same rating) → 100
 * High disagreement (mix of 1s and 5s) → 0
 */
function scoreRatingConsensus(ratings: MarketplaceRating[]): { variance: number; score: number } {
  if (ratings.length < 2) return { variance: 0, score: 50 }; // neutral for too-few ratings

  const mean = ratings.reduce((s, r) => s + r.rating, 0) / ratings.length;
  const variance = ratings.reduce((s, r) => s + Math.pow(r.rating - mean, 2), 0) / ratings.length;
  // Max possible variance for 1-5 scale is 4.0 (all 1s and 5s)
  // Map: 0 variance → 100, 4 variance → 0
  const score = Math.max(0, (1 - variance / 4) * 100);
  return { variance: +variance.toFixed(3), score };
}

/**
 * Fork Lineage Depth — originals are more valuable than forks.
 * depth 0 (original) → 100
 * depth 1 (direct fork) → 60
 * depth 2+ → 30
 *
 * Walks the forkedFromId chain to compute actual depth.
 */
function scoreForkLineage(skill: MarketplaceSkill, allSkills: MarketplaceSkill[]): { depth: number; score: number } {
  let depth = 0;
  let current = skill;
  const visited = new Set<string>();

  while (current.forkedFromId && depth < 10) {
    if (visited.has(current.id)) break; // prevent cycles
    visited.add(current.id);
    const parent = allSkills.find(s => s.id === current.forkedFromId);
    if (!parent) break;
    depth++;
    current = parent;
  }

  let score: number;
  if (depth === 0) score = 100;       // original
  else if (depth === 1) score = 60;   // direct fork — still has value
  else score = Math.max(10, 60 - (depth - 1) * 15); // diminishing returns

  return { depth, score };
}

/**
 * Version Frequency — how actively maintained is this skill?
 * Measures version releases per 30-day window.
 * 0 versions in 30d → 10 (some baseline for existing)
 * 1+ versions in 30d → linear up to 100 at 4+ versions/month
 */
function scoreVersionFrequency(versions: MarketplaceVersion[], skill: MarketplaceSkill): { frequency: number; score: number } {
  const thirtyDaysAgo = Date.now() - 30 * 86_400_000;
  const recentVersions = versions.filter(v => v.createdAt > thirtyDaysAgo);
  const frequency = recentVersions.length;

  // Also factor in total version count as a secondary signal
  const totalVersionBonus = Math.min(versions.length / 5, 1) * 20; // up to 20 for 5+ versions total

  let score: number;
  if (frequency === 0) {
    // No recent versions — but if skill is new (< 30d old), don't penalize
    const ageMs = Date.now() - skill.publishedAt;
    if (ageMs < 30 * 86_400_000) {
      score = 50 + totalVersionBonus; // new skill grace period
    } else {
      score = 10 + totalVersionBonus; // stale
    }
  } else {
    // 1 version/month → 50, 2 → 70, 3 → 85, 4+ → 100
    score = Math.min(50 + frequency * 20, 100);
  }

  return { frequency: +frequency.toFixed(1), score: Math.min(score, 100) };
}

/**
 * Content Richness — heuristic quality check on the skill content.
 * Rewards: length, markdown headings, code blocks, numbered steps,
 *          trigger keywords, structured sections.
 */
function scoreContentRichness(latestVersion: MarketplaceVersion | null): { richness: number; score: number } {
  if (!latestVersion) return { richness: 0, score: 0 };
  const content = latestVersion.content;

  let points = 0;
  const maxPoints = 100;

  // Length (up to 20 points)
  const len = content.length;
  if (len >= 2000) points += 20;
  else if (len >= 1000) points += 15;
  else if (len >= 500) points += 10;
  else if (len >= 200) points += 5;

  // Markdown headings (up to 20 points)
  const headings = (content.match(/^#{1,3}\s+/gm) || []).length;
  points += Math.min(headings * 4, 20);

  // Numbered steps or bullet points (up to 15 points)
  const lists = (content.match(/^\s*[\d]+\.\s+|^\s*[-*]\s+/gm) || []).length;
  points += Math.min(lists * 2, 15);

  // Code blocks (up to 10 points)
  const codeBlocks = (content.match(/```/g) || []).length / 2;
  points += Math.min(Math.floor(codeBlocks) * 5, 10);

  // Has "When to activate" section (10 points)
  if (/when to activate/i.test(content)) points += 10;

  // Has "Output" or "Output format" section (10 points)
  if (/\b(output|output format|deliverable)\b/i.test(content)) points += 10;

  // Trigger keywords populated (up to 15 points)
  try {
    const keywords = JSON.parse(latestVersion.triggerKeywords || "[]");
    points += Math.min(keywords.length * 3, 15);
  } catch { /* skip */ }

  const richness = Math.min(points / maxPoints, 1);
  return { richness: +richness.toFixed(3), score: richness * 100 };
}

// ─── Composite Scoring ──────────────────────────────────────────────────────

export interface SkillScoreBreakdown {
  skillId: string;
  qualityScore: number;
  scoreTier: string;
  featured: boolean;
  verified: boolean;
  signals: {
    installVelocity: { value: number; score: number; weight: number };
    ratingBayesian: { value: number; score: number; weight: number };
    ratingConsensus: { value: number; score: number; weight: number };
    forkLineage: { value: number; score: number; weight: number };
    versionFrequency: { value: number; score: number; weight: number };
    contentRichness: { value: number; score: number; weight: number };
  };
}

function computeTier(score: number): string {
  if (score >= TIER_THRESHOLDS.platinum) return "platinum";
  if (score >= TIER_THRESHOLDS.gold) return "gold";
  if (score >= TIER_THRESHOLDS.silver) return "silver";
  if (score >= TIER_THRESHOLDS.bronze) return "bronze";
  return "unranked";
}

/**
 * Score a single skill. Returns the full breakdown.
 */
export function scoreSkill(
  skill: MarketplaceSkill,
  allSkills: MarketplaceSkill[],
  versions: MarketplaceVersion[],
  ratings: MarketplaceRating[],
): SkillScoreBreakdown {
  const iv = scoreInstallVelocity(skill);
  const rb = scoreRatingBayesian(skill);
  const rc = scoreRatingConsensus(ratings);
  const fl = scoreForkLineage(skill, allSkills);
  const vf = scoreVersionFrequency(versions, skill);
  const cr = scoreContentRichness(versions[0] || null);

  const composite =
    iv.score * WEIGHTS.installVelocity +
    rb.score * WEIGHTS.ratingBayesian +
    rc.score * WEIGHTS.ratingConsensus +
    fl.score * WEIGHTS.forkLineage +
    vf.score * WEIGHTS.versionFrequency +
    cr.score * WEIGHTS.contentRichness;

  const qualityScore = +Math.min(Math.max(composite, 0), 100).toFixed(1);
  const tier = computeTier(qualityScore);

  return {
    skillId: skill.id,
    qualityScore,
    scoreTier: tier,
    featured: tier === "platinum",
    verified: tier === "platinum" || tier === "gold",
    signals: {
      installVelocity: { value: iv.velocity, score: +iv.score.toFixed(1), weight: WEIGHTS.installVelocity },
      ratingBayesian: { value: rb.bayesian, score: +rb.score.toFixed(1), weight: WEIGHTS.ratingBayesian },
      ratingConsensus: { value: rc.variance, score: +rc.score.toFixed(1), weight: WEIGHTS.ratingConsensus },
      forkLineage: { value: fl.depth, score: +fl.score.toFixed(1), weight: WEIGHTS.forkLineage },
      versionFrequency: { value: vf.frequency, score: +vf.score.toFixed(1), weight: WEIGHTS.versionFrequency },
      contentRichness: { value: cr.richness, score: +cr.score.toFixed(1), weight: WEIGHTS.contentRichness },
    },
  };
}

/**
 * Run the full scoring pipeline across all marketplace skills.
 * Persists results to the database and updates featured/verified flags.
 */
export function runScoringPipeline(): {
  scored: number;
  results: SkillScoreBreakdown[];
  tierDistribution: Record<string, number>;
} {
  const allSkills = storage.getMarketplaceSkills();
  const results: SkillScoreBreakdown[] = [];
  const tierDist: Record<string, number> = { platinum: 0, gold: 0, silver: 0, bronze: 0, unranked: 0 };

  for (const skill of allSkills) {
    const versions = storage.getMarketplaceVersions(skill.id);
    const ratings = storage.getMarketplaceRatings(skill.id);

    const breakdown = scoreSkill(skill, allSkills, versions, ratings);
    results.push(breakdown);
    tierDist[breakdown.scoreTier] = (tierDist[breakdown.scoreTier] || 0) + 1;

    // Persist scoring results
    storage.updateMarketplaceSkill(skill.id, {
      qualityScore: breakdown.qualityScore,
      installVelocity: breakdown.signals.installVelocity.value,
      ratingBayesian: breakdown.signals.ratingBayesian.value,
      ratingVariance: breakdown.signals.ratingConsensus.value,
      forkDepth: breakdown.signals.forkLineage.value,
      versionFrequency: breakdown.signals.versionFrequency.value,
      contentRichness: breakdown.signals.contentRichness.value,
      scoreTier: breakdown.scoreTier,
      featured: breakdown.featured,
      verified: breakdown.verified,
      lastScoredAt: Date.now(),
    } as any);
  }

  // Sort by quality score descending
  results.sort((a, b) => b.qualityScore - a.qualityScore);

  scoringLogger.info({ scored: results.length, ...tierDist }, "Pipeline complete");

  return { scored: results.length, results, tierDistribution: tierDist };
}

/**
 * Score a single skill by ID and persist results.
 */
export function scoreSkillById(skillId: string): SkillScoreBreakdown | null {
  const skill = storage.getMarketplaceSkill(skillId);
  if (!skill) return null;

  const allSkills = storage.getMarketplaceSkills();
  const versions = storage.getMarketplaceVersions(skill.id);
  const ratings = storage.getMarketplaceRatings(skill.id);

  const breakdown = scoreSkill(skill, allSkills, versions, ratings);

  storage.updateMarketplaceSkill(skill.id, {
    qualityScore: breakdown.qualityScore,
    installVelocity: breakdown.signals.installVelocity.value,
    ratingBayesian: breakdown.signals.ratingBayesian.value,
    ratingVariance: breakdown.signals.ratingConsensus.value,
    forkDepth: breakdown.signals.forkLineage.value,
    versionFrequency: breakdown.signals.versionFrequency.value,
    contentRichness: breakdown.signals.contentRichness.value,
    scoreTier: breakdown.scoreTier,
    featured: breakdown.featured,
    verified: breakdown.verified,
    lastScoredAt: Date.now(),
  } as any);

  return breakdown;
}

/**
 * Get scoring configuration and thresholds (for transparency UI).
 */
export function getScoringConfig() {
  return {
    weights: WEIGHTS,
    tiers: TIER_THRESHOLDS,
    bayesianPrior: { mean: BAYESIAN_PRIOR_MEAN, count: BAYESIAN_PRIOR_COUNT },
  };
}
