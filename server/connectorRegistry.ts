/**
 * Connector Registry — Integration Layer
 * 10+ prebuilt connectors (productivity, dev, data, CRM)
 * MCP adapter support for any MCP-compatible server
 * OAuth scaffold (tokens stored server-side, never in agent sandbox)
 */

import { v4 as uuidv4 } from "uuid";
import { storage } from "./storage.js";

export interface ConnectorDefinition {
  id: string;
  name: string;
  type: "oauth" | "api_key" | "mcp" | "open";
  category: "productivity" | "dev" | "data" | "crm" | "custom";
  description: string;
  logoUrl?: string;
  scopes?: string[];
  oauthAuthUrl?: string;
  oauthTokenUrl?: string;
  mcpServerUrl?: string;
}

// ─── 10+ built-in connector definitions ──────────────────────────────────────
export const BUILT_IN_CONNECTORS: ConnectorDefinition[] = [
  // Productivity
  {
    id: "gmail",
    name: "Gmail",
    type: "oauth",
    category: "productivity",
    description: "Read, compose, and send emails via Gmail.",
    logoUrl: "https://www.gstatic.com/images/branding/product/2x/gmail_512dp.png",
    scopes: ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.send"],
    oauthAuthUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    oauthTokenUrl: "https://oauth2.googleapis.com/token",
  },
  {
    id: "google_calendar",
    name: "Google Calendar",
    type: "oauth",
    category: "productivity",
    description: "Read and create calendar events.",
    logoUrl: "https://www.gstatic.com/images/branding/product/2x/calendar_512dp.png",
    scopes: ["https://www.googleapis.com/auth/calendar"],
    oauthAuthUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    oauthTokenUrl: "https://oauth2.googleapis.com/token",
  },
  {
    id: "google_drive",
    name: "Google Drive",
    type: "oauth",
    category: "productivity",
    description: "Read, write, and manage files in Google Drive.",
    logoUrl: "https://www.gstatic.com/images/branding/product/2x/drive_512dp.png",
    scopes: ["https://www.googleapis.com/auth/drive"],
    oauthAuthUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    oauthTokenUrl: "https://oauth2.googleapis.com/token",
  },
  {
    id: "slack",
    name: "Slack",
    type: "oauth",
    category: "productivity",
    description: "Read messages, post to channels, and manage workspace.",
    scopes: ["channels:read", "chat:write", "users:read"],
    oauthAuthUrl: "https://slack.com/oauth/v2/authorize",
    oauthTokenUrl: "https://slack.com/api/oauth.v2.access",
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
  },
  {
    id: "onedrive",
    name: "OneDrive",
    type: "oauth",
    category: "productivity",
    description: "Access and manage files in Microsoft OneDrive.",
    scopes: ["Files.ReadWrite.All"],
    oauthAuthUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    oauthTokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
  },
  // Dev Tools
  {
    id: "github",
    name: "GitHub",
    type: "api_key",
    category: "dev",
    description: "Access repositories, issues, PRs, and code.",
  },
  {
    id: "jira",
    name: "Jira",
    type: "api_key",
    category: "dev",
    description: "Manage issues, sprints, and projects in Jira.",
  },
  {
    id: "linear",
    name: "Linear",
    type: "api_key",
    category: "dev",
    description: "Access Linear issues, cycles, and projects.",
  },
  {
    id: "confluence",
    name: "Confluence",
    type: "api_key",
    category: "dev",
    description: "Read and write Confluence pages and spaces.",
  },
  // Data
  {
    id: "postgresql",
    name: "PostgreSQL",
    type: "api_key",
    category: "data",
    description: "Query and manage a PostgreSQL database.",
  },
  {
    id: "snowflake",
    name: "Snowflake",
    type: "api_key",
    category: "data",
    description: "Run queries against Snowflake data warehouse.",
  },
  // CRM
  {
    id: "hubspot",
    name: "HubSpot",
    type: "oauth",
    category: "crm",
    description: "Access contacts, deals, and pipeline data.",
    oauthAuthUrl: "https://app.hubspot.com/oauth/authorize",
    oauthTokenUrl: "https://api.hubapi.com/oauth/v1/token",
  },
  // Custom MCP
  {
    id: "mcp_custom",
    name: "Custom MCP Server",
    type: "mcp",
    category: "custom",
    description: "Connect any tool with an MCP-compatible server URL.",
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
        logoUrl: def.logoUrl,
        description: def.description,
        status: "disconnected",
        config: "{}",
        mcpServerUrl: def.mcpServerUrl,
        scopes: JSON.stringify(def.scopes || []),
      });
    }
  }
}

// ─── Connect a connector (save API key or OAuth token) ────────────────────────
export function connectWithApiKey(connectorId: string, apiKey: string, extraConfig?: Record<string, string>) {
  const config = JSON.stringify({ apiKey, ...(extraConfig || {}) });
  return storage.updateConnector(connectorId, {
    status: "connected",
    config,
    lastSynced: Date.now(),
  });
}

// ─── MCP Tool Caller ──────────────────────────────────────────────────────────
export async function callMCPTool(connectorId: string, toolName: string, args: Record<string, any>): Promise<any> {
  const connector = storage.getConnector(connectorId);
  if (!connector) throw new Error(`Connector ${connectorId} not found`);
  if (connector.status !== "connected") throw new Error(`Connector ${connectorId} is not connected`);

  let config: Record<string, any> = {};
  try {
    config = JSON.parse(connector.config || "{}");
  } catch {
    config = {};
  }
  const serverUrl = connector.mcpServerUrl || config.serverUrl;
  if (!serverUrl) throw new Error("No MCP server URL configured");

  const response = await fetch(`${serverUrl}/tools/${toolName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
    },
    body: JSON.stringify(args),
  });

  if (!response.ok) throw new Error(`MCP call failed: ${response.status} ${response.statusText}`);
  return response.json();
}
