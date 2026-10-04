import fs from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";
import { root, data, loadConfig } from "./private-runtime.mjs";
import { verifyReleasePayload } from "./verify-private-release.mjs";

const config = loadConfig(), base = `http://127.0.0.1:${config.httpPort}`;
const receipt = { checkedAt: new Date().toISOString(), sourceCommit: fs.existsSync(path.join(root, "release-manifest.json")) ? JSON.parse(fs.readFileSync(path.join(root, "release-manifest.json"), "utf8")).sourceCommit : null, results: [] };
let browser;
const record = (name, worked, detail) => { const result = { name, status: worked ? "Worked" : "Failed", detail }; receipt.results.push(result); console.log(JSON.stringify(result)); if (!worked) throw new Error(`${name} failed`); };
async function api(route, body) {
  const response = await fetch(base + route, { method: body === undefined ? "GET" : "POST", headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`${route} HTTP ${response.status}`);
  return response.json();
}
try {
  verifyReleasePayload();
  record("installed-health", (await fetch(base + "/api/health")).status === 200, { url: base });
  record("owner-api-denial", (await fetch(base + "/api/conversations")).status === 401, { unauthenticatedHTTP: 401 });
  const models = await api("/api/models");
  const model = models.find(m => m.isDefault && m.connectionStatus === "connected" && m.provider === "ollama");
  record("configured-local-default", Boolean(model), { provider: model?.provider, modelId: model?.modelId });
  const conversation = await api("/api/conversations", { title: "Owner release verification" });
  await api(`/api/conversations/${conversation.id}/messages`, { content: "What is 2 + 2? Reply with only the number." });
  let answers = [], done = false;
  for (let i = 0; i < 240; i++) {
    const conv = await api(`/api/conversations/${conversation.id}`);
    if (conv.status === "error") throw new Error("Release verification conversation failed");
    answers = (await api(`/api/conversations/${conversation.id}/messages`)).filter(m => m.role === "assistant");
    if (conv.status === "idle" && answers.length) { done = true; break; } await delay(500);
  }
  record("real-local-answer", done && answers.length === 1 && /^\s*4[.!]?\s*$/.test(answers[0].content), { assistantMessages: answers.length, correctAnswer: done && /^\s*4[.!]?\s*$/.test(answers[0]?.content || "") });
  const languages = { python3: "print(2+2)", node: "console.log(2+2)", typescript: "const n: number=2+2; console.log(n)", bash: "echo $((2+2))" };
  for (const [language, code] of Object.entries(languages)) {
    const result = await api("/api/protocols/code/interpret", { language, code });
    record(`isolated-${language}`, result.exitCode === 0 && result.stdout.trim() === "4", { exitCode: result.exitCode, correctOutput: result.stdout.trim() === "4" });
  }
  browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(base);
  await page.getByRole("heading", { name: "Ultra Computer owner access" }).waitFor();
  await page.getByLabel("Owner API key").fill(config.apiKey);
  await page.getByRole("button", { name: "Unlock this session" }).click();
  await page.getByRole("button", { name: /start new session/i }).waitFor();
  // Capture only after the credential form has been removed from the UI.
  const removed = await page.getByLabel("Owner API key").count() === 0;
  if (!removed) throw new Error("Owner credential form remained visible; screenshot refused");
  await page.screenshot({ path: path.join(data, "private-owner-browser.png"), fullPage: true });
  record("installed-browser-unlock", removed, { credentialFormRemoved: true, screenshot: "data/private-owner-browser.png" });
  record("private-diagnostics", (await api("/api/diagnostics/runtime")).queueAvailable && !(await api("/api/diagnostics/traces")).exportFailed, { liveQueue: true, traceExport: "Worked" });
} catch (error) { receipt.error = error.message; console.error(error.message); process.exitCode = 1; }
finally {
  await browser?.close(); receipt.status = receipt.error ? "Failed" : "Worked";
  fs.writeFileSync(path.join(data, "private-owner-receipt.json"), JSON.stringify(receipt, null, 2), { mode: 0o600 });
  console.log(`Owner verification receipt: ${path.join(data, "private-owner-receipt.json")}`);
}
