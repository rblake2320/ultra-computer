export type RuntimeCheckState =
  | "ready"
  | "starting"
  | "unavailable"
  | "disabled"
  | "external"
  | "stopped";

export interface RuntimeCheck {
  state: RuntimeCheckState;
  required: boolean;
}

export interface RuntimeHealth {
  status: "ok" | "degraded";
  checks: Record<string, { ok: boolean; state: RuntimeCheckState }>;
}

/**
 * Readiness is based only on observed state. Optional services remain visible
 * without making the whole process unavailable.
 */
export function buildRuntimeHealth(
  checks: Record<string, RuntimeCheck>,
): RuntimeHealth {
  const requiredReady = Object.values(checks).every(
    (check) => !check.required || check.state === "ready",
  );

  return {
    status: requiredReady ? "ok" : "degraded",
    checks: Object.fromEntries(
      Object.entries(checks).map(([name, check]) => [
        name,
        { ok: check.state === "ready", state: check.state },
      ]),
    ),
  };
}
