import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  ShieldCheck, ShieldAlert, ShieldX, ShieldBan,
  RefreshCw, Play, Eye, Lock, AlertTriangle,
  BarChart3, Ban, FileWarning,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface SentinelPolicy {
  blockPII?: boolean;
  redactPII?: boolean;
  blockInjection?: boolean;
  blockHarmful?: boolean;
  blockCredentials?: boolean;
  maxOutputLength?: number;
  customBlockPatterns?: string[];
  customAllowPatterns?: string[];
}

interface SentinelCheck {
  name: string;
  severity: "critical" | "warning" | "info";
  passed: boolean;
  details: string;
}

interface SentinelResult {
  action: "pass" | "warn" | "redact" | "block";
  checks: SentinelCheck[];
  sanitizedContent?: string;
  blockedReasons: string[];
}

interface HistoryEntry {
  taskId: string;
  agentId: string;
  result: SentinelResult;
}

interface Stats {
  total: number;
  blocked: number;
  redacted: number;
  warned: number;
  passed: number;
  topIssues: Array<{ name: string; count: number }>;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function SentinelPage() {
  const { toast } = useToast();
  const [testContent, setTestContent] = useState("");
  const [testTaskId, setTestTaskId] = useState("test-task-1");
  const [testAgentId, setTestAgentId] = useState("agent-main");

  const { data: policy, isLoading: policyLoading } = useQuery<SentinelPolicy>({
    queryKey: ["/api/sentinel/policy"],
  });

  const { data: stats, isLoading: statsLoading } = useQuery<Stats>({
    queryKey: ["/api/sentinel/stats"],
  });

  const { data: history = [], isLoading: historyLoading } = useQuery<HistoryEntry[]>({
    queryKey: ["/api/sentinel/history"],
  });

  const updatePolicy = useMutation({
    mutationFn: (update: Partial<SentinelPolicy>) =>
      apiRequest("PATCH", "/api/sentinel/policy", update),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sentinel/policy"] });
      toast({ title: "Policy updated" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const checkMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/sentinel/check", {
        taskId: testTaskId, agentId: testAgentId, content: testContent,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sentinel/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sentinel/history"] });
      toast({ title: "Safety check complete" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const actionIcon = (action: string) => {
    switch (action) {
      case "pass": return <ShieldCheck className="w-4 h-4 text-green-400" />;
      case "warn": return <ShieldAlert className="w-4 h-4 text-yellow-400" />;
      case "redact": return <ShieldBan className="w-4 h-4 text-orange-400" />;
      case "block": return <ShieldX className="w-4 h-4 text-red-400" />;
      default: return <ShieldCheck className="w-4 h-4" />;
    }
  };

  const actionBadge = (action: string) => {
    const colors: Record<string, string> = {
      pass: "bg-green-500/15 text-green-400 border-green-500/30",
      warn: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
      redact: "bg-orange-500/15 text-orange-400 border-orange-500/30",
      block: "bg-red-500/15 text-red-400 border-red-500/30",
    };
    return <Badge className={colors[action] || ""}>{action.toUpperCase()}</Badge>;
  };

  const sevBadge = (sev: string) => {
    const colors: Record<string, string> = {
      critical: "bg-red-500/15 text-red-400 border-red-500/30",
      warning: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
      info: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    };
    return <Badge variant="outline" className={`text-[10px] ${colors[sev] || ""}`}>{sev}</Badge>;
  };

  return (
    <div className="h-full overflow-auto p-6 space-y-6" data-testid="sentinel-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold">SENTINEL</h1>
            <p className="text-xs text-muted-foreground">Safety & Guardrails Gate</p>
          </div>
        </div>
        <Button
          size="sm" variant="outline"
          onClick={() => {
            queryClient.invalidateQueries({ queryKey: ["/api/sentinel/stats"] });
            queryClient.invalidateQueries({ queryKey: ["/api/sentinel/history"] });
          }}
          data-testid="button-refresh-sentinel"
        >
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {statsLoading ? (
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)
        ) : (
          <>
            <Card className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <BarChart3 className="w-3.5 h-3.5" /> Total Checks
              </div>
              <p className="text-2xl font-bold">{stats?.total ?? 0}</p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 text-green-400 text-xs mb-1">
                <ShieldCheck className="w-3.5 h-3.5" /> Passed
              </div>
              <p className="text-2xl font-bold text-green-400">{stats?.passed ?? 0}</p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 text-yellow-400 text-xs mb-1">
                <FileWarning className="w-3.5 h-3.5" /> Warned
              </div>
              <p className="text-2xl font-bold text-yellow-400">{stats?.warned ?? 0}</p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 text-orange-400 text-xs mb-1">
                <Eye className="w-3.5 h-3.5" /> Redacted
              </div>
              <p className="text-2xl font-bold text-orange-400">{stats?.redacted ?? 0}</p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 text-red-400 text-xs mb-1">
                <Ban className="w-3.5 h-3.5" /> Blocked
              </div>
              <p className="text-2xl font-bold text-red-400">{stats?.blocked ?? 0}</p>
            </Card>
          </>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Policy Config */}
        <Card className="p-5 space-y-4">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Lock className="w-4 h-4 text-amber-400" /> Policy Configuration
          </h2>
          {policyLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 rounded" />)}
            </div>
          ) : (
            <div className="space-y-3">
              {[
                { key: "blockPII" as const, label: "Block PII", desc: "Block personal identifiable information" },
                { key: "redactPII" as const, label: "Redact PII", desc: "Redact PII instead of blocking" },
                { key: "blockInjection" as const, label: "Block Injection", desc: "Detect prompt injection attempts" },
                { key: "blockHarmful" as const, label: "Block Harmful", desc: "Filter harmful content" },
                { key: "blockCredentials" as const, label: "Block Credentials", desc: "Prevent API key / password leaks" },
              ].map(({ key, label, desc }) => (
                <div key={key} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                  <Switch
                    checked={!!policy?.[key]}
                    onCheckedChange={(checked) => updatePolicy.mutate({ [key]: checked })}
                    data-testid={`switch-${key}`}
                  />
                </div>
              ))}
              <div>
                <p className="text-sm font-medium mb-1">Max Output Length</p>
                <Input
                  type="number"
                  value={policy?.maxOutputLength ?? 50000}
                  onChange={(e) => updatePolicy.mutate({ maxOutputLength: parseInt(e.target.value) || 50000 })}
                  className="w-32"
                  data-testid="input-max-output-length"
                />
              </div>
            </div>
          )}
        </Card>

        {/* Test Check */}
        <Card className="p-5 space-y-4">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Play className="w-4 h-4 text-amber-400" /> Run Safety Check
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Task ID</label>
              <Input value={testTaskId} onChange={(e) => setTestTaskId(e.target.value)} data-testid="input-sentinel-task-id" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Agent ID</label>
              <Input value={testAgentId} onChange={(e) => setTestAgentId(e.target.value)} data-testid="input-sentinel-agent-id" />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Content to Check</label>
            <Textarea
              value={testContent} onChange={(e) => setTestContent(e.target.value)}
              placeholder="Paste content to check for safety issues..."
              rows={5} data-testid="input-sentinel-content"
            />
          </div>
          <Button
            onClick={() => checkMutation.mutate()}
            disabled={checkMutation.isPending || !testContent.trim()}
            data-testid="button-sentinel-check"
          >
            {checkMutation.isPending ? (
              <><RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Checking...</>
            ) : (
              <><ShieldCheck className="w-3.5 h-3.5 mr-1.5" /> Check Safety</>
            )}
          </Button>
        </Card>
      </div>

      {/* Top Issues */}
      {stats?.topIssues && stats.topIssues.length > 0 && (
        <Card className="p-5">
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" /> Top Issues
          </h2>
          <div className="flex flex-wrap gap-2">
            {stats.topIssues.map((issue, i) => (
              <Badge key={i} variant="outline" className="text-xs">
                {issue.name} <span className="ml-1 text-muted-foreground">({issue.count})</span>
              </Badge>
            ))}
          </div>
        </Card>
      )}

      {/* History */}
      <div>
        <h2 className="text-sm font-semibold mb-3">Check History</h2>
        {historyLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
          </div>
        ) : history.length === 0 ? (
          <Card className="p-8 text-center">
            <ShieldCheck className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">No checks yet. Run one above.</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {history.map((entry, i) => (
              <Card key={i} className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {actionIcon(entry.result.action)}
                    <span className="text-sm font-medium">{entry.taskId}</span>
                    <span className="text-xs text-muted-foreground">by {entry.agentId}</span>
                  </div>
                  {actionBadge(entry.result.action)}
                </div>
                {entry.result.checks.length > 0 && (
                  <div className="space-y-1">
                    {entry.result.checks.filter(c => !c.passed).map((c, ci) => (
                      <div key={ci} className="flex items-center gap-2 text-xs">
                        {sevBadge(c.severity)}
                        <span className="text-muted-foreground">{c.name}: {c.details}</span>
                      </div>
                    ))}
                  </div>
                )}
                {entry.result.blockedReasons.length > 0 && (
                  <div className="mt-2 space-y-0.5">
                    {entry.result.blockedReasons.map((r, ri) => (
                      <p key={ri} className="text-xs text-red-400 flex items-center gap-1">
                        <ShieldX className="w-3 h-3" /> {r}
                      </p>
                    ))}
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
