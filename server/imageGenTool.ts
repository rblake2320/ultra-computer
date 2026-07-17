/**
 * Image Generation Tool
 * Generates images from text prompts using a configured OpenAI (or
 * OpenAI-compatible) image model. Looks up models from the database that
 * have "image" in their capabilities array, picks the first enabled one,
 * and calls the OpenAI images.generate API.
 *
 * Generated images are saved to sandbox/images/ and returned as artifacts.
 */

import fs from "fs";
import path from "path";
import crypto from "node:crypto";
import OpenAI from "openai";
import { storage } from "./storage.js";
import { isModelRoutable } from "./modelReadiness.js";
import type { ToolSchema, ToolResult } from "./tools.js";
import { evaluatePolicy, writePolicyAudit } from "./policyEngine.js";
import { redactString } from "./redaction.js";
import { governedFetch } from "./governedFetch.js";
import { createGovernedProviderFetch } from "./models/providerFetch.js";
import {
  imageReservationCostNanoUsd,
  reserveFixedCost,
  settleFixedReservation,
} from "./spendGuard.js";

// ─── Sandbox directory ────────────────────────────────────────────────────────

const SANDBOX_DIR = path.join(process.cwd(), "sandbox");
const IMAGES_DIR = path.join(SANDBOX_DIR, "images");
export const MAX_GENERATED_IMAGE_BYTES = 25 * 1024 * 1024;

function ensureDirs() {
  if (!fs.existsSync(SANDBOX_DIR)) fs.mkdirSync(SANDBOX_DIR, { recursive: true });
  if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

// ─── Tool Schema ──────────────────────────────────────────────────────────────

export const IMAGE_GEN_TOOL_SCHEMAS: ToolSchema[] = [
  {
    name: "generate_image",
    description:
      "Generate an image from a text prompt using a configured image generation model (e.g. DALL-E 3, DALL-E 2, or an OpenAI-compatible image endpoint). The image is saved to sandbox/images/ and its file path is returned as an artifact. Requires at least one model with the 'image' capability to be registered in the Models settings.",
    parameters: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description:
            "A detailed text description of the image to generate. Be descriptive for best results. Example: 'A photorealistic sunset over a calm ocean with silhouetted palm trees and vibrant orange clouds'",
        },
        size: {
          type: "string",
          description:
            "Output image dimensions. Defaults to '512x512'. DALL-E 3 only supports '1024x1024', '1024x1792', '1792x1024'. DALL-E 2 supports '256x256', '512x512', '1024x1024'.",
          enum: ["256x256", "512x512", "1024x1024", "1024x1792", "1792x1024"],
        },
        model: {
          type: "string",
          description:
            "Optional: the model ID (from your Models registry) to use. If omitted, the first enabled model with 'image' in capabilities is used automatically.",
        },
        quality: {
          type: "string",
          description:
            "Image quality — only supported by DALL-E 3. 'standard' is faster and cheaper; 'hd' produces finer details. Defaults to 'standard'.",
          enum: ["standard", "hd"],
        },
        n: {
          type: "string",
          description:
            "Number of images to generate (1–4). Defaults to '1'. Note: DALL-E 3 only supports n=1.",
        },
      },
      required: ["prompt"],
    },
  },
];

// ─── Executor ─────────────────────────────────────────────────────────────────

export async function executeImageGenTool(
  name: string,
  args: Record<string, string>
): Promise<ToolResult> {
  const start = Date.now();

  if (name !== "generate_image") {
    return {
      success: false,
      output: "",
      error: `Unknown image gen tool: ${name}`,
      durationMs: Date.now() - start,
    };
  }

  return executeGenerateImage(args, start);
}

// ─── generate_image ───────────────────────────────────────────────────────────

async function executeGenerateImage(
  args: Record<string, string>,
  start: number
): Promise<ToolResult> {
  const { prompt, quality = "standard" } = args;
  const ALLOWED_SIZES = ["256x256", "512x512", "1024x1024", "1024x1792", "1792x1024"];
  const size = ALLOWED_SIZES.includes(args.size) ? args.size : "512x512";
  const n = Math.min(4, Math.max(1, parseInt(args.n || '1', 10) || 1));

  if (!prompt || prompt.trim().length === 0) {
    return {
      success: false,
      output: "",
      error: "No prompt provided. Supply a descriptive text prompt for the image to generate.",
      durationMs: Date.now() - start,
    };
  }

  // ── Find an image-capable model ───────────────────────────────────────────

  const allModels = storage.getModels().filter(isModelRoutable);

  let imageModel = allModels.find((m) => {
    // Match by explicit model ID if caller provided one
    if (args.model && m.id !== args.model) return false;
    try {
      const caps: string[] = JSON.parse(m.capabilities || "[]");
      return caps.some((c) => c.toLowerCase().includes("image"));
    } catch {
      return false;
    }
  });

  if (!imageModel) {
    const suggestion = args.model
      ? `No connected model with ID '${args.model}' and 'image' capability found.`
      : "No connected models with 'image' capability found.";
    return {
      success: false,
      output: "",
      error:
        `${suggestion} To use image generation, add a model (e.g. DALL-E 3) in Settings → Models ` +
        `and include 'image' in its capabilities list. Supported providers: openai, openai_compat.`,
      durationMs: Date.now() - start,
    };
  }

  const provider = imageModel.provider.toLowerCase();
  if (provider !== "openai" && provider !== "openai_compat") {
    return {
      success: false,
      output: "",
      error:
        `Model '${imageModel.name}' uses provider '${imageModel.provider}', which is not supported for ` +
        `image generation. Only 'openai' and 'openai_compat' providers are supported.`,
      durationMs: Date.now() - start,
    };
  }

  if (!imageModel.apiKey) {
    return {
      success: false,
      output: "",
      error:
        `Model '${imageModel.name}' has no API key configured. ` +
        `Add your API key in Settings → Models → Edit.`,
      durationMs: Date.now() - start,
    };
  }

  // ── Call the OpenAI images.generate API ───────────────────────────────────

  const clientOptions: ConstructorParameters<typeof OpenAI>[0] = {
    apiKey: imageModel.apiKey,
    fetch: createGovernedProviderFetch(`provider:image:${imageModel.id}`),
    maxRetries: 0,
  };
  if (imageModel.baseUrl) {
    clientOptions.baseURL = imageModel.baseUrl;
  }

  const openai = new OpenAI(clientOptions);
  let spendReservation;
  let imageCostNanoUsd: number;
  try {
    imageCostNanoUsd = imageReservationCostNanoUsd(imageModel, n, size, quality);
    spendReservation = reserveFixedCost(
      imageModel,
      "image.generate",
      imageCostNanoUsd,
      { count: n, size, quality },
    );
  } catch (error) {
    return {
      success: false,
      output: "",
      error: error instanceof Error ? error.message : "Image generation spend admission failed",
      durationMs: Date.now() - start,
    };
  }

  let imageResponse: OpenAI.Images.ImagesResponse;
  try {
    imageResponse = await openai.images.generate({
      model: imageModel.modelId,
      prompt: prompt.trim(),
      n,
      size: size as OpenAI.Images.ImageGenerateParams["size"],
      quality: quality as OpenAI.Images.ImageGenerateParams["quality"],
    });
  } catch (err: any) {
    // A transport/provider failure after dispatch may still be billable.
    settleFixedReservation(spendReservation, imageModel, Buffer.byteLength(prompt, "utf8"), n);
    const message =
      err?.error?.message ||
      err?.message ||
      "Unknown API error";
    return {
      success: false,
      output: "",
      error: `Image generation API call failed: ${redactString(message)}`,
      durationMs: Date.now() - start,
    };
  }
  settleFixedReservation(spendReservation, imageModel, Buffer.byteLength(prompt, "utf8"), n);

  if (!imageResponse.data || imageResponse.data.length === 0) {
    return {
      success: false,
      output: "",
      error: "API returned no images.",
      durationMs: Date.now() - start,
    };
  }

  // ── Download and save images ──────────────────────────────────────────────

  ensureDirs();

  const artifacts: { path: string; type: string }[] = [];
  const savedPaths: string[] = [];
  const failures: string[] = [];
  const timestamp = Date.now();

  for (let i = 0; i < imageResponse.data.length; i++) {
    const imageData = imageResponse.data[i];
    const filename = `generated_${timestamp}_${i + 1}.png`;
    const outputPath = path.join(IMAGES_DIR, filename);

    try {
      const fileContext = {
        domain: "filesystem" as const,
        action: "filesystem:write",
        tool: "generate_image",
        path: outputPath,
        metadata: { filename },
      };
      const fileDecision = evaluatePolicy(fileContext);
      writePolicyAudit(fileContext, fileDecision);
      if (!fileDecision.allowed) {
        throw new Error(`Policy denied: ${fileDecision.reason}`);
      }
      const saved = await materializeGeneratedImage(
        imageData,
        outputPath,
        `image-generation:${timestamp}:${i}`,
      );
      artifacts.push({ path: saved.path, type: saved.mediaType });
      savedPaths.push(`images/${path.basename(saved.path)}`);
    } catch (downloadErr: any) {
      failures.push(`Image ${i + 1}: ${redactString(downloadErr?.message || "could not be saved")}`);
    }
  }

  if (artifacts.length === 0) {
    return {
      success: false,
      output: "",
      error: `The provider returned image data, but no image could be saved. ${failures.join(" ")}`.trim(),
      durationMs: Date.now() - start,
    };
  }

  const revisedPrompt = imageResponse.data[0]?.revised_prompt;
  const outputLines: string[] = [
    `Generated and saved ${savedPaths.length} image(s) using model '${imageModel.name}' (${imageModel.modelId}).`,
    `Prompt: ${redactString(prompt)}`,
  ];
  if (revisedPrompt && revisedPrompt !== prompt) {
    outputLines.push(`Revised prompt (DALL-E 3): ${redactString(revisedPrompt)}`);
  }
  outputLines.push("");
  outputLines.push("Saved files:");
  savedPaths.forEach((p) => outputLines.push(`  • ${p}`));
  if (failures.length) {
    outputLines.push("", "Some provider results could not be saved:");
    failures.forEach((failure) => outputLines.push(`  • ${failure}`));
  }

  return {
    success: true,
    output: outputLines.join("\n"),
    artifacts: artifacts.length > 0 ? artifacts : undefined,
    durationMs: Date.now() - start,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Decode provider image bytes or download a provider URL through governed,
 * DNS-pinned egress. Writes atomically so failed operations leave no artifact.
 */
export function decodeGeneratedImageBase64(
  encoded: string,
  maxBytes = MAX_GENERATED_IMAGE_BYTES,
): Buffer {
  const normalized = encoded.replace(/\s+/g, "");
  if (!normalized || !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized) || normalized.length % 4 !== 0) {
    throw new Error("Provider returned invalid base64 image data");
  }
  if (normalized.length > Math.ceil(maxBytes / 3) * 4) {
    throw new Error(`Generated image exceeds the ${maxBytes}-byte limit`);
  }
  const bytes = Buffer.from(normalized, "base64");
  if (!bytes.length || bytes.length > maxBytes) {
    throw new Error(`Generated image exceeds the ${maxBytes}-byte limit`);
  }
  return bytes;
}

export async function materializeGeneratedImage(
  image: { url?: string | null; b64_json?: string | null },
  dest: string,
  sessionId: string,
): Promise<{ path: string; mediaType: string }> {
  let bytes: Buffer;
  if (image.b64_json) {
    bytes = decodeGeneratedImageBase64(image.b64_json);
  } else if (image.url) {
    const response = await governedFetch(
      image.url,
      { method: "GET", headers: { Accept: "image/*" } },
      sessionId,
      "network",
      "image_download",
      { timeoutMs: 60_000, maxRedirects: 5, maxResponseBytes: MAX_GENERATED_IMAGE_BYTES },
    );
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} downloading generated image`);
    }
    const contentType = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
    if (contentType && !contentType.startsWith("image/")) {
      throw new Error(`Provider image URL returned unsupported content type '${contentType}'`);
    }
    bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length) throw new Error("Provider image URL returned an empty response");
  } else {
    throw new Error("Provider result contained neither image bytes nor an image URL");
  }

  const format = detectGeneratedImageFormat(bytes);
  const finalPath = dest.replace(/\.[^.\\/]+$/, format.extension);
  const temporaryPath = `${finalPath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    await fs.promises.writeFile(temporaryPath, bytes, { flag: "wx", mode: 0o600 });
    await fs.promises.rename(temporaryPath, finalPath);
    return { path: finalPath, mediaType: format.mediaType };
  } catch (error) {
    await fs.promises.rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

function detectGeneratedImageFormat(bytes: Buffer): { extension: string; mediaType: string } {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { extension: ".png", mediaType: "image/png" };
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { extension: ".jpg", mediaType: "image/jpeg" };
  }
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") {
    return { extension: ".webp", mediaType: "image/webp" };
  }
  throw new Error("Provider returned bytes that are not a supported PNG, JPEG, or WebP image");
}
