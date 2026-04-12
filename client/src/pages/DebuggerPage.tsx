import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Bug, RefreshCw, Play, AlertTriangle, CheckCircle2,
  Wrench, BarChart3, ArrowRight, RotateCcw, Clock,
  Zap, Ban, Server, Key, Timer, Brain, FileWarning, Code,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Fix {
  action: string;
  description: string;
  priority?: string;
  confidence?: number;
  automated: boolean;
  parameters?: Record<string, unknown>;
}

interface PatternMatch {
  pattern: string;
  frequency: number;
  lastSeen: number;
}

interface RetryConfig {
  recommended?: boolean;
  shouldRetry?: boolean;
  maxRetries?: number;
  delay?: number;
  backoffMs?: number;
  strategy?: string;
}

interface Diagnosis {
  errorCategory: string;
  severity: "critical" | "high" | "medium" | "low";
  rootCause: string;
  explanation: string;
  fixes: Fix[];
  relatedPatterns: PatternMatch[];
  retryable: boolean;
  retryConfig?: RetryConfig;
  diagnosedAt: number;
  latencyMs: number;
}

interface HistoryEntry {
  input: { taskId: string; error: string; context: { agentId?: string; modelId?: string; taskType?: string } };
  diagnosis: Diagnosis;
}

interface Stats {
  total: number;
  byCategory: Record<string, number>;
  bySeverity: Record<string, number>;
  avgLatencyMs: number;
  retryableRate: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const categoryIcon = (cat: string) => {
  const icons: Record<string, typeof Bug> = {
    authentication: Key, rate_limit: Ban, timeout: Timer,
    model_error: Brain, context_overflow: FileWarning, invalid_input: Code,
    tool_failure: Wrench, network_error: Server, unknown: AlertTriangle,
  };
  const Icon = icons[cat] || AlertTriangle;
  return <Icon className="w-3.5 h-3.5" />;
};

const sevColor = (sev: string) => {
  const colors: Record<string, string> = {
    critical: "bg-red-500/15 text-red-400 border-red-500/30",
    high: "bg-orange-500/15 text-orange-400 border-orange-500/30",
    medium: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
    low: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  };
  return colors[sev] || "";
};

// ─── Component ──────────────────────────────────────────────────────────────

export function DebuggerPage() {
  const { toast } = useToast();
  const [taskId, setTaskId] = useState("test-task-1");
  const [error, setError] = useState("");
  const [agentId, setAgentId] = useState("agent-main");
  const [modelId, setModelId] = useState("");
  const [taskType, setTaskType] = useState("general");

  const { data: stats, isLoading: statsLoading } = useQuery<Stats>({
    queryKey: ["/api/debugger/stats"],
  });

  const { data: history = [], isLoading: historyLoading } = useQuery<HistoryEntry[]>({
    queryKey: ["/api/debugger/history"],
  });

  const diagnoseMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/debugger/diagnose", {
        taskId, error, context: { agentId, modelId: modelId || undefined, taskType },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/debugger/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/debugger/history"] });
      toast({ title: "Diagnosis complete" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const topCategories = stats?.byCategory
    ? Object.entries(stats.byCategory).sort((a, b) => b[1] - a[1]).slice(0, 6)
    : [];

  return (
    <div className="h-full overflow-auto p-6 space-y-6" data-testid="debugger-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-red-500/15 border border-red-500/30 flex items-center justify-center">
            <Bug className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold">DEBUGGER</h1>
            <p className="text-xs text-muted-foreground">Automatic Failure Diagnosis</p>
          </div>
        </div>
        <Button
          size="sm" variant="outline"
          onClick={() => {
            queryClient.invalidateQueries({ queryKey: ["/api/debugger/stats"] });
            queryClient.invalidateQueries({ queryKey: ["/api/debugger/history"] });
          }}
          data-testid="button-refresh-debugger"
        >
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {statsLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)
        ) : (
          <>
            <Card className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <BarChart3 className="w-3.5 h-3.5" /> Total Diagnoses
              </div>
              <p className="text-2xl font-bold">{stats?.total ?? 0}</p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <RotateCcw className="w-3.5 h-3.5" /> Retryable
              </div>
              <p className="text-2xl font-bold text-blue-400">{stats?.retryableRate ?? 0}%</p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <Clock className="w-3.5 h-3.5" /> Avg Latency
              </div>
              <p className="text-2xl font-bold">{stats?.avgLatencyMs ?? 0}<span className="text-sm font-normal text-muted-foreground">ms</span></p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <Zap className="w-3.5 h-3.5" /> Categories
              </div>
              <p className="text-2xl font-bold">{Object.keys(stats?.byCategory ?? {}).length}</p>
            </Card>
          </>
        )}
      </div>

      {/* Category Breakdown */}
      {topCategories.length > 0 && (
        <Card className="p-5">
          <h2 className="text-sm font-semibold mb-3">Error Categories</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {topCategories.map(([cat, count]) => (
              <div key={cat} className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                {categoryIcon(cat)}
                <span className="text-xs font-medium flex-1">{cat.replace(/_/g, " ")}</span>
                <Badge variant="outline" className="text-[10px]">{count}</Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Diagnose Form */}
      <Card className="p-5 space-y-4">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Play className="w-4 h-4 text-red-400" /> Run Diagnosis
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Task ID</label>
            <Input value={taskId} onChange={(e) => setTaskId(e.target.value)} data-testid="input-debug-task-id" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Agent ID</label>
            <Input value={agentId} onChange={(e) => setAgentId(e.target.value)} data-testid="input-debug-agent-id" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Model ID</label>
            <Input value={modelId} onChange={(e) => setModelId(e.target.value)} placeholder="(optional)" data-testid="input-debug-model-id" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Task Type</label>
            <Input value={taskType} onChange={(e) => setTaskType(e.target.value)} data-testid="input-debug-task-type" />
          </div>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Error Message / Stack Trace</label>
          <Textarea
            value={error} onChange={(e) => setError(e.target.value)}
            placeholder="Paste the error message or stack trace..."
            rows={4} className="font-mono text-xs" data-testid="input-debug-error"
          />
        </div>
        <Button
          onClick={() => diagnoseMutation.mutate()}
          disabled={diagnoseMutation.isPending || !error.trim()}
          data-testid="button-diagnose"
        >
          {diagnoseMutation.isPending ? (
            <><RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Diagnosing...</>
          ) : (
            <><Bug className="w-3.5 h-3.5 mr-1.5" /> Diagnose</>
          )}
        </Button>
      </Card>

      {/* History */}
      <div>
        <h2 className="text-sm font-semibold mb-3">Diagnosis History</h2>
        {historyLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
          </div>
        ) : history.length === 0 ? (
          <Card className="p-8 text-center">
            <Bug className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">No diagnoses yet. Submit an error above.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {history.map((entry, i) => (
              <Card key={i} className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {categoryIcon(entry.diagnosis.errorCategory)}
                    <span className="text-sm font-medium">{entry.input.taskId}</span>
                    <Badge variant="outline" className="text-[10px]">{entry.diagnosis.errorCategory.replace(/_/g, " ")}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={sevColor(entry.diagnosis.severity)}>{entry.diagnosis.severity}</Badge>
                    {entry.diagnosis.retryable && (
                      <Badge variant="outline" className="text-[10px] border-blue-500/30 text-blue-400">
                        <RotateCcw className="w-2.5 h-2.5 mr-1" /> Retryable
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="bg-muted/50 rounded-md p-3 text-xs">
                  <p className="font-medium mb-1">Root Cause</p>
                  <p className="text-muted-foreground">{entry.diagnosis.rootCause}</p>
                </div>

                <p className="text-xs text-muted-foreground">{entry.diagnosis.explanation}</p>

                {entry.diagnosis.fixes.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium flex items-center gap-1">
                      <Wrench className="w-3 h-3" /> Suggested Fixes
                    </p>
                    {entry.diagnosis.fixes.map((fix, fi) => (
                      <div key={fi} className="flex items-start gap-2 text-xs pl-2">
                        <ArrowRight className="w-3 h-3 text-primary mt-0.5 shrink-0" />
                        <div className="flex-1">
                          <span className="font-medium">{fix.action}</span>
                          <span className="text-muted-foreground"> — {fix.description}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          {fix.automated && <Badge variant="outline" className="text-[9px] border-green-500/30 text-green-400">Auto</Badge>}
                          {fix.priority && <Badge variant="outline" className="text-[9px]">{fix.priority}</Badge>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {entry.diagnosis.retryConfig && (
                  <div className="text-xs text-muted-foreground flex items-center gap-3 pt-1 border-t border-border">
                    {entry.diagnosis.retryConfig.strategy && <span>Strategy: {entry.diagnosis.retryConfig.strategy}</span>}
                    {entry.diagnosis.retryConfig.maxRetries != null && <span>Max retries: {entry.diagnosis.retryConfig.maxRetries}</span>}
                    {(entry.diagnosis.retryConfig.delay || entry.diagnosis.retryConfig.backoffMs) && <span>Delay: {entry.diagnosis.retryConfig.delay || entry.diagnosis.retryConfig.backoffMs}ms</span>}
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
