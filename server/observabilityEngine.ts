/**
 * Production Observability — Structured Trace Spans
 * Traces execution across the entire agent chain for debugging and performance analysis.
 * 
 * Capabilities:
 * 1. Trace spans — hierarchical span tree from orchestrator → worker → tool calls
 * 2. Distributed context — propagate traceId through all execution layers
 * 3. Performance metrics — latency, token usage, error rates per span
 * 4. Search & filter — find traces by conversationId, modelId, status, time range
 * 5. Dashboard aggregates — P50/P95/P99 latencies, throughput, error rates
 */

import { v4 as uuidv4 } from "uuid";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TraceSpan {
  traceId: string;         // top-level trace ID (usually = conversationId request)
  spanId: string;          // unique span ID
  parentSpanId?: string;   // null for root spans
  operationName: string;   // e.g., "orchestrator.plan", "worker.execute", "tool.browser"
  serviceName: string;     // "orchestrator" | "worker" | "tool" | "crucible" | "sentinel" | etc.
  status: "running" | "completed" | "error";
  startTime: number;
  endTime?: number;
  durationMs?: number;
  attributes: Record<string, string | number | boolean>;  // key-value tags
  events: SpanEvent[];     // timestamped events within the span
  error?: { message: string; type?: string; stack?: string };
}

export interface SpanEvent {
  name: string;
  timestamp: number;
  attributes?: Record<string, string | number | boolean>;
}

export interface TraceSearchParams {
  traceId?: string;
  conversationId?: string;
  modelId?: string;
  status?: TraceSpan["status"];
  minDurationMs?: number;
  maxDurationMs?: number;
  startAfter?: number;
  startBefore?: number;
  limit?: number;
}

export interface TraceSummary {
  traceId: string;
  rootSpan: string;
  totalSpans: number;
  totalDurationMs: number;
  status: TraceSpan["status"];
  errorCount: number;
  spanTree: SpanNode[];
  startTime: number;
}

export interface SpanNode {
  span: TraceSpan;
  children: SpanNode[];
}

// ─── Storage ──────────────────────────────────────────────────────────────────

const traces = new Map<string, TraceSpan[]>();     // traceId → spans
const spanIndex = new Map<string, TraceSpan>();     // spanId → span
const MAX_TRACES = 1000;

// ─── Span Lifecycle ───────────────────────────────────────────────────────────

export function startSpan(opts: {
  traceId?: string;
  parentSpanId?: string;
  operationName: string;
  serviceName: string;
  attributes?: Record<string, string | number | boolean>;
}): TraceSpan {
  const traceId = opts.traceId || uuidv4();
  const spanId = uuidv4();

  const span: TraceSpan = {
    traceId,
    spanId,
    parentSpanId: opts.parentSpanId,
    operationName: opts.operationName,
    serviceName: opts.serviceName,
    status: "running",
    startTime: Date.now(),
    attributes: opts.attributes || {},
    events: [],
  };

  // Index
  if (!traces.has(traceId)) traces.set(traceId, []);
  traces.get(traceId)!.push(span);
  spanIndex.set(spanId, span);

  // Evict old traces
  if (traces.size > MAX_TRACES) {
    const oldest = traces.keys().next().value;
    if (oldest) {
      const oldSpans = traces.get(oldest) || [];
      for (const s of oldSpans) spanIndex.delete(s.spanId);
      traces.delete(oldest);
    }
  }

  return span;
}

export function endSpan(spanId: string, opts?: {
  status?: TraceSpan["status"];
  error?: { message: string; type?: string; stack?: string };
  attributes?: Record<string, string | number | boolean>;
}): TraceSpan | null {
  const span = spanIndex.get(spanId);
  if (!span) return null;

  span.endTime = Date.now();
  span.durationMs = span.endTime - span.startTime;
  span.status = opts?.error ? "error" : (opts?.status || "completed");
  if (opts?.error) span.error = opts.error;
  if (opts?.attributes) Object.assign(span.attributes, opts.attributes);

  return span;
}

export function addSpanEvent(spanId: string, name: string, attributes?: Record<string, string | number | boolean>): void {
  const span = spanIndex.get(spanId);
  if (!span) return;
  span.events.push({ name, timestamp: Date.now(), attributes });
}

export function setSpanAttributes(spanId: string, attributes: Record<string, string | number | boolean>): void {
  const span = spanIndex.get(spanId);
  if (!span) return;
  Object.assign(span.attributes, attributes);
}

// ─── Query ────────────────────────────────────────────────────────────────────

export function getTrace(traceId: string): TraceSpan[] | null {
  return traces.get(traceId) || null;
}

export function getTraceSummary(traceId: string): TraceSummary | null {
  const spans = traces.get(traceId);
  if (!spans || spans.length === 0) return null;

  const rootSpans = spans.filter(s => !s.parentSpanId);
  const root = rootSpans[0] || spans[0];
  const errorCount = spans.filter(s => s.status === "error").length;
  const allCompleted = spans.every(s => s.status !== "running");
  const hasError = errorCount > 0;

  // Build span tree
  const spanTree = buildSpanTree(spans);

  // Total duration: from earliest start to latest end
  const startTime = Math.min(...spans.map(s => s.startTime));
  const endTime = Math.max(...spans.map(s => s.endTime || Date.now()));

  return {
    traceId,
    rootSpan: root.operationName,
    totalSpans: spans.length,
    totalDurationMs: endTime - startTime,
    status: !allCompleted ? "running" : hasError ? "error" : "completed",
    errorCount,
    spanTree,
    startTime,
  };
}

function buildSpanTree(spans: TraceSpan[]): SpanNode[] {
  const nodeMap = new Map<string, SpanNode>();
  const roots: SpanNode[] = [];

  for (const span of spans) {
    nodeMap.set(span.spanId, { span, children: [] });
  }

  for (const span of spans) {
    const node = nodeMap.get(span.spanId)!;
    if (span.parentSpanId && nodeMap.has(span.parentSpanId)) {
      nodeMap.get(span.parentSpanId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

export function searchTraces(params: TraceSearchParams): TraceSummary[] {
  const results: TraceSummary[] = [];
  const limit = params.limit || 50;

  for (const [traceId, spans] of traces) {
    if (results.length >= limit) break;

    // Filter by traceId
    if (params.traceId && traceId !== params.traceId) continue;

    // Filter by conversationId
    if (params.conversationId) {
      const hasConv = spans.some(s => s.attributes.conversationId === params.conversationId);
      if (!hasConv) continue;
    }

    // Filter by modelId
    if (params.modelId) {
      const hasModel = spans.some(s => s.attributes.modelId === params.modelId);
      if (!hasModel) continue;
    }

    // Filter by time range
    const startTime = Math.min(...spans.map(s => s.startTime));
    if (params.startAfter && startTime < params.startAfter) continue;
    if (params.startBefore && startTime > params.startBefore) continue;

    const summary = getTraceSummary(traceId);
    if (!summary) continue;

    // Filter by status
    if (params.status && summary.status !== params.status) continue;

    // Filter by duration
    if (params.minDurationMs && summary.totalDurationMs < params.minDurationMs) continue;
    if (params.maxDurationMs && summary.totalDurationMs > params.maxDurationMs) continue;

    results.push(summary);
  }

  return results.sort((a, b) => b.startTime - a.startTime);
}

// ─── Dashboard Aggregates ─────────────────────────────────────────────────────

export function getObservabilityDashboard() {
  const allSpans: TraceSpan[] = [];
  for (const spans of traces.values()) {
    allSpans.push(...spans);
  }

  const completedSpans = allSpans.filter(s => s.durationMs != null);
  const durations = completedSpans.map(s => s.durationMs!).sort((a, b) => a - b);

  const percentile = (arr: number[], p: number) => {
    if (arr.length === 0) return 0;
    const idx = Math.ceil(arr.length * p / 100) - 1;
    return arr[Math.max(0, idx)];
  };

  // Aggregate by service
  const byService: Record<string, { count: number; errors: number; avgDurationMs: number }> = {};
  for (const span of completedSpans) {
    if (!byService[span.serviceName]) {
      byService[span.serviceName] = { count: 0, errors: 0, avgDurationMs: 0 };
    }
    byService[span.serviceName].count++;
    if (span.status === "error") byService[span.serviceName].errors++;
    byService[span.serviceName].avgDurationMs += span.durationMs!;
  }
  for (const svc of Object.values(byService)) {
    svc.avgDurationMs = svc.count > 0 ? Math.round(svc.avgDurationMs / svc.count) : 0;
  }

  // Aggregate by operation
  const byOperation: Record<string, { count: number; errors: number; p50Ms: number; p95Ms: number }> = {};
  const opDurations: Record<string, number[]> = {};
  for (const span of completedSpans) {
    if (!opDurations[span.operationName]) opDurations[span.operationName] = [];
    opDurations[span.operationName].push(span.durationMs!);
  }
  for (const [op, durs] of Object.entries(opDurations)) {
    durs.sort((a, b) => a - b);
    byOperation[op] = {
      count: durs.length,
      errors: completedSpans.filter(s => s.operationName === op && s.status === "error").length,
      p50Ms: percentile(durs, 50),
      p95Ms: percentile(durs, 95),
    };
  }

  // Recent errors
  const recentErrors = allSpans
    .filter(s => s.status === "error" && s.error)
    .slice(-10)
    .map(s => ({
      traceId: s.traceId,
      spanId: s.spanId,
      operation: s.operationName,
      error: s.error!.message,
      timestamp: s.endTime || s.startTime,
    }));

  return {
    totalTraces: traces.size,
    totalSpans: allSpans.length,
    activeSpans: allSpans.filter(s => s.status === "running").length,
    errorRate: completedSpans.length > 0 
      ? Math.round((completedSpans.filter(s => s.status === "error").length / completedSpans.length) * 100) 
      : 0,
    latency: {
      p50Ms: percentile(durations, 50),
      p95Ms: percentile(durations, 95),
      p99Ms: percentile(durations, 99),
    },
    byService,
    byOperation,
    recentErrors,
  };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

export function getActiveTraceCount() {
  return traces.size;
}

export function clearTraces() {
  traces.clear();
  spanIndex.clear();
}
