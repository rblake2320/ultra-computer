import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../lib/queryClient";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Progress } from "../components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../components/ui/tooltip";
import { useToast } from "../hooks/use-toast";
import {
  Activity, Heart, Shield, Clock, Zap, Brain, RefreshCcw,
  CheckCircle, XCircle, AlertTriangle, Pause, Play, Trash2,
  Timer, Cpu, MemoryStick, Gauge, Server, WifiOff, Wifi,
  TrendingUp, BookOpen, Lightbulb, BarChart3, Target, Layers,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  uptime: string;
  uptimeMs: number;
  memoryUsage: { rss: number; heapUsed: number; heapTotal: number };
  eventLoopLagMs: number;
  lastHeartbeat: number;
  restartCount: number;
  activeConnections: number;
  pid: number;
}

interface CheckpointStats {
  total: number;
  running: number;
  completed: number;
  failed: number;
  abandoned: number;
  paused: number;
}

interface CronStats {
  total: number;
  enabled: number;
  disabled: number;
  failedLast24h: number;
  successLast24h: number;
}

interface LearningStats {
  totalExecutions: number;
  successRate: number;
  avgDuration: number;
  topModel: string;
  topSkill: string;
  rulesCount: number;
  lastAnalysisAt: number;
}

interface SkillHealth {
  totalSkills: number;
  healthyCount: number;
  degradedCount: number;
  failingCount: number;
  topPerformers: string[];
  needsAttention: string[];
}

interface DashboardData {
  health: HealthStatus;
  checkpoints: CheckpointStats & { resumable: number };
  cron: CronStats;
  circuits: Record<string, { state: string; failures: number; totalCalls: number }>;
  learning: LearningStats;
  skillHealth: SkillHealth;
}

// ─── Utilities ──────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

function statusColor(status: string): string {
  switch (status) {
    case "healthy": case "CLOSED": case "success": return "text-emerald-400";
    case "degraded": case "HALF_OPEN": return "text-amber-400";
    case "unhealthy": case "OPEN": case "failure": return "text-red-400";
    default: return "text-muted-foreground";
  }
}

function statusBg(status: string): string {
  switch (status) {
    case "healthy": case "CLOSED": return "bg-emerald-500/10 border-emerald-500/30";
    case "degraded": case "HALF_OPEN": return "bg-amber-500/10 border-amber-500/30";
    case "unhealthy": case "OPEN": return "bg-red-500/10 border-red-500/30";
    default: return "bg-muted/50 border-border";
  }
}

function StatusDot({ status }: { status: string }) {
  const color = status === "healthy" || status === "CLOSED" ? "bg-emerald-400"
    : status === "degraded" || status === "HALF_OPEN" ? "bg-amber-400"
    : "bg-red-400";
  return <span className={`w-2 h-2 rounded-full ${color} inline-block`} />;
}

// ─── Health Panel ───────────────────────────────────────────────────────────

function HealthPanel({ health }: { health: HealthStatus }) {
  const heapPct = health.memoryUsage.heapTotal > 0
    ? (health.memoryUsage.heapUsed / health.memoryUsage.heapTotal * 100)
    : 0;

  return (
    <Card className={`p-4 border ${statusBg(health.status)}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Heart className={`w-4 h-4 ${statusColor(health.status)}`} />
          <span className="text-xs font-medium">Process Health</span>
        </div>
        <Badge variant="outline" className={`text-[10px] gap-1 ${statusColor(health.status)}`}>
          <StatusDot status={health.status} />
          {health.status.toUpperCase()}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <p className="text-[10px] text-muted-foreground flex items-center gap-1"><Timer className="w-3 h-3" />Uptime</p>
          <p className="text-sm font-mono font-bold">{health.uptime}</p>
        </div>
        <div className="space-y-1">
          <p className="text-[10px] text-muted-foreground flex items-center gap-1"><Gauge className="w-3 h-3" />Event Loop Lag</p>
          <p className={`text-sm font-mono font-bold ${health.eventLoopLagMs > 2000 ? "text-amber-400" : health.eventLoopLagMs > 5000 ? "text-red-400" : ""}`}>
            {health.eventLoopLagMs.toFixed(0)}ms
          </p>
        </div>
        <div className="space-y-1">
          <p className="text-[10px] text-muted-foreground flex items-center gap-1"><MemoryStick className="w-3 h-3" />Heap</p>
          <p className="text-sm font-mono">{formatBytes(health.memoryUsage.heapUsed)} / {formatBytes(health.memoryUsage.heapTotal)}</p>
          <Progress value={heapPct} className="h-1" />
        </div>
        <div className="space-y-1">
          <p className="text-[10px] text-muted-foreground flex items-center gap-1"><Server className="w-3 h-3" />RSS</p>
          <p className="text-sm font-mono">{formatBytes(health.memoryUsage.rss)}</p>
        </div>
        <div className="space-y-1">
          <p className="text-[10px] text-muted-foreground flex items-center gap-1"><RefreshCcw className="w-3 h-3" />Restarts</p>
          <p className="text-sm font-mono font-bold">{health.restartCount}</p>
        </div>
        <div className="space-y-1">
          <p className="text-[10px] text-muted-foreground flex items-center gap-1"><Zap className="w-3 h-3" />Connections</p>
          <p className="text-sm font-mono font-bold">{health.activeConnections}</p>
        </div>
      </div>
    </Card>
  );
}

// ─── Checkpoints Panel ──────────────────────────────────────────────────────

function CheckpointsPanel({ stats }: { stats: CheckpointStats & { resumable: number } }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <Layers className="w-4 h-4 text-muted-foreground" />
        <span className="text-xs font-medium">Task Checkpoints</span>
        {stats.resumable > 0 && (
          <Badge variant="outline" className="text-[10px] gap-1 bg-amber-500/10 text-amber-400 border-amber-500/30">
            {stats.resumable} resumable
          </Badge>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Running", value: stats.running, icon: Play, color: "text-blue-400" },
          { label: "Completed", value: stats.completed, icon: CheckCircle, color: "text-emerald-400" },
          { label: "Failed", value: stats.failed, icon: XCircle, color: "text-red-400" },
          { label: "Paused", value: stats.paused, icon: Pause, color: "text-amber-400" },
          { label: "Abandoned", value: stats.abandoned, icon: AlertTriangle, color: "text-orange-400" },
          { label: "Total", value: stats.total, icon: Layers, color: "text-muted-foreground" },
        ].map(s => (
          <div key={s.label} className="text-center p-2 rounded-lg bg-muted/30">
            <s.icon className={`w-3.5 h-3.5 mx-auto mb-1 ${s.color}`} />
            <p className="text-base font-bold leading-none">{s.value}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── Cron Panel ─────────────────────────────────────────────────────────────

function CronPanel({ stats }: { stats: CronStats }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <Clock className="w-4 h-4 text-muted-foreground" />
        <span className="text-xs font-medium">Cron Scheduler</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <p className="text-[10px] text-muted-foreground">Total Jobs</p>
          <p className="text-lg font-bold">{stats.total}</p>
        </div>
        <div className="space-y-1">
          <p className="text-[10px] text-muted-foreground">Enabled</p>
          <p className="text-lg font-bold text-emerald-400">{stats.enabled}</p>
        </div>
        <div className="space-y-1">
          <p className="text-[10px] text-muted-foreground">Success (24h)</p>
          <p className="text-lg font-bold text-blue-400">{stats.successLast24h}</p>
        </div>
        <div className="space-y-1">
          <p className="text-[10px] text-muted-foreground">Failed (24h)</p>
          <p className="text-lg font-bold text-red-400">{stats.failedLast24h}</p>
        </div>
      </div>
    </Card>
  );
}

// ─── Circuit Breakers Panel ─────────────────────────────────────────────────

function CircuitBreakersPanel({ circuits }: { circuits: Record<string, { state: string; failures: number; totalCalls: number }> }) {
  const entries = Object.entries(circuits ?? {});

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <Shield className="w-4 h-4 text-muted-foreground" />
        <span className="text-xs font-medium">Circuit Breakers</span>
      </div>
      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-2">No circuit breakers registered</p>
      ) : (
        <div className="space-y-2">
          {entries.map(([name, info]) => (
            <div key={name} className={`flex items-center justify-between p-2 rounded-lg border ${statusBg(info.state)}`}>
              <div className="flex items-center gap-2">
                {info.state === "CLOSED" ? <Wifi className="w-3 h-3 text-emerald-400" /> : <WifiOff className="w-3 h-3 text-red-400" />}
                <span className="text-xs font-medium">{name}</span>
              </div>
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                <span>Calls: {info.totalCalls}</span>
                <span>Failures: {info.failures}</span>
                <Badge variant="outline" className={`text-[10px] ${statusColor(info.state)}`}>
                  {info.state}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ─── Learning Panel ─────────────────────────────────────────────────────────

function LearningPanel({ stats }: { stats: LearningStats }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <Brain className="w-4 h-4 text-muted-foreground" />
        <span className="text-xs font-medium">Self-Learning Engine</span>
        {stats.rulesCount > 0 && (
          <Badge variant="outline" className="text-[10px] gap-1 bg-violet-500/10 text-violet-400 border-violet-500/30">
            {stats.rulesCount} rules learned
          </Badge>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <p className="text-[10px] text-muted-foreground flex items-center gap-1"><BarChart3 className="w-3 h-3" />Executions</p>
          <p className="text-lg font-bold">{stats.totalExecutions}</p>
        </div>
        <div className="space-y-1">
          <p className="text-[10px] text-muted-foreground flex items-center gap-1"><Target className="w-3 h-3" />Success Rate</p>
          <p className={`text-lg font-bold ${stats.successRate >= 0.8 ? "text-emerald-400" : stats.successRate >= 0.5 ? "text-amber-400" : "text-red-400"}`}>
            {(stats.successRate * 100).toFixed(1)}%
          </p>
        </div>
        <div className="space-y-1">
          <p className="text-[10px] text-muted-foreground flex items-center gap-1"><Cpu className="w-3 h-3" />Top Model</p>
          <p className="text-xs font-mono truncate">{stats.topModel || "—"}</p>
        </div>
        <div className="space-y-1">
          <p className="text-[10px] text-muted-foreground flex items-center gap-1"><BookOpen className="w-3 h-3" />Top Skill</p>
          <p className="text-xs font-mono truncate">{stats.topSkill || "—"}</p>
        </div>
      </div>
      {stats.lastAnalysisAt > 0 && (
        <p className="text-[10px] text-muted-foreground mt-2">
          Last analysis: {new Date(stats.lastAnalysisAt).toLocaleString()}
        </p>
      )}
    </Card>
  );
}

// ─── Skill Health Panel ─────────────────────────────────────────────────────

function SkillHealthPanel({ health }: { health: SkillHealth }) {
  const total = health.totalSkills || 1;
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <Lightbulb className="w-4 h-4 text-muted-foreground" />
        <span className="text-xs font-medium">Skill Auto-Improvement</span>
      </div>
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="text-center p-2 rounded-lg bg-emerald-500/10">
          <p className="text-base font-bold text-emerald-400">{health.healthyCount}</p>
          <p className="text-[10px] text-muted-foreground">Healthy</p>
        </div>
        <div className="text-center p-2 rounded-lg bg-amber-500/10">
          <p className="text-base font-bold text-amber-400">{health.degradedCount}</p>
          <p className="text-[10px] text-muted-foreground">Degraded</p>
        </div>
        <div className="text-center p-2 rounded-lg bg-red-500/10">
          <p className="text-base font-bold text-red-400">{health.failingCount}</p>
          <p className="text-[10px] text-muted-foreground">Failing</p>
        </div>
      </div>
      {health.topPerformers.length > 0 && (
        <div className="mb-2">
          <p className="text-[10px] text-muted-foreground mb-1">Top performers</p>
          <div className="flex flex-wrap gap-1">
            {health.topPerformers.slice(0, 5).map(s => (
              <Badge key={s} variant="secondary" className="text-[10px]">{s}</Badge>
            ))}
          </div>
        </div>
      )}
      {health.needsAttention.length > 0 && (
        <div>
          <p className="text-[10px] text-muted-foreground mb-1">Needs attention</p>
          <div className="flex flex-wrap gap-1">
            {health.needsAttention.slice(0, 5).map(s => (
              <Badge key={s} variant="outline" className="text-[10px] text-amber-400 border-amber-500/30">{s}</Badge>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

// ─── Main Autonomy Page ─────────────────────────────────────────────────────

export function AutonomyPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("overview");

  const { data: dashboard, isLoading, isError: dashboardError } = useQuery<DashboardData>({
    queryKey: ["/api/autonomy/dashboard"],
    refetchInterval: 10000, // auto-refresh every 10s
  });

  const analyzeMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/autonomy/learning/analyze"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/autonomy/dashboard"] });
      toast({ title: "Analysis complete" });
    },
    onError: (e: any) => toast({ title: "Analysis failed", description: e.message, variant: "destructive" }),
  });

  const improveMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/autonomy/skills/improvements/generate"),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["/api/autonomy/dashboard"] });
      const count = Array.isArray(data) ? data.length : 0;
      toast({ title: `Generated ${count} improvement suggestions` });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const abandonMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/autonomy/checkpoints/abandon-stale", {}),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["/api/autonomy/dashboard"] });
      toast({ title: `Abandoned ${data?.abandoned || 0} stale tasks` });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (dashboardError && !dashboard) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Failed to load autonomy dashboard. Please try again.
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card/50">
          <Activity className="w-4 h-4 text-primary" />
          <h1 className="font-semibold text-sm">Autonomy Dashboard</h1>
        </div>
        <div className="flex items-center justify-center flex-1">
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card/50">
        <Activity className="w-4 h-4 text-primary" />
        <h1 className="font-semibold text-sm">Autonomy Dashboard</h1>
        <p className="text-xs text-muted-foreground flex-1">Self-healing, self-learning, long-running task management</p>
        <div className="flex gap-2">
          <Button
            size="sm" variant="ghost" className="h-7 text-xs gap-1"
            onClick={() => analyzeMutation.mutate()}
            disabled={analyzeMutation.isPending}
            data-testid="button-run-analysis"
          >
            <Brain className={`w-3 h-3 ${analyzeMutation.isPending ? "animate-spin" : ""}`} />
            Run Analysis
          </Button>
          <Button
            size="sm" variant="ghost" className="h-7 text-xs gap-1"
            onClick={() => improveMutation.mutate()}
            disabled={improveMutation.isPending}
            data-testid="button-gen-improvements"
          >
            <Lightbulb className={`w-3 h-3 ${improveMutation.isPending ? "animate-pulse" : ""}`} />
            Improvements
          </Button>
          <Button
            size="sm" variant="ghost" className="h-7 text-xs gap-1 text-muted-foreground"
            onClick={() => abandonMutation.mutate()}
            disabled={abandonMutation.isPending}
            data-testid="button-abandon-stale"
          >
            <Trash2 className="w-3 h-3" />
            Abandon Stale
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="h-8 mb-4">
            <TabsTrigger value="overview" className="text-xs h-7">Overview</TabsTrigger>
            <TabsTrigger value="health" className="text-xs h-7">Health</TabsTrigger>
            <TabsTrigger value="learning" className="text-xs h-7">Learning</TabsTrigger>
            <TabsTrigger value="circuits" className="text-xs h-7">Circuits</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-0">
            {/* Top-level status cards */}
            <div className="grid grid-cols-6 gap-3 mb-4">
              {[
                { icon: Heart, label: "Health", value: dashboard.health.status, color: statusColor(dashboard.health.status) },
                { icon: Timer, label: "Uptime", value: dashboard.health.uptime, color: "text-foreground" },
                { icon: Layers, label: "Tasks Running", value: dashboard.checkpoints.running, color: "text-blue-400" },
                { icon: Clock, label: "Cron Jobs", value: `${dashboard.cron.enabled}/${dashboard.cron.total}`, color: "text-foreground" },
                { icon: Brain, label: "Rules Learned", value: dashboard.learning.rulesCount, color: "text-violet-400" },
                { icon: Target, label: "Success Rate", value: `${(dashboard.learning.successRate * 100).toFixed(0)}%`, color: dashboard.learning.successRate >= 0.8 ? "text-emerald-400" : "text-amber-400" },
              ].map(s => (
                <Card key={s.label} className="p-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <s.icon className="w-4 h-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className={`text-sm font-bold leading-none truncate ${s.color}`}>{s.value}</p>
                    <p className="text-[10px] text-muted-foreground">{s.label}</p>
                  </div>
                </Card>
              ))}
            </div>

            {/* Main panels grid */}
            <div className="grid grid-cols-2 gap-4">
              <HealthPanel health={dashboard.health} />
              <CheckpointsPanel stats={dashboard.checkpoints} />
              <CronPanel stats={dashboard.cron} />
              <CircuitBreakersPanel circuits={dashboard.circuits} />
              <LearningPanel stats={dashboard.learning} />
              <SkillHealthPanel health={dashboard.skillHealth} />
            </div>
          </TabsContent>

          <TabsContent value="health" className="mt-0">
            <div className="grid grid-cols-2 gap-4">
              <HealthPanel health={dashboard.health} />
              <Card className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Activity className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs font-medium">System Info</span>
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between"><span className="text-muted-foreground">PID</span><span className="font-mono">{dashboard.health.pid}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Uptime (ms)</span><span className="font-mono">{dashboard.health.uptimeMs.toLocaleString()}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Restart Count</span><span className="font-mono">{dashboard.health.restartCount}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Active Connections</span><span className="font-mono">{dashboard.health.activeConnections}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Event Loop Lag</span><span className="font-mono">{dashboard.health.eventLoopLagMs.toFixed(1)} ms</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Heap Used</span><span className="font-mono">{formatBytes(dashboard.health.memoryUsage.heapUsed)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Heap Total</span><span className="font-mono">{formatBytes(dashboard.health.memoryUsage.heapTotal)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">RSS</span><span className="font-mono">{formatBytes(dashboard.health.memoryUsage.rss)}</span></div>
                </div>
              </Card>
              <CheckpointsPanel stats={dashboard.checkpoints} />
              <CronPanel stats={dashboard.cron} />
            </div>
          </TabsContent>

          <TabsContent value="learning" className="mt-0">
            <div className="grid grid-cols-2 gap-4">
              <LearningPanel stats={dashboard.learning} />
              <SkillHealthPanel health={dashboard.skillHealth} />
              <Card className="p-4 col-span-2">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs font-medium">How Self-Learning Works</span>
                </div>
                <div className="grid grid-cols-4 gap-4 text-xs text-muted-foreground">
                  <div className="space-y-1">
                    <p className="font-medium text-foreground flex items-center gap-1"><BarChart3 className="w-3 h-3 text-blue-400" />1. Track</p>
                    <p>Every task execution is logged — model used, skills activated, duration, outcome, and any errors.</p>
                  </div>
                  <div className="space-y-1">
                    <p className="font-medium text-foreground flex items-center gap-1"><Brain className="w-3 h-3 text-violet-400" />2. Analyze</p>
                    <p>Every 6 hours, the engine analyzes patterns — which models work best for which tasks, recurring failures, speed trends.</p>
                  </div>
                  <div className="space-y-1">
                    <p className="font-medium text-foreground flex items-center gap-1"><Lightbulb className="w-3 h-3 text-amber-400" />3. Learn</p>
                    <p>Rules are derived from evidence — "prefer model X for code tasks", "add compaction before skill Y".</p>
                  </div>
                  <div className="space-y-1">
                    <p className="font-medium text-foreground flex items-center gap-1"><Target className="w-3 h-3 text-emerald-400" />4. Improve</p>
                    <p>Low-risk improvements auto-apply. High-impact changes surface as suggestions for review.</p>
                  </div>
                </div>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="circuits" className="mt-0">
            <CircuitBreakersPanel circuits={dashboard.circuits} />
            <Card className="p-4 mt-4">
              <div className="flex items-center gap-2 mb-3">
                <Shield className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs font-medium">How Circuit Breakers Work</span>
              </div>
              <div className="grid grid-cols-3 gap-4 text-xs text-muted-foreground">
                <div className={`p-3 rounded-lg border ${statusBg("CLOSED")}`}>
                  <p className="font-medium text-emerald-400 mb-1">CLOSED (Normal)</p>
                  <p>All requests pass through. Failures are counted in a sliding window. If failures exceed threshold, circuit opens.</p>
                </div>
                <div className={`p-3 rounded-lg border ${statusBg("OPEN")}`}>
                  <p className="font-medium text-red-400 mb-1">OPEN (Protecting)</p>
                  <p>All requests immediately rejected — no load on the failing service. After timeout, transitions to half-open for testing.</p>
                </div>
                <div className={`p-3 rounded-lg border ${statusBg("HALF_OPEN")}`}>
                  <p className="font-medium text-amber-400 mb-1">HALF_OPEN (Testing)</p>
                  <p>Limited requests allowed through to test recovery. Successes close the circuit; failures reopen it.</p>
                </div>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
