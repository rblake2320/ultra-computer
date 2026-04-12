import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  DollarSign, RefreshCw, Trash2, AlertTriangle, Clock,
  BarChart3, TrendingUp, Shield, Zap, Settings2,
  CircleDollarSign, Gauge, Ban, ArrowDownToLine,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface CostConfig {
  enabled: boolean;
  maxTokensPerConversation: number;
  maxTokensPerHour: number;
  maxTokensPerDay: number;
  maxTokensPerStep: number;
  warningThresholdPercent: number;
  fallbackThresholdPercent: number;
  fallbackModelTier: "fast" | "medium";
  blockOnExhausted: boolean;
}

interface CostAlert {
  level: "warning" | "critical" | "blocked";
  scope: "conversation" | "hourly" | "daily" | "step";
  message: string;
  timestamp: number;
}

interface BudgetStatus {
  conversationTokens: Record<string, number>;
  hourlyTokens: number;
  dailyTokens: number;
  hourlyBudgetRemaining: number;
  dailyBudgetRemaining: number;
  alerts: CostAlert[];
  shouldFallback: boolean;
  isBlocked: boolean;
}

interface CostBreakdown {
  totalTokens: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCalls: number;
  byModel: Record<string, { input: number; output: number; total: number; calls: number }>;
  byOperation: Record<string, unknown>;
  byConversation: Record<string, { tokens: number; calls: number }>;
  timeRangeMs: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

const alertColors: Record<string, string> = {
  warning: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  critical: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  blocked: "bg-red-500/15 text-red-400 border-red-500/30",
};

// ─── Component ──────────────────────────────────────────────────────────────

export function CostControllerPage() {
  const { toast } = useToast();
  const [timeRange, setTimeRange] = useState<"hour" | "day" | "all">("day");

  const timeMs = timeRange === "hour" ? 3600_000 : timeRange === "day" ? 86400_000 : undefined;

  const { data: config, isLoading: configLoading } = useQuery<CostConfig>({
    queryKey: ["/api/cost/config"],
  });

  const { data: status, isLoading: statusLoading } = useQuery<BudgetStatus>({
    queryKey: ["/api/cost/status"],
    refetchInterval: 5000,
  });

  const { data: breakdown, isLoading: breakdownLoading } = useQuery<CostBreakdown>({
    queryKey: ["/api/cost/breakdown", timeMs],
    queryFn: () => apiRequest("GET", `/api/cost/breakdown${timeMs ? `?timeRangeMs=${timeMs}` : ""}`),
  });

  const updateConfig = useMutation({
    mutationFn: (update: Partial<CostConfig>) => apiRequest("PATCH", "/api/cost/config", update),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cost/config"] });
      toast({ title: "Config updated" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const resetMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/cost/reset"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cost/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cost/breakdown"] });
      toast({ title: "Cost tracking reset" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const hourlyPct = config && status ? Math.min(100, ((config.maxTokensPerHour - status.hourlyBudgetRemaining) / config.maxTokensPerHour) * 100) : 0;
  const dailyPct = config && status ? Math.min(100, ((config.maxTokensPerDay - status.dailyBudgetRemaining) / config.maxTokensPerDay) * 100) : 0;

  const modelBreakdown = breakdown?.byModel ? Object.entries(breakdown.byModel).sort((a, b) => b[1].total - a[1].total) : [];

  return (
    <div className="h-full overflow-auto p-6 space-y-6" data-testid="cost-controller-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
            <CircleDollarSign className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold">COST CONTROLLER</h1>
            <p className="text-xs text-muted-foreground">Budget Caps & Token Usage</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm" variant="outline"
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ["/api/cost/status"] });
              queryClient.invalidateQueries({ queryKey: ["/api/cost/breakdown"] });
            }}
            data-testid="button-refresh-cost"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
          </Button>
          <Button
            size="sm" variant="outline" className="text-destructive hover:text-destructive"
            onClick={() => resetMutation.mutate()}
            disabled={resetMutation.isPending}
            data-testid="button-reset-cost"
          >
            <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Reset
          </Button>
        </div>
      </div>

      {/* Status Banner */}
      {status && (status.isBlocked || status.shouldFallback) && (
        <div className={`rounded-lg p-4 flex items-center gap-3 ${status.isBlocked ? "bg-red-500/10 border border-red-500/30" : "bg-yellow-500/10 border border-yellow-500/30"}`}>
          {status.isBlocked ? (
            <Ban className="w-5 h-5 text-red-400" />
          ) : (
            <ArrowDownToLine className="w-5 h-5 text-yellow-400" />
          )}
          <div>
            <p className="text-sm font-medium">{status.isBlocked ? "Budget Exhausted — Requests Blocked" : "Budget High — Falling Back to Cheaper Model"}</p>
            <p className="text-xs text-muted-foreground">
              {status.isBlocked ? "Token budgets have been exceeded. Reset or raise limits to resume." : "Approaching budget limits. Automatically routing to faster/cheaper models."}
            </p>
          </div>
        </div>
      )}

      {/* Budget Gauges */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {statusLoading ? (
          Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-lg" />)
        ) : (
          <>
            <Card className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Clock className="w-4 h-4 text-emerald-400" /> Hourly Budget
                </div>
                <span className="text-xs text-muted-foreground">
                  {formatTokens(config?.maxTokensPerHour ? config.maxTokensPerHour - (status?.hourlyBudgetRemaining ?? 0) : 0)} / {formatTokens(config?.maxTokensPerHour ?? 0)}
                </span>
              </div>
              <Progress value={hourlyPct} className="h-2.5 mb-2" />
              <p className="text-xs text-muted-foreground">{formatTokens(status?.hourlyBudgetRemaining ?? 0)} tokens remaining</p>
            </Card>
            <Card className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <BarChart3 className="w-4 h-4 text-emerald-400" /> Daily Budget
                </div>
                <span className="text-xs text-muted-foreground">
                  {formatTokens(config?.maxTokensPerDay ? config.maxTokensPerDay - (status?.dailyBudgetRemaining ?? 0) : 0)} / {formatTokens(config?.maxTokensPerDay ?? 0)}
                </span>
              </div>
              <Progress value={dailyPct} className="h-2.5 mb-2" />
              <p className="text-xs text-muted-foreground">{formatTokens(status?.dailyBudgetRemaining ?? 0)} tokens remaining</p>
            </Card>
          </>
        )}
      </div>

      {/* Token Breakdown */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" /> Token Usage
          </h2>
          <div className="flex gap-1">
            {(["hour", "day", "all"] as const).map((r) => (
              <Button
                key={r} size="sm" variant={timeRange === r ? "default" : "outline"}
                className="text-xs h-7 px-2.5"
                onClick={() => setTimeRange(r)}
                data-testid={`button-range-${r}`}
              >
                {r === "hour" ? "1H" : r === "day" ? "24H" : "All"}
              </Button>
            ))}
          </div>
        </div>
        {breakdownLoading ? (
          <Skeleton className="h-40 rounded-lg" />
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-muted/50 rounded-md p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">Total Tokens</p>
                <p className="text-xl font-bold">{formatTokens(breakdown?.totalTokens ?? 0)}</p>
              </div>
              <div className="bg-muted/50 rounded-md p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">Input</p>
                <p className="text-xl font-bold text-blue-400">{formatTokens(breakdown?.totalInputTokens ?? 0)}</p>
              </div>
              <div className="bg-muted/50 rounded-md p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">Output</p>
                <p className="text-xl font-bold text-purple-400">{formatTokens(breakdown?.totalOutputTokens ?? 0)}</p>
              </div>
            </div>

            {/* Model Breakdown */}
            {modelBreakdown.length > 0 && (
              <div>
                <p className="text-xs font-medium mb-2">By Model</p>
                <div className="space-y-2">
                  {modelBreakdown.map(([model, m]) => {
                    const pct = breakdown?.totalTokens ? (m.total / breakdown.totalTokens * 100) : 0;
                    return (
                      <div key={model}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="font-medium truncate flex-1">{model}</span>
                          <span className="text-muted-foreground ml-2">{m.calls} calls — {formatTokens(m.total)} tokens</span>
                        </div>
                        <Progress value={pct} className="h-1.5" />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Alerts */}
      {status?.alerts && status.alerts.length > 0 && (
        <Card className="p-5">
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-yellow-400" /> Active Alerts
          </h2>
          <div className="space-y-2">
            {status.alerts.map((alert, i) => (
              <div key={i} className={`flex items-center gap-3 p-3 rounded-md border ${alertColors[alert.level] || ""}`}>
                <Badge className={alertColors[alert.level]}>{alert.level}</Badge>
                <span className="text-xs flex-1">{alert.message}</span>
                <span className="text-[10px] text-muted-foreground">{new Date(alert.timestamp).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Configuration */}
      <Card className="p-5 space-y-4">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-emerald-400" /> Budget Configuration
        </h2>
        {configLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 rounded" />)}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Cost Controller Enabled</p>
                <p className="text-xs text-muted-foreground">Enable budget tracking and enforcement</p>
              </div>
              <Switch
                checked={config?.enabled ?? false}
                onCheckedChange={(checked) => updateConfig.mutate({ enabled: checked })}
                data-testid="switch-cost-enabled"
              />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { key: "maxTokensPerConversation" as const, label: "Per Conversation" },
                { key: "maxTokensPerHour" as const, label: "Per Hour" },
                { key: "maxTokensPerDay" as const, label: "Per Day" },
                { key: "maxTokensPerStep" as const, label: "Per Step" },
              ].map(({ key, label }) => (
                <div key={key}>
                  <label className="text-xs text-muted-foreground mb-1 block">{label}</label>
                  <Input
                    type="number"
                    value={config?.[key] ?? 0}
                    onChange={(e) => updateConfig.mutate({ [key]: parseInt(e.target.value) || 0 })}
                    data-testid={`input-${key}`}
                  />
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Warning Threshold (%)</label>
                <Input
                  type="number"
                  value={config?.warningThresholdPercent ?? 80}
                  onChange={(e) => updateConfig.mutate({ warningThresholdPercent: parseInt(e.target.value) || 80 })}
                  data-testid="input-warning-threshold"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Fallback Threshold (%)</label>
                <Input
                  type="number"
                  value={config?.fallbackThresholdPercent ?? 90}
                  onChange={(e) => updateConfig.mutate({ fallbackThresholdPercent: parseInt(e.target.value) || 90 })}
                  data-testid="input-fallback-threshold"
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Block When Exhausted</p>
                <p className="text-xs text-muted-foreground">Hard-block requests when budget is fully exhausted</p>
              </div>
              <Switch
                checked={config?.blockOnExhausted ?? true}
                onCheckedChange={(checked) => updateConfig.mutate({ blockOnExhausted: checked })}
                data-testid="switch-block-exhausted"
              />
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
