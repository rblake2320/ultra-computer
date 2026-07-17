import { expect, test } from "@playwright/test";
import type { ChildProcess } from "node:child_process";
import { API_KEY, BASE, api, ollamaModel, startServer, stopServer, tempDbPath } from "./helpers";

test.describe.configure({ mode: "serial" });
let server: ChildProcess | undefined;
let databasePath: string;
let localModel: string | null;

test.beforeAll(async () => {
  databasePath = tempDbPath();
  server = await startServer(databasePath);
  localModel = await ollamaModel();
});
test.afterAll(async () => stopServer(server));
test.beforeEach(async ({ page }, testInfo) => {
  if (testInfo.title.startsWith("workflow 1:")) return;
  await page.addInitScript((key) => { (window as any).__ULTRA_API_KEY__ = key; }, API_KEY);
});

test("workflow 1: private launch renders and experimental surfaces default off", async ({ page }) => {
  const health = await fetch(`${BASE}/api/health`);
  expect(health.ok).toBe(true);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Ultra Computer owner access" })).toBeVisible();
  await page.getByLabel("Owner API key").fill("wrong-owner-key");
  await page.getByRole("button", { name: "Unlock this session" }).click();
  await expect(page.getByRole("alert")).toHaveText("That API key was rejected by the server.");
  await page.getByLabel("Owner API key").fill(API_KEY);
  await page.getByRole("button", { name: "Unlock this session" }).click();
  await expect(page.getByRole("button", { name: /start new session/i })).toBeVisible();
  expect(await api<{ experimental: boolean }>("/api/app-config")).toEqual({ experimental: false });
  await expect(page.getByText("Swarm", { exact: true })).toHaveCount(0);
});

test("workflow 1b: provider credentials have an explicit save-and-connect action", async ({ page }) => {
  await page.goto("/#/models");
  await page.getByTestId("tab-add").click();
  await page.getByTestId("provider-openai").click();
  await page.getByTestId("input-qa-api-key").fill("not-a-real-key");
  await expect(page.getByTestId("preset-gpt-5.6-sol")).toContainText("Save & connect");
  await expect(page.getByText("The key is encrypted and stored with the model")).toBeVisible();
});

test("workflow 1c: authenticated connector creation and multipart upload work in the real UI", async ({ page }) => {
  const connectorName = `E2E connector ${crypto.randomUUID().slice(0, 8)}`;
  await page.goto("/#/connectors");
  await page.getByRole("button", { name: "Add Custom", exact: true }).click();
  await page.getByPlaceholder("My Custom API").fill(connectorName);
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect.poll(async () => (await api<any[]>("/api/connectors")).find(item => item.name === connectorName))
    .toBeTruthy();
  const connector = (await api<any[]>("/api/connectors")).find(item => item.name === connectorName);
  await api(`/api/connectors/${connector.id}`, { method: "DELETE" });

  const directory = `e2e-upload-${crypto.randomUUID()}`;
  const relativePath = `${directory}/auth-proof.txt`;
  await page.goto("/#/files");
  await page.getByTestId("input-upload-destination").fill(directory);
  await page.getByTestId("input-file-upload").setInputFiles({
    name: "auth-proof.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("authenticated multipart proof"),
  });
  await expect.poll(async () => JSON.stringify(await api("/api/sandbox/files"))).toContain(relativePath);
  await api(`/api/sandbox/files/${relativePath}`, { method: "DELETE" });
});

test("workflow 2: manual model creation and first passing test assign both roles", async ({ page }) => {
  test.skip(!localModel, "Ollama is not running on 127.0.0.1:11434");
  test.setTimeout(240_000);
  await page.goto("/#/models");
  await page.getByTestId("tab-manual").click();
  await page.getByTestId("input-model-name").fill("E2E Ollama");
  await page.getByTestId("select-provider").click();
  await page.getByRole("option", { name: /ollama/i }).click();
  await page.getByTestId("input-model-id").fill(localModel!);
  await page.getByTestId("select-auth-method").click();
  await page.getByRole("option", { name: /no auth/i }).click();
  await page.getByTestId("input-base-url").fill("http://127.0.0.1:11434/v1");
  await page.getByTestId("button-create-model").click();
  await page.getByTestId("tab-connected").click();
  const card = page.locator('[data-testid^="model-card-"]', { hasText: "E2E Ollama" });
  await expect(card).toBeVisible();
  const id = (await card.getAttribute("data-testid"))!.replace("model-card-", "");
  await page.getByTestId(`button-test-${id}`).click();
  await expect.poll(async () => (await api<any[]>("/api/models")).find((model) => model.id === id), { timeout: 180_000 })
    .toMatchObject({ connectionStatus: "connected", isDefault: true, isOrchestrator: true });
});

test("workflow 3: a real local model persists a real assistant response", async ({ page }) => {
  test.skip(!localModel, "Ollama is not running on 127.0.0.1:11434");
  test.setTimeout(420_000);
  await page.goto("/");
  await page.getByRole("button", { name: /start new session/i }).click();
  await page.waitForURL(/#\/chat\//);
  const conversationId = page.url().split("#/chat/")[1];
  await page.getByTestId("input-message").fill("Reply with one short sentence: what is 2+2?");
  await page.getByTestId("button-send").click();
  await expect.poll(async () => {
    const conversation = await api<any>(`/api/conversations/${conversationId}`);
    if (conversation.status === "error") throw new Error("Conversation entered error state before producing a response");
    const messages = await api<any[]>(`/api/conversations/${conversationId}/messages`);
    return messages.findLast((message) => message.role === "assistant")?.content ?? "";
  }, { timeout: 360_000, intervals: [3000] }).not.toBe("");
});

test("workflow 3b: no-model chat persists guidance instead of crashing", async () => {
  await stopServer(server);
  server = await startServer(tempDbPath());
  await api("/api/models", {
    method: "POST",
    body: JSON.stringify({
      name: "Visible but unverified",
      provider: "ollama",
      modelId: "not-probed",
      authMethod: "none",
      capabilities: ["chat"],
    }),
  });
  const conversation = await api<any>("/api/conversations", { method: "POST", body: JSON.stringify({ title: "no-model" }) });
  await api(`/api/conversations/${conversation.id}/messages`, { method: "POST", body: JSON.stringify({ content: "hello" }) });
  await expect.poll(async () => {
    const messages = await api<any[]>(`/api/conversations/${conversation.id}/messages`);
    return messages.find((message) => message.role === "assistant")?.content ?? "";
  }, { timeout: 30_000 }).toContain("No connected model is ready");
  await stopServer(server);
  server = await startServer(databasePath);
});

test("workflow 4: tool execution is real and traversal is rejected", async () => {
  const execution = await api<any>("/api/protocols/cli/execute", {
    method: "POST",
    body: JSON.stringify({ command: "echo ultra-e2e-proof" }),
  });
  expect(JSON.stringify(execution)).toContain("ultra-e2e-proof");
  const escape = await fetch(`${BASE}/api/protocols/cli/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ command: "echo x", workDir: "../../outside" }),
  });
  expect(escape.status).toBe(400);
});

test("workflow 5: database-backed configuration and history survive restart", async () => {
  const conversation = await api<any>("/api/conversations", { method: "POST", body: JSON.stringify({ title: "restart-proof" }) });
  const before = await api<any[]>("/api/conversations");
  await stopServer(server);
  server = await startServer(databasePath);
  const after = await api<any[]>("/api/conversations");
  expect(after.map((item) => item.id).sort()).toEqual(before.map((item) => item.id).sort());
  expect(after.some((item) => item.id === conversation.id)).toBe(true);
});

test("experimental routes and navigation are enabled only with explicit opt-in", async ({ page }) => {
  await stopServer(server);
  server = await startServer(databasePath, true);
  expect(await api<{ experimental: boolean }>("/api/app-config")).toEqual({ experimental: true });
  await page.goto("/");
  await expect(page.getByText("Swarm", { exact: true })).toBeVisible();
});
