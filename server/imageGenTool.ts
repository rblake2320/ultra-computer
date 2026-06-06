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
import https from "https";
import http from "http";
import OpenAI from "openai";
import { storage } from "./storage.js";
import type { ToolSchema, ToolResult } from "./tools.js";
import { evaluatePolicy, writePolicyAudit } from "./policyEngine.js";
import { redactString } from "./redaction.js";

// ─── Sandbox directory ────────────────────────────────────────────────────────

const SANDBOX_DIR = path.join(process.cwd(), "sandbox");
const IMAGES_DIR = path.join(SANDBOX_DIR, "images");

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

  const allModels = storage.getModels().filter((m) => m.enabled);

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
      ? `No enabled model with ID '${args.model}' and 'image' capability found.`
      : "No enabled models with 'image' capability found.";
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
  };
  if (imageModel.baseUrl) {
    clientOptions.baseURL = imageModel.baseUrl;
  }

  const providerUrl = imageModel.baseUrl || "https://api.openai.com/v1";
  const providerContext = {
    domain: "network" as const,
    action: "network:ai_provider",
    tool: "generate_image",
    url: providerUrl,
    method: "POST",
    metadata: { provider: imageModel.provider, modelId: imageModel.modelId },
  };
  const providerDecision = evaluatePolicy(providerContext);
  writePolicyAudit(providerContext, providerDecision);
  if (!providerDecision.allowed) {
    return {
      success: false,
      output: "",
      error: `Policy denied: ${providerDecision.reason}`,
      durationMs: Date.now() - start,
    };
  }

  const openai = new OpenAI(clientOptions);

  let imageResponse: OpenAI.Images.ImagesResponse;
  try {
    imageResponse = await openai.images.generate({
      model: imageModel.modelId,
      prompt: prompt.trim(),
      n,
      size: size as OpenAI.Images.ImageGenerateParams["size"],
      quality: quality as OpenAI.Images.ImageGenerateParams["quality"],
      response_format: "url",
    });
  } catch (err: any) {
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
  const timestamp = Date.now();

  for (let i = 0; i < imageResponse.data.length; i++) {
    const imageData = imageResponse.data[i];
    const imageUrl = imageData.url;

    if (!imageUrl) continue;

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
      await downloadFile(imageUrl, outputPath);
      artifacts.push({ path: outputPath, type: "image/png" });
      savedPaths.push(`images/${filename}`);
    } catch (downloadErr: any) {
      // If download fails, record the URL so the agent can still use it
      savedPaths.push(redactString(`(download failed, URL: ${imageUrl})`));
    }
  }

  const revisedPrompt = imageResponse.data[0]?.revised_prompt;
  const outputLines: string[] = [
    `Generated ${savedPaths.length} image(s) using model '${imageModel.name}' (${imageModel.modelId}).`,
    `Prompt: ${redactString(prompt)}`,
  ];
  if (revisedPrompt && revisedPrompt !== prompt) {
    outputLines.push(`Revised prompt (DALL-E 3): ${redactString(revisedPrompt)}`);
  }
  outputLines.push("");
  outputLines.push("Saved files:");
  savedPaths.forEach((p) => outputLines.push(`  • ${p}`));

  return {
    success: true,
    output: outputLines.join("\n"),
    artifacts: artifacts.length > 0 ? artifacts : undefined,
    durationMs: Date.now() - start,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Download a file from a URL and save it to disk.
 * Uses Node's built-in http/https modules to avoid extra dependencies.
 */
function downloadFile(url: string, dest: string, hopCount = 0): Promise<void> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const policyContext = {
      domain: "network" as const,
      action: "network:image_download",
      tool: "generate_image",
      url: parsedUrl.toString(),
      method: "GET",
      metadata: { dest, hopCount },
    };
    const policyDecision = evaluatePolicy(policyContext);
    writePolicyAudit(policyContext, policyDecision);
    if (!policyDecision.allowed) {
      reject(new Error(`Policy denied: ${policyDecision.reason}`));
      return;
    }

    const client = parsedUrl.protocol === "https:" ? https : http;

    const request = client.get(url, { timeout: 60_000 }, (response) => {
      // Follow redirects (up to 5 hops)
      if (
        (response.statusCode === 301 ||
          response.statusCode === 302 ||
          response.statusCode === 307 ||
          response.statusCode === 308) &&
        response.headers.location
      ) {
        response.destroy();
        if (hopCount >= 5) {
          reject(new Error('Too many redirects (max 5)'));
          return;
        }
        const nextUrl = new URL(response.headers.location, parsedUrl).toString();
        downloadFile(nextUrl, dest, hopCount + 1).then(resolve, reject);
        return;
      }

      if (response.statusCode && response.statusCode >= 400) {
        reject(new Error(`HTTP ${response.statusCode} downloading image`));
        return;
      }

      const file = fs.createWriteStream(dest);
      response.pipe(file);
      file.on("finish", () => file.close((err) => (err ? reject(err) : resolve())));
      file.on("error", (err) => {
        fs.unlink(dest, () => {}); // clean up partial file
        reject(err);
      });
    });

    request.on("error", reject);
    request.on("timeout", () => {
      request.destroy();
      reject(new Error("Download timed out (60s)"));
    });
  });
}
