import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../lib/queryClient";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Switch } from "../components/ui/switch";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { useToast } from "../hooks/use-toast";
// Layout wrapper is provided by App.tsx route
import { useState, useEffect } from "react";
import { Container, Shield, Cpu, HardDrive, Network, Clock, RefreshCw, Trash2, Download, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";

interface SandboxStatus {
  dockerAvailable: boolean;
  enabled: boolean;
  activeContainers: number;
  maxContainers: number;
  containers: Array<{
    sessionId: string;
    containerId: string;
    status: string;
    age: string;
    idleSince: string;
  }>;
}

interface SandboxConfig {
  image: string;
  cpuLimit: string;
  memoryLimit: string;
  execTimeoutMs: number;
  networkEnabled: boolean;
  maxContainers: number;
  idleTimeoutMs: number;
  enabled: boolean;
}

export function SandboxPage() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: status, isLoading: statusLoading } = useQuery<SandboxStatus>({
    queryKey: ["/api/sandbox/status"],
    refetchInterval: 5000,
  });

  const { data: config, isLoading: configLoading } = useQuery<SandboxConfig>({
    queryKey: ["/api/sandbox/config"],
  });

  const [form, setForm] = useState<SandboxConfig | null>(null);

  useEffect(() => {
    if (config && !form) setForm({ ...config });
  }, [config, form]);

  const saveConfig = useMutation({
    mutationFn: (cfg: Partial<SandboxConfig>) => apiRequest("POST", "/api/sandbox/config", cfg),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/sandbox/config"] });
      qc.invalidateQueries({ queryKey: ["/api/sandbox/status"] });
    },
    onError: () => toast({ title: "Error", description: "Operation failed", variant: "destructive" }),
  });

  const pullImage = useMutation({
    mutationFn: () => apiRequest("POST", "/api/sandbox/pull-image"),
    onError: (e: any) => toast({ title: "Pull failed", description: e.message, variant: "destructive" }),
  });

  const resetDetection = useMutation({
    mutationFn: () => apiRequest("POST", "/api/sandbox/reset-detection"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/sandbox/status"] });
    },
    onError: () => toast({ title: "Error", description: "Operation failed", variant: "destructive" }),
  });

  const cleanup = useMutation({
    mutationFn: () => apiRequest("POST", "/api/sandbox/cleanup"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/sandbox/status"] });
    },
    onError: () => toast({ title: "Error", description: "Operation failed", variant: "destructive" }),
  });

  const handleSave = () => {
    if (form) saveConfig.mutate(form);
  };

  const dockerOk = status?.dockerAvailable ?? false;
  const isActive = dockerOk && (form?.enabled ?? config?.enabled ?? false);

  if (configLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Loading configuration...
      </div>
    );
  }

  return (
      <div className="max-w-3xl mx-auto p-6 space-y-6 overflow-auto h-full">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Container className="w-5 h-5 text-primary" />
              Docker Sandbox
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Isolate bash commands in Docker containers with CPU, memory, and network limits.
            </p>
          </div>
        </div>

        {/* Status Banner */}
        <div className={`rounded-lg border p-4 ${
          isActive
            ? "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800"
            : dockerOk
              ? "bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800"
              : "bg-muted border-border"
        }`}>
          <div className="flex items-center gap-3">
            {isActive ? (
              <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
            ) : dockerOk ? (
              <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
            ) : (
              <XCircle className="w-5 h-5 text-muted-foreground" />
            )}
            <div className="flex-1">
              <p className="text-sm font-medium">
                {isActive
                  ? "Docker isolation active"
                  : dockerOk
                    ? "Docker available but sandbox disabled"
                    : "Docker not detected — using host fallback"
                }
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isActive
                  ? `${status?.activeContainers || 0} active container(s) of ${status?.maxContainers || 0} max`
                  : dockerOk
                    ? "Enable the sandbox below to isolate bash commands in containers"
                    : "Install Docker and click 'Re-detect' to enable container isolation"
                }
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => resetDetection.mutate()} disabled={resetDetection.isPending}>
                <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${resetDetection.isPending ? "animate-spin" : ""}`} />
                Re-detect
              </Button>
            </div>
          </div>
        </div>

        {/* Configuration */}
        {form && (
          <div className="space-y-6">
            {/* Enable toggle */}
            <div className="flex items-center justify-between p-4 bg-card rounded-lg border border-border">
              <div className="flex items-center gap-3">
                <Shield className="w-4 h-4 text-primary" />
                <div>
                  <Label className="text-sm font-semibold">Enable Docker Sandbox</Label>
                  <p className="text-xs text-muted-foreground">When enabled, bash commands run in isolated containers instead of the host</p>
                </div>
              </div>
              <Switch
                checked={form.enabled}
                onCheckedChange={v => setForm(f => f ? { ...f, enabled: v } : f)}
                data-testid="switch-sandbox-enabled"
              />
            </div>

            {/* Container Image */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <Container className="w-3.5 h-3.5" /> Docker Image
                </Label>
                <div className="flex gap-2">
                  <Input
                    value={form.image}
                    onChange={e => setForm(f => f ? { ...f, image: e.target.value } : f)}
                    placeholder="ubuntu:22.04"
                    className="text-sm"
                    data-testid="input-docker-image"
                  />
                  <Button
                    variant="outline" size="sm"
                    onClick={() => pullImage.mutate()}
                    disabled={pullImage.isPending}
                    data-testid="button-pull-image"
                  >
                    <Download className={`w-3.5 h-3.5 ${pullImage.isPending ? "animate-bounce" : ""}`} />
                  </Button>
                </div>
                {pullImage.isSuccess && (
                  <p className="text-xs text-green-600">Image pulled successfully</p>
                )}
                {pullImage.isError && (
                  <p className="text-xs text-red-500">Pull failed: {(pullImage.error as Error).message}</p>
                )}
              </div>

              {/* CPU Limit */}
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5" /> CPU Limit (cores)
                </Label>
                <Input
                  value={form.cpuLimit}
                  onChange={e => setForm(f => f ? { ...f, cpuLimit: e.target.value } : f)}
                  placeholder="1.0"
                  className="text-sm"
                  data-testid="input-cpu-limit"
                />
              </div>

              {/* Memory Limit */}
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <HardDrive className="w-3.5 h-3.5" /> Memory Limit
                </Label>
                <Input
                  value={form.memoryLimit}
                  onChange={e => setForm(f => f ? { ...f, memoryLimit: e.target.value } : f)}
                  placeholder="512m"
                  className="text-sm"
                  data-testid="input-memory-limit"
                />
              </div>

              {/* Exec Timeout */}
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" /> Exec Timeout (seconds)
                </Label>
                <Input
                  type="number"
                  value={form.execTimeoutMs / 1000}
                  onChange={e => setForm(f => f ? { ...f, execTimeoutMs: Number(e.target.value) * 1000 } : f)}
                  placeholder="30"
                  className="text-sm"
                  data-testid="input-exec-timeout"
                />
              </div>

              {/* Max Containers */}
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <Container className="w-3.5 h-3.5" /> Max Containers
                </Label>
                <Input
                  type="number"
                  value={form.maxContainers}
                  onChange={e => setForm(f => f ? { ...f, maxContainers: Number(e.target.value) } : f)}
                  min={1} max={20}
                  className="text-sm"
                  data-testid="input-max-containers"
                />
              </div>

              {/* Idle Timeout */}
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" /> Idle Timeout (seconds)
                </Label>
                <Input
                  type="number"
                  value={form.idleTimeoutMs / 1000}
                  onChange={e => setForm(f => f ? { ...f, idleTimeoutMs: Number(e.target.value) * 1000 } : f)}
                  placeholder="300"
                  className="text-sm"
                  data-testid="input-idle-timeout"
                />
              </div>
            </div>

            {/* Network toggle */}
            <div className="flex items-center justify-between p-4 bg-card rounded-lg border border-border">
              <div className="flex items-center gap-3">
                <Network className="w-4 h-4 text-primary" />
                <div>
                  <Label className="text-sm font-semibold">Network Access</Label>
                  <p className="text-xs text-muted-foreground">Allow containers to access the internet (disabled = maximum isolation)</p>
                </div>
              </div>
              <Switch
                checked={form.networkEnabled}
                onCheckedChange={v => setForm(f => f ? { ...f, networkEnabled: v } : f)}
                data-testid="switch-network-enabled"
              />
            </div>

            {/* Save / Actions */}
            <div className="flex items-center gap-3">
              <Button onClick={handleSave} disabled={saveConfig.isPending} data-testid="button-save-config">
                {saveConfig.isPending ? "Saving..." : "Save Configuration"}
              </Button>
              <Button variant="destructive" size="sm" onClick={() => cleanup.mutate()} disabled={cleanup.isPending} data-testid="button-cleanup">
                <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                {cleanup.isPending ? "Cleaning..." : "Kill All Containers"}
              </Button>
              {saveConfig.isSuccess && (
                <span className="text-sm text-green-600">Saved</span>
              )}
            </div>
          </div>
        )}

        {/* Active Containers Table */}
        {status && (status.containers?.length ?? 0) > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground">Active Containers</h2>
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Container</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Session</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Status</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Age</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Idle</th>
                  </tr>
                </thead>
                <tbody>
                  {status.containers.map(c => (
                    <tr key={c.containerId} className="border-t border-border">
                      <td className="px-3 py-2 font-mono text-xs">{c.containerId}</td>
                      <td className="px-3 py-2 font-mono text-xs">{c.sessionId.substring(0, 8)}</td>
                      <td className="px-3 py-2">
                        <Badge variant={c.status === "ready" ? "default" : c.status === "busy" ? "secondary" : "outline"} className="text-xs">
                          {c.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{c.age}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{c.idleSince}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Security Info */}
        <div className="p-4 bg-muted/50 rounded-lg border border-border space-y-2">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <Shield className="w-4 h-4 text-primary" />
            Security Model
          </h3>
          <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
            <li>Each agent run gets its own ephemeral container — no cross-session leakage</li>
            <li>Capabilities are dropped (CAP_DROP=ALL) with minimal add-backs for file operations</li>
            <li>PID limit of 256 prevents fork bombs</li>
            <li>Memory and swap are capped — no OOM cascading to host</li>
            <li>Network isolation (--network=none) is the default — toggle above to enable</li>
            <li>The sandbox directory is bind-mounted as /workspace for file persistence</li>
            <li>Containers auto-reap after idle timeout</li>
            <li>If Docker is unavailable, commands run on the host scoped to the sandbox directory (reduced isolation)</li>
          </ul>
        </div>
      </div>
  );
}
