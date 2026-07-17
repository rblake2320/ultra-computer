export function experimentalFeaturesEnabled(
  env: { ULTRA_EXPERIMENTAL?: string } = process.env,
): boolean {
  return env.ULTRA_EXPERIMENTAL === "1";
}

export function isSwarmPrompt(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.startsWith("swarm:") ||
    (normalized.includes("use swarm") && normalized.includes("agents"));
}

export function swarmPromptAllowed(
  message: string,
  env: { ULTRA_EXPERIMENTAL?: string } = process.env,
): boolean {
  return experimentalFeaturesEnabled(env) && isSwarmPrompt(message);
}
