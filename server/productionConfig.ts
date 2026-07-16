const FORBIDDEN_API_KEYS = new Set([
  "dev-local-key",
  "test-smoke-key",
  "your-api-key-here",
  "change-me",
  "changeme",
]);

const FORBIDDEN_ENCRYPTION_KEYS = new Set([
  "0".repeat(64),
  "generate-with-npm-run-gen-key",
]);

export interface ProductionConfigValidation {
  valid: boolean;
  errors: string[];
}

/**
 * Validate security-sensitive production settings before the server registers
 * routes or opens a listening socket.
 */
export function validateProductionEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): ProductionConfigValidation {
  if (env.NODE_ENV !== "production") {
    return { valid: true, errors: [] };
  }

  const errors: string[] = [];
  const apiKey = env.ULTRA_API_KEY?.trim() ?? "";
  const encryptionKey = env.ENCRYPTION_KEY?.trim() ?? "";

  if (apiKey.length < 32) {
    errors.push("ULTRA_API_KEY must contain at least 32 characters");
  } else if (FORBIDDEN_API_KEYS.has(apiKey.toLowerCase())) {
    errors.push("ULTRA_API_KEY uses a known development or placeholder value");
  }

  if (!/^[a-f0-9]{64}$/i.test(encryptionKey)) {
    errors.push("ENCRYPTION_KEY must be exactly 64 hexadecimal characters");
  } else if (
    FORBIDDEN_ENCRYPTION_KEYS.has(encryptionKey.toLowerCase()) ||
    /^([a-f0-9])\1{63}$/i.test(encryptionKey)
  ) {
    errors.push("ENCRYPTION_KEY must not use a known or repeated development value");
  }

  if (env.ALLOW_HOST_SHELL === "true") {
    errors.push("ALLOW_HOST_SHELL cannot be enabled in production");
  }

  return { valid: errors.length === 0, errors };
}

export function assertProductionEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): void {
  const result = validateProductionEnvironment(env);
  if (!result.valid) {
    throw new Error(`Invalid production configuration:\n- ${result.errors.join("\n- ")}`);
  }
}
