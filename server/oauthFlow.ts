import type { Express } from "express";
import { authLogger } from "./logger.js";
import crypto from "crypto";
import { storage } from "./storage.js";

// In-memory state store: state_token → connectorId
// (no localStorage; purely server-side ephemeral state)
const pendingStates = new Map<string, { connectorId: string; createdAt: number }>();

// Clean up expired states (older than 10 minutes)
function purgeExpiredStates() {
  const tenMinutes = 10 * 60 * 1000;
  const now = Date.now();
  for (const [key, val] of Array.from(pendingStates.entries())) {
    if (now - val.createdAt > tenMinutes) {
      pendingStates.delete(key);
    }
  }
}

export function registerOAuthRoutes(app: Express): void {
  /**
   * GET /api/oauth/:connectorId/authorize
   * Generates and returns an OAuth authorization URL.
   * Reads connector config (client_id, auth_url, scopes) from DB.
   * Returns { authUrl }.
   */
  app.get("/api/oauth/:connectorId/authorize", (req, res) => {
    purgeExpiredStates();

    const { connectorId } = req.params;
    const connector = storage.getConnector(connectorId);

    if (!connector) {
      return res.status(404).json({ error: "Connector not found" });
    }

    // Parse config from DB
    let config: Record<string, any> = {};
    try {
      config = JSON.parse(connector.config || "{}");
    } catch {
      config = {};
    }

    const clientId: string | undefined = config.client_id;
    const authUrl: string | undefined = config.auth_url;

    if (!authUrl) {
      return res.status(400).json({
        error: "Connector does not have an auth_url configured",
      });
    }

    if (!clientId) {
      return res.status(400).json({
        error: "Connector does not have a client_id configured",
      });
    }

    // Parse scopes — stored either in connector.scopes (JSON array) or config.scopes
    let scopes: string[] = [];
    try {
      const scopesFromRecord = JSON.parse(connector.scopes || "[]");
      if (Array.isArray(scopesFromRecord)) scopes = scopesFromRecord;
    } catch {
      /* ignore */
    }
    if (scopes.length === 0 && Array.isArray(config.scopes)) {
      scopes = config.scopes;
    }

    // Generate a cryptographically secure state token
    const state = crypto.randomBytes(24).toString("hex");
    pendingStates.set(state, { connectorId, createdAt: Date.now() });

    // Determine redirect_uri — honour OAUTH_REDIRECT_BASE_URL env var when set
    let redirectUri: string;
    if (process.env.OAUTH_REDIRECT_BASE_URL) {
      redirectUri = `${process.env.OAUTH_REDIRECT_BASE_URL.replace(/\/$/, "")}/api/oauth/callback`;
    } else {
      const rawProto = req.headers["x-forwarded-proto"];
      const protocol = (Array.isArray(rawProto) ? rawProto[0] : rawProto) || req.protocol || "http";
      const rawHost = req.headers["x-forwarded-host"];
      const host = (Array.isArray(rawHost) ? rawHost[0] : rawHost) || req.headers.host || "localhost:5000";
      redirectUri = `${protocol}://${host}/api/oauth/callback`;
    }

    // Build the authorization URL
    let url: URL;
    try {
      url = new URL(authUrl);
    } catch {
      return res.status(400).json({ error: "Connector has an invalid auth_url" });
    }
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("state", state);
    if (scopes.length > 0) {
      url.searchParams.set("scope", scopes.join(" "));
    }

    return res.json({ authUrl: url.toString(), state, redirectUri });
  });

  /**
   * GET /api/oauth/callback
   * Handles the OAuth redirect callback.
   * Receives code + state, exchanges for access_token, saves tokens to connector config.
   * Redirects to /#/connectors with ?oauth=success or ?oauth=error.
   */
  app.get("/api/oauth/callback", async (req, res) => {
    purgeExpiredStates();

    const code = typeof req.query.code === 'string' ? req.query.code : undefined;
    const state = typeof req.query.state === 'string' ? req.query.state : undefined;
    const oauthError = typeof req.query.error === 'string' ? req.query.error : undefined;
    const error_description = typeof req.query.error_description === 'string' ? req.query.error_description : undefined;

    // OAuth provider returned an error
    if (oauthError) {
      const msg = encodeURIComponent(error_description || oauthError || "OAuth error");
      return res.redirect(`/#/connectors?oauth=error&message=${msg}`);
    }

    if (!code || !state) {
      const msg = encodeURIComponent("Missing code or state parameter");
      return res.redirect(`/#/connectors?oauth=error&message=${msg}`);
    }

    // Validate state
    const pending = pendingStates.get(state);
    if (!pending) {
      const msg = encodeURIComponent("Invalid or expired OAuth state");
      return res.redirect(`/#/connectors?oauth=error&message=${msg}`);
    }

    // Remove state immediately (one-time use)
    pendingStates.delete(state);

    const { connectorId } = pending;
    const connector = storage.getConnector(connectorId);

    if (!connector) {
      const msg = encodeURIComponent("Connector not found");
      return res.redirect(`/#/connectors?oauth=error&message=${msg}`);
    }

    let config: Record<string, any> = {};
    try {
      config = JSON.parse(connector.config || "{}");
    } catch {
      config = {};
    }

    const clientId: string | undefined = config.client_id;
    const clientSecret: string | undefined = config.client_secret;
    const tokenUrl: string | undefined = config.token_url;

    if (!tokenUrl) {
      const msg = encodeURIComponent("Connector does not have a token_url configured");
      return res.redirect(`/#/connectors?oauth=error&message=${msg}`);
    }

    // Reconstruct redirect_uri (must match exactly what was sent to /authorize)
    let redirectUri: string;
    if (process.env.OAUTH_REDIRECT_BASE_URL) {
      redirectUri = `${process.env.OAUTH_REDIRECT_BASE_URL.replace(/\/$/, "")}/api/oauth/callback`;
    } else {
      const rawProto = req.headers["x-forwarded-proto"];
      const protocol = (Array.isArray(rawProto) ? rawProto[0] : rawProto) || req.protocol || "http";
      const rawHost = req.headers["x-forwarded-host"];
      const host = (Array.isArray(rawHost) ? rawHost[0] : rawHost) || req.headers.host || "localhost:5000";
      redirectUri = `${protocol}://${host}/api/oauth/callback`;
    }

    try {
      // Exchange authorization code for access token
      const tokenRequestBody = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        ...(clientId ? { client_id: clientId } : {}),
        ...(clientSecret ? { client_secret: clientSecret } : {}),
      });

      const tokenResponse = await fetch(tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: tokenRequestBody.toString(),
      });

      if (!tokenResponse.ok) {
        let errBody: any = {};
        try {
          errBody = await tokenResponse.json();
        } catch {
          errBody = { error: tokenResponse.statusText };
        }
        const msg = encodeURIComponent(
          errBody.error_description || errBody.error || `Token exchange failed (HTTP ${tokenResponse.status})`
        );
        return res.redirect(`/#/connectors?oauth=error&message=${msg}`);
      }

      const tokenData = await tokenResponse.json();

      // Save tokens into connector config and mark as connected
      const updatedConfig = {
        ...config,
        access_token: tokenData.access_token,
        token_type: tokenData.token_type || "Bearer",
        ...(tokenData.refresh_token ? { refresh_token: tokenData.refresh_token } : {}),
        ...(tokenData.expires_in
          ? { expires_at: Date.now() + tokenData.expires_in * 1000 }
          : {}),
        ...(tokenData.scope ? { granted_scope: tokenData.scope } : {}),
      };

      storage.updateConnector(connectorId, {
        status: "connected",
        config: JSON.stringify(updatedConfig),
        lastSynced: Date.now(),
      });

      return res.redirect(`/#/connectors?oauth=success&connector=${encodeURIComponent(connector.name)}`);
    } catch (err: any) {
      authLogger.error({ err }, "Token exchange error");
      const msg = encodeURIComponent(err?.message || "Token exchange failed");
      return res.redirect(`/#/connectors?oauth=error&message=${msg}`);
    }
  });
}
