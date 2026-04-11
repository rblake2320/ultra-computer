import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Database,
  Zap,
  DollarSign,
  BarChart3,
  Trash2,
  RefreshCw,
  MemoryStick,
  Target,
  Layers,
  Activity,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface TierStats {
  hits: number;
  misses: number;
  entries?: number;
  hitRate?: number;
  estimatedHits?: number;
  prefixesTracked?: number;
  similarityThreshold?: number;
  sizeBytes?: number;
  maxSizeBytes?: number;
}

interface MemoryUsage {
  totalBytes: number;
  budgetBytes: number;
  exact?: number;
  prefix?: number;
  semantic?: number;
}

interface DashboardData {
  overview: {
    totalRequests: number;
    totalHits: number;
    overallHitRate: number;
    estimatedSavingsUSD: number;
    totalTokensSaved: number;
  };
  tiers: {
    exact: TierStats;
    prefix: TierStats;
    semantic: TierStats;
  };
  memory: MemoryUsage;
  modelBreakdown: Record<string, { hits: number; misses: number }>;
  rollingWindows: Record<string, unknown>;
}

// ─── Utilities ──────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

function hitRateColor(rate: number): string {
  if (rate >= 50) return "text-emerald-400";
  if (rate >= 25) return "text-amber-400";
  return "text-red-400";
}

function hitRateBarColor(rate: number): string {
  if (rate >= 50) return "bg-emerald-500";
  if (rate >= 25) return "bg-amber-500";
  return "bg-red-500";
}

// ─── Overview Card ──────────────────────────────────────────────────────────

function OverviewCard({
  icon: Icon,
  label,
  value,
  colorClass,
  testId,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  colorClass?: string;
  testId?: string;
}) {
  return (
    <Card className="p-4 flex items-center gap-3" data-testid={testId}>
      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5 text-primary" />
      </div>
      <div className="min-w-0">
        <p className={`text-xl font-bold leading-none truncate ${colorClass ?? ""}`}>{value}</p>
        <p className="text-[11px] text-muted-foreground mt-1">{label}</p>
      </div>
    </Card>
  );
}

// ─── Tier Card ───────────────────────────────────────────────────────────────

function TierCard({
  title,
  icon: Icon,
  stats,
  variant,
}: {
  title: string;
  icon: React.ElementType;
  stats: TierStats;
  variant: "exact" | "prefix" | "semantic";
}) {
  const hits = stats.hits ?? 0;
  const misses = stats.misses ?? 0;
  const total = hits + misses;
  const hitRate = total > 0 ? (hits / total) * 100 : 0;

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-4">
        <Icon className="w-4 h-4 text-primary" />
        <span className="text-xs font-semibold">{title}</span>
      </div>

      {variant === "prefix" ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground">Est. Hits Generated</p>
              <p className="text-lg font-bold text-emerald-400">
                {(stats.estimatedHits ?? (stats as Record<string, number>).estimatedHitsGenerated ?? 0).toLocaleString()}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground">Prefixes Tracked</p>
              <p className="text-lg font-bold">
                {(stats.prefixesTracked ?? stats.entries ?? 0).toLocaleString()}
              </p>
            </div>
          </div>
          <div className="text-[10px] text-muted-foreground bg-muted/30 rounded-md p-2">
            Prefix optimizer pre-warms token prefixes to reduce latency and cost for repeated prompt stems.
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground">Hits</p>
              <p className="text-lg font-bold text-emerald-400">{hits.toLocaleString()}</p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground">Misses</p>
              <p className="text-lg font-bold text-muted-foreground">
                {(stats.misses ?? 0).toLocaleString()}
              </p>
            </div>
            {stats.entries !== undefined && (
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground">Entries</p>
                <p className="text-sm font-bold">{stats.entries.toLocaleString()}</p>
              </div>
            )}
            {variant === "semantic" && stats.similarityThreshold !== undefined && (
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground">Similarity Threshold</p>
                <p className="text-sm font-bold">{(stats.similarityThreshold * 100).toFixed(0)}%</p>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-muted-foreground">Hit Rate</p>
              <span className={`text-[10px] font-bold ${hitRateColor(hitRate)}`}>
                {hitRate.toFixed(1)}%
              </span>
            </div>
            <div className="relative h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className={`absolute inset-y-0 left-0 rounded-full transition-all ${hitRateBarColor(hitRate)}`}
                style={{ width: `${Math.min(hitRate, 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

// ─── Memory Section ──────────────────────────────────────────────────────────

function MemorySection({ memory }: { memory: Record<string, unknown> }) {
  // Handle both expected shapes from the API
  const mem = memory as Record<string, unknown>;
  const totalBytes = (mem.totalBytes ?? mem.totalEstimatedBytes ?? 0) as number;
  const budgetBytes = (mem.budgetBytes ?? mem.limitBytes ?? 268435456) as number;
  const usedPct = budgetBytes > 0
    ? Math.min((totalBytes / budgetBytes) * 100, 100)
    : 0;

  // Extract per-tier bytes (may be nested objects with estimatedBytes)
  const extractBytes = (v: unknown): number => {
    if (typeof v === "number") return v;
    if (v && typeof v === "object" && "estimatedBytes" in v) return (v as Record<string, number>).estimatedBytes ?? 0;
    return 0;
  };

  const tiers = [
    { label: "Exact Cache", bytes: extractBytes(mem.exact), color: "bg-blue-500" },
    { label: "Prefix Optimizer", bytes: extractBytes(mem.prefix), color: "bg-violet-500" },
    { label: "Semantic Cache", bytes: extractBytes(mem.semantic), color: "bg-emerald-500" },
  ];

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-4">
        <MemoryStick className="w-4 h-4 text-muted-foreground" />
        <span className="text-xs font-semibold">Memory Usage</span>
        <Badge variant="outline" className="text-[10px] ml-auto">
          {formatBytes(totalBytes)} / {formatBytes(budgetBytes)}
        </Badge>
      </div>

      <div className="space-y-1.5 mb-4">
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>Total Used</span>
          <span>{usedPct.toFixed(1)}%</span>
        </div>
        <Progress value={usedPct} className="h-2" />
      </div>

      <div className="space-y-2">
        {tiers.map((tier) => {
          const pct = budgetBytes > 0
            ? Math.min((tier.bytes / budgetBytes) * 100, 100)
            : 0;
          return (
            <div key={tier.label} className="space-y-1">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-muted-foreground">{tier.label}</span>
                <span className="font-mono">{formatBytes(tier.bytes)}</span>
              </div>
              <div className="relative h-1 bg-muted rounded-full overflow-hidden">
                <div
                  className={`absolute inset-y-0 left-0 rounded-full ${tier.color}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ─── Model Breakdown Table ────────────────────────────────────────────────────

function ModelBreakdownTable({
  breakdown,
}: {
  breakdown: Record<string, { hits: number; misses: number }>;
}) {
  const rows = Object.entries(breakdown)
    .map(([model, stats]) => ({
      model,
      hits: stats.hits,
      misses: stats.misses,
      total: stats.hits + stats.misses,
      hitRate: stats.hits + stats.misses > 0
        ? (stats.hits / (stats.hits + stats.misses)) * 100
        : 0,
    }))
    .sort((a, b) => b.total - a.total);

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="w-4 h-4 text-muted-foreground" />
        <span className="text-xs font-semibold">Model Breakdown</span>
        <Badge variant="outline" className="text-[10px] ml-auto">{rows.length} models</Badge>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">No model data yet</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs" data-testid="model-breakdown-table">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left pb-2 text-muted-foreground font-medium">Model</th>
                <th className="text-right pb-2 text-muted-foreground font-medium">Hits</th>
                <th className="text-right pb-2 text-muted-foreground font-medium">Misses</th>
                <th className="text-right pb-2 text-muted-foreground font-medium">Hit Rate</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.model} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="py-2 pr-4">
                    <span className="font-mono truncate max-w-[200px] block">{row.model}</span>
                  </td>
                  <td className="py-2 text-right text-emerald-400 font-mono">
                    {row.hits.toLocaleString()}
                  </td>
                  <td className="py-2 text-right text-muted-foreground font-mono">
                    {row.misses.toLocaleString()}
                  </td>
                  <td className={`py-2 text-right font-bold font-mono ${hitRateColor(row.hitRate)}`}>
                    {row.hitRate.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ─── Actions Panel ────────────────────────────────────────────────────────────

function ActionsPanel({
  autoRefresh,
  onToggleAutoRefresh,
}: {
  autoRefresh: boolean;
  onToggleAutoRefresh: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["/api/cache/dashboard"] });
  };

  const clearMutation = useMutation({
    mutationFn: (body: { tier?: string; modelId?: string }) =>
      apiRequest("POST", "/api/cache/clear", body),
    onSuccess: (_data, variables) => {
      invalidate();
      const label = variables.tier ? `${variables.tier} cache` : "all caches";
      toast({ title: `Cleared ${label}`, description: "Cache entries have been removed." });
    },
    onError: (e: any) =>
      toast({ title: "Clear failed", description: e.message, variant: "destructive" }),
  });

  const resetStatsMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/cache/reset-stats"),
    onSuccess: () => {
      invalidate();
      toast({ title: "Stats reset", description: "All cache statistics have been cleared." });
    },
    onError: (e: any) =>
      toast({ title: "Reset failed", description: e.message, variant: "destructive" }),
  });

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-4">
        <Activity className="w-4 h-4 text-muted-foreground" />
        <span className="text-xs font-semibold">Actions</span>
      </div>

      <div className="space-y-3">
        {/* Auto-refresh toggle */}
        <div className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
          <div>
            <p className="text-xs font-medium">Auto-refresh</p>
            <p className="text-[10px] text-muted-foreground">Refresh every 5 seconds</p>
          </div>
          <Button
            size="sm"
            variant={autoRefresh ? "default" : "outline"}
            className="h-7 text-xs gap-1"
            onClick={onToggleAutoRefresh}
            data-testid="button-auto-refresh-toggle"
          >
            <RefreshCw className={`w-3 h-3 ${autoRefresh ? "animate-spin" : ""}`} />
            {autoRefresh ? "On" : "Off"}
          </Button>
        </div>

        {/* Individual tier clears */}
        <div className="grid grid-cols-2 gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs gap-1"
            onClick={() => clearMutation.mutate({ tier: "exact" })}
            disabled={clearMutation.isPending}
            data-testid="button-clear-exact"
          >
            <Database className="w-3 h-3" />
            Clear Exact
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs gap-1"
            onClick={() => clearMutation.mutate({ tier: "semantic" })}
            disabled={clearMutation.isPending}
            data-testid="button-clear-semantic"
          >
            <Layers className="w-3 h-3" />
            Clear Semantic
          </Button>
        </div>

        {/* Reset stats */}
        <Button
          size="sm"
          variant="outline"
          className="w-full h-8 text-xs gap-1"
          onClick={() => resetStatsMutation.mutate()}
          disabled={resetStatsMutation.isPending}
          data-testid="button-reset-stats"
        >
          <BarChart3 className={`w-3 h-3 ${resetStatsMutation.isPending ? "animate-pulse" : ""}`} />
          {resetStatsMutation.isPending ? "Resetting..." : "Reset Stats"}
        </Button>

        {/* Clear all — destructive with confirmation */}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              size="sm"
              variant="destructive"
              className="w-full h-8 text-xs gap-1"
              disabled={clearMutation.isPending}
              data-testid="button-clear-all"
            >
              <Trash2 className="w-3 h-3" />
              {clearMutation.isPending ? "Clearing..." : "Clear All Cache"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear All Cache?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently remove all cached entries across exact, prefix, and semantic tiers.
                Token savings and hit rate will reset as the cache refills. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => clearMutation.mutate({})}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                data-testid="button-clear-all-confirm"
              >
                Clear All
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Card>
  );
}

// ─── Loading Skeleton ─────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card/50">
        <Database className="w-4 h-4 text-primary" />
        <h1 className="font-semibold text-sm">Cache Engine</h1>
      </div>
      <div className="flex-1 overflow-auto p-4 space-y-4">
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="p-4">
              <Skeleton className="h-8 w-8 rounded-lg mb-2" />
              <Skeleton className="h-6 w-3/4 mb-1" />
              <Skeleton className="h-3 w-1/2" />
            </Card>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="p-4 space-y-3">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-2 w-full" />
            </Card>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2">
            <Card className="p-4 space-y-3">
              <Skeleton className="h-4 w-1/3" />
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </Card>
          </div>
          <Card className="p-4 space-y-3">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </Card>
        </div>
      </div>
    </div>
  );
}

// ─── Main CachePage ───────────────────────────────────────────────────────────

export function CachePage() {
  const [autoRefresh, setAutoRefresh] = useState(false);

  const { data: dashboard, isLoading, isError: dashboardError } = useQuery<DashboardData>({
    queryKey: ["/api/cache/dashboard"],
    refetchInterval: autoRefresh ? 5000 : false,
  });

  if (dashboardError) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Failed to load cache data. Please try again.
      </div>
    );
  }

  if (!dashboard) {
    return <LoadingSkeleton />;
  }

  const { overview, tiers, memory, modelBreakdown: rawBreakdown } = dashboard;
  const modelBreakdown = rawBreakdown ?? {};
  const safeOverview = {
    totalRequests: overview?.totalRequests ?? 0,
    totalHits: overview?.totalHits ?? 0,
    overallHitRate: overview?.overallHitRate ?? 0,
    estimatedSavingsUSD: overview?.estimatedSavingsUSD ?? 0,
    totalTokensSaved: overview?.totalTokensSaved ?? 0,
  };
  const hitRatePct = safeOverview.overallHitRate * 100;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card/50">
        <Database className="w-4 h-4 text-primary" />
        <h1 className="font-semibold text-sm">Cache Engine</h1>
        <p className="text-xs text-muted-foreground flex-1">
          Multi-tier intelligent caching • Token savings • Cost reduction
        </p>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs gap-1"
          onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/cache/dashboard"] })}
          data-testid="button-manual-refresh"
        >
          <RefreshCw className="w-3 h-3" />
          Refresh
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Overview Cards */}
        <div className="grid grid-cols-4 gap-3">
          <OverviewCard
            icon={BarChart3}
            label="Total Requests"
            value={safeOverview.totalRequests.toLocaleString()}
            testId="card-total-requests"
          />
          <OverviewCard
            icon={Zap}
            label="Hit Rate"
            value={`${hitRatePct.toFixed(1)}%`}
            colorClass={hitRateColor(hitRatePct)}
            testId="card-hit-rate"
          />
          <OverviewCard
            icon={Database}
            label="Tokens Saved"
            value={safeOverview.totalTokensSaved.toLocaleString()}
            colorClass="text-violet-400"
            testId="card-tokens-saved"
          />
          <OverviewCard
            icon={DollarSign}
            label="Est. Cost Savings"
            value={`$${safeOverview.estimatedSavingsUSD.toFixed(2)}`}
            colorClass="text-emerald-400"
            testId="card-cost-savings"
          />
        </div>

        {/* Tier Breakdown */}
        <div className="grid grid-cols-3 gap-3">
          <TierCard
            title="Exact Cache"
            icon={Database}
            stats={tiers.exact}
            variant="exact"
          />
          <TierCard
            title="Prefix Optimizer"
            icon={Target}
            stats={tiers.prefix}
            variant="prefix"
          />
          <TierCard
            title="Semantic Cache"
            icon={Layers}
            stats={tiers.semantic}
            variant="semantic"
          />
        </div>

        {/* Memory */}
        <MemorySection memory={memory} />

        {/* Model Breakdown + Actions */}
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2">
            <ModelBreakdownTable breakdown={modelBreakdown} />
          </div>
          <ActionsPanel
            autoRefresh={autoRefresh}
            onToggleAutoRefresh={() => setAutoRefresh((v) => !v)}
          />
        </div>
      </div>
    </div>
  );
}
