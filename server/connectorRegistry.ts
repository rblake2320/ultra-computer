/**
 * Connector Registry
 * ═══════════════════════════════════════════════════════════════════════════
 * Defines all built-in connectors: OAuth services, API-key services, and
 * plug-and-play MCP servers. Each connector has a type, category, and
 * optional field schema for the connect dialog.
 *
 * Connector types:
 *   - "oauth"   → OAuth2 popup flow (client_id + client_secret required)
 *   - "api_key" → API key / token entry with live validation
 *   - "mcp"     → MCP server URL + optional API key
 *
 * Field schemas drive the connect dialog UI — each field maps to an input.
 */

import { storage } from "./storage.js";
import { evaluatePolicy, writePolicyAudit } from "./policyEngine.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ConnectorType = "oauth" | "api_key" | "mcp";
export type ConnectorCategory = "productivity" | "dev" | "data" | "crm" | "ai" | "communication" | "custom";

export interface ConnectorFieldDef {
  key: string;
  label: string;
  placeholder: string;
  type: "text" | "password" | "url";
  required: boolean;
  helpUrl?: string;
}

export interface ConnectorDef {
  id: string;
  name: string;
  type: ConnectorType;
  category: ConnectorCategory;
  description: string;
  logoUrl?: string;
  // OAuth fields
  oauthAuthUrl?: string;
  oauthTokenUrl?: string;
  scopes?: string[];
  // MCP fields
  mcpServerUrl?: string;
  // Field schema for connect dialog
  fields?: ConnectorFieldDef[];
  // Validation endpoint (GET with Authorization: Bearer <key>) to test the key
  validateUrl?: string;
}

// ─── Built-in Connector Definitions ──────────────────────────────────────────

export const BUILT_IN_CONNECTORS: ConnectorDef[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // PRODUCTIVITY
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "gmail",
    name: "Gmail",
    type: "oauth",
    category: "productivity",
    description: "Read, compose, and send emails via Gmail.",
    scopes: ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.send"],
    oauthAuthUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    oauthTokenUrl: "https://oauth2.googleapis.com/token",
    fields: [
      { key: "client_id", label: "OAuth Client ID", placeholder: "your-client-id.apps.googleusercontent.com", type: "text", required: true, helpUrl: "https://console.cloud.google.com/apis/credentials" },
      { key: "client_secret", label: "OAuth Client Secret", placeholder: "GOCSPX-...", type: "password", required: true },
    ],
  },
  {
    id: "google_drive",
    name: "Google Drive",
    type: "oauth",
    category: "productivity",
    description: "Read, write, and search files in Google Drive.",
    scopes: ["https://www.googleapis.com/auth/drive.readonly", "https://www.googleapis.com/auth/drive.file"],
    oauthAuthUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    oauthTokenUrl: "https://oauth2.googleapis.com/token",
    fields: [
      { key: "client_id", label: "OAuth Client ID", placeholder: "your-client-id.apps.googleusercontent.com", type: "text", required: true, helpUrl: "https://console.cloud.google.com/apis/credentials" },
      { key: "client_secret", label: "OAuth Client Secret", placeholder: "GOCSPX-...", type: "password", required: true },
    ],
  },
  {
    id: "google_calendar",
    name: "Google Calendar",
    type: "oauth",
    category: "productivity",
    description: "Read and create calendar events.",
    scopes: ["https://www.googleapis.com/auth/calendar.readonly", "https://www.googleapis.com/auth/calendar.events"],
    oauthAuthUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    oauthTokenUrl: "https://oauth2.googleapis.com/token",
    fields: [
      { key: "client_id", label: "OAuth Client ID", placeholder: "your-client-id.apps.googleusercontent.com", type: "text", required: true, helpUrl: "https://console.cloud.google.com/apis/credentials" },
      { key: "client_secret", label: "OAuth Client Secret", placeholder: "GOCSPX-...", type: "password", required: true },
    ],
  },
  {
    id: "notion",
    name: "Notion",
    type: "oauth",
    category: "productivity",
    description: "Read and write Notion pages and databases.",
    scopes: ["read_content", "update_content", "insert_content"],
    oauthAuthUrl: "https://api.notion.com/v1/oauth/authorize",
    oauthTokenUrl: "https://api.notion.com/v1/oauth/token",
    fields: [
      { key: "client_id", label: "Notion OAuth Client ID", placeholder: "your-notion-client-id", type: "text", required: true, helpUrl: "https://www.notion.so/my-integrations" },
      { key: "client_secret", label: "Notion OAuth Client Secret", placeholder: "secret_...", type: "password", required: true },
    ],
  },
  {
    id: "onedrive",
    name: "OneDrive",
    type: "oauth",
    category: "productivity",
    description: "Access and manage files in Microsoft OneDrive.",
    scopes: ["Files.ReadWrite.All", "offline_access"],
    oauthAuthUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    oauthTokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    fields: [
      { key: "client_id", label: "Azure App Client ID", placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx", type: "text", required: true, helpUrl: "https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps" },
      { key: "client_secret", label: "Azure App Client Secret", placeholder: "your-client-secret", type: "password", required: true },
    ],
  },
  {
    id: "dropbox",
    name: "Dropbox",
    type: "oauth",
    category: "productivity",
    description: "Access and manage files in Dropbox.",
    scopes: ["files.content.read", "files.content.write", "files.metadata.read"],
    oauthAuthUrl: "https://www.dropbox.com/oauth2/authorize",
    oauthTokenUrl: "https://api.dropboxapi.com/oauth2/token",
    fields: [
      { key: "client_id", label: "Dropbox App Key", placeholder: "your-app-key", type: "text", required: true, helpUrl: "https://www.dropbox.com/developers/apps" },
      { key: "client_secret", label: "Dropbox App Secret", placeholder: "your-app-secret", type: "password", required: true },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // COMMUNICATION
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "slack",
    name: "Slack",
    type: "oauth",
    category: "communication",
    description: "Read messages, post to channels, and manage workspace.",
    scopes: ["channels:read", "chat:write", "users:read", "files:read"],
    oauthAuthUrl: "https://slack.com/oauth/v2/authorize",
    oauthTokenUrl: "https://slack.com/api/oauth.v2.access",
    fields: [
      { key: "client_id", label: "Slack App Client ID", placeholder: "1234567890.1234567890", type: "text", required: true, helpUrl: "https://api.slack.com/apps" },
      { key: "client_secret", label: "Slack App Client Secret", placeholder: "your-client-secret", type: "password", required: true },
    ],
  },
  {
    id: "discord",
    name: "Discord",
    type: "api_key",
    category: "communication",
    description: "Send messages and manage Discord servers via Bot token.",
    fields: [
      { key: "apiKey", label: "Bot Token", placeholder: "MTxxxxxxxxxxxxxxxxxxxxxxxx.xxxxxx.xxxxxxxxxxxxxxxxxxxxxxxxxxx", type: "password", required: true, helpUrl: "https://discord.com/developers/applications" },
    ],
    validateUrl: "https://discord.com/api/v10/users/@me",
  },
  {
    id: "telegram",
    name: "Telegram",
    type: "api_key",
    category: "communication",
    description: "Send and receive Telegram messages via Bot API.",
    fields: [
      { key: "apiKey", label: "Bot Token", placeholder: "1234567890:ABCdefGHIjklMNOpqrsTUVwxyz", type: "password", required: true, helpUrl: "https://t.me/BotFather" },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // DEVELOPER TOOLS
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "github",
    name: "GitHub",
    type: "api_key",
    category: "dev",
    description: "Access repositories, issues, PRs, and code via Personal Access Token.",
    fields: [
      { key: "apiKey", label: "Personal Access Token", placeholder: "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", type: "password", required: true, helpUrl: "https://github.com/settings/tokens/new" },
    ],
    validateUrl: "https://api.github.com/user",
  },
  {
    id: "jira",
    name: "Jira",
    type: "api_key",
    category: "dev",
    description: "Manage issues, sprints, and projects in Jira.",
    fields: [
      { key: "apiKey", label: "API Token", placeholder: "your-jira-api-token", type: "password", required: true, helpUrl: "https://id.atlassian.com/manage-profile/security/api-tokens" },
      { key: "email", label: "Atlassian Email", placeholder: "you@example.com", type: "text", required: true },
      { key: "baseUrl", label: "Jira Base URL", placeholder: "https://yourorg.atlassian.net", type: "url", required: true },
    ],
  },
  {
    id: "linear",
    name: "Linear",
    type: "api_key",
    category: "dev",
    description: "Access Linear issues, cycles, and projects.",
    fields: [
      { key: "apiKey", label: "API Key", placeholder: "lin_api_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", type: "password", required: true, helpUrl: "https://linear.app/settings/api" },
    ],
    validateUrl: "https://api.linear.app/graphql",
  },
  {
    id: "confluence",
    name: "Confluence",
    type: "api_key",
    category: "dev",
    description: "Read and write Confluence pages and spaces.",
    fields: [
      { key: "apiKey", label: "API Token", placeholder: "your-confluence-api-token", type: "password", required: true, helpUrl: "https://id.atlassian.com/manage-profile/security/api-tokens" },
      { key: "email", label: "Atlassian Email", placeholder: "you@example.com", type: "text", required: true },
      { key: "baseUrl", label: "Confluence Base URL", placeholder: "https://yourorg.atlassian.net/wiki", type: "url", required: true },
    ],
  },
  {
    id: "vercel",
    name: "Vercel",
    type: "api_key",
    category: "dev",
    description: "Manage Vercel projects, deployments, and domains.",
    fields: [
      { key: "apiKey", label: "Access Token", placeholder: "your-vercel-token", type: "password", required: true, helpUrl: "https://vercel.com/account/tokens" },
    ],
    validateUrl: "https://api.vercel.com/v2/user",
  },
  {
    id: "sentry",
    name: "Sentry",
    type: "api_key",
    category: "dev",
    description: "Monitor errors, performance, and issues across your applications.",
    fields: [
      { key: "apiKey", label: "Auth Token", placeholder: "your-sentry-auth-token", type: "password", required: true, helpUrl: "https://sentry.io/settings/account/api/auth-tokens/" },
      { key: "org", label: "Organization Slug", placeholder: "your-org", type: "text", required: true },
    ],
    validateUrl: "https://sentry.io/api/0/",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // DATA & ANALYTICS
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "postgresql",
    name: "PostgreSQL",
    type: "api_key",
    category: "data",
    description: "Query and manage a PostgreSQL database.",
    fields: [
      { key: "apiKey", label: "Connection String", placeholder: "postgresql://user:password@host:5432/dbname", type: "password", required: true },
    ],
  },
  {
    id: "supabase",
    name: "Supabase",
    type: "api_key",
    category: "data",
    description: "Access Supabase database, auth, storage, and realtime.",
    fields: [
      { key: "apiKey", label: "Service Role Key", placeholder: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...", type: "password", required: true, helpUrl: "https://app.supabase.com/project/_/settings/api" },
      { key: "baseUrl", label: "Project URL", placeholder: "https://xxxxxxxxxxxxxxxxxxxx.supabase.co", type: "url", required: true },
    ],
  },
  {
    id: "snowflake",
    name: "Snowflake",
    type: "api_key",
    category: "data",
    description: "Run queries against Snowflake data warehouse.",
    fields: [
      { key: "apiKey", label: "Password / Private Key", placeholder: "your-snowflake-password", type: "password", required: true },
      { key: "account", label: "Account Identifier", placeholder: "orgname-accountname", type: "text", required: true },
      { key: "username", label: "Username", placeholder: "your-username", type: "text", required: true },
      { key: "warehouse", label: "Warehouse", placeholder: "COMPUTE_WH", type: "text", required: false },
    ],
  },
  {
    id: "stripe",
    name: "Stripe",
    type: "api_key",
    category: "data",
    description: "Manage payments, subscriptions, customers, and invoices.",
    fields: [
      { key: "apiKey", label: "Secret Key", placeholder: "sk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxx", type: "password", required: true, helpUrl: "https://dashboard.stripe.com/apikeys" },
    ],
    validateUrl: "https://api.stripe.com/v1/balance",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CRM & SALES
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "hubspot",
    name: "HubSpot",
    type: "oauth",
    category: "crm",
    description: "Access contacts, deals, companies, and pipeline data.",
    oauthAuthUrl: "https://app.hubspot.com/oauth/authorize",
    oauthTokenUrl: "https://api.hubapi.com/oauth/v1/token",
    scopes: ["crm.objects.contacts.read", "crm.objects.deals.read", "crm.objects.companies.read"],
    fields: [
      { key: "client_id", label: "HubSpot App Client ID", placeholder: "your-client-id", type: "text", required: true, helpUrl: "https://developers.hubspot.com/docs/api/creating-an-app" },
      { key: "client_secret", label: "HubSpot App Client Secret", placeholder: "your-client-secret", type: "password", required: true },
    ],
  },
  {
    id: "salesforce",
    name: "Salesforce",
    type: "oauth",
    category: "crm",
    description: "Access Salesforce CRM data, leads, opportunities, and reports.",
    oauthAuthUrl: "https://login.salesforce.com/services/oauth2/authorize",
    oauthTokenUrl: "https://login.salesforce.com/services/oauth2/token",
    scopes: ["api", "refresh_token"],
    fields: [
      { key: "client_id", label: "Connected App Consumer Key", placeholder: "your-consumer-key", type: "text", required: true, helpUrl: "https://help.salesforce.com/s/articleView?id=sf.connected_app_create.htm" },
      { key: "client_secret", label: "Connected App Consumer Secret", placeholder: "your-consumer-secret", type: "password", required: true },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // AI & MCP SERVERS (Plug-and-Play — works with Scout's 10M token context)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "mcp_stripe",
    name: "Stripe MCP",
    type: "mcp",
    category: "ai",
    description: "Plug-and-play Stripe MCP server — payments, subscriptions, customers, invoices.",
    mcpServerUrl: "https://mcp.stripe.com",
    fields: [
      { key: "apiKey", label: "Stripe Secret Key", placeholder: "sk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxx", type: "password", required: true, helpUrl: "https://dashboard.stripe.com/apikeys" },
    ],
  },
  {
    id: "mcp_supabase",
    name: "Supabase MCP",
    type: "mcp",
    category: "ai",
    description: "Plug-and-play Supabase MCP server — database, auth, storage, realtime.",
    mcpServerUrl: "https://mcp.supabase.com",
    fields: [
      { key: "apiKey", label: "Supabase Service Role Key", placeholder: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...", type: "password", required: true, helpUrl: "https://app.supabase.com/project/_/settings/api" },
      { key: "baseUrl", label: "Supabase Project URL", placeholder: "https://xxxx.supabase.co", type: "url", required: true },
    ],
  },
  {
    id: "mcp_linear",
    name: "Linear MCP",
    type: "mcp",
    category: "ai",
    description: "Plug-and-play Linear MCP server — issues, projects, cycles, comments.",
    mcpServerUrl: "https://mcp.linear.app/sse",
    fields: [
      { key: "apiKey", label: "Linear API Key", placeholder: "lin_api_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", type: "password", required: true, helpUrl: "https://linear.app/settings/api" },
    ],
  },
  {
    id: "mcp_sentry",
    name: "Sentry MCP",
    type: "mcp",
    category: "ai",
    description: "Plug-and-play Sentry MCP server — error monitoring, stack traces, performance.",
    mcpServerUrl: "https://mcp.sentry.io/sse",
    fields: [
      { key: "apiKey", label: "Sentry Auth Token", placeholder: "your-sentry-auth-token", type: "password", required: true, helpUrl: "https://sentry.io/settings/account/api/auth-tokens/" },
    ],
  },
  {
    id: "mcp_vercel",
    name: "Vercel MCP",
    type: "mcp",
    category: "ai",
    description: "Plug-and-play Vercel MCP server — deployments, projects, domains, logs.",
    mcpServerUrl: "https://mcp.vercel.com/sse",
    fields: [
      { key: "apiKey", label: "Vercel Access Token", placeholder: "your-vercel-token", type: "password", required: true, helpUrl: "https://vercel.com/account/tokens" },
    ],
  },
  {
    id: "mcp_firecrawl",
    name: "Firecrawl MCP",
    type: "mcp",
    category: "ai",
    description: "Plug-and-play Firecrawl MCP server — web scraping, crawling, and search.",
    mcpServerUrl: "https://mcp.firecrawl.dev/sse",
    fields: [
      { key: "apiKey", label: "Firecrawl API Key", placeholder: "fc-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", type: "password", required: true, helpUrl: "https://www.firecrawl.dev/app/api-keys" },
    ],
  },
  {
    id: "mcp_cloudflare",
    name: "Cloudflare MCP",
    type: "mcp",
    category: "ai",
    description: "Plug-and-play Cloudflare MCP — D1 databases, R2 storage, KV, Workers.",
    mcpServerUrl: "https://mcp.cloudflare.com/sse",
    fields: [
      { key: "apiKey", label: "Cloudflare API Token", placeholder: "your-cloudflare-api-token", type: "password", required: true, helpUrl: "https://dash.cloudflare.com/profile/api-tokens" },
    ],
  },
  {
    id: "mcp_prisma",
    name: "Prisma Postgres MCP",
    type: "mcp",
    category: "ai",
    description: "Plug-and-play Prisma Postgres MCP — database management, backups, SQL queries.",
    fields: [
      { key: "apiKey", label: "Prisma API Key", placeholder: "your-prisma-api-key", type: "password", required: true, helpUrl: "https://console.prisma.io/" },
      { key: "serverUrl", label: "MCP Server URL", placeholder: "https://your-prisma-mcp.example.com", type: "url", required: true },
    ],
  },
  {
    id: "mcp_heygen",
    name: "HeyGen MCP",
    type: "mcp",
    category: "ai",
    description: "Plug-and-play HeyGen MCP — AI avatar video generation.",
    fields: [
      { key: "apiKey", label: "HeyGen API Key", placeholder: "your-heygen-api-key", type: "password", required: true, helpUrl: "https://app.heygen.com/settings?nav=API" },
      { key: "serverUrl", label: "MCP Server URL", placeholder: "https://your-heygen-mcp.example.com", type: "url", required: true },
    ],
  },
  {
    id: "mcp_playwright",
    name: "Playwright MCP",
    type: "mcp",
    category: "ai",
    description: "Plug-and-play Playwright MCP — browser automation, web testing, scraping.",
    fields: [
      { key: "serverUrl", label: "MCP Server URL", placeholder: "http://localhost:3000", type: "url", required: true },
    ],
  },
  {
    id: "mcp_huggingface",
    name: "Hugging Face MCP",
    type: "mcp",
    category: "ai",
    description: "Plug-and-play Hugging Face MCP — model discovery, datasets, papers.",
    fields: [
      { key: "apiKey", label: "HF Token", placeholder: "hf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", type: "password", required: true, helpUrl: "https://huggingface.co/settings/tokens" },
      { key: "serverUrl", label: "MCP Server URL", placeholder: "https://your-hf-mcp.example.com", type: "url", required: true },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CUSTOM MCP
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "mcp_custom",
    name: "Custom MCP Server",
    type: "mcp",
    category: "custom",
    description: "Connect any tool with an MCP-compatible server URL.",
    fields: [
      { key: "serverUrl", label: "MCP Server URL", placeholder: "https://your-mcp-server.com", type: "url", required: true },
      { key: "apiKey", label: "API Key / Token (optional)", placeholder: "Bearer token or API key", type: "password", required: false },
    ],
  },
];

// ─── Seed built-in connectors ─────────────────────────────────────────────────

export function seedConnectors() {
  const existing = storage.getConnectors();
  const existingIds = new Set(existing.map(c => c.id));
  for (const def of BUILT_IN_CONNECTORS) {
    if (!existingIds.has(def.id)) {
      storage.createConnector({
        id: def.id,
        name: def.name,
        type: def.type,
        category: def.category,
        logoUrl: def.logoUrl || null,
        description: def.description,
        status: "disconnected",
        config: "{}",
        mcpServerUrl: def.mcpServerUrl || null,
        scopes: JSON.stringify(def.scopes || []),
      });
    }
  }
}

// ─── Get connector definition ─────────────────────────────────────────────────

export function getConnectorDef(id: string): ConnectorDef | undefined {
  return BUILT_IN_CONNECTORS.find(d => d.id === id);
}

// ─── Connect a connector (save API key or OAuth token) ────────────────────────

export function connectWithApiKey(
  connectorId: string,
  apiKey: string,
  extraConfig?: Record<string, string>,
) {
  const config = JSON.stringify({ apiKey, ...(extraConfig || {}) });
  return storage.updateConnector(connectorId, {
    status: "connected",
    config,
    lastSynced: Date.now(),
  });
}

// ─── Validate a connector's API key by hitting its validateUrl ────────────────

export async function validateConnectorKey(
  connectorId: string,
  apiKey: string,
): Promise<{ valid: boolean; error?: string }> {
  const def = getConnectorDef(connectorId);
  if (!def?.validateUrl) {
    // No validation URL — accept as-is (can't verify without calling the API)
    return { valid: true };
  }
  const networkContext = { domain: "network" as const, action: "network:connector_validate", tool: "connector.validate", connectorId, url: def.validateUrl, method: connectorId === "linear" ? "POST" : "GET" };
  const networkDecision = evaluatePolicy(networkContext);
  writePolicyAudit(networkContext, networkDecision);
  if (!networkDecision.allowed) {
    return { valid: false, error: `Policy denied: ${networkDecision.reason}` };
  }
  if (connectorId === "github") {
    const githubContext = { domain: "github" as const, action: "github:validate", tool: "connector.validate", connectorId, toolName: "validate" };
    const githubDecision = evaluatePolicy(githubContext);
    writePolicyAudit(githubContext, githubDecision);
    if (!githubDecision.allowed) {
      return { valid: false, error: `Policy denied: ${githubDecision.reason}` };
    }
  }
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    // Provider-specific auth header formats
    if (connectorId === "github") {
      headers["Authorization"] = `token ${apiKey}`;
    } else if (connectorId === "stripe") {
      headers["Authorization"] = `Basic ${Buffer.from(apiKey + ":").toString("base64")}`;
    } else if (connectorId === "linear") {
      headers["Authorization"] = apiKey;
    } else {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(def.validateUrl, {
      method: connectorId === "linear" ? "POST" : "GET",
      headers,
      signal: controller.signal,
      body: connectorId === "linear" ? JSON.stringify({ query: "{ viewer { id } }" }) : undefined,
    });
    clearTimeout(timeout);
    if (res.status === 401 || res.status === 403) {
      return { valid: false, error: "Invalid API key or insufficient permissions" };
    }
    if (res.status >= 500) {
      return { valid: false, error: `Provider returned ${res.status} — try again later` };
    }
    return { valid: true };
  } catch (err: any) {
    if (err.name === "AbortError") {
      return { valid: false, error: "Connection timed out — check the API key and try again" };
    }
    return { valid: false, error: err.message || "Validation failed" };
  }
}

// ─── MCP Tool Caller ──────────────────────────────────────────────────────────

// Tool name allowlist pattern: alphanumeric, underscores, hyphens, dots only
const SAFE_TOOL_NAME = /^[a-zA-Z0-9_\-\.]{1,128}$/;

export async function callMCPTool(
  connectorId: string,
  toolName: string,
  args: Record<string, any>,
): Promise<any> {
  // Security: validate tool name against allowlist pattern
  if (!SAFE_TOOL_NAME.test(toolName)) {
    throw new Error(`Invalid tool name: '${toolName}'. Tool names must match [a-zA-Z0-9_\\-\\.]{1,128}`);
  }
  if (connectorId === "github") {
    const githubContext = { domain: "github" as const, action: "github:tool", tool: "mcp.tool", connectorId, toolName, metadata: args };
    const githubDecision = evaluatePolicy(githubContext);
    writePolicyAudit(githubContext, githubDecision);
    if (!githubDecision.allowed) {
      throw new Error(`Policy denied: ${githubDecision.reason}`);
    }
  }

  const connector = storage.getConnector(connectorId);
  if (!connector) throw new Error(`Connector ${connectorId} not found`);
  if (connector.status !== "connected") {
    throw new Error(`Connector ${connectorId} is not connected. Please connect it first.`);
  }

  let config: Record<string, any> = {};
  try {
    config = JSON.parse(connector.config || "{}");
  } catch {
    config = {};
  }

  const serverUrl = connector.mcpServerUrl || config.serverUrl;
  if (!serverUrl) throw new Error("No MCP server URL configured for this connector");

  // Security: only allow http/https URLs
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(serverUrl);
  } catch {
    throw new Error("Invalid MCP server URL");
  }
  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error("MCP server URL must use http or https");
  }
  const networkContext = { domain: "network" as const, action: "network:mcp_call", tool: "mcp.tool", connectorId, toolName, url: serverUrl, method: "POST", metadata: args };
  const networkDecision = evaluatePolicy(networkContext);
  writePolicyAudit(networkContext, networkDecision);
  if (!networkDecision.allowed) {
    throw new Error(`Policy denied: ${networkDecision.reason}`);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch(`${serverUrl}/tools/${toolName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify(args),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!response.ok) {
      throw new Error(`MCP call failed: ${response.status} ${response.statusText}`);
    }
    return response.json();
  } catch (err: any) {
    clearTimeout(timeout);
    if (err.name === "AbortError") throw new Error("MCP tool call timed out after 30s");
    throw err;
  }
}
