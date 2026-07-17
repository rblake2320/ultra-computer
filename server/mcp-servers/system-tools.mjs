#!/usr/bin/env node
/**
 * System Tools MCP Server
 * Provides environment, process, and filesystem access beyond the sandbox.
 *
 * Runs on port 5011 — connect via: POST /api/protocols/mcp/servers/connect
 *   { "url": "http://localhost:5011/mcp", "name": "System Tools", "transport": "streamable-http" }
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";

const execAsync = promisify(exec);
const PORT = parseInt(process.env.PORT || "5011", 10);

const TOOLS = [
  {
    name: "env_get",
    description: "Read an environment variable value. Returns the value or 'not set'.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Environment variable name (e.g. PATH, HOME, OLLAMA_HOST)" },
      },
      required: ["name"],
    },
  },
  {
    name: "env_list",
    description: "List all environment variables matching a pattern (case-insensitive).",
    inputSchema: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Filter pattern (case-insensitive substring match). Leave empty for all." },
      },
      required: [],
    },
  },
  {
    name: "system_info",
    description: "Get system information: OS, CPU, RAM, GPU, hostname, uptime.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "process_list",
    description: "List running processes, optionally filtered by name.",
    inputSchema: {
      type: "object",
      properties: {
        filter: { type: "string", description: "Filter by process name (substring match)" },
      },
      required: [],
    },
  },
  {
    name: "fs_read",
    description: "Read a file from anywhere on the filesystem (not just sandbox). Use for config files, logs, etc.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Absolute or relative file path" },
        encoding: { type: "string", description: "Encoding (default: utf-8)" },
        lines: { type: "string", description: "Max lines to return (default: 200)" },
      },
      required: ["path"],
    },
  },
  {
    name: "fs_list",
    description: "List files and directories at a path. Shows name, size, and type.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Directory path to list" },
      },
      required: ["path"],
    },
  },
  {
    name: "fs_find",
    description: "Find files matching a glob pattern in a directory tree.",
    inputSchema: {
      type: "object",
      properties: {
        directory: { type: "string", description: "Root directory to search" },
        pattern: { type: "string", description: "Filename pattern (e.g. *.py, *.log)" },
        maxResults: { type: "string", description: "Maximum results (default: 50)" },
      },
      required: ["directory", "pattern"],
    },
  },
  {
    name: "network_ports",
    description: "List active network listeners (open ports) on this machine.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "docker_ps",
    description: "List running Docker containers with their status, ports, and names.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "ollama_models",
    description: "List locally available Ollama models with sizes and last modified dates.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
];

async function executeTool(name, args) {
  switch (name) {
    case "env_get":
      return process.env[args.name] || `(not set)`;

    case "env_list": {
      const pattern = (args.pattern || "").toLowerCase();
      const entries = Object.entries(process.env)
        .filter(([k]) => !pattern || k.toLowerCase().includes(pattern))
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(0, 100);
      return entries.map(([k, v]) => `${k}=${v?.slice(0, 200) || ""}`).join("\n") || "No matches.";
    }

    case "system_info": {
      const cpus = os.cpus();
      let gpu = "unknown";
      try {
        const { stdout } = await execAsync("nvidia-smi --query-gpu=name,memory.total --format=csv,noheader", { timeout: 5000 });
        gpu = stdout.trim();
      } catch { /* no nvidia-smi */ }
      return [
        `OS: ${os.type()} ${os.release()} (${os.arch()})`,
        `Hostname: ${os.hostname()}`,
        `CPU: ${cpus[0]?.model || "?"} (${cpus.length} cores)`,
        `RAM: ${(os.totalmem() / 1e9).toFixed(1)} GB total, ${(os.freemem() / 1e9).toFixed(1)} GB free`,
        `GPU: ${gpu}`,
        `Uptime: ${(os.uptime() / 3600).toFixed(1)} hours`,
        `Node.js: ${process.version}`,
      ].join("\n");
    }

    case "process_list": {
      const cmd = process.platform === "win32"
        ? "tasklist /fo csv /nh"
        : "ps aux --sort=-%mem | head -30";
      const { stdout } = await execAsync(cmd, { timeout: 10000 });
      if (args.filter) {
        const filter = args.filter.toLowerCase();
        return stdout.split("\n").filter((l) => l.toLowerCase().includes(filter)).slice(0, 30).join("\n") || "No matching processes.";
      }
      return stdout.slice(0, 5000);
    }

    case "fs_read": {
      const maxLines = parseInt(args.lines || "200", 10);
      const content = fs.readFileSync(args.path, args.encoding || "utf-8");
      const lines = content.split("\n");
      if (lines.length > maxLines) {
        return lines.slice(0, maxLines).join("\n") + `\n\n... (${lines.length - maxLines} more lines)`;
      }
      return content;
    }

    case "fs_list": {
      const entries = fs.readdirSync(args.path, { withFileTypes: true });
      return entries.map((e) => {
        try {
          const stat = fs.statSync(path.join(args.path, e.name));
          const size = e.isDirectory() ? "DIR" : `${(stat.size / 1024).toFixed(1)}KB`;
          return `${e.isDirectory() ? "📁" : "📄"} ${e.name}  (${size})`;
        } catch { return `❌ ${e.name}  (access denied)`; }
      }).join("\n") || "Empty directory.";
    }

    case "fs_find": {
      const maxResults = parseInt(args.maxResults || "50", 10);
      // Use simple recursive search
      const results = [];
      function walk(dir, depth = 0) {
        if (depth > 5 || results.length >= maxResults) return;
        try {
          for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              walk(full, depth + 1);
            } else if (matchGlob(entry.name, args.pattern)) {
              results.push(full);
            }
          }
        } catch { /* skip inaccessible dirs */ }
      }
      walk(args.directory);
      return results.join("\n") || "No files found.";
    }

    case "network_ports": {
      const cmd = process.platform === "win32"
        ? "netstat -an | findstr LISTENING"
        : "ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null";
      const { stdout } = await execAsync(cmd, { timeout: 10000 });
      return stdout.slice(0, 5000);
    }

    case "docker_ps": {
      try {
        const { stdout } = await execAsync("docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'", { timeout: 10000 });
        return stdout || "No running containers.";
      } catch (e) {
        return `Docker not available: ${e.message}`;
      }
    }

    case "ollama_models": {
      try {
        const { stdout } = await execAsync("ollama list", { timeout: 10000 });
        return stdout || "No Ollama models found.";
      } catch (e) {
        return `Ollama not available: ${e.message}`;
      }
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function matchGlob(filename, pattern) {
  if (typeof pattern !== "string" || pattern.length > 200) {
    throw new Error("Glob pattern must contain at most 200 characters");
  }
  let previous = new Array(filename.length + 1).fill(false);
  previous[0] = true;
  for (const token of pattern) {
    const current = new Array(filename.length + 1).fill(false);
    if (token === "*") current[0] = previous[0];
    for (let index = 1; index <= filename.length; index += 1) {
      current[index] = token === "*"
        ? current[index - 1] || previous[index]
        : previous[index - 1]
          && (token === "?" || token.toLowerCase() === filename[index - 1].toLowerCase());
    }
    previous = current;
  }
  return previous[filename.length];
}

// ─── MCP HTTP Server ─────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
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

  if (rpcReq.method === "initialize") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({
      jsonrpc: "2.0", id: rpcReq.id,
      result: {
        protocolVersion: "2025-03-26",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "system-tools", version: "1.0.0" },
      },
    }));
    return;
  }
  if (rpcReq.method === "notifications/initialized") { res.writeHead(204); res.end(); return; }
  if (rpcReq.method === "ping") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ jsonrpc: "2.0", id: rpcReq.id, result: {} }));
    return;
  }
  if (rpcReq.method === "tools/list") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ jsonrpc: "2.0", id: rpcReq.id, result: { tools: TOOLS } }));
    return;
  }
  if (rpcReq.method === "tools/call") {
    try {
      const output = await executeTool(rpcReq.params.name, rpcReq.params.arguments || {});
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        jsonrpc: "2.0", id: rpcReq.id,
        result: { content: [{ type: "text", text: output }] },
      }));
    } catch (err) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        jsonrpc: "2.0", id: rpcReq.id,
        result: { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true },
      }));
    }
    return;
  }

  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ jsonrpc: "2.0", id: rpcReq.id, error: { code: -32601, message: `Unknown method: ${rpcReq.method}` } }));
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[System Tools MCP] Running on http://localhost:${PORT}/mcp`);
  console.log(`[System Tools MCP] Tools: ${TOOLS.map((t) => t.name).join(", ")}`);
});
