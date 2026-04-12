/**
 * Voice Routes — REST API for ASR, TTS, Voice Pipeline, and Configuration
 */

import type { Express, Request, Response } from "express";
import { voiceEngine, checkNIMHealth } from "./voiceEngine.js";
import type { ASRRequest, TTSRequest, VoiceConfig } from "./voiceEngine.js";

export function registerVoiceRoutes(app: Express) {
  // ─── Health & Capabilities ──────────────────────────────────────────────────

  /** GET /api/voice/health — Voice engine health check */
  app.get("/api/voice/health", (_req: Request, res: Response) => {
    const config = voiceEngine.getConfig();
    res.json({
      status: "ok",
      engine: "voice",
      provider: config.provider,
      configured: !!config.apiKey,
      streaming: config.enableStreaming,
      defaultLanguage: config.defaultLanguage,
      defaultVoice: config.defaultVoice,
    });
  });

  /** GET /api/voice/nim/health — NVIDIA NIM health check (self-hosted) */
  app.get("/api/voice/nim/health", async (_req: Request, res: Response) => {
    try {
      const result = await checkNIMHealth();
      res.json(result);
    } catch (error: any) {
      res.json({ ready: false, endpoint: "unknown", error: error.message });
    }
  });

  /** GET /api/voice/capabilities — List all voice capabilities */
  app.get("/api/voice/capabilities", (_req: Request, res: Response) => {
    const config = voiceEngine.getConfig();
    res.json({
      asr: {
        supported: true,
        formats: ["wav", "opus", "flac", "mp3", "pcm"],
        maxFileSizeMb: 25,
        streaming: config.enableStreaming,
        features: [
          "automatic_punctuation",
          "word_timestamps",
          "language_detection",
          "multiple_alternatives",
          "custom_vocabulary",
        ],
      },
      tts: {
        supported: true,
        outputFormats: ["wav", "pcm", "mp3"],
        features: [
          "multiple_voices",
          "multilingual",
          "speed_control",
          "pitch_control",
          "zero_shot_voice_cloning",
          "streaming_synthesis",
        ],
      },
      pipeline: {
        supported: true,
        description: "Full voice-in → process → voice-out pipeline",
      },
      providers: ["nvidia_nim", "openai_whisper", "custom"],
    });
  });

  // ─── ASR (Speech-to-Text) ──────────────────────────────────────────────────

  /** POST /api/voice/transcribe — Transcribe audio to text */
  app.post("/api/voice/transcribe", async (req: Request, res: Response) => {
    try {
      let audioBuffer: Buffer;
      let format: ASRRequest["format"] = "wav";

      // Handle both JSON (base64) and raw body
      if (req.is("application/json")) {
        const { audio, format: fmt, languageCode, enablePunctuation, enableTimestamps, maxAlternatives } = req.body;
        if (!audio) {
          res.status(400).json({ error: "Missing 'audio' field (base64-encoded)" });
          return;
        }
        audioBuffer = Buffer.from(audio, "base64");
        format = fmt || "wav";

        const result = await voiceEngine.transcribe({
          audio: audioBuffer,
          format,
          languageCode,
          enablePunctuation: enablePunctuation !== false,
          enableTimestamps,
          maxAlternatives,
        });

        res.json(result);
      } else {
        // Raw binary upload
        const chunks: Buffer[] = [];
        req.on("data", (chunk: Buffer) => chunks.push(chunk));
        req.on("end", async () => {
          audioBuffer = Buffer.concat(chunks);
          const fmt = (req.query.format as string) || "wav";
          const lang = req.query.language as string;
          const timestamps = req.query.timestamps === "true";

          const result = await voiceEngine.transcribe({
            audio: audioBuffer,
            format: fmt as ASRRequest["format"],
            languageCode: lang,
            enablePunctuation: true,
            enableTimestamps: timestamps,
          });

          res.json(result);
        });
        return;
      }
    } catch (error: any) {
      console.error("[VOICE ROUTE] Transcribe error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ─── TTS (Text-to-Speech) ──────────────────────────────────────────────────

  /** POST /api/voice/synthesize — Synthesize speech from text */
  app.post("/api/voice/synthesize", async (req: Request, res: Response) => {
    try {
      const {
        text,
        voice,
        languageCode,
        sampleRate,
        speed,
        pitch,
        volume,
        format,
        returnBase64,
      } = req.body;

      if (!text || typeof text !== "string") {
        res.status(400).json({ error: "Missing or invalid 'text' field" });
        return;
      }

      if (text.length > 5000) {
        res.status(400).json({ error: "Text too long (max 5000 characters)" });
        return;
      }

      const result = await voiceEngine.synthesize({
        text,
        voice,
        languageCode,
        sampleRate,
        speed,
        pitch,
        volume,
        format,
      });

      if (returnBase64) {
        // Return JSON with base64-encoded audio
        res.json({
          audio: result.audio.toString("base64"),
          format: result.format,
          sampleRate: result.sampleRate,
          durationMs: result.durationMs,
          charactersProcessed: result.charactersProcessed,
          provider: result.provider,
          processingTimeMs: result.processingTimeMs,
        });
      } else {
        // Return raw audio bytes
        const mimeType = result.format === "mp3" ? "audio/mpeg" : "audio/wav";
        res.set({
          "Content-Type": mimeType,
          "Content-Length": String(result.audio.length),
          "X-Duration-Ms": String(result.durationMs),
          "X-Provider": result.provider,
          "X-Processing-Time-Ms": String(result.processingTimeMs),
        });
        res.send(result.audio);
      }
    } catch (error: any) {
      console.error("[VOICE ROUTE] Synthesize error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ─── Voice Pipeline ─────────────────────────────────────────────────────────

  /** POST /api/voice/pipeline — Full voice-in → process → voice-out */
  app.post("/api/voice/pipeline", async (req: Request, res: Response) => {
    try {
      const { audio, format, languageCode, responseVoice, processingPrompt } = req.body;

      if (!audio) {
        res.status(400).json({ error: "Missing 'audio' field (base64-encoded)" });
        return;
      }

      const audioBuffer = Buffer.from(audio, "base64");

      // Simple processing callback: echo or transform the transcript
      const processCallback = async (transcript: string): Promise<string> => {
        if (processingPrompt) {
          return `${processingPrompt}: ${transcript}`;
        }
        return `You said: "${transcript}"`;
      };

      const result = await voiceEngine.pipeline({
        audio: audioBuffer,
        format: format || "wav",
        processCallback,
        responseVoice,
        languageCode,
      });

      res.json({
        inputTranscript: result.inputTranscript,
        processedText: result.processedText,
        outputAudio: result.outputAudio.toString("base64"),
        outputFormat: result.outputFormat,
        totalLatencyMs: result.totalLatencyMs,
        asrLatencyMs: result.asrLatencyMs,
        processingLatencyMs: result.processingLatencyMs,
        ttsLatencyMs: result.ttsLatencyMs,
      });
    } catch (error: any) {
      console.error("[VOICE ROUTE] Pipeline error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ─── Voices & Languages ─────────────────────────────────────────────────────

  /** GET /api/voice/voices — List available voices */
  app.get("/api/voice/voices", (_req: Request, res: Response) => {
    const voices = voiceEngine.getVoices();
    const language = (_req.query.language as string) || undefined;

    if (language) {
      res.json(voices.filter(v => v.language === language));
    } else {
      res.json(voices);
    }
  });

  /** GET /api/voice/languages — List supported languages */
  app.get("/api/voice/languages", (_req: Request, res: Response) => {
    res.json(voiceEngine.getLanguages());
  });

  // ─── Configuration ──────────────────────────────────────────────────────────

  /** GET /api/voice/config — Get current voice configuration */
  app.get("/api/voice/config", (_req: Request, res: Response) => {
    res.json(voiceEngine.getConfig());
  });

  /** PATCH /api/voice/config — Update voice configuration */
  app.patch("/api/voice/config", (req: Request, res: Response) => {
    try {
      const updates: Partial<VoiceConfig> = {};
      const allowed = [
        "provider", "apiKey", "nimEndpoint", "asrEndpoint", "ttsEndpoint",
        "asrFunctionId", "ttsFunctionId",
        "defaultLanguage", "defaultVoice", "sampleRate", "enableStreaming"
      ];

      for (const key of allowed) {
        if (req.body[key] !== undefined) {
          (updates as any)[key] = req.body[key];
        }
      }

      const updated = voiceEngine.updateConfig(updates);
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ─── Analytics ──────────────────────────────────────────────────────────────

  /** GET /api/voice/stats — Voice engine statistics */
  app.get("/api/voice/stats", (_req: Request, res: Response) => {
    res.json(voiceEngine.getStats());
  });

  // ─── Quick Test Endpoint ────────────────────────────────────────────────────

  /** POST /api/voice/test — Quick test: synthesize a test phrase */
  app.post("/api/voice/test", async (req: Request, res: Response) => {
    try {
      const text = req.body.text || "Hello from Ultra Computer voice engine. All systems operational.";
      const voice = req.body.voice || undefined;

      const result = await voiceEngine.synthesize({
        text,
        voice,
        format: "wav",
      });

      res.json({
        success: true,
        text,
        provider: result.provider,
        durationMs: result.durationMs,
        processingTimeMs: result.processingTimeMs,
        audioSizeBytes: result.audio.length,
        audio: result.audio.toString("base64"),
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });
}
