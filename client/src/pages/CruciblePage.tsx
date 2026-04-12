import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  FlaskConical, CheckCircle2, XCircle, AlertTriangle, Clock,
  BarChart3, RefreshCw, Play, TrendingUp, Target,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface CrucibleCheck {
  name: string;
  score: number;
  passed: boolean;
  feedback: string;
  weight: number;
}

interface CrucibleResult {
  passed: boolean;
  overallScore: number;
  checks: CrucibleCheck[];
  recommendation: "accept" | "revise" | "reject";
  revisionHints: string[];
  validatedAt: number;
  latencyMs: number;
}

interface HistoryEntry {
  taskId: string;
  agentId: string;
  result: CrucibleResult;
}

interface Stats {
  total: number;
  passed: number;
  failed: number;
  passRate: number;
  avgScore: number;
  avgLatencyMs: number;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function CruciblePage() {
  const { toast } = useToast();
  const [taskId, setTaskId] = useState("test-task-1");
  const [agentId, setAgentId] = useState("agent-main");
  const [output, setOutput] = useState("");
  const [criteria, setCriteria] = useState(
    JSON.stringify({
      checks: [
        { name: "accuracy", weight: 0.4, description: "Factual correctness" },
        { name: "completeness", weight: 0.3, description: "Covers all aspects" },
        { name: "clarity", weight: 0.3, description: "Clear and readable" },
      ],
      threshold: 0.6,
    }, null, 2)
  );

  const { data: stats, isLoading: statsLoading } = useQuery<Stats>({
    queryKey: ["/api/crucible/stats"],
  });

  const { data: history = [], isLoading: historyLoading } = useQuery<HistoryEntry[]>({
    queryKey: ["/api/crucible/history"],
  });

  const validateMutation = useMutation({
    mutationFn: () => {
      let parsedCriteria;
      try {
        parsedCriteria = JSON.parse(criteria);
      } catch {
        throw new Error("Invalid JSON in criteria");
      }
      return apiRequest("POST", "/api/crucible/validate", {
        taskId, agentId, output, criteria: parsedCriteria,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crucible/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crucible/history"] });
      toast({ title: "Validation complete" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const recBadge = (rec: string) => {
    if (rec === "accept") return <Badge className="bg-green-500/15 text-green-400 border-green-500/30">Accept</Badge>;
    if (rec === "revise") return <Badge className="bg-yellow-500/15 text-yellow-400 border-yellow-500/30">Revise</Badge>;
    return <Badge className="bg-red-500/15 text-red-400 border-red-500/30">Reject</Badge>;
  };

  return (
    <div className="h-full overflow-auto p-6 space-y-6" data-testid="crucible-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-purple-500/15 border border-purple-500/30 flex items-center justify-center">
            <FlaskConical className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold">CRUCIBLE</h1>
            <p className="text-xs text-muted-foreground">Quality Validation Gate</p>
          </div>
        </div>
        <Button
          size="sm" variant="outline"
          onClick={() => {
            queryClient.invalidateQueries({ queryKey: ["/api/crucible/stats"] });
            queryClient.invalidateQueries({ queryKey: ["/api/crucible/history"] });
          }}
          data-testid="button-refresh-crucible"
        >
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {statsLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)
        ) : (
          <>
            <Card className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <BarChart3 className="w-3.5 h-3.5" /> Total Validations
              </div>
              <p className="text-2xl font-bold">{stats?.total ?? 0}</p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <Target className="w-3.5 h-3.5" /> Pass Rate
              </div>
              <p className="text-2xl font-bold text-green-400">{stats?.passRate ?? 0}%</p>
              <Progress value={stats?.passRate ?? 0} className="mt-2 h-1.5" />
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <TrendingUp className="w-3.5 h-3.5" /> Avg Score
              </div>
              <p className="text-2xl font-bold">{stats?.avgScore?.toFixed(2) ?? "0.00"}</p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <Clock className="w-3.5 h-3.5" /> Avg Latency
              </div>
              <p className="text-2xl font-bold">{stats?.avgLatencyMs ?? 0}<span className="text-sm font-normal text-muted-foreground">ms</span></p>
            </Card>
          </>
        )}
      </div>

      {/* Validate Form */}
      <Card className="p-5 space-y-4">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Play className="w-4 h-4 text-purple-400" /> Run Validation
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Task ID</label>
            <Input value={taskId} onChange={(e) => setTaskId(e.target.value)} placeholder="task-id" data-testid="input-task-id" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Agent ID</label>
            <Input value={agentId} onChange={(e) => setAgentId(e.target.value)} placeholder="agent-id" data-testid="input-agent-id" />
          </div>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Output to Validate</label>
          <Textarea
            value={output} onChange={(e) => setOutput(e.target.value)}
            placeholder="Paste the agent output here..."
            rows={4} data-testid="input-output"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Criteria (JSON)</label>
          <Textarea
            value={criteria} onChange={(e) => setCriteria(e.target.value)}
            rows={6} className="font-mono text-xs" data-testid="input-criteria"
          />
        </div>
        <Button
          onClick={() => validateMutation.mutate()}
          disabled={validateMutation.isPending || !output.trim()}
          data-testid="button-validate"
        >
          {validateMutation.isPending ? (
            <><RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Validating...</>
          ) : (
            <><FlaskConical className="w-3.5 h-3.5 mr-1.5" /> Validate</>
          )}
        </Button>
      </Card>

      {/* History */}
      <div>
        <h2 className="text-sm font-semibold mb-3">Validation History</h2>
        {historyLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
          </div>
        ) : history.length === 0 ? (
          <Card className="p-8 text-center">
            <FlaskConical className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">No validations yet. Run one above.</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {history.map((entry, i) => (
              <Card key={i} className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {entry.result.passed ? (
                      <CheckCircle2 className="w-4 h-4 text-green-400" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-400" />
                    )}
                    <span className="text-sm font-medium">{entry.taskId}</span>
                    <span className="text-xs text-muted-foreground">by {entry.agentId}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {recBadge(entry.result.recommendation)}
                    <span className="text-xs text-muted-foreground">{entry.result.latencyMs}ms</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 mb-2">
                  <div className="flex-1">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">Score</span>
                      <span className="font-medium">{(entry.result.overallScore * 100).toFixed(0)}%</span>
                    </div>
                    <Progress value={entry.result.overallScore * 100} className="h-1.5" />
                  </div>
                </div>
                {entry.result.checks.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {entry.result.checks.map((c, ci) => (
                      <Badge key={ci} variant="outline" className={`text-[10px] ${c.passed ? "border-green-500/30 text-green-400" : "border-red-500/30 text-red-400"}`}>
                        {c.name}: {(c.score * 100).toFixed(0)}%
                      </Badge>
                    ))}
                  </div>
                )}
                {entry.result.revisionHints.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {entry.result.revisionHints.map((hint, hi) => (
                      <div key={hi} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                        <AlertTriangle className="w-3 h-3 text-yellow-400 mt-0.5 shrink-0" />
                        <span>{hint}</span>
                      </div>
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
