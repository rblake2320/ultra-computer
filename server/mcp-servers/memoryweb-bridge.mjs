#!/usr/bin/env node
/**
 * MemoryWeb MCP Bridge Server
 * Exposes MemoryWeb (localhost:8100) as a Streamable HTTP MCP server
 * so Ultra Computer's brain can search, create, and manage memories.
 *
 * Runs on port 5010 — connect via: POST /api/protocols/mcp/servers/connect
 *   { "url": "http://localhost:5010/mcp", "name": "MemoryWeb", "transport": "streamable-http" }
 */

import http from "node:http";

const MW_BASE = process.env.MEMORYWEB_URL || "http://localhost:8100";
const PORT = parseInt(process.env.PORT || "5010", 10);

// ─── MCP Tool Definitions ───────────────────────────────────────────────────

const TOOLS = [
  {
    name: "memory_search",
    description: "Search memories using natural language. Uses 3-tier search: SQL → fuzzy → semantic vector.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Natural language search query" },
        k: { type: "string", description: "Number of results (default: 5)" },
      },
      required: ["query"],
    },
  },
  {
    name: "memory_create",
    description: "Create a new memory entry. Use for saving important facts, decisions, or context.",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string", description: "The memory content to save" },
        source: { type: "string", description: "Source identifier (default: ultra-computer)" },
        tags: { type: "string", description: "Comma-separated tags" },
      },
      required: ["content"],
    },
  },
  {
    name: "memory_stats",
    description: "Get MemoryWeb statistics: total memories, embedding coverage, health status.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "memory_recent",
    description: "Get the most recently added or updated memories.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "string", description: "Number of recent memories (default: 10)" },
      },
      required: [],
    },
  },
];

// ─── Tool Executors ─────────────────────────────────────────────────────────

async function mwFetch(path, opts = {}) {
  const url = `${MW_BASE}${path}`;
  const res = await fetch(url, {
    headers: { "content-type": "application/json" },
    ...opts,
  });
  if (!res.ok) throw new Error(`MemoryWeb ${res.status}: ${await res.text()}`);
  return res.json();
}

async function executeTool(name, args) {
  switch (name) {
    case "memory_search": {
      const data = await mwFetch("/api/search", {
        method: "POST",
        body: JSON.stringify({ query: args.query, k: parseInt(args.k || "5", 10) }),
      });
      const results = data.results || data;
      if (Array.isArray(results) && results.length === 0) return "No memories found.";
      return Array.isArray(results)
        ? results.map((r, i) => `${i + 1}. [score: ${r.score?.toFixed(3) || "?"}] ${r.content?.slice(0, 300) || r.text?.slice(0, 300) || JSON.stringify(r)}`).join("\n\n")
        : JSON.stringify(results, null, 2);
    }

    case "memory_create": {
      const data = await mwFetch("/api/memories", {
        method: "POST",
        body: JSON.stringify({
          content: args.content,
          source: args.source || "ultra-computer",
          tags: args.tags ? args.tags.split(",").map((t) => t.trim()) : ["ultra-computer"],
        }),
      });
      return `Memory created: id=${data.id || "ok"}`;
    }

    case "memory_stats": {
      const health = await mwFetch("/api/health");
      let stats = {};
      try { stats = await mwFetch("/api/stats"); } catch { /* stats endpoint may not exist */ }
      return JSON.stringify({ health, stats }, null, 2);
    }

    case "memory_recent": {
      const limit = parseInt(args.limit || "10", 10);
      const data = await mwFetch(`/api/memories?limit=${limit}&sort=created_at&order=desc`);
      const items = Array.isArray(data) ? data : data.memories || [];
      return items.map((m, i) => `${i + 1}. [${m.source || "?"}] ${m.content?.slice(0, 200) || "?"}`).join("\n\n") || "No memories.";
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ─── MCP JSON-RPC Handler ───────────────────────────────────────────────────

let requestCounter = 0;

function handleRPC(req) {
  const { method, params, id } = req;

  switch (method) {
    case "initialize":
      return {
        jsonrpc: "2.0", id,
        result: {
          protocolVersion: "2025-03-26",
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "memoryweb-bridge", version: "1.0.0" },
        },
      };

    case "notifications/initialized":
      return null; // notification, no response

    case "ping":
      return { jsonrpc: "2.0", id, result: {} };

    case "tools/list":
      return { jsonrpc: "2.0", id, result: { tools: TOOLS } };

    case "tools/call":
      return null; // handled async

    default:
      return { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } };
  }
}

// ─── HTTP Server (Streamable HTTP Transport) ─────────────────────────────────

const server = http.createServer(async (req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type, authorization");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  if (req.method !== "POST" || req.url !== "/mcp") {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "POST /mcp only" }));
    return;
  }

  let body = "";
  for await (const chunk of req) body += chunk;

  let rpcReq;
  try { rpcReq = JSON.parse(body); } catch {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32700, message: "Parse error" } }));
    return;
  }

  // Handle tools/call async
  if (rpcReq.method === "tools/call") {
    try {
      const output = await executeTool(rpcReq.params.name, rpcReq.params.arguments || {});
      const response = {
        jsonrpc: "2.0",
        id: rpcReq.id,
        result: { content: [{ type: "text", text: output }] },
      };
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(response));
    } catch (err) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        jsonrpc: "2.0",
        id: rpcReq.id,
        result: { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true },
      }));
    }
    return;
  }

  const response = handleRPC(rpcReq);
  if (!response) {
    res.writeHead(204); res.end(); return;
  }
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(response));
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[MemoryWeb MCP Bridge] Running on http://localhost:${PORT}/mcp`);
  console.log(`[MemoryWeb MCP Bridge] Backend: ${MW_BASE}`);
});
