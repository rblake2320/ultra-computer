/**
 * governedFetch.ts
 * Shared outbound HTTP client that routes egress through the policy plane.
 *
 * All external-facing fetch() calls that should be policy-governed can use
 * this helper instead of raw fetch(). It evaluates network policy, writes
 * an audit record, and throws on deny.
 *
 * Usage:
 *   import { governedFetch } from "./governedFetch.js";
 *   const response = await governedFetch(url, options, sessionId, domain, action);
 *
 * Files that still use raw fetch() and are GAP ACCEPTED:
 *   - server/oauthFlow.ts (token exchange with provider — low-frequency, user-initiated)
 *   - server/modelConnections.ts (OAuth token exchange — low-frequency, user-initiated)
 *
 * These can be migrated to governedFetch when the policy plane supports
 * scoped OAuth/token-exchange rules.
 */

import {
  evaluatePolicy,
  writePolicyAudit,
  type PolicyDomain,
} from "./policyEngine.js";

export class PolicyDeniedError extends Error {
  constructor(
    public readonly domain: PolicyDomain,
    public readonly action: string,
    public readonly reason: string,
  ) {
    super(`Policy denied: ${domain}:${action} — ${reason}`);
    this.name = "PolicyDeniedError";
  }
}

/**
 * Performs a fetch() that is governed by the policy engine.
 *
 * @param url      - The outbound URL to fetch.
 * @param options  - Standard RequestInit options for fetch().
 * @param sessionId - Session or workflow ID for audit correlation.
 * @param domain   - Policy domain (typically "network").
 * @param action   - Policy action (e.g., "webhook_send", "provider_call").
 * @returns        The fetch Response.
 * @throws PolicyDeniedError if the policy engine denies the request.
 */
export async function governedFetch(
  url: string,
  options: RequestInit,
  sessionId: string,
  domain: PolicyDomain,
  action: string,
): Promise<Response> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new PolicyDeniedError(domain, action, `Invalid URL: ${url}`);
  }

  const context = {
    domain,
    action,
    url,
    method: (options.method ?? "GET").toUpperCase(),
    sessionId,
    metadata: {
      host: parsedUrl.hostname,
      protocol: parsedUrl.protocol,
    },
  };

  const decision = evaluatePolicy(context);
  writePolicyAudit(context, decision);

  if (!decision.allowed) {
    throw new PolicyDeniedError(domain, action, decision.reason);
  }

  return fetch(url, options);
}
