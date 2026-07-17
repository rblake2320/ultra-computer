import type { ModelCapability } from "./types.js";

const CAPABILITY_ALIASES: Readonly<Record<string, string>> = {
  analyze: "reasoning",
  analysis: "reasoning",
  "function-calling": "tools",
  "image-output": "image-generation",
  image: "image-generation",
  search: "web-search",
  "tool-use": "tools",
  tool_use: "tools",
};

export interface CapabilityRequirement {
  /** Every capability in this group must be available. */
  all?: readonly ModelCapability[];
  /** At least one capability in this group must be available. */
  any?: readonly ModelCapability[];
  /** None of these capabilities may be present. */
  none?: readonly ModelCapability[];
}

export interface CapabilityMatch {
  matches: boolean;
  available: readonly string[];
  missing: readonly string[];
  anySatisfied: boolean;
  missingAny: readonly string[];
  forbidden: readonly string[];
}

/**
 * Converts provider and legacy capability labels into stable identifiers while
 * preserving unknown future identifiers.
 */
export function normalizeCapability(capability: string): string {
  const normalized = capability.trim().toLowerCase().replace(/[\s_]+/g, "-");
  if (!normalized) {
    throw new TypeError("Capability identifiers must not be empty");
  }
  return CAPABILITY_ALIASES[normalized] ?? normalized;
}

export function normalizeCapabilities(capabilities: readonly string[]): string[] {
  return [...new Set(capabilities.map(normalizeCapability))].sort();
}

/**
 * Evaluates explicit capability requirements without guessing from a model
 * name. The detailed result is suitable for routing diagnostics.
 */
export function matchCapabilities(
  capabilities: readonly string[],
  requirement: CapabilityRequirement,
): CapabilityMatch {
  const available = normalizeCapabilities(capabilities);
  const availableSet = new Set(available);
  const requiredAll = normalizeCapabilities(requirement.all ?? []);
  const requiredAny = normalizeCapabilities(requirement.any ?? []);
  const prohibited = normalizeCapabilities(requirement.none ?? []);

  const missing = requiredAll.filter((capability) => !availableSet.has(capability));
  const anySatisfied =
    requiredAny.length === 0 || requiredAny.some((capability) => availableSet.has(capability));
  const missingAny = anySatisfied ? [] : requiredAny;
  const forbidden = prohibited.filter((capability) => availableSet.has(capability));

  return {
    matches: missing.length === 0 && anySatisfied && forbidden.length === 0,
    available,
    missing,
    anySatisfied,
    missingAny,
    forbidden,
  };
}

export function hasCapabilities(
  capabilities: readonly string[],
  requirement: CapabilityRequirement,
): boolean {
  return matchCapabilities(capabilities, requirement).matches;
}
