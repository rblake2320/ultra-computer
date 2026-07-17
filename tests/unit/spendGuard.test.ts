import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { once } from "node:events";
import { beforeEach, describe, expect, it } from "vitest";
import type { ModelRequest } from "../../server/models/types.js";

const directory = mkdtempSync(path.join(tmpdir(), "ultra-spend-"));
process.env.DATABASE_PATH = path.join(directory, "spend.db");

const {
  DEFAULT_SPEND_LIMIT_USD,
  NANO_USD_PER_USD,
  SpendLimitError,
  UnknownModelPriceError,
  _clearSpendForTests,
  _setSpendClockForTests,
  getSpendStatus,
  imageReservationCostNanoUsd,
  isVerifiedLocalModel,
  reserveFixedCost,
  reserveModelRequest,
  settleModelReservation,
  settleReservationConservatively,
  tokenPriceFor,
} = await import("../../server/spendGuard.js");
const { sqlite, storage } = await import("../../server/storage.js");
const { modelEvents, registerProviderAdapter } = await import("../../server/models/index.js");
const { chat, chatStream } = await import("../../server/modelRouter.js");

const sonnet = {
  id: "sonnet-configured",
  provider: "anthropic",
  modelId: "claude-sonnet-4-6-20260217",
  baseUrl: "https://api.anthropic.com",
};

const request: ModelRequest = {
  model: sonnet.modelId,
  messages: [{ role: "user", content: "hello" }],
  maxOutputTokens: 100,
};

beforeEach(() => {
  _clearSpendForTests();
  storage.setSetting("spend_limit_usd", String(DEFAULT_SPEND_LIMIT_USD));
  for (const configured of storage.getModels()) storage.deleteModel(configured.id);
});

describe("production spend guard", () => {
  it("uses provider-scoped prices and blocks unknown paid models", () => {
    expect(tokenPriceFor(sonnet)).toEqual({
      inputUsdPerMillion: 3,
      outputUsdPerMillion: 15,
    });
    expect(() => tokenPriceFor({
      ...sonnet,
      provider: "openai_compat",
      modelId: "gpt-5.6-sol",
    })).toThrow(UnknownModelPriceError);
    expect(() => reserveModelRequest({
      ...sonnet,
      modelId: "claude-future-unpriced",
    }, request)).toThrow(UnknownModelPriceError);
  });

  it("only exempts loopback Ollama and LM Studio endpoints", () => {
    expect(isVerifiedLocalModel({ provider: "ollama", baseUrl: null })).toBe(true);
    expect(isVerifiedLocalModel({ provider: "ollama", baseUrl: "http://127.0.0.1:11434/v1" })).toBe(true);
    expect(isVerifiedLocalModel({ provider: "lmstudio", baseUrl: "http://[::1]:1234/v1" })).toBe(true);
    expect(isVerifiedLocalModel({ provider: "ollama", baseUrl: "https://paid.example/v1" })).toBe(false);
    expect(isVerifiedLocalModel({ provider: "custom", baseUrl: "http://127.0.0.1:8000/v1" })).toBe(false);
  });

  it("clamps configuration to $20 and makes zero fail closed", () => {
    storage.setSetting("spend_limit_usd", "500");
    expect(getSpendStatus().limitUsd).toBe(20);
    storage.setSetting("spend_limit_usd", "0");
    expect(() => reserveModelRequest(sonnet, request)).toThrow(SpendLimitError);
  });

  it("reports durable reservations as committed spend", () => {
    const reservation = reserveFixedCost(
      sonnet,
      "test.reserve",
      5 * NANO_USD_PER_USD,
    );
    expect(reservation).not.toBeNull();
    expect(getSpendStatus()).toEqual(expect.objectContaining({
      recordedUsd: 0,
      reservedUsd: 5,
      committedUsd: 5,
      availableUsd: 15,
      reservationCount: 1,
    }));
  });

  it("settles exact provider usage with fixed-point accounting", () => {
    const reservation = reserveModelRequest(sonnet, request);
    settleModelReservation(reservation, sonnet, {
      inputTokens: 1_000_000,
      outputTokens: 100_000,
      totalTokens: 1_100_000,
    });
    expect(getSpendStatus()).toEqual(expect.objectContaining({
      recordedUsd: 4.5,
      reservedUsd: 0,
      committedUsd: 4.5,
    }));
  });

  it("charges the full reservation for ambiguous failures", () => {
    const reservation = reserveFixedCost(
      sonnet,
      "model.generate",
      2 * NANO_USD_PER_USD,
    );
    settleReservationConservatively(reservation, sonnet);
    expect(getSpendStatus()).toEqual(expect.objectContaining({
      recordedUsd: 2,
      reservedUsd: 0,
    }));
    const ledger = sqlite.prepare(
      "SELECT accounting FROM spend_ledger_v2 WHERE reservation_id = ?",
    ).get(reservation!.id) as { accounting: string };
    expect(ledger.accounting).toBe("conservative");
  });

  it("never expires orphaned reservations automatically", () => {
    reserveFixedCost(sonnet, "model.generate", 19 * NANO_USD_PER_USD);
    expect(() => reserveFixedCost(
      sonnet,
      "model.generate",
      2 * NANO_USD_PER_USD,
    )).toThrow(SpendLimitError);
    expect(getSpendStatus().reservationCount).toBe(1);
  });

  it("settles against the admission month across UTC month rollover", () => {
    _setSpendClockForTests(() => new Date("2026-07-31T23:59:59.000Z"));
    const reservation = reserveFixedCost(
      sonnet,
      "model.generate",
      NANO_USD_PER_USD,
    );
    _setSpendClockForTests(() => new Date("2026-08-01T00:00:01.000Z"));
    settleReservationConservatively(reservation, sonnet);
    const row = sqlite.prepare(
      "SELECT month FROM spend_ledger_v2 WHERE reservation_id = ?",
    ).get(reservation!.id) as { month: string };
    expect(row.month).toBe("2026-07");
  });

  it("validates all fixed-point inputs", () => {
    expect(() => reserveFixedCost(sonnet, "bad", Number.NaN)).toThrow(TypeError);
    expect(() => reserveFixedCost(sonnet, "bad", -1)).toThrow(TypeError);
    expect(() => reserveModelRequest(sonnet, {
      ...request,
      maxOutputTokens: Number.NaN,
    })).toThrow(TypeError);
  });

  it("prices supported image requests and rejects unknown image models", () => {
    expect(imageReservationCostNanoUsd({
      id: "image",
      provider: "openai",
      modelId: "dall-e-3",
      baseUrl: "https://api.openai.com/v1",
    }, 1, "1024x1792", "hd")).toBe(120_000_000);
    expect(() => imageReservationCostNanoUsd({
      id: "image",
      provider: "openai_compat",
      modelId: "unknown-image",
      baseUrl: "https://images.example/v1",
    }, 1, "1024x1024", "standard")).toThrow(UnknownModelPriceError);
  });

  it("atomically admits at most one competing process", async () => {
    _clearSpendForTests();
    const barrier = path.join(directory, `barrier-${Date.now()}`);
    const childSource = `
      import { existsSync } from "node:fs";
      const { reserveFixedCost, NANO_USD_PER_USD } = await import("./server/spendGuard.ts");
      process.stdout.write("READY\\n");
      while (!existsSync(${JSON.stringify(barrier)})) await new Promise(r => setTimeout(r, 5));
      try {
        reserveFixedCost(
          { id: process.pid.toString(), provider: "anthropic", modelId: "claude-sonnet-4-6-20260217", baseUrl: "https://api.anthropic.com" },
          "multiprocess.test",
          12 * NANO_USD_PER_USD,
        );
        process.stdout.write("ADMITTED\\n");
      } catch (error) {
        process.stdout.write("BLOCKED:" + (error?.code ?? "error") + "\\n");
      }
    `;
    const children = [startChild(childSource), startChild(childSource)];
    await Promise.all(children.map(({ ready }) => ready));
    writeFileSync(barrier, "go");
    const outputs = await Promise.all(children.map(({ output }) => output));
    expect(outputs.filter((value) => value.includes("ADMITTED"))).toHaveLength(1);
    expect(outputs.filter((value) => value.includes("BLOCKED:spend_limit_reached"))).toHaveLength(1);
    expect(getSpendStatus().reservedUsd).toBe(12);
  }, 20_000);

  it("settles real router usage and conservatively charges ambiguous failures", async () => {
    createConfiguredSonnet();
    const unregisterSuccess = registerProviderAdapter("anthropic", () => ({
      provider: "anthropic",
      features: { capabilities: ["chat", "streaming"], discovery: false, streaming: true },
      async generate(request) {
        return {
          provider: "anthropic",
          model: request.model,
          text: "ok",
          toolCalls: [],
          finishReason: "stop",
          usage: { inputTokens: 1_000, outputTokens: 100, totalTokens: 1_100 },
        };
      },
      async *stream() {
        yield modelEvents.started("anthropic", sonnet.modelId);
        yield modelEvents.text("ok");
        yield modelEvents.usage({ inputTokens: 1_000, outputTokens: 100, totalTokens: 1_100 });
        yield modelEvents.completed("stop");
      },
    }));
    try {
      await chat([{ role: "user", content: "hello" }], {
        modelId: sonnet.id,
        maxTokens: 100,
        bypassCache: true,
      });
      expect(getSpendStatus().recordedUsd).toBeCloseTo(0.0045, 8);
    } finally {
      unregisterSuccess();
    }

    _clearSpendForTests();
    const unregisterFailure = registerProviderAdapter("anthropic", () => ({
      provider: "anthropic",
      features: { capabilities: ["chat"], discovery: false, streaming: false },
      async generate() {
        throw new Error("connection reset after dispatch");
      },
    }));
    try {
      await expect(chat([{ role: "user", content: "hello" }], {
        modelId: sonnet.id,
        maxTokens: 100,
        bypassCache: true,
      })).rejects.toThrow("connection reset after dispatch");
      const status = getSpendStatus();
      expect(status.recordedUsd).toBeGreaterThan(0);
      expect(status.reservedUsd).toBe(0);
    } finally {
      unregisterFailure();
    }
  });

  it("uses terminal stream usage and charges an abandoned stream conservatively", async () => {
    createConfiguredSonnet();
    const unregister = registerProviderAdapter("anthropic", () => ({
      provider: "anthropic",
      features: { capabilities: ["chat", "streaming"], discovery: false, streaming: true },
      async generate() {
        throw new Error("not used");
      },
      async *stream() {
        yield modelEvents.started("anthropic", sonnet.modelId);
        yield modelEvents.text("first");
        yield modelEvents.text("second");
        yield modelEvents.usage({ inputTokens: 2_000, outputTokens: 200, totalTokens: 2_200 });
        yield modelEvents.completed("stop");
      },
    }));
    try {
      const complete: string[] = [];
      for await (const chunk of chatStream([{ role: "user", content: "hello" }], {
        modelId: sonnet.id,
        maxTokens: 100,
      })) complete.push(chunk);
      expect(complete).toEqual(["first", "second"]);
      expect(getSpendStatus().recordedUsd).toBeCloseTo(0.009, 8);

      _clearSpendForTests();
      for await (const _chunk of chatStream([{ role: "user", content: "hello" }], {
        modelId: sonnet.id,
        maxTokens: 100,
      })) break;
      expect(getSpendStatus()).toEqual(expect.objectContaining({
        reservedUsd: 0,
        reservationCount: 0,
      }));
      expect(getSpendStatus().recordedUsd).toBeGreaterThan(0);
    } finally {
      unregister();
    }
  });
});

function createConfiguredSonnet(): void {
  storage.createModel({
    id: sonnet.id,
    name: "Spend Test Sonnet",
    provider: sonnet.provider,
    modelId: sonnet.modelId,
    baseUrl: sonnet.baseUrl,
    apiKey: "test-key",
    enabled: true,
    capabilities: JSON.stringify(["chat"]),
    contextWindow: 1_000_000,
    isDefault: true,
    isOrchestrator: true,
    speedTier: "medium",
    notes: null,
    authMethod: "api_key",
    oauthTokens: null,
    envVarName: null,
    connectionStatus: "connected",
    connectionError: null,
    lastTestedAt: null,
    lastTestLatency: null,
  });
}

function startChild(source: string): {
  child: ChildProcessWithoutNullStreams;
  ready: Promise<void>;
  output: Promise<string>;
} {
  const child = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "-e", source], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_PATH: process.env.DATABASE_PATH },
    stdio: "pipe",
  });
  let stdout = "";
  const ready = new Promise<void>((resolve, reject) => {
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
      if (stdout.includes("READY")) resolve();
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (!stdout.includes("READY")) reject(new Error(`child exited ${code}: ${stdout}`));
    });
  });
  const output = (async () => {
    const [code] = await once(child, "exit") as [number | null];
    if (code !== 0) {
      const stderr = await streamText(child.stderr);
      throw new Error(`child exited ${code}: ${stderr}`);
    }
    return stdout;
  })();
  return { child, ready, output };
}

async function streamText(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}
