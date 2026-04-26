/**
 * Image Generation Tool — Multi-Provider Cascade
 * 
 * Generates real images from text prompts using a cascade of providers:
 *   1. Pollinations.ai  — free, no API key, always available
 *   2. OpenAI DALL-E     — premium quality, requires real OpenAI API key
 *   3. NVIDIA Build API  — enterprise, requires NVIDIA_API_KEY
 * 
 * The tool tries each provider in order and falls back automatically.
 * Generated images are saved to sandbox/images/ and returned as artifacts
 * that the frontend RichMessageRenderer displays inline.
 */

import fs from "fs";
import path from "path";
import https from "https";
import http from "http";
import type { ToolSchema, ToolResult } from "./tools.js";

// ─── Sandbox directory ────────────────────────────────────────────────────────

const SANDBOX_DIR = path.join(process.cwd(), "sandbox");
const IMAGES_DIR = path.join(SANDBOX_DIR, "images");

function ensureDirs() {
  if (!fs.existsSync(SANDBOX_DIR)) fs.mkdirSync(SANDBOX_DIR, { recursive: true });
  if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

// ─── Provider types ──────────────────────────────────────────────────────────

interface ImageProviderResult {
  success: boolean;
  imagePath?: string;        // local file path
  imageUrl?: string;         // original URL (if applicable)
  revisedPrompt?: string;    // DALL-E 3 revised prompt
  provider: string;
  error?: string;
}

// ─── Tool Schema ──────────────────────────────────────────────────────────────

export const IMAGE_GEN_TOOL_SCHEMAS: ToolSchema[] = [
  {
    name: "generate_image",
    description:
      "Generate a real image from a text prompt. Uses a multi-provider cascade (Pollinations.ai → DALL-E 3 → NVIDIA) " +
      "with automatic fallback. The image is saved to sandbox/images/ and displayed inline in the chat. " +
      "No API key is required for the default provider (Pollinations.ai). " +
      "For premium quality, configure a DALL-E model in Settings → Models.",
    parameters: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description:
            "A detailed text description of the image to generate. Be descriptive for best results. " +
            "Example: 'A photorealistic sunset over a calm ocean with silhouetted palm trees'",
        },
        size: {
          type: "string",
          description:
            "Output image dimensions. Defaults to '1024x1024'. Options: '256x256', '512x512', '1024x1024', '1024x1792', '1792x1024'.",
          enum: ["256x256", "512x512", "1024x1024", "1024x1792", "1792x1024"],
        },
        quality: {
          type: "string",
          description:
            "Image quality. 'standard' is faster; 'hd' produces finer details (DALL-E 3 only). Defaults to 'standard'.",
          enum: ["standard", "hd"],
        },
        provider: {
          type: "string",
          description:
            "Force a specific provider. If omitted, tries all providers in cascade order. " +
            "Options: 'pollinations', 'openai', 'nvidia'.",
          enum: ["pollinations", "openai", "nvidia"],
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

// ─── generate_image (main entry) ──────────────────────────────────────────────

async function executeGenerateImage(
  args: Record<string, string>,
  start: number
): Promise<ToolResult> {
  const { prompt, quality = "standard" } = args;
  const ALLOWED_SIZES = ["256x256", "512x512", "1024x1024", "1024x1792", "1792x1024"];
  const size = ALLOWED_SIZES.includes(args.size) ? args.size : "1024x1024";

  if (!prompt || prompt.trim().length === 0) {
    return {
      success: false,
      output: "",
      error: "No prompt provided. Supply a descriptive text prompt for the image to generate.",
      durationMs: Date.now() - start,
    };
  }

  ensureDirs();

  // ── Build provider cascade ───────────────────────────────────────────────
  const forcedProvider = args.provider?.toLowerCase();
  const [width, height] = size.split("x").map(Number);

  type ProviderFn = () => Promise<ImageProviderResult>;
  const providers: { name: string; fn: ProviderFn }[] = [];

  if (!forcedProvider || forcedProvider === "pollinations") {
    providers.push({
      name: "Pollinations.ai",
      fn: () => generateViaPollinations(prompt.trim(), width, height),
    });
  }

  if (!forcedProvider || forcedProvider === "openai") {
    providers.push({
      name: "OpenAI DALL-E",
      fn: () => generateViaDallE(prompt.trim(), size, quality),
    });
  }

  if (!forcedProvider || forcedProvider === "nvidia") {
    providers.push({
      name: "NVIDIA Build API",
      fn: () => generateViaNvidia(prompt.trim()),
    });
  }

  // ── Try each provider in cascade ─────────────────────────────────────────
  const errors: string[] = [];

  for (const provider of providers) {
    console.log(`[imageGenTool] Trying provider: ${provider.name}...`);
    try {
      const result = await provider.fn();
      if (result.success && result.imagePath) {
        // Verify the file exists and has content
        if (fs.existsSync(result.imagePath)) {
          const stat = fs.statSync(result.imagePath);
          if (stat.size > 500) {
            const relativePath = path.relative(SANDBOX_DIR, result.imagePath);
            const outputLines: string[] = [
              `✅ Image generated successfully using ${result.provider}.`,
              `Prompt: ${prompt}`,
            ];
            if (result.revisedPrompt && result.revisedPrompt !== prompt) {
              outputLines.push(`Revised prompt: ${result.revisedPrompt}`);
            }
            outputLines.push("");
            outputLines.push(`Saved to: ${relativePath}`);
            outputLines.push(`File size: ${(stat.size / 1024).toFixed(1)} KB`);

            console.log(`[imageGenTool] ✅ Success via ${result.provider}: ${result.imagePath} (${stat.size} bytes)`);

            return {
              success: true,
              output: outputLines.join("\n"),
              artifacts: [{ path: result.imagePath, type: "image/png" }],
              durationMs: Date.now() - start,
            };
          } else {
            errors.push(`${provider.name}: File too small (${stat.size} bytes)`);
          }
        } else {
          errors.push(`${provider.name}: File not found after generation`);
        }
      } else {
        errors.push(`${provider.name}: ${result.error || "Unknown error"}`);
      }
    } catch (err: any) {
      const msg = err?.message || String(err);
      errors.push(`${provider.name}: ${msg}`);
      console.log(`[imageGenTool] ❌ ${provider.name} failed: ${msg}`);
    }
  }

  // All providers failed
  return {
    success: false,
    output: "",
    error:
      `All image generation providers failed:\n${errors.map((e) => `  • ${e}`).join("\n")}\n\n` +
      `To improve image generation, you can:\n` +
      `  1. Pollinations.ai should work without any configuration\n` +
      `  2. Add a DALL-E model in Settings → Models with a real OpenAI API key\n` +
      `  3. Set NVIDIA_API_KEY environment variable for NVIDIA Build API`,
    durationMs: Date.now() - start,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Provider 1: Pollinations.ai (free, no API key)
// ═══════════════════════════════════════════════════════════════════════════════

async function generateViaPollinations(
  prompt: string,
  width: number,
  height: number
): Promise<ImageProviderResult> {
  const encodedPrompt = encodeURIComponent(prompt);
  const seed = Math.floor(Math.random() * 999999);
  const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&nologo=true&seed=${seed}`;

  const timestamp = Date.now();
  const filename = `generated_${timestamp}_pollinations.png`;
  const outputPath = path.join(IMAGES_DIR, filename);

  try {
    await downloadFile(url, outputPath, 0, 90_000); // 90s timeout for generation

    // Verify we got a real image (not an error page)
    const stat = fs.statSync(outputPath);
    if (stat.size < 500) {
      fs.unlinkSync(outputPath);
      return {
        success: false,
        provider: "Pollinations.ai",
        error: `Response too small (${stat.size} bytes) — likely not a real image`,
      };
    }

    return {
      success: true,
      imagePath: outputPath,
      imageUrl: url,
      provider: "Pollinations.ai",
    };
  } catch (err: any) {
    // Clean up partial file
    try { fs.unlinkSync(outputPath); } catch {}
    return {
      success: false,
      provider: "Pollinations.ai",
      error: err?.message || String(err),
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Provider 2: OpenAI DALL-E (requires real API key)
// ═══════════════════════════════════════════════════════════════════════════════

async function generateViaDallE(
  prompt: string,
  size: string,
  quality: string
): Promise<ImageProviderResult> {
  // We need a real OpenAI API key — not a proxy key
  // Check env first, then check registered models
  let apiKey = "";
  let modelId = "dall-e-3";

  // Try env var
  const envKey = process.env.OPENAI_API_KEY || "";
  const envBaseUrl = process.env.OPENAI_BASE_URL || "";

  // Only use the env key if it's a real OpenAI key (starts with sk- and is long enough)
  // Proxy keys (like Manus proxy) don't support /images/generations
  if (envKey.length > 30 && envKey.startsWith("sk-") && !envBaseUrl.includes("llm-proxy")) {
    apiKey = envKey;
  }

  // Also check registered models for a real DALL-E key
  try {
    const { storage } = await import("./storage.js");
    const models = storage.getModels().filter((m) => m.enabled);
    const imageModel = models.find((m) => {
      try {
        const caps: string[] = JSON.parse(m.capabilities || "[]");
        return caps.some((c) => c.toLowerCase().includes("image"));
      } catch {
        return false;
      }
    });

    if (imageModel) {
      // Use the model's key if it's real (not masked)
      if (imageModel.apiKey && imageModel.apiKey.length > 30 && imageModel.apiKey.startsWith("sk-")) {
        const isProxy = imageModel.baseUrl && imageModel.baseUrl.includes("llm-proxy");
        if (!isProxy) {
          apiKey = imageModel.apiKey;
          modelId = imageModel.modelId || "dall-e-3";
        }
      }
    }
  } catch {}

  if (!apiKey) {
    return {
      success: false,
      provider: "OpenAI DALL-E",
      error: "No real OpenAI API key available (proxy keys don't support image generation)",
    };
  }

  // Dynamic import to avoid requiring openai package at module load
  const OpenAI = (await import("openai")).default;
  const openai = new OpenAI({ apiKey, baseURL: "https://api.openai.com/v1" });

  try {
    const response = await openai.images.generate({
      model: modelId,
      prompt,
      n: 1,
      size: size as any,
      quality: quality as any,
      response_format: "url",
    });

    if (!response.data || response.data.length === 0 || !response.data[0].url) {
      return {
        success: false,
        provider: "OpenAI DALL-E",
        error: "API returned no images",
      };
    }

    const imageUrl = response.data[0].url;
    const timestamp = Date.now();
    const filename = `generated_${timestamp}_dalle.png`;
    const outputPath = path.join(IMAGES_DIR, filename);

    await downloadFile(imageUrl, outputPath);

    return {
      success: true,
      imagePath: outputPath,
      imageUrl,
      revisedPrompt: response.data[0].revised_prompt || undefined,
      provider: "OpenAI DALL-E 3",
    };
  } catch (err: any) {
    return {
      success: false,
      provider: "OpenAI DALL-E",
      error: err?.error?.message || err?.message || String(err),
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Provider 3: NVIDIA Build API (requires NVIDIA_API_KEY)
// ═══════════════════════════════════════════════════════════════════════════════

async function generateViaNvidia(prompt: string): Promise<ImageProviderResult> {
  const apiKey = process.env.NVIDIA_API_KEY || "";
  if (!apiKey) {
    return {
      success: false,
      provider: "NVIDIA Build API",
      error: "No NVIDIA_API_KEY environment variable set",
    };
  }

  const url = "https://ai.api.nvidia.com/v1/genai/stabilityai/stable-diffusion-3_5-large";

  try {
    const payload = JSON.stringify({
      prompt,
      mode: "base",
      seed: Math.floor(Math.random() * 999999),
      steps: 30,
    });

    const responseData = await httpPost(url, payload, {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    });

    const parsed = JSON.parse(responseData);
    if (!parsed.artifacts || parsed.artifacts.length === 0 || !parsed.artifacts[0].base64) {
      return {
        success: false,
        provider: "NVIDIA Build API",
        error: "No image data in response",
      };
    }

    const imageBuffer = Buffer.from(parsed.artifacts[0].base64, "base64");
    const timestamp = Date.now();
    const filename = `generated_${timestamp}_nvidia.png`;
    const outputPath = path.join(IMAGES_DIR, filename);
    fs.writeFileSync(outputPath, imageBuffer);

    return {
      success: true,
      imagePath: outputPath,
      provider: "NVIDIA Stable Diffusion 3.5",
    };
  } catch (err: any) {
    return {
      success: false,
      provider: "NVIDIA Build API",
      error: err?.message || String(err),
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Download a file from a URL and save it to disk.
 * Uses Node's built-in http/https modules to avoid extra dependencies.
 */
function downloadFile(url: string, dest: string, hopCount = 0, timeoutMs = 60_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === "https:" ? https : http;

    const request = client.get(url, { timeout: timeoutMs }, (response) => {
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
          reject(new Error("Too many redirects (max 5)"));
          return;
        }
        downloadFile(response.headers.location, dest, hopCount + 1, timeoutMs).then(resolve, reject);
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
      reject(new Error(`Download timed out (${timeoutMs / 1000}s)`));
    });
  });
}

/**
 * Simple HTTP POST helper for NVIDIA API.
 */
function httpPost(
  url: string,
  body: string,
  headers: Record<string, string>
): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === "https:" ? https : http;

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === "https:" ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: "POST",
      headers: {
        ...headers,
        "Content-Length": Buffer.byteLength(body),
      },
      timeout: 60_000,
    };

    const req = client.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
        } else {
          resolve(data);
        }
      });
    });

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timed out (60s)"));
    });

    req.write(body);
    req.end();
  });
}
