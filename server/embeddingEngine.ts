/**
 * In-process semantic embedding engine.
 *
 * Model: all-MiniLM-L6-v2 — 384 dimensions, ~23 MB download (cached after first use).
 * Runs on CPU via @huggingface/transformers WASM backend. No external API call.
 *
 * Startup: pipeline loads lazily on first call. Skill seeding and `matchSkills()`
 * both await `embedText()` — the pipeline is a singleton so the model only loads once.
 *
 * Fallback: if the package or model cannot be loaded, `embedText()` returns null
 * and callers fall back to their TF-IDF implementation.
 */

// Model ID — sentence-transformers/all-MiniLM-L6-v2 (HuggingFace Hub)
const MODEL = "Xenova/all-MiniLM-L6-v2";

/**
 * Bump this when switching to a different model or revision.
 * Stored embeddings whose version tag doesn't match are automatically
 * re-computed by upgradeAllSkillEmbeddings() on next server start.
 */
export const MODEL_VERSION = "1";

let _pipeline: any | null = null;
let _loading: Promise<any | null> | null = null;
let _available: boolean | null = null; // null = untested, true/false = settled

async function getPipeline(): Promise<any | null> {
  if (_available === false) return null;
  if (_pipeline) return _pipeline;
  if (_loading) return _loading;

  _loading = (async () => {
    try {
      // Dynamic import so the server starts even if the package is absent
      const { pipeline, env } = await import("@huggingface/transformers");
      // Store model in the project cache dir, not a global user dir
      env.cacheDir = "./data/hf-cache";
      env.allowLocalModels = true;
      _pipeline = await pipeline("feature-extraction", MODEL, { dtype: "fp32" });
      _available = true;
      console.log("[embeddingEngine] all-MiniLM-L6-v2 ready");
      return _pipeline;
    } catch (err: any) {
      _available = false;
      console.warn("[embeddingEngine] Not available (TF-IDF fallback active):", err.message);
      return null;
    }
  })();
  return _loading;
}

/**
 * Embed a string. Returns a Float32Array of length 384, or null on failure.
 * Mean-pools the last hidden state across tokens (standard for MiniLM).
 */
export async function embedText(text: string): Promise<Float32Array | null> {
  const pipe = await getPipeline();
  if (!pipe) return null;
  try {
    const output = await pipe(text, { pooling: "mean", normalize: true });
    // output.data is Float32Array when dtype="fp32"
    return output.data as Float32Array;
  } catch {
    return null;
  }
}

/** Cosine similarity between two Float32Arrays of equal length. */
export function cosineSimF32(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

/** Serialise Float32Array → compact base64 for SQLite storage. */
export function serializeEmbedding(vec: Float32Array): string {
  return Buffer.from(vec.buffer).toString("base64");
}

/** Deserialise base64 → Float32Array. Returns null on error. */
export function deserializeEmbedding(s: string): Float32Array | null {
  try {
    const buf = Buffer.from(s, "base64");
    return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  } catch {
    return null;
  }
}

/** True when the embedding model has been successfully loaded. */
export function isEmbeddingAvailable(): boolean {
  return _available === true;
}

/** Pre-warm: trigger model download/load at startup. Non-blocking. */
export function prewarmEmbeddingModel(): void {
  getPipeline().catch(() => {});
}
