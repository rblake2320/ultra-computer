import { randomUUID } from "node:crypto";
import type { Model } from "@shared/schema";
import type { ModelRequest, ModelUsage } from "./models/types.js";
import { sqlite, storage } from "./storage.js";

export const HARD_MAX_SPEND_USD = 20;
export const DEFAULT_SPEND_LIMIT_USD = HARD_MAX_SPEND_USD;
export const NANO_USD_PER_USD = 1_000_000_000;

const HARD_MAX_NANO_USD = HARD_MAX_SPEND_USD * NANO_USD_PER_USD;
const MILLION = BigInt(1_000_000);
const LOCAL_PROVIDERS = new Set(["ollama", "lmstudio"]);
const DEFAULT_LOCAL_URLS: Readonly<Record<string, string>> = {
  ollama: "http://127.0.0.1:11434/v1",
  lmstudio: "http://127.0.0.1:1234/v1",
};

interface TokenPrice {
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
}

interface PriceRule extends TokenPrice {
  provider: string;
  model: RegExp;
}

/**
 * Versioned, provider-scoped prices. Unknown paid models are rejected: guessing
 * a price cannot enforce a hard external-currency ceiling.
 */
const TOKEN_PRICES: readonly PriceRule[] = [
  { provider: "openai", model: /^gpt-5\.6-(?:sol|terra|luna)(?:-|$)/i, inputUsdPerMillion: 5, outputUsdPerMillion: 30 },
  { provider: "openai", model: /^o3(?:-|$)/i, inputUsdPerMillion: 10, outputUsdPerMillion: 40 },
  { provider: "openai", model: /^o4-mini(?:-|$)/i, inputUsdPerMillion: 1.1, outputUsdPerMillion: 4.4 },
  { provider: "anthropic", model: /^claude-(?:[^/]*-)?opus(?:-|$)/i, inputUsdPerMillion: 15, outputUsdPerMillion: 75 },
  { provider: "anthropic", model: /^claude-(?:[^/]*-)?sonnet(?:-|$)/i, inputUsdPerMillion: 3, outputUsdPerMillion: 15 },
  { provider: "anthropic", model: /^claude-(?:[^/]*-)?haiku(?:-|$)/i, inputUsdPerMillion: 0.8, outputUsdPerMillion: 4 },
  { provider: "google", model: /^gemini-(?:2\.5|3(?:\.1)?)-(?:pro|flash|flash-lite)(?:-|$)/i, inputUsdPerMillion: 5, outputUsdPerMillion: 30 },
  { provider: "deepseek", model: /^deepseek-chat(?:-|$)/i, inputUsdPerMillion: 0.27, outputUsdPerMillion: 1.1 },
  { provider: "deepseek", model: /^deepseek-(?:reasoner|r1)(?:-|$)/i, inputUsdPerMillion: 0.55, outputUsdPerMillion: 2.19 },
];

// Admission uses an intentionally high bound even when settlement has a lower
// verified rate. This covers cache-write premiums and tokenizer uncertainty for
// the currently supported text providers without pretending unknown models are safe.
const ADMISSION_USD_PER_MILLION = 100;
let clock: () => Date = () => new Date();

sqlite.pragma("busy_timeout = 5000");
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS spend_ledger_v2 (
    id TEXT PRIMARY KEY,
    reservation_id TEXT UNIQUE,
    month TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    model_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    operation TEXT NOT NULL,
    input_units INTEGER NOT NULL,
    output_units INTEGER NOT NULL,
    cost_nano_usd INTEGER NOT NULL,
    accounting TEXT NOT NULL CHECK(accounting IN ('provider_usage', 'conservative'))
  );
  CREATE INDEX IF NOT EXISTS idx_spend_ledger_v2_month ON spend_ledger_v2(month);
  CREATE TABLE IF NOT EXISTS spend_reservations_v2 (
    id TEXT PRIMARY KEY,
    month TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    model_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    operation TEXT NOT NULL,
    reserved_nano_usd INTEGER NOT NULL,
    metadata_json TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_spend_reservations_v2_month ON spend_reservations_v2(month);
`);

export class SpendLimitError extends Error {
  readonly code = "spend_limit_reached";
  constructor(readonly committedNanoUsd: number, readonly limitNanoUsd: number) {
    super(
      `Monthly paid-model ceiling reached: ${formatUsd(committedNanoUsd)} committed ` +
      `of ${formatUsd(limitNanoUsd)} allowed.`,
    );
    this.name = "SpendLimitError";
  }
}

export class UnknownModelPriceError extends Error {
  readonly code = "model_price_unverified";
  constructor(provider: string, modelId: string) {
    super(
      `Paid model pricing is not verified for ${provider}/${modelId}; ` +
      "the request was blocked to preserve the hard monthly ceiling.",
    );
    this.name = "UnknownModelPriceError";
  }
}

export interface SpendSubject {
  id: string;
  provider: string;
  modelId: string;
  baseUrl?: string | null;
}

export interface SpendReservation {
  id: string;
  month: string;
  reservedNanoUsd: number;
}

export interface SpendStatus {
  month: string;
  limitUsd: number;
  recordedUsd: number;
  reservedUsd: number;
  committedUsd: number;
  availableUsd: number;
  blocked: boolean;
  reservationCount: number;
}

function utcMonth(now = clock()): string {
  return now.toISOString().slice(0, 7);
}

function assertSafeNonNegativeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative safe integer`);
  }
}

function assertNanoUsd(value: number, name: string): void {
  assertSafeNonNegativeInteger(value, name);
  if (value > HARD_MAX_NANO_USD) {
    throw new SpendLimitError(value, getSpendLimitNanoUsd());
  }
}

function usdToNanoUsd(value: number): number {
  if (!Number.isFinite(value) || value < 0) throw new TypeError("USD value must be finite and non-negative");
  const nano = Math.ceil(value * NANO_USD_PER_USD);
  if (!Number.isSafeInteger(nano)) throw new RangeError("USD value exceeds safe accounting range");
  return nano;
}

function formatUsd(nanoUsd: number): string {
  return `$${(nanoUsd / NANO_USD_PER_USD).toFixed(2)}`;
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (normalized === "localhost" || normalized === "::1") return true;
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(normalized);
  if (!match) return false;
  const octets = match.slice(1).map(Number);
  return octets.every((octet) => octet >= 0 && octet <= 255) && octets[0] === 127;
}

export function isVerifiedLocalModel(
  model: Pick<SpendSubject, "provider" | "baseUrl">,
): boolean {
  if (!LOCAL_PROVIDERS.has(model.provider)) return false;
  const rawUrl = model.baseUrl || DEFAULT_LOCAL_URLS[model.provider];
  if (!rawUrl) return false;
  try {
    const url = new URL(rawUrl);
    return url.protocol === "http:" && isLoopbackHostname(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function tokenPriceFor(
  model: Pick<SpendSubject, "provider" | "modelId" | "baseUrl">,
): TokenPrice | null {
  if (isVerifiedLocalModel(model)) return null;
  const rule = TOKEN_PRICES.find(
    (candidate) => candidate.provider === model.provider && candidate.model.test(model.modelId),
  );
  if (!rule) throw new UnknownModelPriceError(model.provider, model.modelId);
  return {
    inputUsdPerMillion: rule.inputUsdPerMillion,
    outputUsdPerMillion: rule.outputUsdPerMillion,
  };
}

function tokenCostNanoUsd(tokens: number, usdPerMillion: number): number {
  assertSafeNonNegativeInteger(tokens, "token count");
  const rate = usdToNanoUsd(usdPerMillion);
  const numerator = BigInt(tokens) * BigInt(rate);
  const cost = (numerator + MILLION - BigInt(1)) / MILLION;
  if (cost > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError("Token cost exceeds safe accounting range");
  return Number(cost);
}

function exactTokenCostNanoUsd(price: TokenPrice, inputTokens: number, outputTokens: number): number {
  return tokenCostNanoUsd(inputTokens, price.inputUsdPerMillion) +
    tokenCostNanoUsd(outputTokens, price.outputUsdPerMillion);
}

function conservativeInputTokens(request: ModelRequest): number {
  const serializedBytes = Buffer.byteLength(JSON.stringify(request), "utf8");
  // One token per UTF-8 byte plus explicit protocol framing is a conservative
  // upper bound for supported text requests and includes tool schemas.
  return serializedBytes + 1024 + request.messages.length * 32;
}

export function getSpendLimitNanoUsd(): number {
  const raw = storage.getSetting("spend_limit_usd");
  if (raw === null) return HARD_MAX_NANO_USD;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return HARD_MAX_NANO_USD;
  return Math.min(usdToNanoUsd(parsed), HARD_MAX_NANO_USD);
}

function totalsForMonth(month: string): { recorded: number; reserved: number; reservations: number } {
  const ledger = sqlite.prepare(
    "SELECT COALESCE(SUM(cost_nano_usd), 0) AS total FROM spend_ledger_v2 WHERE month = ?",
  ).get(month) as { total: number };
  const reservations = sqlite.prepare(
    `SELECT COALESCE(SUM(reserved_nano_usd), 0) AS total, COUNT(*) AS count
     FROM spend_reservations_v2 WHERE month = ?`,
  ).get(month) as { total: number; count: number };
  return { recorded: ledger.total, reserved: reservations.total, reservations: reservations.count };
}

export function reserveFixedCost(
  model: SpendSubject,
  operation: string,
  reservedNanoUsd: number,
  metadata: Readonly<Record<string, unknown>> = {},
): SpendReservation | null {
  if (isVerifiedLocalModel(model)) return null;
  if (!operation.trim()) throw new TypeError("operation must not be empty");
  assertNanoUsd(reservedNanoUsd, "reservedNanoUsd");
  const limit = getSpendLimitNanoUsd();
  const month = utcMonth();
  const reservation: SpendReservation = { id: randomUUID(), month, reservedNanoUsd };
  const transaction = sqlite.transaction(() => {
    const totals = totalsForMonth(month);
    const committed = totals.recorded + totals.reserved + reservedNanoUsd;
    if (committed > limit) throw new SpendLimitError(committed, limit);
    sqlite.prepare(
      `INSERT INTO spend_reservations_v2
       (id, month, created_at, model_id, provider, operation, reserved_nano_usd, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      reservation.id,
      month,
      Date.now(),
      model.id,
      model.provider,
      operation,
      reservedNanoUsd,
      JSON.stringify(metadata),
    );
  });
  transaction.immediate();
  return reservation;
}

export function reserveModelRequest(model: SpendSubject, request: ModelRequest): SpendReservation | null {
  const price = tokenPriceFor(model);
  if (!price) return null;
  const inputTokens = conservativeInputTokens(request);
  const outputTokens = request.maxOutputTokens ?? 4096;
  assertSafeNonNegativeInteger(outputTokens, "maxOutputTokens");
  const admissionPrice: TokenPrice = {
    inputUsdPerMillion: Math.max(price.inputUsdPerMillion, ADMISSION_USD_PER_MILLION),
    outputUsdPerMillion: Math.max(price.outputUsdPerMillion, ADMISSION_USD_PER_MILLION),
  };
  const reserved = exactTokenCostNanoUsd(admissionPrice, inputTokens, outputTokens);
  return reserveFixedCost(model, "model.generate", reserved, { inputTokens, outputTokens });
}

function insertLedger(
  reservation: SpendReservation,
  model: SpendSubject,
  operation: string,
  inputUnits: number,
  outputUnits: number,
  costNanoUsd: number,
  accounting: "provider_usage" | "conservative",
): void {
  assertSafeNonNegativeInteger(inputUnits, "inputUnits");
  assertSafeNonNegativeInteger(outputUnits, "outputUnits");
  assertSafeNonNegativeInteger(costNanoUsd, "costNanoUsd");
  sqlite.prepare(
    `INSERT INTO spend_ledger_v2
     (id, reservation_id, month, created_at, model_id, provider, operation,
      input_units, output_units, cost_nano_usd, accounting)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(), reservation.id, reservation.month, Date.now(), model.id, model.provider,
    operation, inputUnits, outputUnits, costNanoUsd, accounting,
  );
}

export function settleModelReservation(
  reservation: SpendReservation | null,
  model: SpendSubject,
  usage?: ModelUsage,
): void {
  if (!reservation) return;
  const transaction = sqlite.transaction(() => {
    const row = sqlite.prepare(
      `SELECT operation, reserved_nano_usd FROM spend_reservations_v2
       WHERE id = ? AND month = ?`,
    ).get(reservation.id, reservation.month) as { operation: string; reserved_nano_usd: number } | undefined;
    if (!row) throw new Error(`Spend reservation ${reservation.id} is missing or already settled`);

    let cost = row.reserved_nano_usd;
    let input = 0;
    let output = 0;
    let accounting: "provider_usage" | "conservative" = "conservative";
    if (usage) {
      input = usage.inputTokens;
      output = usage.outputTokens;
      const price = tokenPriceFor(model);
      if (!price) throw new Error("Local model unexpectedly had a spend reservation");
      cost = exactTokenCostNanoUsd(price, input, output);
      accounting = "provider_usage";
    }
    insertLedger(reservation, model, row.operation, input, output, cost, accounting);
    sqlite.prepare("DELETE FROM spend_reservations_v2 WHERE id = ?").run(reservation.id);
  });
  transaction.immediate();
}

/** Charge the full reservation when the provider may have accepted the request. */
export function settleReservationConservatively(
  reservation: SpendReservation | null,
  model: SpendSubject,
): void {
  settleModelReservation(reservation, model);
}

export function settleFixedReservation(
  reservation: SpendReservation | null,
  model: SpendSubject,
  inputUnits: number,
  outputUnits: number,
  actualNanoUsd?: number,
): void {
  if (!reservation) return;
  const transaction = sqlite.transaction(() => {
    const row = sqlite.prepare(
      `SELECT operation, reserved_nano_usd FROM spend_reservations_v2
       WHERE id = ? AND month = ?`,
    ).get(reservation.id, reservation.month) as { operation: string; reserved_nano_usd: number } | undefined;
    if (!row) throw new Error(`Spend reservation ${reservation.id} is missing or already settled`);
    const cost = actualNanoUsd === undefined ? row.reserved_nano_usd : actualNanoUsd;
    insertLedger(
      reservation, model, row.operation, inputUnits, outputUnits, cost,
      actualNanoUsd === undefined ? "conservative" : "provider_usage",
    );
    sqlite.prepare("DELETE FROM spend_reservations_v2 WHERE id = ?").run(reservation.id);
  });
  transaction.immediate();
}

export function imageReservationCostNanoUsd(
  model: Pick<SpendSubject, "provider" | "modelId" | "baseUrl">,
  count: number,
  size: string,
  quality: string,
): number {
  assertSafeNonNegativeInteger(count, "image count");
  if (count === 0) return 0;
  if (isVerifiedLocalModel(model)) return 0;
  if (model.provider !== "openai") throw new UnknownModelPriceError(model.provider, model.modelId);

  let perImageUsd: number;
  if (/^dall-e-2$/i.test(model.modelId)) {
    perImageUsd = 0.02;
  } else if (/^dall-e-3$/i.test(model.modelId)) {
    const portrait = size === "1024x1792" || size === "1792x1024";
    perImageUsd = quality === "hd" ? (portrait ? 0.12 : 0.08) : (portrait ? 0.08 : 0.04);
  } else if (/^gpt-image-1(?:\.5|-mini)?$/i.test(model.modelId)) {
    // Conservative current-family ceiling for high-quality portrait output.
    perImageUsd = 0.25;
  } else {
    throw new UnknownModelPriceError(model.provider, model.modelId);
  }
  return usdToNanoUsd(perImageUsd * count);
}

export function getSpendStatus(month = utcMonth()): SpendStatus {
  const totals = totalsForMonth(month);
  const limit = getSpendLimitNanoUsd();
  const committed = totals.recorded + totals.reserved;
  return {
    month,
    limitUsd: limit / NANO_USD_PER_USD,
    recordedUsd: totals.recorded / NANO_USD_PER_USD,
    reservedUsd: totals.reserved / NANO_USD_PER_USD,
    committedUsd: committed / NANO_USD_PER_USD,
    availableUsd: Math.max(0, limit - committed) / NANO_USD_PER_USD,
    blocked: committed >= limit,
    reservationCount: totals.reservations,
  };
}

export function _clearSpendForTests(): void {
  sqlite.exec("DELETE FROM spend_ledger_v2; DELETE FROM spend_reservations_v2;");
  clock = () => new Date();
}

export function _setSpendClockForTests(replacement: () => Date): void {
  clock = replacement;
}
