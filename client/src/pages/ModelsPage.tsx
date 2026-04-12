import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../lib/queryClient";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { Card } from "../components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { useToast } from "../hooks/use-toast";
import {
  Plus, Trash2, TestTube2, Check, X, Star, Brain, Zap, Shield,
  Server, Globe, Cpu, Key, Variable, Unplug, Link2, ExternalLink,
  ChevronRight, Loader2, CircleDot, AlertTriangle, Search, Sparkles,
  Wind, Users, Layers, Bot, Settings, MonitorSmartphone, Wifi, WifiOff,
  MessageSquare, Code2, Eye, Compass, Wrench, LayoutGrid, ArrowRight, RefreshCw,
} from "lucide-react";
import type { Model } from "../../../shared/schema";
import { safeJsonParse } from "../lib/safeJson";

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

interface ProviderPreset {
  name: string;
  modelId: string;
  speedTier: string;
  capabilities: string[];
  contextWindow: number;
  description: string;
  recommended?: boolean;
}

interface ProviderInfo {
  id: string;
  name: string;
  icon: string;
  supportedAuth: string[];
  defaultAuth: string;
  apiKeyUrl?: string;
  envVarNames: string[];
  models: ProviderPreset[];
  hasBaseUrl: boolean;
}

interface EnvVarInfo {
  provider: string;
  envVar: string;
  isSet: boolean;
  masked: string;
}

interface RoleConfig {
  role: string;
  defaultModelId: string | null;
  fallbackModelId: string | null;
  strategy: string;
  preferLocal: boolean;
  maxCostPerRequest: number | null;
  assignedModels: {
    id: string; name: string; provider: string; modelId: string;
    isRoleDefault: boolean; speedTier: string; connectionStatus: string;
  }[];
  resolvedModel: { id: string; name: string; provider: string } | null;
}

interface DiscoveredModel {
  modelId: string;
  name: string;
  ownedBy: string;
}

const SPEED_TIERS = [
  { value: "fast", label: "Fast", desc: "Speed tasks, quick lookups" },
  { value: "medium", label: "Medium", desc: "General tasks" },
  { value: "powerful", label: "Powerful", desc: "Research, code, analysis" },
];

const ROLE_INFO: Record<string, { label: string; icon: any; desc: string; color: string }> = {
  chat: { label: "Chat", icon: MessageSquare, desc: "Primary conversational model — handles general dialogue, writing, and research", color: "text-blue-400 border-blue-400/30" },
  code: { label: "Code", icon: Code2, desc: "Code generation, debugging, refactoring, and technical tasks", color: "text-green-400 border-green-400/30" },
  utility: { label: "Utility", icon: Wrench, desc: "Fast lightweight tasks — summarization, classification, extraction", color: "text-amber-400 border-amber-400/30" },
  embedding: { label: "Embedding", icon: LayoutGrid, desc: "Text embeddings for semantic search and memory", color: "text-purple-400 border-purple-400/30" },
  browser: { label: "Browser", icon: Compass, desc: "Web browsing automation and page interaction", color: "text-cyan-400 border-cyan-400/30" },
  vision: { label: "Vision", icon: Eye, desc: "Image analysis, screenshots, and visual understanding", color: "text-pink-400 border-pink-400/30" },
};

const LOCAL_PROVIDERS = [
  { id: "ollama", name: "Ollama", defaultUrl: "http://localhost:11434/v1", desc: "Run open-source models locally", port: "11434" },
  { id: "lmstudio", name: "LM Studio", defaultUrl: "http://localhost:1234/v1", desc: "Desktop app for local LLMs", port: "1234" },
  { id: "vllm", name: "vLLM", defaultUrl: "http://localhost:8000/v1", desc: "High-performance GPU inference server", port: "8000" },
];

// Map provider icon names to Lucide components
const ICON_MAP: Record<string, any> = {
  Brain, Shield, Sparkles, Wind, Zap, Users, Search, Bot, Layers, Server, Globe, Settings,
};

function ProviderIcon({ icon, className }: { icon: string; className?: string }) {
  const Icon = ICON_MAP[icon] || Cpu;
  return <Icon className={className || "w-4 h-4"} />;
}

// Connection status indicator
function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    connected: "bg-green-400",
    disconnected: "bg-zinc-500",
    unconfigured: "bg-zinc-600",
    expired: "bg-amber-400",
    error: "bg-red-400",
  };
  return (
    <span className={`inline-block w-2 h-2 rounded-full ${colors[status] || "bg-zinc-600"}`}
      title={status} />
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════════════════

export function ModelsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("connected");
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [connectMode, setConnectMode] = useState<"preset" | "manual">("preset");
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; latencyMs?: number; error?: string }>>({});
  const [connectingId, setConnectingId] = useState<string | null>(null);

  // Local model discovery state
  const [discoveryProvider, setDiscoveryProvider] = useState<string | null>(null);
  const [discoveryUrl, setDiscoveryUrl] = useState("");
  const [discoveredModels, setDiscoveredModels] = useState<DiscoveredModel[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);

  // Queries
  const { data: models = [], isLoading: modelsLoading, isError: modelsError } = useQuery<Model[]>({ queryKey: ["/api/models"] });
  const { data: providers = [], isLoading: providersLoading, isError: providersError } = useQuery<ProviderInfo[]>({ queryKey: ["/api/models/providers"] });
  const { data: envVars = [], isLoading: envVarsLoading, isError: envVarsError } = useQuery<EnvVarInfo[]>({ queryKey: ["/api/models/env-vars"] });
  const { data: roles = [], isLoading: rolesLoading } = useQuery<RoleConfig[]>({ queryKey: ["/api/models/roles"] });

  // Quick-add form state
  const [qaProvider, setQaProvider] = useState("");
  const [qaPreset, setQaPreset] = useState("");
  const [qaAuth, setQaAuth] = useState("api_key");
  const [qaApiKey, setQaApiKey] = useState("");
  const [qaEnvVar, setQaEnvVar] = useState("");
  const [qaBaseUrl, setQaBaseUrl] = useState("");

  // Manual form state
  const [form, setForm] = useState({
    name: "", provider: "openai", modelId: "", baseUrl: "", apiKey: "",
    speedTier: "medium", isDefault: false, isOrchestrator: false,
    capabilities: ["chat"], contextWindow: 8192, notes: "",
    authMethod: "api_key", envVarName: "",
  });

  // Mutations
  const createModel = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/models", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/models"] });
      qc.invalidateQueries({ queryKey: ["/api/models/roles"] });
      setActiveTab("connected");
      resetForm();
      toast({ title: "Model added" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const quickAddMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/models/quick-add", data),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["/api/models"] });
      qc.invalidateQueries({ queryKey: ["/api/models/roles"] });
      setActiveTab("connected");
      setSelectedProvider(null);
      resetQuickAdd();
      if (data.connection?.ok) {
        toast({ title: "Model connected", description: `${data.model.name} is ready` });
      } else {
        toast({ title: "Model added", description: data.connection?.error || "Test the connection manually", variant: "destructive" });
      }
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteModel = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/models/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/models"] }); qc.invalidateQueries({ queryKey: ["/api/models/roles"] }); toast({ title: "Model removed" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const connectModelMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => apiRequest("POST", `/api/models/${id}/connect`, data),
    onSuccess: (data: any, vars: any) => {
      qc.invalidateQueries({ queryKey: ["/api/models"] });
      setConnectingId(null);
      if (data.ok) toast({ title: "Connected" });
      else toast({ title: "Connection failed", description: data.error, variant: "destructive" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const disconnectMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/models/${id}/disconnect`, {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/models"] }); toast({ title: "Disconnected" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const setDefault = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/models/${id}`, { isDefault: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/models"] }),
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const setOrchestrator = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/models/${id}`, { isOrchestrator: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/models"] }),
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const assignRole = useMutation({
    mutationFn: ({ id, role, isDefault }: { id: string; role: string; isDefault: boolean }) =>
      apiRequest("POST", `/api/models/${id}/assign-role`, { role, isDefault }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/models"] });
      qc.invalidateQueries({ queryKey: ["/api/models/roles"] });
      toast({ title: "Role assigned" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const unassignRole = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/models/${id}/unassign-role`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/models"] });
      qc.invalidateQueries({ queryKey: ["/api/models/roles"] });
      toast({ title: "Role removed" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateRoleStrategy = useMutation({
    mutationFn: ({ role, ...data }: any) => apiRequest("PUT", `/api/models/roles/${role}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/models/roles"] });
      toast({ title: "Strategy updated" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const testModel = async (id: string) => {
    setTestResults(r => ({ ...r, [id]: { ok: false } }));
    try {
      const res = await apiRequest("POST", `/api/models/${id}/test`, {});
      setTestResults(r => ({ ...r, [id]: res as any }));
      qc.invalidateQueries({ queryKey: ["/api/models"] });
    } catch (e: any) {
      setTestResults(r => ({ ...r, [id]: { ok: false, error: e.message } }));
    }
  };

  const discoverLocalModels = async (provider: string, baseUrl: string) => {
    setDiscovering(true);
    setDiscoveryError(null);
    setDiscoveredModels([]);
    try {
      const res = await apiRequest("POST", "/api/models/discover-local", { provider, baseUrl }) as any;
      if (res.ok) {
        setDiscoveredModels(res.models);
        if (res.models.length === 0) setDiscoveryError("Server is running but no models found. Load a model first.");
      } else {
        setDiscoveryError(res.error || "Could not connect to local server");
      }
    } catch (e: any) {
      setDiscoveryError(e.message);
    } finally {
      setDiscovering(false);
    }
  };

  const addDiscoveredModel = async (provider: string, baseUrl: string, discovered: DiscoveredModel) => {
    try {
      await apiRequest("POST", "/api/models", {
        name: discovered.name,
        provider,
        modelId: discovered.modelId,
        baseUrl,
        authMethod: "none",
        capabilities: ["chat", "code"],
        contextWindow: 32768,
        speedTier: "medium",
      });
      qc.invalidateQueries({ queryKey: ["/api/models"] });
      qc.invalidateQueries({ queryKey: ["/api/models/roles"] });
      toast({ title: "Model added", description: `${discovered.name} from ${provider}` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const resetForm = () => setForm({
    name: "", provider: "openai", modelId: "", baseUrl: "", apiKey: "",
    speedTier: "medium", isDefault: false, isOrchestrator: false,
    capabilities: ["chat"], contextWindow: 8192, notes: "",
    authMethod: "api_key", envVarName: "",
  });

  const resetQuickAdd = () => {
    setQaProvider(""); setQaPreset(""); setQaAuth("api_key");
    setQaApiKey(""); setQaEnvVar(""); setQaBaseUrl("");
  };

  const toggleCapability = (cap: string) => {
    setForm(f => ({
      ...f,
      capabilities: f.capabilities.includes(cap)
        ? f.capabilities.filter(c => c !== cap)
        : [...f.capabilities, cap],
    }));
  };

  const currentProviderInfo = providers.find(p => p.id === qaProvider);
  const formProviderInfo = providers.find(p => p.id === form.provider);
  const detectedEnvVars = envVars.filter(ev => ev.isSet);

  // ═══════════════════════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════════════════════

  if (modelsLoading || providersLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />Loading models...
      </div>
    );
  }

  if (modelsError || providersError) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Failed to load models. Please try again.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card/50">
        <Cpu className="w-4 h-4 text-primary" />
        <h1 className="font-semibold text-sm">Models</h1>
        <p className="text-xs text-muted-foreground flex-1">
          Multi-provider model management with role-based assignment
        </p>
        <Badge variant="outline" className="text-[10px]">
          {models.length} model{models.length !== 1 ? "s" : ""}
        </Badge>
      </div>

      {/* Env var detection banner */}
      {detectedEnvVars.length > 0 && activeTab !== "connected" && activeTab !== "roles" && (
        <div className="mx-4 mt-3 p-2.5 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center gap-2">
          <Variable className="w-3.5 h-3.5 text-green-400 shrink-0" />
          <span className="text-xs text-green-300">
            Detected API keys: {detectedEnvVars.map(ev => (
              <code key={ev.envVar} className="mx-1 px-1.5 py-0.5 bg-green-500/20 rounded text-green-200">
                {ev.envVar}
              </code>
            ))}
            — use env var auth to auto-connect
          </span>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <div className="px-4 pt-3">
          <TabsList className="grid w-full grid-cols-5 h-8">
            <TabsTrigger value="connected" className="text-xs" data-testid="tab-connected">
              Models ({models.length})
            </TabsTrigger>
            <TabsTrigger value="roles" className="text-xs" data-testid="tab-roles">
              Roles
            </TabsTrigger>
            <TabsTrigger value="local" className="text-xs" data-testid="tab-local">
              Local
            </TabsTrigger>
            <TabsTrigger value="add" className="text-xs" data-testid="tab-add">
              Add
            </TabsTrigger>
            <TabsTrigger value="manual" className="text-xs" data-testid="tab-manual">
              Manual
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ═══ Tab: Connected Models ═══ */}
        <TabsContent value="connected" className="flex-1 overflow-auto p-4 mt-0">
          {models.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Cpu className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p className="text-sm font-medium">No models connected</p>
              <p className="text-xs mt-1 mb-4 max-w-xs mx-auto">
                Add a model to get started — pick a provider, enter your API key or use an environment variable.
              </p>
              <div className="flex gap-2 justify-center">
                <Button size="sm" onClick={() => setActiveTab("add")} className="gap-1.5">
                  <Plus className="w-3 h-3" /> Cloud Provider
                </Button>
                <Button size="sm" variant="outline" onClick={() => setActiveTab("local")} className="gap-1.5">
                  <Server className="w-3 h-3" /> Local Model
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {models.map(model => {
                const prov = providers.find(p => p.id === model.provider);
                const status = (model as any).connectionStatus || "unconfigured";
                const authMethod = (model as any).authMethod || "api_key";
                const testResult = testResults[model.id];
                const modelRole = (model as any).modelRole;
                const isRoleDefault = (model as any).isRoleDefault;

                return (
                  <Card key={model.id} className={`p-3 ${!model.enabled ? "opacity-50" : ""}`}
                    data-testid={`model-card-${model.id}`}>
                    <div className="flex items-start gap-3">
                      {/* Provider icon */}
                      <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                        <ProviderIcon icon={prov?.icon || "Cpu"} className="w-4.5 h-4.5 text-primary" />
                      </div>

                      {/* Model info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <StatusDot status={status} />
                          <span className="font-semibold text-sm">{model.name}</span>
                          <Badge variant="secondary" className="text-[10px]">{prov?.name || model.provider}</Badge>
                          <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                            {model.modelId}
                          </code>
                          {model.isDefault && (
                            <Badge className="text-[10px] gap-1"><Star className="w-2.5 h-2.5" />Default</Badge>
                          )}
                          {model.isOrchestrator && (
                            <Badge variant="secondary" className="text-[10px] gap-1"><Brain className="w-2.5 h-2.5" />Orchestrator</Badge>
                          )}
                          {modelRole && (
                            <Badge variant="outline" className={`text-[10px] gap-1 ${ROLE_INFO[modelRole]?.color || ""}`}>
                              {ROLE_INFO[modelRole]?.label || modelRole}
                              {isRoleDefault && <Star className="w-2 h-2" />}
                            </Badge>
                          )}
                          {model.speedTier === "fast" && (
                            <Badge variant="outline" className="text-[10px] gap-1 text-green-400 border-green-400/30">
                              <Zap className="w-2.5 h-2.5" />Fast
                            </Badge>
                          )}
                          {model.speedTier === "powerful" && (
                            <Badge variant="outline" className="text-[10px] gap-1 text-purple-400 border-purple-400/30">
                              <Shield className="w-2.5 h-2.5" />Powerful
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                          <p className="text-xs text-muted-foreground">
                            {safeJsonParse(model.capabilities, [] as string[]).join(", ")} · {model.contextWindow.toLocaleString()} ctx
                          </p>
                          <Badge variant="outline" className="text-[9px] gap-1 px-1.5 py-0">
                            {authMethod === "api_key" && <><Key className="w-2 h-2" /> API Key</>}
                            {authMethod === "env_var" && <><Variable className="w-2 h-2" /> Env: {(model as any).envVarName}</>}
                            {authMethod === "oauth" && <><Link2 className="w-2 h-2" /> OAuth</>}
                            {authMethod === "none" && <><Server className="w-2 h-2" /> Local</>}
                          </Badge>
                          {status === "error" && (model as any).connectionError && (
                            <span className="text-[10px] text-red-400 truncate max-w-[200px]" title={(model as any).connectionError}>
                              {(model as any).connectionError}
                            </span>
                          )}
                          {testResult && (
                            testResult.ok
                              ? <Badge variant="outline" className="text-[10px] text-green-400 border-green-400/30 gap-1">
                                  <Check className="w-2.5 h-2.5" />{testResult.latencyMs}ms
                                </Badge>
                              : <Badge variant="destructive" className="text-[10px] gap-1">
                                  <X className="w-2.5 h-2.5" />Failed
                                </Badge>
                          )}
                          {(model as any).lastTestedAt && !testResult && (
                            <span className="text-[10px] text-muted-foreground">
                              Tested {new Date((model as any).lastTestedAt).toLocaleDateString()}
                              {(model as any).lastTestLatency ? ` · ${(model as any).lastTestLatency}ms` : ""}
                            </span>
                          )}
                        </div>

                        {/* Reconnect UI for disconnected/error models */}
                        {connectingId === model.id && (
                          <div className="mt-2 flex items-center gap-2">
                            <Input
                              type="password"
                              placeholder={authMethod === "env_var" ? "ENV_VAR_NAME" : "API key"}
                              className="h-7 text-xs flex-1 max-w-[280px]"
                              onChange={e => setQaApiKey(e.target.value)}
                              value={qaApiKey}
                              data-testid="input-reconnect-key"
                            />
                            <Button size="sm" className="h-7 text-xs gap-1"
                              onClick={() => {
                                connectModelMutation.mutate({
                                  id: model.id,
                                  authMethod: authMethod,
                                  apiKey: authMethod === "api_key" ? qaApiKey : undefined,
                                  envVarName: authMethod === "env_var" ? qaApiKey : undefined,
                                });
                                setQaApiKey("");
                              }}
                              data-testid="button-reconnect-save"
                            >
                              <Check className="w-3 h-3" /> Save
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 text-xs"
                              onClick={() => { setConnectingId(null); setQaApiKey(""); }}>
                              Cancel
                            </Button>
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex gap-1 shrink-0">
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => testModel(model.id)}
                          title="Test connection" data-testid={`button-test-${model.id}`}>
                          <TestTube2 className="w-3.5 h-3.5" />
                        </Button>
                        {(status === "error" || status === "disconnected" || status === "unconfigured") && (
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                            onClick={() => { setConnectingId(model.id); setQaApiKey(""); }}
                            title="Update credentials" data-testid={`button-reconnect-${model.id}`}>
                            <Key className="w-3.5 h-3.5 text-amber-400" />
                          </Button>
                        )}
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
                        {status === "connected" && (
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => disconnectMutation.mutate(model.id)}
                            title="Disconnect" data-testid={`button-disconnect-${model.id}`}>
                            <Unplug className="w-3.5 h-3.5 text-amber-400" />
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 hover:text-destructive"
                          onClick={() => deleteModel.mutate(model.id)} data-testid={`button-delete-${model.id}`}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ═══ Tab: Role Assignment (Agent Zero-style) ═══ */}
        <TabsContent value="roles" className="flex-1 overflow-auto p-4 mt-0">
          <div className="mb-4">
            <p className="text-xs text-muted-foreground">
              Assign the right model to each role. The router automatically picks the best model per task type.
              Unassigned models remain available as fallbacks.
            </p>
          </div>

          {rolesLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
              <Loader2 className="w-4 h-4 animate-spin mr-2" />Loading roles...
            </div>
          ) : (
            <div className="space-y-3">
              {roles.map(roleConfig => {
                const info = ROLE_INFO[roleConfig.role];
                const RoleIcon = info?.icon || Cpu;
                const unassignedModels = models.filter(m => !(m as any).modelRole && m.enabled);
                return (
                  <Card key={roleConfig.role} className="p-3" data-testid={`role-card-${roleConfig.role}`}>
                    <div className="flex items-start gap-3">
                      <div className={`w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0`}>
                        <RoleIcon className={`w-4.5 h-4.5 ${info?.color?.split(" ")[0] || "text-primary"}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-sm">{info?.label || roleConfig.role}</span>
                          {roleConfig.resolvedModel ? (
                            <Badge variant="outline" className="text-[10px] text-green-400 border-green-400/30 gap-1">
                              <Check className="w-2 h-2" /> {roleConfig.resolvedModel.name}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] text-zinc-500 border-zinc-500/30">
                              No model assigned
                            </Badge>
                          )}
                          {roleConfig.preferLocal && (
                            <Badge variant="outline" className="text-[10px] text-amber-400 border-amber-400/30 gap-1">
                              <Server className="w-2 h-2" /> Prefer local
                            </Badge>
                          )}
                          <Badge variant="outline" className="text-[10px]">
                            {roleConfig.strategy}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground mb-2">{info?.desc}</p>

                        {/* Assigned models */}
                        {roleConfig.assignedModels.length > 0 && (
                          <div className="flex gap-1.5 flex-wrap mb-2">
                            {roleConfig.assignedModels.map(m => (
                              <div key={m.id} className="flex items-center gap-1.5 bg-muted rounded-md px-2 py-1 text-[11px]">
                                <StatusDot status={m.connectionStatus} />
                                <span className="font-medium">{m.name}</span>
                                {m.isRoleDefault && <Star className="w-2.5 h-2.5 text-amber-400" />}
                                <button onClick={() => unassignRole.mutate(m.id)}
                                  className="ml-1 text-muted-foreground hover:text-red-400 transition-colors"
                                  title="Remove from role" data-testid={`unassign-${m.id}`}>
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Assign model dropdown */}
                        <div className="flex items-center gap-2">
                          <Select
                            value=""
                            onValueChange={(modelId) => {
                              if (modelId) {
                                assignRole.mutate({
                                  id: modelId,
                                  role: roleConfig.role,
                                  isDefault: roleConfig.assignedModels.length === 0,
                                });
                              }
                            }}
                          >
                            <SelectTrigger className="h-7 text-xs w-[220px]" data-testid={`assign-select-${roleConfig.role}`}>
                              <SelectValue placeholder="Assign a model..." />
                            </SelectTrigger>
                            <SelectContent>
                              {unassignedModels.map(m => (
                                <SelectItem key={m.id} value={m.id}>
                                  {m.name} ({(providers.find(p => p.id === m.provider)?.name || m.provider)})
                                </SelectItem>
                              ))}
                              {unassignedModels.length === 0 && (
                                <SelectItem value="_none" disabled>No unassigned models</SelectItem>
                              )}
                            </SelectContent>
                          </Select>

                          {/* Prefer local toggle */}
                          <Button
                            size="sm"
                            variant={roleConfig.preferLocal ? "default" : "outline"}
                            className="h-7 text-xs gap-1"
                            onClick={() => updateRoleStrategy.mutate({
                              role: roleConfig.role,
                              strategy: roleConfig.strategy,
                              preferLocal: !roleConfig.preferLocal,
                            })}
                            title="Prefer local models for zero-cost 24/7 operation"
                            data-testid={`prefer-local-${roleConfig.role}`}
                          >
                            <Server className="w-3 h-3" />
                            {roleConfig.preferLocal ? "Local preferred" : "Prefer local"}
                          </Button>

                          {/* Strategy selector */}
                          <Select
                            value={roleConfig.strategy}
                            onValueChange={(strategy) => updateRoleStrategy.mutate({
                              role: roleConfig.role,
                              strategy,
                              preferLocal: roleConfig.preferLocal,
                            })}
                          >
                            <SelectTrigger className="h-7 text-xs w-[130px]" data-testid={`strategy-${roleConfig.role}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="single">Single model</SelectItem>
                              <SelectItem value="fallback">With fallback</SelectItem>
                              <SelectItem value="round_robin">Round robin</SelectItem>
                              <SelectItem value="cost_optimized">Cost optimized</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ═══ Tab: Local Models ═══ */}
        <TabsContent value="local" className="flex-1 overflow-auto p-4 mt-0">
          <div className="mb-4">
            <p className="text-xs text-muted-foreground mb-1">
              Connect to local model servers for zero-cost 24/7 operation. Run any open-source model on your own hardware.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
            {LOCAL_PROVIDERS.map(lp => {
              const isSelected = discoveryProvider === lp.id;
              const existingCount = models.filter(m => m.provider === lp.id).length;
              return (
                <button
                  key={lp.id}
                  onClick={() => {
                    setDiscoveryProvider(lp.id);
                    setDiscoveryUrl(lp.defaultUrl);
                    setDiscoveredModels([]);
                    setDiscoveryError(null);
                  }}
                  className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${
                    isSelected
                      ? "bg-primary/10 border-primary"
                      : "bg-card border-border hover:border-primary/40"
                  }`}
                  data-testid={`local-provider-${lp.id}`}
                >
                  <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <Server className={`w-4.5 h-4.5 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-sm">{lp.name}</span>
                      {existingCount > 0 && (
                        <Badge variant="outline" className="text-[9px] text-green-400 border-green-400/30 px-1 py-0">
                          {existingCount} added
                        </Badge>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground">{lp.desc}</p>
                    <p className="text-[10px] text-muted-foreground">Port {lp.port}</p>
                  </div>
                </button>
              );
            })}
          </div>

          {discoveryProvider && (
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Server className="w-4 h-4 text-primary" />
                <span className="font-semibold text-sm">
                  {LOCAL_PROVIDERS.find(lp => lp.id === discoveryProvider)?.name} Connection
                </span>
              </div>

              <div className="flex gap-2 mb-4">
                <Input
                  value={discoveryUrl}
                  onChange={e => setDiscoveryUrl(e.target.value)}
                  placeholder="http://localhost:11434/v1"
                  className="h-8 text-sm flex-1"
                  data-testid="input-discovery-url"
                />
                <Button
                  size="sm"
                  className="h-8 gap-1.5"
                  onClick={() => discoverLocalModels(discoveryProvider, discoveryUrl)}
                  disabled={discovering || !discoveryUrl}
                  data-testid="button-discover"
                >
                  {discovering ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                  Discover Models
                </Button>
              </div>

              {discoveryError && (
                <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center gap-2 mb-3">
                  <WifiOff className="w-3.5 h-3.5 text-red-400 shrink-0" />
                  <span className="text-xs text-red-300">{discoveryError}</span>
                </div>
              )}

              {discoveredModels.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground mb-2">
                    <Wifi className="w-3 h-3 inline mr-1 text-green-400" />
                    Found {discoveredModels.length} model{discoveredModels.length !== 1 ? "s" : ""}:
                  </p>
                  {discoveredModels.map(dm => {
                    const alreadyAdded = models.some(m => m.provider === discoveryProvider && m.modelId === dm.modelId);
                    return (
                      <div key={dm.modelId}
                        className="flex items-center gap-3 p-2.5 rounded-lg border border-border bg-card"
                      >
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium">{dm.name}</span>
                          <p className="text-[10px] text-muted-foreground">
                            {dm.ownedBy} · {dm.modelId}
                          </p>
                        </div>
                        {alreadyAdded ? (
                          <Badge variant="outline" className="text-[10px] text-green-400 border-green-400/30">Added</Badge>
                        ) : (
                          <Button size="sm" className="h-7 text-xs gap-1"
                            onClick={() => addDiscoveredModel(discoveryProvider!, discoveryUrl, dm)}
                            data-testid={`add-discovered-${dm.modelId}`}>
                            <Plus className="w-3 h-3" /> Add
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {!discovering && !discoveryError && discoveredModels.length === 0 && (
                <div className="text-center py-6 text-muted-foreground">
                  <MonitorSmartphone className="w-8 h-8 mx-auto mb-2 opacity-20" />
                  <p className="text-xs">
                    Make sure {LOCAL_PROVIDERS.find(lp => lp.id === discoveryProvider)?.name} is running, then click Discover Models
                  </p>
                </div>
              )}
            </Card>
          )}

          {!discoveryProvider && (
            <div className="text-center py-8 text-muted-foreground">
              <Server className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm font-medium">Select a local provider above</p>
              <p className="text-xs mt-1 max-w-sm mx-auto">
                Ultra Computer will probe the server to discover available models and let you add them with one click.
                Local models run at zero cost — 24/7.
              </p>
            </div>
          )}
        </TabsContent>

        {/* ═══ Tab: Add Model (Provider Catalog + 1-Click) ═══ */}
        <TabsContent value="add" className="flex-1 overflow-auto p-4 mt-0">
          {!selectedProvider ? (
            <>
              <p className="text-xs text-muted-foreground mb-3">Choose a provider to add models from:</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {providers.filter(p => p.models.length > 0).map(prov => {
                  const existingCount = models.filter(m => m.provider === prov.id).length;
                  const detectedEnv = envVars.find(ev => ev.provider === prov.id && ev.isSet);
                  return (
                    <button
                      key={prov.id}
                      onClick={() => { setSelectedProvider(prov.id); setQaProvider(prov.id); setQaAuth(prov.defaultAuth); }}
                      className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:border-primary/50 hover:bg-card/80 transition-all text-left group"
                      data-testid={`provider-${prov.id}`}
                    >
                      <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0 group-hover:bg-primary/10 transition-colors">
                        <ProviderIcon icon={prov.icon} className="w-4.5 h-4.5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-sm">{prov.name}</span>
                          {detectedEnv && (
                            <Badge variant="outline" className="text-[9px] text-green-400 border-green-400/30 px-1 py-0">
                              env
                            </Badge>
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          {prov.models.length} model{prov.models.length !== 1 ? "s" : ""}
                          {existingCount > 0 ? ` · ${existingCount} added` : ""}
                        </p>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                    </button>
                  );
                })}

                {/* Custom / OpenAI-compat cards */}
                {providers.filter(p => p.models.length === 0).map(prov => (
                  <button
                    key={prov.id}
                    onClick={() => { setSelectedProvider(null); setActiveTab("manual"); setForm(f => ({ ...f, provider: prov.id })); }}
                    className="flex items-center gap-3 p-3 rounded-lg border border-dashed border-border bg-card/50 hover:border-primary/30 transition-all text-left group"
                    data-testid={`provider-${prov.id}`}
                  >
                    <div className="w-9 h-9 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
                      <ProviderIcon icon={prov.icon} className="w-4.5 h-4.5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-sm text-muted-foreground">{prov.name}</span>
                      <p className="text-[10px] text-muted-foreground">Manual configuration</p>
                    </div>
                  </button>
                ))}
              </div>
            </>
          ) : (
            /* Provider detail + model selection */
            <div>
              {/* Back button + provider header */}
              <div className="flex items-center gap-2 mb-4">
                <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs"
                  onClick={() => { setSelectedProvider(null); resetQuickAdd(); }}>
                  ← Back
                </Button>
                <div className="flex items-center gap-2 flex-1">
                  <ProviderIcon icon={currentProviderInfo?.icon || "Cpu"} className="w-4 h-4 text-primary" />
                  <span className="font-semibold text-sm">{currentProviderInfo?.name}</span>
                </div>
                {currentProviderInfo?.apiKeyUrl && (
                  <a href={currentProviderInfo.apiKeyUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[10px] text-primary hover:underline">
                    Get API Key <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                )}
              </div>

              {/* Auth method selection */}
              <div className="mb-4 p-3 rounded-lg bg-muted/30 border border-border">
                <p className="text-xs font-medium mb-2">Connection Method</p>
                <div className="flex gap-2 flex-wrap">
                  {currentProviderInfo?.supportedAuth.map(auth => {
                    const detectedEnv = auth === "env_var" ? envVars.find(ev => ev.provider === qaProvider && ev.isSet) : null;
                    return (
                      <button
                        key={auth}
                        onClick={() => {
                          setQaAuth(auth);
                          if (auth === "env_var" && detectedEnv) setQaEnvVar(detectedEnv.envVar);
                        }}
                        className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border transition-all ${
                          qaAuth === auth
                            ? "bg-primary/20 border-primary text-primary"
                            : "bg-muted border-border text-muted-foreground hover:border-primary/30"
                        }`}
                        data-testid={`auth-${auth}`}
                      >
                        {auth === "api_key" && <><Key className="w-3 h-3" /> API Key</>}
                        {auth === "env_var" && (
                          <>
                            <Variable className="w-3 h-3" /> Environment Variable
                            {detectedEnv && (
                              <Badge variant="outline" className="text-[8px] text-green-400 border-green-400/30 px-1 py-0 ml-1">
                                detected
                              </Badge>
                            )}
                          </>
                        )}
                        {auth === "oauth" && <><Link2 className="w-3 h-3" /> OAuth Login</>}
                        {auth === "none" && <><Server className="w-3 h-3" /> No Auth (Local)</>}
                      </button>
                    );
                  })}
                </div>

                {/* Credential input for selected auth method */}
                <div className="mt-3">
                  {qaAuth === "api_key" && (
                    <div className="flex gap-2">
                      <Input
                        type="password"
                        value={qaApiKey}
                        onChange={e => setQaApiKey(e.target.value)}
                        placeholder={`Enter ${currentProviderInfo?.name} API key${currentProviderInfo?.apiKeyUrl ? " (sk-...)" : ""}`}
                        className="h-8 text-sm flex-1"
                        data-testid="input-qa-api-key"
                      />
                    </div>
                  )}
                  {qaAuth === "env_var" && (
                    <div>
                      <Select value={qaEnvVar} onValueChange={setQaEnvVar}>
                        <SelectTrigger className="h-8 text-sm" data-testid="select-env-var">
                          <SelectValue placeholder="Select environment variable" />
                        </SelectTrigger>
                        <SelectContent>
                          {(currentProviderInfo?.envVarNames || []).map(name => {
                            const info = envVars.find(ev => ev.envVar === name);
                            return (
                              <SelectItem key={name} value={name}>
                                {name} {info?.isSet ? `(${info.masked})` : "(not set)"}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                      {qaEnvVar && !envVars.find(ev => ev.envVar === qaEnvVar)?.isSet && (
                        <p className="text-[10px] text-amber-400 mt-1">
                          This variable is not set in the server environment. Set it and restart.
                        </p>
                      )}
                    </div>
                  )}
                  {qaAuth === "none" && currentProviderInfo?.hasBaseUrl && (
                    <Input
                      value={qaBaseUrl}
                      onChange={e => setQaBaseUrl(e.target.value)}
                      placeholder={currentProviderInfo?.id === "ollama" ? "http://localhost:11434/v1" : "Base URL"}
                      className="h-8 text-sm"
                      data-testid="input-qa-base-url"
                    />
                  )}
                </div>
              </div>

              {/* Model presets */}
              <p className="text-xs text-muted-foreground mb-2">Select a model to add:</p>
              <div className="space-y-1.5">
                {currentProviderInfo?.models.map(preset => {
                  const alreadyAdded = models.some(m => m.provider === qaProvider && m.modelId === preset.modelId);
                  return (
                    <button
                      key={preset.modelId}
                      onClick={() => {
                        if (alreadyAdded) return;
                        quickAddMutation.mutate({
                          provider: qaProvider,
                          presetModelId: preset.modelId,
                          authMethod: qaAuth,
                          apiKey: qaAuth === "api_key" ? qaApiKey : undefined,
                          envVarName: qaAuth === "env_var" ? qaEnvVar : undefined,
                          baseUrl: qaBaseUrl || undefined,
                        });
                      }}
                      disabled={alreadyAdded || quickAddMutation.isPending ||
                        (qaAuth === "api_key" && !qaApiKey && currentProviderInfo?.id !== "ollama")}
                      className={`w-full flex items-center gap-3 p-2.5 rounded-lg border text-left transition-all ${
                        alreadyAdded
                          ? "border-border/50 bg-card/30 opacity-50 cursor-not-allowed"
                          : "border-border bg-card hover:border-primary/40 hover:bg-card/80"
                      }`}
                      data-testid={`preset-${preset.modelId}`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{preset.name}</span>
                          {preset.recommended && (
                            <Badge className="text-[9px] px-1 py-0">Recommended</Badge>
                          )}
                          {alreadyAdded && (
                            <Badge variant="outline" className="text-[9px] px-1 py-0 text-green-400 border-green-400/30">Added</Badge>
                          )}
                          <Badge variant="outline" className={`text-[9px] px-1 py-0 ${
                            preset.speedTier === "fast" ? "text-green-400 border-green-400/30" :
                            preset.speedTier === "powerful" ? "text-purple-400 border-purple-400/30" :
                            "text-blue-400 border-blue-400/30"
                          }`}>
                            {preset.speedTier}
                          </Badge>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {preset.description} · {preset.capabilities.join(", ")} · {preset.contextWindow.toLocaleString()} ctx
                        </p>
                      </div>
                      {!alreadyAdded && (
                        quickAddMutation.isPending
                          ? <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0" />
                          : <Plus className="w-4 h-4 text-muted-foreground group-hover:text-primary shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </TabsContent>

        {/* ═══ Tab: Manual Setup ═══ */}
        <TabsContent value="manual" className="flex-1 overflow-auto p-4 mt-0">
          <Card className="p-4 border-border bg-card">
            <h2 className="font-semibold text-sm mb-3">Manual Model Configuration</h2>
            <p className="text-xs text-muted-foreground mb-4">
              Full control — configure any provider, model ID, base URL, and auth method.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Display Name</label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. My GPT-4o" className="h-8 text-sm" data-testid="input-model-name" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Provider</label>
                <Select value={form.provider} onValueChange={v => setForm(f => ({ ...f, provider: v }))}>
                  <SelectTrigger className="h-8 text-sm" data-testid="select-provider">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {providers.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Model ID</label>
                <Input value={form.modelId} onChange={e => setForm(f => ({ ...f, modelId: e.target.value }))}
                  placeholder="gpt-4o, claude-sonnet-4, etc." className="h-8 text-sm" data-testid="input-model-id" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Auth Method</label>
                <Select value={form.authMethod} onValueChange={v => setForm(f => ({ ...f, authMethod: v }))}>
                  <SelectTrigger className="h-8 text-sm" data-testid="select-auth-method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="api_key">API Key</SelectItem>
                    <SelectItem value="env_var">Environment Variable</SelectItem>
                    <SelectItem value="none">No Auth (Local)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Conditional credential fields */}
              {form.authMethod === "api_key" && (
                <div className="col-span-2">
                  <label className="text-xs text-muted-foreground mb-1 block">API Key</label>
                  <Input value={form.apiKey} onChange={e => setForm(f => ({ ...f, apiKey: e.target.value }))}
                    type="password" placeholder="sk-..." className="h-8 text-sm" data-testid="input-api-key" />
                </div>
              )}
              {form.authMethod === "env_var" && (
                <div className="col-span-2">
                  <label className="text-xs text-muted-foreground mb-1 block">Environment Variable Name</label>
                  <Input value={form.envVarName} onChange={e => setForm(f => ({ ...f, envVarName: e.target.value }))}
                    placeholder="OPENAI_API_KEY" className="h-8 text-sm" data-testid="input-env-var-name" />
                </div>
              )}

              {/* Base URL (always shown for compat/custom/ollama/vllm, optional for others) */}
              {(form.provider === "openai_compat" || form.provider === "custom" || form.provider === "ollama" ||
                form.provider === "vllm" || form.provider === "lmstudio" ||
                form.provider === "mistral" || form.provider === "groq" || form.provider === "together" ||
                form.provider === "deepseek" || form.provider === "xai" || form.provider === "cohere") && (
                <div className="col-span-2">
                  <label className="text-xs text-muted-foreground mb-1 block">Base URL</label>
                  <Input value={form.baseUrl} onChange={e => setForm(f => ({ ...f, baseUrl: e.target.value }))}
                    placeholder={formProviderInfo?.hasBaseUrl ? "Auto-configured if empty" : "https://your-endpoint.com/v1"}
                    className="h-8 text-sm" data-testid="input-base-url" />
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
                        : "bg-muted border-border text-muted-foreground"}`}
                      data-testid={`cap-${cap}`}>
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
            <div className="flex gap-2 mt-4">
              <Button size="sm" onClick={() => createModel.mutate(form)} disabled={!form.name.trim() || !form.modelId.trim()}
                data-testid="button-create-model">
                Add Model
              </Button>
              <Button size="sm" variant="outline" onClick={resetForm}>Reset</Button>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
