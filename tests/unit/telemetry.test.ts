import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SpanStatusCode } from "@opentelemetry/api";
import { NodeTracerProvider, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-node";
import { PrivateTraceExporter, telemetryIdentity } from "../../server/telemetry.js";

describe("private metadata exporter", () => {
  it("drops content and secrets, retains failed outcomes, and bounds rotated files", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ultra-private-trace-test-"));
    const exporter = new PrivateTraceExporter(() => dir, 2048);
    const provider = new NodeTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] });
    const tracer = provider.getTracer("ultra-computer");
    for (let i = 0; i < 80; i++) {
      const span = tracer.startSpan("model.generate", { attributes: {
        "model.id_hash": telemetryIdentity("fixture-model"), "model.provider": "ollama",
        "prompt": "PRIVATE_CANARY", "error.message": "PRIVATE_CANARY", "authorization": "PRIVATE_CANARY",
      } });
      span.addEvent("PRIVATE_CANARY", { output: "PRIVATE_CANARY" });
      span.setStatus({ code: i % 2 ? SpanStatusCode.OK : SpanStatusCode.ERROR, message: "PRIVATE_CANARY" });
      span.end();
    }
    await provider.forceFlush();
    const files = fs.readdirSync(dir);
    expect(files.length).toBe(4);
    expect(files.every(file => fs.statSync(path.join(dir, file)).size <= 2048)).toBe(true);
    const retained = exporter.read(200) as { outcome: string }[];
    expect(retained.some(r => r.outcome === "failed")).toBe(true);
    expect(retained.some(r => r.outcome === "worked")).toBe(true);
    expect(JSON.stringify(retained)).not.toContain("PRIVATE_CANARY");
    expect(exporter.status().exportFailed).toBe(false);
    await provider.shutdown();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  it("reports an observed file failure without exposing exception text", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ultra-private-trace-error-"));
    const file = path.join(dir, "PRIVATE_CANARY"); fs.writeFileSync(file, "occupied");
    const exporter = new PrivateTraceExporter(() => file);
    const provider = new NodeTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] });
    const span = provider.getTracer("ultra-computer").startSpan("model.generate"); span.end();
    await expect(provider.forceFlush()).rejects.toBeDefined();
    expect(exporter.status().exportFailed).toBe(true);
    await provider.shutdown(); fs.rmSync(dir, { recursive: true, force: true });
  });
});
