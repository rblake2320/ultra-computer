import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Activity, RefreshCw, Trash2, Search, Clock, BarChart3,
  Layers, AlertTriangle, CheckCircle2, XCircle, ArrowRight,
  Timer, Server, Zap,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ServiceMetrics {
  count: number;
  errors: number;
  avgDurationMs: number;
}

interface DashboardData {
  totalTraces: number;
  totalSpans: number;
  activeSpans: number;
  avgDurationMs: number;
  latency: { p50Ms: number; p95Ms: number; p99Ms: number };
  errorRate: number;
  byService: Record<string, ServiceMetrics>;
  byOperation: Record<string, { count: number; avgDurationMs: number }>;
  recentErrors: Array<{
    traceId: string;
    spanId: string;
    operationName: string;
    serviceName: string;
    error: string;
    timestamp: number;
  }>;
}

interface TraceSummary {
  traceId: string;
  rootOperation: string;
  rootService: string;
  spanCount: number;
  durationMs: number;
  hasErrors: boolean;
  startTime: number;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function ObservabilityPage() {
  const { toast } = useToast();
  const [searchService, setSearchService] = useState("");
  const [searchOperation, setSearchOperation] = useState("");
  const [searchResults, setSearchResults] = useState<TraceSummary[] | null>(null);

  const { data: dashboard, isLoading } = useQuery<DashboardData>({
    queryKey: ["/api/observability/dashboard"],
    refetchInterval: 10000, // Live refresh every 10s
  });

  const searchMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/observability/search", {
        serviceName: searchService || undefined,
        operationName: searchOperation || undefined,
        limit: 25,
      }),
    onSuccess: (data: TraceSummary[]) => setSearchResults(data),
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const clearMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/observability/clear"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/observability/dashboard"] });
      setSearchResults(null);
      toast({ title: "Traces cleared" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const services = dashboard?.byService ? Object.entries(dashboard.byService) : [];
  const operations = dashboard?.byOperation
    ? Object.entries(dashboard.byOperation).sort((a, b) => b[1].count - a[1].count).slice(0, 10)
    : [];

  return (
    <div className="h-full overflow-auto p-6 space-y-6" data-testid="observability-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center">
            <Activity className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold">OBSERVABILITY</h1>
            <p className="text-xs text-muted-foreground">Distributed Tracing & Span Monitoring</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm" variant="outline"
            onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/observability/dashboard"] })}
            data-testid="button-refresh-observability"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
          </Button>
          <Button
            size="sm" variant="outline" className="text-destructive hover:text-destructive"
            onClick={() => clearMutation.mutate()}
            disabled={clearMutation.isPending}
            data-testid="button-clear-traces"
          >
            <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Clear
          </Button>
        </div>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)
        ) : (
          <>
            <Card className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <Layers className="w-3.5 h-3.5" /> Total Traces
              </div>
              <p className="text-2xl font-bold">{dashboard?.totalTraces ?? 0}</p>
              <p className="text-xs text-muted-foreground">{dashboard?.totalSpans ?? 0} spans total</p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <Zap className="w-3.5 h-3.5" /> Active Spans
              </div>
              <p className="text-2xl font-bold text-cyan-400">{dashboard?.activeSpans ?? 0}</p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <Timer className="w-3.5 h-3.5" /> Latency (p50 / p95 / p99)
              </div>
              <p className="text-lg font-bold">
                {dashboard?.latency?.p50Ms ?? 0}<span className="text-xs font-normal text-muted-foreground">ms</span>
                {" / "}
                {dashboard?.latency?.p95Ms ?? 0}<span className="text-xs font-normal text-muted-foreground">ms</span>
                {" / "}
                {dashboard?.latency?.p99Ms ?? 0}<span className="text-xs font-normal text-muted-foreground">ms</span>
              </p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <AlertTriangle className="w-3.5 h-3.5" /> Error Rate
              </div>
              <p className={`text-2xl font-bold ${(dashboard?.errorRate ?? 0) > 5 ? "text-red-400" : (dashboard?.errorRate ?? 0) > 0 ? "text-yellow-400" : "text-green-400"}`}>
                {(dashboard?.errorRate ?? 0).toFixed(1)}%
              </p>
              <Progress value={100 - (dashboard?.errorRate ?? 0)} className="mt-2 h-1.5" />
            </Card>
          </>
        )}
      </div>

      {/* Service Breakdown */}
      {services.length > 0 && (
        <Card className="p-5">
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Server className="w-4 h-4 text-cyan-400" /> Services
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="text-left py-2 pr-4">Service</th>
                  <th className="text-right py-2 px-4">Spans</th>
                  <th className="text-right py-2 px-4">Errors</th>
                  <th className="text-right py-2 px-4">Error Rate</th>
                  <th className="text-right py-2 pl-4">Avg Duration</th>
                </tr>
              </thead>
              <tbody>
                {services.map(([name, m]) => {
                  const errRate = m.count > 0 ? (m.errors / m.count * 100) : 0;
                  return (
                    <tr key={name} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="py-2 pr-4 font-medium">{name}</td>
                      <td className="text-right py-2 px-4">{m.count}</td>
                      <td className="text-right py-2 px-4">
                        <span className={m.errors > 0 ? "text-red-400" : "text-muted-foreground"}>{m.errors}</span>
                      </td>
                      <td className="text-right py-2 px-4">
                        <span className={errRate > 5 ? "text-red-400" : errRate > 0 ? "text-yellow-400" : "text-green-400"}>
                          {errRate.toFixed(1)}%
                        </span>
                      </td>
                      <td className="text-right py-2 pl-4 text-muted-foreground">{Math.round(m.avgDurationMs)}ms</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Top Operations */}
      {operations.length > 0 && (
        <Card className="p-5">
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-cyan-400" /> Top Operations
          </h2>
          <div className="space-y-2">
            {operations.map(([name, m]) => (
              <div key={name} className="flex items-center gap-3">
                <span className="text-xs font-mono flex-1 truncate">{name}</span>
                <span className="text-xs text-muted-foreground w-16 text-right">{m.count} calls</span>
                <span className="text-xs text-muted-foreground w-20 text-right">{Math.round(m.avgDurationMs)}ms avg</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Search */}
      <Card className="p-5 space-y-4">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Search className="w-4 h-4 text-cyan-400" /> Search Traces
        </h2>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="text-xs text-muted-foreground mb-1 block">Service Name</label>
            <Input value={searchService} onChange={(e) => setSearchService(e.target.value)} placeholder="e.g. model-router" data-testid="input-search-service" />
          </div>
          <div className="flex-1">
            <label className="text-xs text-muted-foreground mb-1 block">Operation Name</label>
            <Input value={searchOperation} onChange={(e) => setSearchOperation(e.target.value)} placeholder="e.g. chat" data-testid="input-search-operation" />
          </div>
          <Button onClick={() => searchMutation.mutate()} disabled={searchMutation.isPending} data-testid="button-search-traces">
            {searchMutation.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
          </Button>
        </div>

        {searchResults && (
          <div className="space-y-2 mt-3">
            {searchResults.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No traces found</p>
            ) : (
              searchResults.map((t) => (
                <div key={t.traceId} className="flex items-center gap-3 p-3 rounded-md bg-muted/50 hover:bg-muted/70">
                  {t.hasErrors ? (
                    <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{t.rootOperation}</p>
                    <p className="text-[10px] text-muted-foreground">{t.rootService} — {t.spanCount} spans</p>
                  </div>
                  <span className="text-xs text-muted-foreground">{t.durationMs}ms</span>
                  <span className="text-[10px] text-muted-foreground">{new Date(t.startTime).toLocaleTimeString()}</span>
                </div>
              ))
            )}
          </div>
        )}
      </Card>

      {/* Recent Errors */}
      {dashboard?.recentErrors && dashboard.recentErrors.length > 0 && (
        <Card className="p-5">
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400" /> Recent Errors
          </h2>
          <div className="space-y-2">
            {dashboard.recentErrors.slice(0, 10).map((err, i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-md bg-red-500/5 border border-red-500/10">
                <XCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium">{err.operationName}</span>
                    <span className="text-[10px] text-muted-foreground">{err.serviceName}</span>
                  </div>
                  <p className="text-xs text-red-400 font-mono truncate">{err.error}</p>
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {new Date(err.timestamp).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
