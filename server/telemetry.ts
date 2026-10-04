import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { SpanStatusCode, type Attributes, type Span } from "@opentelemetry/api";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeTracerProvider, SimpleSpanProcessor, type ReadableSpan, type SpanExporter } from "@opentelemetry/sdk-trace-node";

const names = new Set(["workflow.execute", "model.generate", "model.stream"]);
const providerNames = new Set(["openai", "ollama", "anthropic", "google", "custom", "groq", "mistral", "together", "deepseek"]);
export function telemetryIdentity(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function safeAttributes(input: Attributes): Attributes {
  const output: Attributes = {};
  for (const key of ["workflow.task_id_hash", "model.id_hash"]) {
    const value = input[key];
    if (typeof value === "string" && /^[a-f0-9]{64}$/.test(value)) output[key] = value;
  }
  if (typeof input["model.provider"] === "string" && providerNames.has(input["model.provider"])) {
    output["model.provider"] = input["model.provider"];
  }
  return output;
}

/** Local bounded metadata only: no network exporter, prompts, results or exceptions. */
export class PrivateTraceExporter implements SpanExporter {
  private failed = false;
  private dropped = 0;
  constructor(private readonly directory: () => string, private readonly maxBytes = 256 * 1024) {}

  export(spans: ReadableSpan[], callback: (result: { code: number; error?: Error }) => void): void {
    try {
      const directory = this.directory();
      fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
      const file = path.join(directory, "traces.jsonl");
      for (const span of spans) {
        if (!names.has(span.name) || span.instrumentationScope.name !== "ultra-computer") {
          this.dropped++;
          continue;
        }
        const ctx = span.spanContext();
        const record = {
          name: span.name, traceId: ctx.traceId, spanId: ctx.spanId,
          parentSpanId: span.parentSpanContext?.spanId,
          startedAt: new Date(span.startTime[0] * 1000 + span.startTime[1] / 1e6).toISOString(),
          durationMs: (span.duration[0] * 1e9 + span.duration[1]) / 1e6,
          outcome: span.status.code === SpanStatusCode.OK ? "worked" : "failed",
          attributes: safeAttributes(span.attributes),
        };
        const line = JSON.stringify(record) + "\n";
        if (fs.existsSync(file) && fs.statSync(file).size + Buffer.byteLength(line) > this.maxBytes) {
          fs.rmSync(`${file}.3`, { force: true });
          for (let i = 2; i >= 0; i--) {
            const source = i ? `${file}.${i}` : file;
            if (fs.existsSync(source)) fs.renameSync(source, `${file}.${i + 1}`);
          }
        }
        fs.appendFileSync(file, line, { mode: 0o600 });
      }
      this.failed = false;
      callback({ code: 0 });
    } catch {
      this.failed = true;
      callback({ code: 1, error: new Error("Private trace export failed") });
    }
  }
  status(): { exportFailed: boolean; droppedSpans: number; maxRetainedBytes: number } {
    return { exportFailed: this.failed, droppedSpans: this.dropped, maxRetainedBytes: this.maxBytes * 4 };
  }
  read(limit = 100): unknown[] {
    const directory = this.directory();
    const records: unknown[] = [];
    for (let i = 3; i >= 0; i--) {
      const file = path.join(directory, `traces.jsonl${i ? `.${i}` : ""}`);
      if (!fs.existsSync(file)) continue;
      if (fs.statSync(file).size > this.maxBytes) throw new Error("Private trace file exceeds retention limit");
      for (const line of fs.readFileSync(file, "utf8").split("\n")) {
        if (line) records.push(JSON.parse(line));
      }
    }
    return records.slice(-Math.max(1, Math.min(200, limit)));
  }
  async shutdown(): Promise<void> {}
  async forceFlush(): Promise<void> {}
}

// Resolve only on export/read. Importing telemetry must not create state before ownership.
export const privateTraceExporter = new PrivateTraceExporter(() => path.join(
  path.dirname(path.resolve(process.env.DATABASE_PATH ?? "data/ultra_computer.db")), "telemetry",
));
const provider = new NodeTracerProvider({
  resource: resourceFromAttributes({ "service.name": "ultra-computer" }),
  spanProcessors: [new SimpleSpanProcessor(privateTraceExporter)],
});
provider.register();
const tracer = provider.getTracer("ultra-computer", "1.0.0");

export async function withExecutionSpan<T>(name: "workflow.execute" | "model.generate", attributes: Attributes, work: () => Promise<T>): Promise<T> {
  return tracer.startActiveSpan(name, { attributes: safeAttributes(attributes) }, async span => {
    try {
      const result = await work();
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw error;
    } finally { span.end(); }
  });
}

export function startModelStream(attributes: Attributes): Span {
  return tracer.startSpan("model.stream", { attributes: safeAttributes(attributes) });
}
export async function shutdownTelemetry(): Promise<void> { await provider.shutdown(); }
