import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../lib/queryClient";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { Card } from "../components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { useToast } from "../hooks/use-toast";
import {
  Plus, Trash2, TestTube2, Check, X, Star, Brain, Zap, Shield,
  Server, Globe, Cpu, ChevronDown
} from "lucide-react";
import type { Model } from "../../../shared/schema";

const PROVIDERS = [
  { value: "openai", label: "OpenAI", placeholder: "gpt-4o, gpt-4o-mini, o3, o4-mini" },
  { value: "anthropic", label: "Anthropic", placeholder: "claude-opus-4-5, claude-sonnet-4-5, claude-haiku-3-5" },
  { value: "google", label: "Google Gemini", placeholder: "gemini-2.0-flash, gemini-1.5-pro" },
  { value: "ollama", label: "Ollama (Local)", placeholder: "llama3.3:70b, qwen2.5:72b, deepseek-r1:14b" },
  { value: "openai_compat", label: "OpenAI-Compatible", placeholder: "any model ID at your endpoint" },
  { value: "custom", label: "Custom Endpoint", placeholder: "model ID at your base URL" },
];

const SPEED_TIERS = [
  { value: "fast", label: "Fast", desc: "Speed tasks, quick lookups" },
  { value: "medium", label: "Medium", desc: "General tasks" },
  { value: "powerful", label: "Powerful", desc: "Research, code, analysis" },
];

const PRESETS = [
  { name: "GPT-4o", provider: "openai", modelId: "gpt-4o", speedTier: "medium", capabilities: ["chat", "code", "vision"], contextWindow: 128000 },
  { name: "GPT-4o Mini", provider: "openai", modelId: "gpt-4o-mini", speedTier: "fast", capabilities: ["chat", "code"], contextWindow: 128000 },
  { name: "o4-mini", provider: "openai", modelId: "o4-mini", speedTier: "powerful", capabilities: ["chat", "code", "analyze"], contextWindow: 128000 },
  { name: "Claude Opus 4.5", provider: "anthropic", modelId: "claude-opus-4-5", speedTier: "powerful", capabilities: ["chat", "code", "analyze"], contextWindow: 200000 },
  { name: "Claude Sonnet 4.5", provider: "anthropic", modelId: "claude-sonnet-4-5", speedTier: "medium", capabilities: ["chat", "code"], contextWindow: 200000 },
  { name: "Gemini 2.0 Flash", provider: "google", modelId: "gemini-2.0-flash", speedTier: "fast", capabilities: ["chat", "code", "vision"], contextWindow: 1000000 },
  { name: "Llama 3.3 70B (Ollama)", provider: "ollama", modelId: "llama3.3:70b", speedTier: "powerful", capabilities: ["chat", "code"], contextWindow: 32768, baseUrl: "http://localhost:11434/v1" },
  { name: "Qwen2.5 72B (Ollama)", provider: "ollama", modelId: "qwen2.5:72b", speedTier: "powerful", capabilities: ["chat", "code"], contextWindow: 32768, baseUrl: "http://localhost:11434/v1" },
  { name: "Llama 3.2 3B (Ollama)", provider: "ollama", modelId: "llama3.2:3b", speedTier: "fast", capabilities: ["chat"], contextWindow: 8192, baseUrl: "http://localhost:11434/v1" },
];

export function ModelsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; latencyMs?: number; error?: string }>>({});

  const { data: models = [] } = useQuery<Model[]>({ queryKey: ["/api/models"] });

  const [form, setForm] = useState({
    name: "", provider: "openai", modelId: "", baseUrl: "", apiKey: "",
    speedTier: "medium", isDefault: false, isOrchestrator: false,
    capabilities: ["chat"], contextWindow: 8192, notes: "",
  });

  const createModel = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/models", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/models"] });
      setShowForm(false);
      resetForm();
      toast({ title: "Model added" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteModel = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/models/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/models"] }); toast({ title: "Model removed" }); },
  });

  const setDefault = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/models/${id}`, { isDefault: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/models"] }),
  });

  const setOrchestrator = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/models/${id}`, { isOrchestrator: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/models"] }),
  });

  const testModel = async (id: string) => {
    const res = await apiRequest("POST", `/api/models/${id}/test`, {});
    setTestResults(r => ({ ...r, [id]: res }));
  };

  const resetForm = () => setForm({
    name: "", provider: "openai", modelId: "", baseUrl: "", apiKey: "",
    speedTier: "medium", isDefault: false, isOrchestrator: false,
    capabilities: ["chat"], contextWindow: 8192, notes: "",
  });

  const applyPreset = (preset: typeof PRESETS[0]) => {
    setForm(f => ({
      ...f,
      name: preset.name,
      provider: preset.provider,
      modelId: preset.modelId,
      speedTier: preset.speedTier,
      capabilities: preset.capabilities,
      contextWindow: preset.contextWindow,
      baseUrl: (preset as any).baseUrl || "",
    }));
    setShowForm(true);
  };

  const toggleCapability = (cap: string) => {
    setForm(f => ({
      ...f,
      capabilities: f.capabilities.includes(cap)
        ? f.capabilities.filter(c => c !== cap)
        : [...f.capabilities, cap],
    }));
  };

  const providerInfo = PROVIDERS.find(p => p.value === form.provider);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card/50">
        <Cpu className="w-4 h-4 text-primary" />
        <h1 className="font-semibold text-sm">Models</h1>
        <p className="text-xs text-muted-foreground flex-1">Add any LLM — cloud, local, or any OpenAI-compatible endpoint</p>
        <Button size="sm" onClick={() => setShowForm(f => !f)} className="gap-1">
          <Plus className="w-3 h-3" />Add Model
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {/* Add form */}
        {showForm && (
          <Card className="p-4 mb-6 border-primary/30 bg-card">
            <h2 className="font-semibold text-sm mb-3">Add New Model</h2>

            {/* Presets */}
            <div className="mb-3">
              <p className="text-xs text-muted-foreground mb-2">Quick presets:</p>
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map(p => (
                  <button key={p.name} onClick={() => applyPreset(p)}
                    className="text-xs px-2 py-1 rounded-md bg-muted hover:bg-muted/70 border border-border hover:border-primary/50 transition-colors">
                    {p.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Display Name *</label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. My GPT-4o" className="h-8 text-sm" data-testid="input-model-name" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Provider *</label>
                <Select value={form.provider} onValueChange={v => setForm(f => ({ ...f, provider: v }))}>
                  <SelectTrigger className="h-8 text-sm" data-testid="select-provider">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROVIDERS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Model ID *</label>
                <Input value={form.modelId} onChange={e => setForm(f => ({ ...f, modelId: e.target.value }))}
                  placeholder={providerInfo?.placeholder || "model ID"} className="h-8 text-sm" data-testid="input-model-id" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  {form.provider === "ollama" ? "Base URL" : "API Key"}
                </label>
                {form.provider === "ollama" ? (
                  <Input value={form.baseUrl} onChange={e => setForm(f => ({ ...f, baseUrl: e.target.value }))}
                    placeholder="http://localhost:11434/v1" className="h-8 text-sm" data-testid="input-base-url" />
                ) : (
                  <Input value={form.apiKey} onChange={e => setForm(f => ({ ...f, apiKey: e.target.value }))}
                    type="password" placeholder="sk-..." className="h-8 text-sm" data-testid="input-api-key" />
                )}
              </div>
              {(form.provider === "openai_compat" || form.provider === "custom") && (
                <div className="col-span-2">
                  <label className="text-xs text-muted-foreground mb-1 block">Base URL *</label>
                  <Input value={form.baseUrl} onChange={e => setForm(f => ({ ...f, baseUrl: e.target.value }))}
                    placeholder="https://your-endpoint.com/v1" className="h-8 text-sm" data-testid="input-base-url-compat" />
                </div>
              )}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Speed Tier</label>
                <Select value={form.speedTier} onValueChange={v => setForm(f => ({ ...f, speedTier: v }))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SPEED_TIERS.map(t => <SelectItem key={t.value} value={t.value}>{t.label} — {t.desc}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Context Window</label>
                <Input type="number" value={form.contextWindow}
                  onChange={e => setForm(f => ({ ...f, contextWindow: Number(e.target.value) }))}
                  className="h-8 text-sm" />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground mb-1 block">Capabilities</label>
                <div className="flex gap-2 flex-wrap">
                  {["chat", "code", "vision", "analyze", "image"].map(cap => (
                    <button key={cap} onClick={() => toggleCapability(cap)}
                      className={`text-xs px-2 py-1 rounded-md border transition-colors ${form.capabilities.includes(cap)
                        ? "bg-primary/20 border-primary text-primary"
                        : "bg-muted border-border text-muted-foreground"}`}>
                      {cap}
                    </button>
                  ))}
                </div>
              </div>
              <div className="col-span-2 flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.isDefault}
                    onChange={e => setForm(f => ({ ...f, isDefault: e.target.checked }))} className="rounded" />
                  <span className="text-xs">Set as default model</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.isOrchestrator}
                    onChange={e => setForm(f => ({ ...f, isOrchestrator: e.target.checked }))} className="rounded" />
                  <span className="text-xs">Use as orchestrator (planning engine)</span>
                </label>
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <Button size="sm" onClick={() => createModel.mutate(form)} disabled={!form.name || !form.modelId}>
                Add Model
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setShowForm(false); resetForm(); }}>Cancel</Button>
            </div>
          </Card>
        )}

        {/* Model list */}
        {models.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Cpu className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No models added yet.</p>
            <p className="text-xs mt-1">Add a model to get started — Ollama, OpenAI, Anthropic, Gemini, or any OpenAI-compatible endpoint.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {models.map(model => (
              <Card key={model.id} className={`p-3 ${!model.enabled ? "opacity-50" : ""}`} data-testid={`model-card-${model.id}`}>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <Server className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{model.name}</span>
                      <Badge variant="secondary" className="text-[10px]">{model.provider}</Badge>
                      <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{model.modelId}</code>
                      {model.isDefault && <Badge className="text-[10px] gap-1"><Star className="w-2.5 h-2.5" />Default</Badge>}
                      {model.isOrchestrator && <Badge variant="secondary" className="text-[10px] gap-1"><Brain className="w-2.5 h-2.5" />Orchestrator</Badge>}
                      {model.speedTier === "fast" && <Badge variant="outline" className="text-[10px] gap-1 text-green-400 border-green-400/30"><Zap className="w-2.5 h-2.5" />Fast</Badge>}
                      {model.speedTier === "powerful" && <Badge variant="outline" className="text-[10px] gap-1 text-purple-400 border-purple-400/30"><Shield className="w-2.5 h-2.5" />Powerful</Badge>}
                      {testResults[model.id] && (
                        testResults[model.id].ok
                          ? <Badge variant="outline" className="text-[10px] text-green-400 border-green-400/30 gap-1"><Check className="w-2.5 h-2.5" />{testResults[model.id].latencyMs}ms</Badge>
                          : <Badge variant="destructive" className="text-[10px] gap-1"><X className="w-2.5 h-2.5" />Failed</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {(JSON.parse(model.capabilities || "[]") as string[]).join(", ")} · {model.contextWindow.toLocaleString()} ctx
                      {model.baseUrl && ` · ${model.baseUrl}`}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => testModel(model.id)}
                      title="Test connection" data-testid={`button-test-${model.id}`}>
                      <TestTube2 className="w-3.5 h-3.5" />
                    </Button>
                    {!model.isDefault && (
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setDefault.mutate(model.id)}
                        title="Set as default" data-testid={`button-default-${model.id}`}>
                        <Star className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    {!model.isOrchestrator && (
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setOrchestrator.mutate(model.id)}
                        title="Use as orchestrator" data-testid={`button-orch-${model.id}`}>
                        <Brain className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 hover:text-destructive"
                      onClick={() => deleteModel.mutate(model.id)} data-testid={`button-delete-${model.id}`}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
