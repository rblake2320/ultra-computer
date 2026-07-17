import type { Model } from "@shared/schema";

/**
 * Return why a configured model cannot receive production work right now.
 * A successful connection probe is necessary but not sufficient: credentials
 * referenced through the environment can disappear after the probe.
 */
export function modelRoutabilityIssue(model: Model): string | null {
  if (!model.enabled) return "disabled";
  if (model.connectionStatus !== "connected") return `connection status is ${model.connectionStatus}`;

  switch (model.authMethod || "api_key") {
    case "none":
      return null;
    case "api_key":
      return model.apiKey ? null : "API key is missing";
    case "env_var":
      if (!model.envVarName) return "environment variable name is missing";
      return process.env[model.envVarName] ? null : `environment variable ${model.envVarName} is not set`;
    case "oauth": {
      try {
        const tokens = JSON.parse(model.oauthTokens || "{}");
        if (!tokens.access_token) return "OAuth access token is missing";
        if (tokens.expires_at && Date.now() >= Number(tokens.expires_at)) return "OAuth access token is expired";
        return null;
      } catch {
        return "OAuth token data is invalid";
      }
    }
    default:
      return `unsupported authentication method ${model.authMethod}`;
  }
}

export function isModelRoutable(model: Model): boolean {
  return modelRoutabilityIssue(model) === null;
}
