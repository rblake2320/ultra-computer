/**
 * Setup Wizard — First-run configuration flow for Ultra Computer.
 * Route: /#/setup
 *
 * Steps:
 *  1. Welcome
 *  2. Environment Detection (auto-runs)
 *  3. Model Configuration
 *  4. Recommended Settings
 *  5. Complete
 */

import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  ChevronRight,
  ChevronLeft,
  Cpu,
  MemoryStick,
  Zap,
  Server,
  Box,
  Database,
  Wifi,
  Terminal,
  Key,
  Sliders,
  Rocket,
  ExternalLink,
  RefreshCw,
  Loader2,
  MonitorSpeaker,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";

// ─── Types mirroring server ───────────────────────────────────────────────────

interface EnvironmentInfo {
  os: { platform: string; release: string; arch: string };
  runtime: { nodeVersion: string; npmVersion: string };
  hardware: {
    cpuCores: number;
    totalMemoryGB: number;
    availableMemoryGB: number;
    gpuDetected: boolean;
    gpuInfo?: string;
  };
  services: {
    redisAvailable: boolean;
    dockerAvailable: boolean;
    dockerVersion?: string;
  };
  network: { port: number; portAvailable: boolean };
  isDocker: boolean;
  isWSL: boolean;
}

interface RecommendedSettings {
  concurrentAgents: number;
  enableRedis: boolean;
  enableSandbox: boolean;
  sandboxPreset: "minimal" | "standard" | "full";
  cacheStrategy: "memory" | "redis" | "hybrid";
  suggestedModels: string[];
}

// ─── Provider catalogue ───────────────────────────────────────────────────────

interface Provider {
  id: string;
  name: string;
  description: string;
  keyPlaceholder: string;
  apiUrl: string;
  color: string;
  docsUrl: string;
}

const PROVIDERS: Provider[] = [
  {
    id: "anthropic",
    name: "Anthropic",
    description: "Claude 3.5 Sonnet — best for reasoning & long context",
    keyPlaceholder: "sk-ant-api03-...",
    apiUrl: "https://api.anthropic.com",
    color: "#c96442",
    docsUrl: "https://console.anthropic.com/",
  },
  {
    id: "openai",
    name: "OpenAI",
    description: "GPT-4o — powerful multimodal flagship",
    keyPlaceholder: "sk-proj-...",
    apiUrl: "https://api.openai.com/v1",
    color: "#10a37f",
    docsUrl: "https://platform.openai.com/api-keys",
  },
  {
    id: "google",
    name: "Google Gemini",
    description: "Gemini 2.0 Flash — fast, affordable, 1M token context",
    keyPlaceholder: "AIza...",
    apiUrl: "https://generativelanguage.googleapis.com/v1beta",
    color: "#4285f4",
    docsUrl: "https://ai.google.dev/",
  },
  {
    id: "ollama",
    name: "Ollama (Local)",
    description: "Run open-source models on your hardware",
    keyPlaceholder: "No key needed",
    apiUrl: "http://localhost:11434/v1",
    color: "#5b8def",
    docsUrl: "https://ollama.ai/",
  },
  {
    id: "nvidia",
    name: "NVIDIA NIM",
    description: "Llama 3.1 405B — GPU-accelerated inference",
    keyPlaceholder: "nvapi-...",
    apiUrl: "https://integrate.api.nvidia.com/v1",
    color: "#76b900",
    docsUrl: "https://build.nvidia.com/",
  },
];

// ─── Animation variants ────────────────────────────────────────────────────────

const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 48 : -48,
    opacity: 0,
  }),
  center: { x: 0, opacity: 1 },
  exit:  (direction: number) => ({
    x: direction > 0 ? -48 : 48,
    opacity: 0,
  }),
};

const transition = { type: "spring", stiffness: 380, damping: 32 };

// ─── Sub-components ────────────────────────────────────────────────────────────

function StatusIcon({
  state,
}: {
  state: "ok" | "warn" | "error" | "loading";
}) {
  if (state === "loading")
    return <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />;
  if (state === "ok")
    return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
  if (state === "warn")
    return <AlertCircle className="w-4 h-4 text-amber-400" />;
  return <XCircle className="w-4 h-4 text-destructive" />;
}

function EnvRow({
  icon: Icon,
  label,
  value,
  state,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  state: "ok" | "warn" | "error" | "loading";
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex items-center gap-3 py-2.5 border-b border-border/50 last:border-0"
    >
      <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
      <span className="text-sm text-muted-foreground w-36 shrink-0">{label}</span>
      <span className="text-sm font-mono flex-1 text-foreground truncate">{value}</span>
      <StatusIcon state={state} />
    </motion.div>
  );
}

// ─── STEP 1 — Welcome ─────────────────────────────────────────────────────────

function StepWelcome({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-col items-center text-center gap-6 py-8">
      {/* Logo */}
      <motion.div
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 20 }}
        className="w-24 h-24 rounded-3xl bg-primary/10 border border-primary/30 flex items-center justify-center"
      >
        <svg viewBox="0 0 24 24" fill="none" className="w-14 h-14">
          <polygon
            points="12,2 22,8 22,16 12,22 2,16 2,8"
            stroke="hsl(195,90%,48%)"
            strokeWidth="1.5"
            fill="none"
          />
          <circle cx="12" cy="12" r="3" fill="hsl(265,70%,60%)" />
          <line x1="12" y1="2" x2="12" y2="9" stroke="hsl(195,90%,48%)" strokeWidth="1.5" />
          <line x1="12" y1="15" x2="12" y2="22" stroke="hsl(195,90%,48%)" strokeWidth="1.5" />
          <line x1="22" y1="8" x2="15.5" y2="10.5" stroke="hsl(195,90%,48%)" strokeWidth="1.5" />
          <line x1="8.5" y1="13.5" x2="2" y2="16" stroke="hsl(195,90%,48%)" strokeWidth="1.5" />
          <line x1="2" y1="8" x2="8.5" y2="10.5" stroke="hsl(195,90%,48%)" strokeWidth="1.5" />
          <line x1="15.5" y1="13.5" x2="22" y2="16" stroke="hsl(195,90%,48%)" strokeWidth="1.5" />
        </svg>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
      >
        <h1 className="text-3xl font-bold gradient-text mb-2">
          Welcome to Ultra Computer
        </h1>
        <p className="text-muted-foreground max-w-md text-sm leading-relaxed">
          A complete agent harness — not a chatbot. Decomposes goals, spawns
          parallel sub-agents, routes tasks to the best model, and remembers
          everything across sessions.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="grid grid-cols-3 gap-3 max-w-md w-full text-left"
      >
        {[
          { icon: Cpu, title: "Multi-model router", desc: "Picks the best LLM per task" },
          { icon: Zap, title: "DAG orchestration",  desc: "Parallel task execution"    },
          { icon: MemoryStick, title: "Persistent memory", desc: "Remembers everything"      },
        ].map(({ icon: Icon, title, desc }) => (
          <div
            key={title}
            className="bg-card border border-border rounded-lg p-3"
          >
            <Icon className="w-4 h-4 text-primary mb-1.5" />
            <p className="text-xs font-semibold">{title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
          </div>
        ))}
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.35 }}
      >
        <Button size="lg" onClick={onNext} className="gap-2 px-8">
          Let&rsquo;s get started
          <ChevronRight className="w-4 h-4" />
        </Button>
      </motion.div>
    </div>
  );
}

// ─── STEP 2 — Environment Detection ──────────────────────────────────────────

function StepEnvironment({
  onNext,
  onEnvDetected,
}: {
  onNext: () => void;
  onEnvDetected: (env: EnvironmentInfo, rec: RecommendedSettings) => void;
}) {
  const [progress, setProgress] = useState(0);

  const detectQuery = useQuery<{ environment: EnvironmentInfo; recommended: RecommendedSettings }>({
    queryKey: ["/api/setup/detect"],
    queryFn: () => apiRequest("GET", "/api/setup/detect"),
    retry: 1,
    staleTime: Infinity,
  });

  useEffect(() => {
    // Animate progress bar while detecting
    const interval = setInterval(() => {
      setProgress((p) => (p < 90 ? p + Math.random() * 12 : p));
    }, 300);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (detectQuery.data) {
      setProgress(100);
      onEnvDetected(detectQuery.data.environment, detectQuery.data.recommended);
    }
  }, [detectQuery.data, onEnvDetected]);

  const env  = detectQuery.data?.environment;
  const isLoading = detectQuery.isPending;

  const platform = () => {
    if (!env) return "—";
    const p = env.os.platform;
    if (p === "win32")  return "Windows";
    if (p === "darwin") return "macOS";
    return `Linux (${env.os.arch})`;
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-xl font-bold mb-1">Environment Detection</h2>
        <p className="text-sm text-muted-foreground">
          Scanning your system to determine the best configuration&hellip;
        </p>
      </div>

      {/* Progress */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{isLoading ? "Scanning…" : "Scan complete"}</span>
          <span>{Math.round(progress)}%</span>
        </div>
        <Progress value={progress} className="h-1.5" />
      </div>

      {/* Results card */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Terminal className="w-4 h-4 text-primary" />
            System Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EnvRow
            icon={MonitorSpeaker}
            label="Operating System"
            value={env ? platform() : "Detecting…"}
            state={isLoading ? "loading" : "ok"}
          />
          <EnvRow
            icon={Terminal}
            label="Node.js"
            value={env ? env.runtime.nodeVersion : "Detecting…"}
            state={isLoading ? "loading" : "ok"}
          />
          <EnvRow
            icon={Cpu}
            label="CPU cores"
            value={env ? String(env.hardware.cpuCores) : "Detecting…"}
            state={isLoading ? "loading" : (env && env.hardware.cpuCores >= 2 ? "ok" : "warn")}
          />
          <EnvRow
            icon={MemoryStick}
            label="Total RAM"
            value={env ? `${env.hardware.totalMemoryGB} GB` : "Detecting…"}
            state={
              isLoading
                ? "loading"
                : !env
                ? "warn"
                : env.hardware.totalMemoryGB >= 8
                ? "ok"
                : env.hardware.totalMemoryGB >= 4
                ? "warn"
                : "error"
            }
          />
          <EnvRow
            icon={Zap}
            label="GPU"
            value={
              isLoading
                ? "Detecting…"
                : env?.hardware.gpuDetected
                ? env.hardware.gpuInfo || "Detected"
                : "Not detected"
            }
            state={
              isLoading
                ? "loading"
                : env?.hardware.gpuDetected
                ? "ok"
                : "warn"
            }
          />
          <EnvRow
            icon={Database}
            label="Redis"
            value={
              isLoading
                ? "Checking…"
                : env?.services.redisAvailable
                ? "Reachable"
                : "Not available"
            }
            state={
              isLoading
                ? "loading"
                : env?.services.redisAvailable
                ? "ok"
                : "warn"
            }
          />
          <EnvRow
            icon={Box}
            label="Docker"
            value={
              isLoading
                ? "Checking…"
                : env?.services.dockerAvailable
                ? `Available${env.services.dockerVersion ? ` v${env.services.dockerVersion}` : ""}`
                : "Not available"
            }
            state={
              isLoading
                ? "loading"
                : env?.services.dockerAvailable
                ? "ok"
                : "warn"
            }
          />
          {env?.isDocker && (
            <EnvRow
              icon={Box}
              label="Running in"
              value="Docker container"
              state="ok"
            />
          )}
          {env?.isWSL && (
            <EnvRow
              icon={Terminal}
              label="Subsystem"
              value="WSL (Windows Subsystem for Linux)"
              state="ok"
            />
          )}
        </CardContent>
      </Card>

      {detectQuery.isError && (
        <div className="flex items-center gap-2 text-destructive text-sm p-3 bg-destructive/10 rounded-lg border border-destructive/20">
          <XCircle className="w-4 h-4 shrink-0" />
          Detection failed: {(detectQuery.error as Error)?.message}. You can still continue with manual configuration.
        </div>
      )}

      <div className="flex justify-end">
        <Button
          onClick={onNext}
          disabled={isLoading}
          className="gap-2"
        >
          {isLoading ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Detecting…</>
          ) : (
            <>Continue <ChevronRight className="w-4 h-4" /></>
          )}
        </Button>
      </div>
    </div>
  );
}

// ─── STEP 3 — Model Configuration ────────────────────────────────────────────

interface ModelConfig {
  [providerId: string]: { apiKey: string; testing: boolean; tested: boolean; success?: boolean };
}

function StepModels({
  onNext,
  onBack,
}: {
  onNext: () => void;
  onBack: () => void;
}) {
  const { toast } = useToast();
  const [configs, setConfigs] = useState<ModelConfig>({});

  const setKey = (id: string, key: string) =>
    setConfigs((c) => ({ ...c, [id]: { ...(c[id] || {}), apiKey: key, testing: false, tested: false } }));

  const testMutation = useMutation({
    mutationFn: ({ provider, url, apiKey }: { provider: string; url: string; apiKey: string }) =>
      apiRequest("POST", "/api/setup/test-connection", { service: "model", url, apiKey }),
    onSuccess: (data, vars) => {
      const ok = data?.success;
      setConfigs((c) => ({ ...c, [vars.provider]: { ...c[vars.provider], testing: false, tested: true, success: ok } }));
      toast({
        title: ok ? "Connection successful" : "Connection failed",
        description: ok ? `${vars.provider} API is reachable` : data?.error,
        variant: ok ? "default" : "destructive",
      });
    },
    onError: (e: Error, vars) => {
      setConfigs((c) => ({ ...c, [vars.provider]: { ...c[vars.provider], testing: false, tested: true, success: false } }));
      toast({ title: "Test failed", description: e.message, variant: "destructive" });
    },
  });

  const testProvider = (p: Provider) => {
    const key = configs[p.id]?.apiKey || "";
    if (!key && p.id !== "ollama") {
      toast({ title: "API key required", description: "Enter an API key before testing", variant: "destructive" });
      return;
    }
    setConfigs((c) => ({ ...c, [p.id]: { ...c[p.id], testing: true } }));
    testMutation.mutate({ provider: p.id, url: p.apiUrl, apiKey: key });
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-xl font-bold mb-1">Model Configuration</h2>
        <p className="text-sm text-muted-foreground">
          Add API keys for the AI providers you want to use. You can skip this
          and configure models later in the Models page.
        </p>
      </div>

      <div className="space-y-3">
        {PROVIDERS.map((p) => {
          const cfg = configs[p.id] || {};
          const isOllama = p.id === "ollama";
          return (
            <Card key={p.id} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: p.color }}
                    />
                    <div>
                      <p className="text-sm font-semibold">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.description}</p>
                    </div>
                  </div>
                  <a
                    href={p.docsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline flex items-center gap-1 shrink-0"
                  >
                    Get key <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                <div className="flex gap-2">
                  <Input
                    type={isOllama ? "text" : "password"}
                    placeholder={p.keyPlaceholder}
                    value={isOllama ? p.apiUrl : (cfg.apiKey || "")}
                    disabled={isOllama}
                    onChange={(e) => setKey(p.id, e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => testProvider(p)}
                    disabled={cfg.testing}
                    className="shrink-0 gap-1 h-8 text-xs"
                  >
                    {cfg.testing ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : cfg.tested ? (
                      cfg.success ? (
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <XCircle className="w-3 h-3 text-destructive" />
                      )
                    ) : (
                      <Wifi className="w-3 h-3" />
                    )}
                    Test
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex justify-between">
        <Button variant="ghost" onClick={onBack} className="gap-2">
          <ChevronLeft className="w-4 h-4" /> Back
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onNext}>
            Skip for now
          </Button>
          <Button onClick={onNext} className="gap-2">
            Continue <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── STEP 4 — Recommended Settings ───────────────────────────────────────────

function StepSettings({
  recommended,
  onNext,
  onBack,
  onSettingsChange,
}: {
  recommended: RecommendedSettings | null;
  onNext: () => void;
  onBack: () => void;
  onSettingsChange: (s: RecommendedSettings) => void;
}) {
  const [settings, setSettings] = useState<RecommendedSettings>(
    recommended || {
      concurrentAgents: 2,
      enableRedis: false,
      enableSandbox: false,
      sandboxPreset: "minimal",
      cacheStrategy: "memory",
      suggestedModels: [],
    },
  );

  useEffect(() => {
    if (recommended) setSettings(recommended);
  }, [recommended]);

  const update = <K extends keyof RecommendedSettings>(key: K, value: RecommendedSettings[K]) => {
    setSettings((s) => {
      const next = { ...s, [key]: value };
      onSettingsChange(next);
      return next;
    });
  };

  const configureMutation = useMutation({
    mutationFn: (s: RecommendedSettings) =>
      apiRequest("POST", "/api/setup/configure", s),
  });

  const handleNext = () => {
    configureMutation.mutate(settings);
    onNext();
  };

  const CACHE_OPTIONS: Array<{ value: RecommendedSettings["cacheStrategy"]; label: string; desc: string }> = [
    { value: "memory",  label: "In-memory",  desc: "Fast, no persistence" },
    { value: "redis",   label: "Redis",       desc: "Persistent, shareable" },
    { value: "hybrid",  label: "Hybrid",      desc: "Memory + Redis fallback" },
  ];

  const SANDBOX_PRESETS: Array<{ value: RecommendedSettings["sandboxPreset"]; label: string }> = [
    { value: "minimal",  label: "Minimal"  },
    { value: "standard", label: "Standard" },
    { value: "full",     label: "Full"     },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-xl font-bold mb-1">Recommended Settings</h2>
        <p className="text-sm text-muted-foreground">
          Adjust or accept the defaults derived from your hardware.
        </p>
      </div>

      <Card>
        <CardContent className="p-5 space-y-5">
          {/* Concurrent agents */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2 text-sm">
                <Cpu className="w-4 h-4 text-primary" />
                Concurrent Agents
              </Label>
              <Badge variant="secondary">{settings.concurrentAgents}</Badge>
            </div>
            <Slider
              min={1}
              max={10}
              step={1}
              value={[settings.concurrentAgents]}
              onValueChange={([v]) => update("concurrentAgents", v)}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              How many sub-agents can run in parallel. Based on available RAM and CPU cores.
            </p>
          </div>

          <Separator />

          {/* Redis */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <Database className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <div>
                <Label className="text-sm">Enable Redis Caching</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Persistent cache across restarts. Requires a Redis instance.
                </p>
              </div>
            </div>
            <Switch
              checked={settings.enableRedis}
              onCheckedChange={(v) => update("enableRedis", v)}
            />
          </div>

          {/* Docker sandbox */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <Box className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <div>
                <Label className="text-sm">Enable Docker Sandbox</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Isolate code execution in containers. Requires Docker daemon.
                </p>
              </div>
            </div>
            <Switch
              checked={settings.enableSandbox}
              onCheckedChange={(v) => update("enableSandbox", v)}
            />
          </div>

          {settings.enableSandbox && (
            <div className="pl-6 space-y-1.5">
              <Label className="text-xs text-muted-foreground">Sandbox Preset</Label>
              <div className="flex gap-2">
                {SANDBOX_PRESETS.map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => update("sandboxPreset", value)}
                    className={`px-3 py-1.5 rounded-md text-xs border transition-colors ${
                      settings.sandboxPreset === value
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card border-border text-muted-foreground hover:border-primary/40"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <Separator />

          {/* Cache strategy */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2 text-sm">
              <Sliders className="w-4 h-4 text-primary" />
              Cache Strategy
            </Label>
            <div className="grid grid-cols-3 gap-2">
              {CACHE_OPTIONS.map(({ value, label, desc }) => (
                <button
                  key={value}
                  onClick={() => update("cacheStrategy", value)}
                  className={`p-3 rounded-lg border text-left text-xs transition-colors ${
                    settings.cacheStrategy === value
                      ? "bg-primary/10 border-primary text-foreground"
                      : "bg-card border-border text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  <p className="font-semibold">{label}</p>
                  <p className="mt-0.5 opacity-70">{desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Suggested models preview */}
          {settings.suggestedModels.length > 0 && (
            <>
              <Separator />
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-sm">
                  <Server className="w-4 h-4 text-primary" />
                  Suggested Models
                </Label>
                <div className="flex flex-wrap gap-1.5">
                  {settings.suggestedModels.map((m) => (
                    <Badge key={m} variant="outline" className="text-xs font-mono">
                      {m}
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Based on detected resources. Configure further in the Models page.
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button variant="ghost" onClick={onBack} className="gap-2">
          <ChevronLeft className="w-4 h-4" /> Back
        </Button>
        <Button onClick={handleNext} className="gap-2">
          Apply & Continue <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

// ─── STEP 5 — Complete ────────────────────────────────────────────────────────

function StepComplete({
  settings,
  onLaunch,
}: {
  settings: RecommendedSettings | null;
  onLaunch: () => void;
}) {
  const completeMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/setup/complete", {}),
    onSuccess: onLaunch,
  });

  const summary = settings
    ? [
        { label: "Concurrent Agents", value: String(settings.concurrentAgents) },
        { label: "Redis",             value: settings.enableRedis     ? "Enabled"   : "Disabled"  },
        { label: "Sandbox",           value: settings.enableSandbox   ? `Enabled (${settings.sandboxPreset})` : "Disabled" },
        { label: "Cache Strategy",    value: settings.cacheStrategy   },
      ]
    : [];

  return (
    <div className="flex flex-col items-center text-center gap-6 py-6">
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 20 }}
        className="w-20 h-20 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center"
      >
        <CheckCircle2 className="w-10 h-10 text-emerald-400" />
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <h2 className="text-2xl font-bold mb-1">All set!</h2>
        <p className="text-sm text-muted-foreground max-w-md">
          Ultra Computer is configured and ready to use. You can always adjust
          settings later from the Settings page.
        </p>
      </motion.div>

      {summary.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18 }}
          className="w-full max-w-sm"
        >
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Configuration Summary</CardTitle>
            </CardHeader>
            <CardContent>
              {summary.map(({ label, value }) => (
                <div
                  key={label}
                  className="flex justify-between py-2 border-b border-border/50 last:border-0 text-sm"
                >
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-mono text-foreground capitalize">{value}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="flex flex-col items-center gap-3"
      >
        <Button
          size="lg"
          onClick={() => completeMutation.mutate()}
          disabled={completeMutation.isPending}
          className="gap-2 px-8"
        >
          {completeMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Rocket className="w-4 h-4" />
          )}
          Launch Ultra Computer
        </Button>

        <div className="flex gap-4 text-xs text-muted-foreground">
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground flex items-center gap-1 transition-colors"
          >
            <ExternalLink className="w-3 h-3" /> Documentation
          </a>
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground flex items-center gap-1 transition-colors"
          >
            <ExternalLink className="w-3 h-3" /> GitHub
          </a>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Step indicator ───────────────────────────────────────────────────────────

const STEPS = ["Welcome", "Environment", "Models", "Settings", "Complete"] as const;

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center gap-1 mb-6">
      {STEPS.map((label, i) => (
        <div key={label} className="flex items-center">
          <div
            className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold border transition-all ${
              i < current
                ? "bg-primary border-primary text-primary-foreground"
                : i === current
                ? "border-primary text-primary bg-primary/10"
                : "border-border text-muted-foreground"
            }`}
          >
            {i < current ? (
              <CheckCircle2 className="w-3.5 h-3.5" />
            ) : (
              i + 1
            )}
          </div>
          {i < STEPS.length - 1 && (
            <div
              className={`w-8 h-px mx-1 transition-colors ${
                i < current ? "bg-primary" : "bg-border"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SetupWizard() {
  const [, setLocation] = useLocation();
  const [step, setStep]           = useState(0);
  const [direction, setDirection] = useState(1);
  const [env, setEnv]             = useState<EnvironmentInfo | null>(null);
  const [recommended, setRecommended] = useState<RecommendedSettings | null>(null);
  const [settings, setSettings]   = useState<RecommendedSettings | null>(null);

  const goTo = (target: number) => {
    setDirection(target > step ? 1 : -1);
    setStep(target);
  };

  const next = () => goTo(step + 1);
  const back = () => goTo(step - 1);

  const handleEnvDetected = useCallback(
    (detectedEnv: EnvironmentInfo, rec: RecommendedSettings) => {
      setEnv(detectedEnv);
      setRecommended(rec);
      setSettings(rec);
    },
    [],
  );

  const handleLaunch = () => setLocation("/");

  const steps = [
    <StepWelcome key="welcome" onNext={next} />,
    <StepEnvironment key="env" onNext={next} onEnvDetected={handleEnvDetected} />,
    <StepModels key="models" onNext={next} onBack={back} />,
    <StepSettings
      key="settings"
      recommended={recommended}
      onNext={next}
      onBack={back}
      onSettingsChange={setSettings}
    />,
    <StepComplete key="complete" settings={settings} onLaunch={handleLaunch} />,
  ];

  return (
    // Full-screen overlay — no sidebar, no layout chrome
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-xl">
        {/* Header */}
        <div className="text-center mb-2">
          <p className="text-xs text-muted-foreground uppercase tracking-widest">
            First-Run Setup
          </p>
        </div>

        <StepIndicator current={step} />

        {/* Card */}
        <Card className="relative overflow-hidden min-h-[420px]">
          <CardContent className="p-6 sm:p-8">
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={step}
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={transition}
              >
                {steps[step]}
              </motion.div>
            </AnimatePresence>
          </CardContent>
        </Card>

        {/* Step label */}
        <p className="text-center text-xs text-muted-foreground mt-3">
          Step {step + 1} of {STEPS.length} — {STEPS[step]}
        </p>
      </div>
    </div>
  );
}
