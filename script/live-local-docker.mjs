import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

const image = process.env.LIVE_DOCKER_IMAGE || "ultra-computer-live-gate:local";
const port = process.env.LIVE_DOCKER_PORT || "5188";
const apiKey = process.env.LIVE_DOCKER_API_KEY || `live-${randomBytes(24).toString("hex")}`;
const networkName = `ultra-live-network-${process.pid}`;
const encryptionKey = randomBytes(32).toString("hex");
const dataVolume = `ultra-live-data-${process.pid}`;
const sandboxVolume = `ultra-live-sandbox-${process.pid}`;
const redisImage = process.env.LIVE_DOCKER_REDIS_IMAGE
  || "redis:7-alpine@sha256:6ab0b6e7381779332f97b8ca76193e45b0756f38d4c0dcda72dbb3c32061ab99";

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
      windowsHide: true,
      ...options,
    });
    let stdout = "";
    let stderr = "";
    if (child.stdout) child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    if (child.stderr) child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} exited ${code}\n${stderr || stdout}`));
    });
  });
}

async function docker(args, options) {
  return run("docker", args, options);
}

async function request(path, options = {}) {
  const headers = {
    ...(options.auth === false ? {} : { Authorization: `Bearer ${apiKey}` }),
    ...(options.headers || {}),
  };
  const response = await fetch(`http://127.0.0.1:${port}${path}`, { ...options, headers });
  let body = "";
  try {
    body = await response.text();
  } catch {
    body = "";
  }
  return { response, body };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForHealth(name) {
  const deadline = Date.now() + 45_000;
  let last = "";
  while (Date.now() < deadline) {
    try {
      const { response, body } = await request("/api/health", { auth: false });
      if (response.ok) return;
      last = `${response.status} ${body}`;
    } catch (err) {
      last = err instanceof Error ? err.message : String(err);
    }
    const inspect = await docker(["inspect", "-f", "{{.State.Running}} {{.State.ExitCode}}", name], { capture: true }).catch((err) => ({ stdout: err.message }));
    if (inspect.stdout.includes("false")) break;
    await delay(750);
  }
  const logs = await docker(["logs", "--tail", "80", name], { capture: true }).catch((err) => ({ stdout: "", stderr: err.message }));
  throw new Error(`container did not become healthy: ${last}\n${logs.stdout}\n${logs.stderr}`);
}

async function startContainer(name, { extraEnv = [], volumes = [] } = {}) {
  await docker(["rm", "-f", name], { capture: true }).catch(() => {});
  const env = [
    "-e", `ULTRA_API_KEY=${apiKey}`,
    "-e", "SLACK_SIGNING_SECRET=live-local-slack-secret",
    "-e", "GITHUB_WEBHOOK_SECRET=live-local-github-secret",
    "-e", `ENCRYPTION_KEY=${encryptionKey}`,
    "-e", "NODE_ENV=production",
    "-e", "PORT=5000",
    "-e", "GRPC_PORT=50051",
    "-e", "REDIS_URL=redis://redis:6379",
    "-e", "REDIS_HOST=redis",
    "-e", "REDIS_PORT=6379",
    ...extraEnv.flatMap((item) => ["-e", item]),
  ];
  await docker([
    "run", "-d", "--name", name,
    "--network", networkName,
    "-p", `127.0.0.1:${port}:5000`,
    ...volumes.flatMap(({ name: volumeName, target }) => ["-v", `${volumeName}:${target}`]),
    ...env,
    image,
  ], { capture: true });
  await waitForHealth(name);
}

async function stopContainer(name) {
  await docker(["rm", "-f", name], { capture: true }).catch(() => {});
}

async function main() {
  const redisName = `ultra-live-redis-${process.pid}`;
  const normal = `ultra-live-${process.pid}`;
  const badPolicy = `ultra-live-bad-policy-${process.pid}`;
  const badAudit = `ultra-live-bad-audit-${process.pid}`;
  const persistentVolumes = [
    { name: dataVolume, target: "/app/data" },
    { name: sandboxVolume, target: "/app/sandbox" },
  ];
  let imageBuilt = false;
  let networkCreated = false;
  let volumesCreated = false;

  try {
    console.log("Building clean Docker image for live-local gate...");
    await docker(["build", "--target", "app", "-f", "Dockerfile.live", "-t", image, "."]);
    imageBuilt = true;

    // Start Redis for BullMQ queue dispatch proof. Setup stays inside the
    // cleanup boundary so an early Docker/network failure cannot leak state.
    console.log("Starting Redis container for queue dispatch proof...");
    await docker(["network", "create", networkName], { capture: true });
    networkCreated = true;
    await docker(["rm", "-f", redisName], { capture: true }).catch(() => {});
    await docker([
      "run", "-d", "--name", redisName,
      "--network", networkName,
      "--network-alias", "redis",
      redisImage, "redis-server", "--save", "", "--loglevel", "warning"
    ], { capture: true });
    await delay(1500);

    console.log("Starting production container...");
    await docker(["volume", "create", dataVolume], { capture: true });
    await docker(["volume", "create", sandboxVolume], { capture: true });
    volumesCreated = true;
    await startContainer(normal, { volumes: persistentVolumes });

    let result = await request("/api/models", { auth: false });
    assert(result.response.status === 401, `expected unauthenticated /api/models to return 401, got ${result.response.status}`);

    result = await request("/api/models");
    assert(result.response.status === 200, `expected authenticated /api/models to return 200, got ${result.response.status}: ${result.body}`);

    result = await request("/api/sandbox/files");
    assert(result.response.status === 200, `expected sandbox list to return 200, got ${result.response.status}: ${result.body}`);

    const form = new FormData();
    form.append("files", new Blob(["live-local file policy proof\n"], { type: "text/plain" }), "live-policy-proof.txt");
    result = await request("/api/sandbox/files/upload", { method: "POST", body: form });
    assert(result.response.status === 200, `expected upload to return 200, got ${result.response.status}: ${result.body}`);

    result = await request("/api/sandbox/files/live-policy-proof.txt");
    assert(result.response.status === 200 && result.body.includes("live-local file policy proof"), "expected uploaded file to be readable through sandbox API");

    result = await request("/api/browser/navigate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "http://127.0.0.1:5000/api/health" }),
    });
    assert(result.response.status === 403 && /Policy denied/i.test(result.body), `expected private browser navigation to be policy-denied, got ${result.response.status}: ${result.body}`);

    const audit = await docker(["exec", normal, "sh", "-lc", "test -s /app/data/policy/audit.jsonl && tail -n 20 /app/data/policy/audit.jsonl"], { capture: true });
    assert(/filesystem:list/.test(audit.stdout) || /network:browse/.test(audit.stdout), "expected policy audit records in container");

    // Prove BullMQ queue dispatch (requires Redis running)
    console.log("Testing BullMQ queue dispatch through Redis...");
    // Create a conversation first
    const convResult = await request("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "live-docker-queue-proof" }),
    });
    assert(convResult.response.status === 201 || convResult.response.status === 200,
      `expected conversation create to succeed, got ${convResult.response.status}: ${convResult.body}`);
    let convId;
    try {
      convId = JSON.parse(convResult.body)?.id || JSON.parse(convResult.body)?.conversation?.id;
    } catch { convId = null; }
    assert(convId, `expected conversation create to return an id, got: ${convResult.body}`);

    const msgResult = await request(`/api/conversations/${convId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "queue-dispatch-proof", role: "user" }),
    });
    assert(
      msgResult.response.status === 200 || msgResult.response.status === 201 || msgResult.response.status === 202,
      `expected message enqueue to succeed, got ${msgResult.response.status}: ${msgResult.body}`
    );
    console.log("BullMQ queue dispatch proof passed");

    console.log("Testing persistence across app-container destruction and recreation...");
    await stopContainer(normal);
    await startContainer(normal, { volumes: persistentVolumes });

    result = await request(`/api/conversations/${convId}`);
    assert(
      result.response.status === 200 && JSON.parse(result.body)?.id === convId,
      `expected conversation to survive container recreation, got ${result.response.status}: ${result.body}`,
    );

    result = await request(`/api/conversations/${convId}/messages`);
    let messages = [];
    try {
      messages = JSON.parse(result.body);
    } catch {
      messages = [];
    }
    assert(
      result.response.status === 200
        && Array.isArray(messages)
        && messages.some((message) => message?.content === "queue-dispatch-proof"),
      `expected message history to survive container recreation, got ${result.response.status}: ${result.body}`,
    );

    result = await request("/api/sandbox/files/live-policy-proof.txt");
    assert(
      result.response.status === 200 && result.body.includes("live-local file policy proof"),
      `expected sandbox file to survive container recreation, got ${result.response.status}: ${result.body}`,
    );
    console.log("Container-recreation persistence proof passed");

    console.log("Testing fail-closed missing policy config in production container...");
    await stopContainer(normal);
    await startContainer(badPolicy, { extraEnv: ["ULTRA_POLICY_DIR=/app/missing-policies"] });
    result = await request("/api/sandbox/files");
    assert(result.response.status === 403 && /Policy denied/i.test(result.body), `expected missing policy config to fail closed, got ${result.response.status}: ${result.body}`);

    console.log("Testing audit write failure reporting in production container...");
    await stopContainer(badPolicy);
    await startContainer(badAudit, { extraEnv: ["ULTRA_POLICY_AUDIT_FILE=/app"] });
    result = await request("/api/sandbox/files");
    assert(result.response.status === 200, `expected audit failure not to grant/deny by itself for allowed action, got ${result.response.status}: ${result.body}`);
    const logs = await docker(["logs", "--tail", "120", badAudit], { capture: true });
    assert(/audit write failed/i.test(`${logs.stdout}\n${logs.stderr}`), "expected audit write failure to be logged");

    console.log("live-local Docker gate passed");
  } finally {
    await stopContainer(normal);
    await stopContainer(badPolicy);
    await stopContainer(badAudit);
    await stopContainer(redisName);
    if (networkCreated) {
      await docker(["network", "rm", networkName], { capture: true });
    }
    if (volumesCreated) {
      await docker(["volume", "rm", dataVolume, sandboxVolume], { capture: true });
    }
    if (process.env.LIVE_DOCKER_CLEAN_IMAGE === "true" && imageBuilt) {
      await docker(["image", "rm", image], { capture: true });
    }
  }
}

main().catch((err) => {
  console.error("live-local Docker gate failed:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
