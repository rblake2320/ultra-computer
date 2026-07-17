import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Cpu, Activity, BarChart2, Zap, DollarSign } from "lucide-react";
import type { Conversation, AgentRun } from "@shared/schema";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TokenUsage {
  prompt: number;
  completion: number;
  total: number;
}

interface EnrichedRun extends AgentRun {
  usage: TokenUsage;
  sessionTitle: string;
  taskTitle: string;
  durationMs: number | null;
}

interface SpendStatus {
  month: string;
  limitUsd: number;
  recordedUsd: number;
  reservedUsd: number;
  committedUsd: number;
  availableUsd: number;
  blocked: boolean;
  reservationCount: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseUsage(raw: string | null | undefined): TokenUsage {
  try {
    const obj = JSON.parse(raw || "{}");
    return {
      prompt: Number(obj.prompt ?? obj.promptTokens ?? 0),
      completion: Number(obj.completion ?? obj.completionTokens ?? 0),
      total: Number(obj.total ?? obj.totalTokens ?? 0),
    };
  } catch {
    return { prompt: 0, completion: 0, total: 0 };
  }
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatDuration(ms: number | null): string {
  if (ms == null || ms <= 0) return "—";
  if (ms < 1_000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1_000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1_000)}s`;
}

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "complete":
    case "completed": return "default";
    case "failed":    return "destructive";
    case "running":   return "secondary";
    default:          return "outline";
  }
}

// Date range helpers
function startOfDay(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function getDateRangeStart(range: string): number {
  const now = new Date();
  switch (range) {
    case "today":
      return startOfDay(now);
    case "week":
      return startOfDay(new Date(now.getTime() - 6 * 86_400_000));
    default:
      return 0;
  }
}

// Chart colors — accessible, distinct
const CHART_COLORS = [
  "#4f98a3", "#6daa45", "#e8af34", "#bb653b",
  "#a86fdf", "#5591c7", "#dd6974", "#6ec0b8",
];

// ─── Summary Cards ────────────────────────────────────────────────────────────

interface SummaryCardsProps {
  runs: EnrichedRun[];
  loading: boolean;
}

function SummaryCards({ runs, loading }: SummaryCardsProps) {
  const totalTokens = runs.reduce((s, r) => s + r.usage.total, 0);
  const totalRuns = runs.length;
  const avgTokens = totalRuns > 0 ? Math.round(totalTokens / totalRuns) : 0;

  const modelCounts = runs.reduce<Record<string, number>>((acc, r) => {
    acc[r.modelId] = (acc[r.modelId] ?? 0) + 1;
    return acc;
  }, {});
  const topModel =
    Object.entries(modelCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

  const cards = [
    {
      title: "Total Tokens",
      value: formatNumber(totalTokens),
      icon: <Cpu className="h-4 w-4 text-muted-foreground" />,
      desc: "Across all filtered runs",
      testId: "card-total-tokens",
    },
    {
      title: "Total Runs",
      value: totalRuns.toLocaleString(),
      icon: <Activity className="h-4 w-4 text-muted-foreground" />,
      desc: "Agent executions",
      testId: "card-total-runs",
    },
    {
      title: "Avg Tokens / Run",
      value: formatNumber(avgTokens),
      icon: <BarChart2 className="h-4 w-4 text-muted-foreground" />,
      desc: "Mean token consumption",
      testId: "card-avg-tokens",
    },
    {
      title: "Most Used Model",
      value: topModel.length > 20 ? topModel.slice(0, 20) + "…" : topModel,
      icon: <Zap className="h-4 w-4 text-muted-foreground" />,
      desc: modelCounts[topModel] ? `${modelCounts[topModel]} runs` : "No runs yet",
      testId: "card-top-model",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {cards.map((c) => (
        <Card key={c.title} data-testid={c.testId}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{c.title}</CardTitle>
            {c.icon}
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold" data-testid={`value-${c.testId}`}>
                  {c.value}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{c.desc}</p>
              </>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Bar Chart ────────────────────────────────────────────────────────────────

interface TokensByModelChartProps {
  runs: EnrichedRun[];
  loading: boolean;
}

function TokensByModelChart({ runs, loading }: TokensByModelChartProps) {
  const data = useMemo(() => {
    const modelTokens = runs.reduce<Record<string, number>>((acc, r) => {
      acc[r.modelId] = (acc[r.modelId] ?? 0) + r.usage.total;
      return acc;
    }, {});

    return Object.entries(modelTokens)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([model, tokens]) => ({
        model: model.length > 18 ? model.slice(0, 18) + "…" : model,
        fullModel: model,
        tokens,
      }));
  }, [runs]);

  return (
    <Card data-testid="card-tokens-by-model">
      <CardHeader>
        <CardTitle className="text-base">Tokens by Model</CardTitle>
        <CardDescription>Total token consumption per model</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-48 w-full" />
        ) : data.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
            No data available
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="model"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                angle={-30}
                textAnchor="end"
                interval={0}
              />
              <YAxis
                tickFormatter={formatNumber}
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                width={48}
              />
              <Tooltip
                formatter={(value) => [
                  formatNumber(typeof value === "number" ? value : Number(value ?? 0)),
                  "Tokens",
                ]}
                labelFormatter={(label, payload) =>
                  payload?.[0]?.payload?.fullModel ?? label
                }
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "6px",
                  fontSize: 12,
                }}
              />
              <Bar dataKey="tokens" radius={[3, 3, 0, 0]}>
                {data.map((_, idx) => (
                  <Cell
                    key={idx}
                    fill={CHART_COLORS[idx % CHART_COLORS.length]}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Runs Table ───────────────────────────────────────────────────────────────

interface RunsTableProps {
  runs: EnrichedRun[];
  loading: boolean;
}

function RunsTable({ runs, loading }: RunsTableProps) {
  const PAGE_SIZE = 25;
  const [page, setPage] = useState(0);

  const paged = runs.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(runs.length / PAGE_SIZE);

  return (
    <Card data-testid="card-runs-table">
      <CardHeader>
        <CardTitle className="text-base">Agent Runs</CardTitle>
        <CardDescription>
          {runs.length.toLocaleString()} run{runs.length !== 1 ? "s" : ""} — most recent first
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Session</TableHead>
                <TableHead>Task</TableHead>
                <TableHead>Model</TableHead>
                <TableHead className="text-right">Prompt</TableHead>
                <TableHead className="text-right">Completion</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Duration</TableHead>
                <TableHead className="pr-4">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 8 }).map((__, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                : paged.length === 0
                ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-10 text-sm">
                      No agent runs found for the selected filters.
                    </TableCell>
                  </TableRow>
                )
                : paged.map((run) => (
                    <TableRow key={run.id} data-testid={`row-run-${run.id}`}>
                      <TableCell
                        className="pl-4 max-w-[140px] truncate text-sm font-medium"
                        title={run.sessionTitle}
                        data-testid={`text-session-${run.id}`}
                      >
                        {run.sessionTitle}
                      </TableCell>
                      <TableCell
                        className="max-w-[160px] truncate text-sm text-muted-foreground"
                        title={run.taskTitle}
                        data-testid={`text-task-${run.id}`}
                      >
                        {run.taskTitle}
                      </TableCell>
                      <TableCell
                        className="max-w-[140px] truncate"
                        data-testid={`text-model-${run.id}`}
                      >
                        <code className="text-xs bg-muted px-1 py-0.5 rounded">
                          {run.modelId}
                        </code>
                      </TableCell>
                      <TableCell
                        className="text-right tabular-nums text-sm"
                        data-testid={`text-prompt-tokens-${run.id}`}
                      >
                        {formatNumber(run.usage.prompt)}
                      </TableCell>
                      <TableCell
                        className="text-right tabular-nums text-sm"
                        data-testid={`text-completion-tokens-${run.id}`}
                      >
                        {formatNumber(run.usage.completion)}
                      </TableCell>
                      <TableCell
                        className="text-right tabular-nums text-sm font-medium"
                        data-testid={`text-total-tokens-${run.id}`}
                      >
                        {formatNumber(run.usage.total)}
                      </TableCell>
                      <TableCell
                        className="text-right tabular-nums text-sm text-muted-foreground"
                        data-testid={`text-duration-${run.id}`}
                      >
                        {formatDuration(run.durationMs)}
                      </TableCell>
                      <TableCell className="pr-4" data-testid={`text-status-${run.id}`}>
                        <Badge variant={statusVariant(run.status)} className="text-xs">
                          {run.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <p className="text-sm text-muted-foreground">
              Page {page + 1} of {totalPages}
            </p>
            <div className="flex gap-2">
              <button
                className="text-sm px-3 py-1 rounded border border-border hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed"
                disabled={page === 0}
                onClick={() => setPage(p => p - 1)}
                data-testid="button-prev-page"
              >
                Previous
              </button>
              <button
                className="text-sm px-3 py-1 rounded border border-border hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed"
                disabled={page >= totalPages - 1}
                onClick={() => setPage(p => p + 1)}
                data-testid="button-next-page"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function TokenDashboardPage() {
  const [dateRange, setDateRange] = useState<"today" | "week" | "all">("all");
  const [modelFilter, setModelFilter] = useState<string>("all");

  // Fetch all conversations (for session titles)
  const { data: conversations = [], isLoading: loadingConvs, isError: convsError } = useQuery<Conversation[]>({
    queryKey: ["/api/conversations"],
  });

  // Fetch all agent runs in a single request
  const { data: allRuns = [], isLoading: loadingRuns, isError: runsError } = useQuery<AgentRun[]>({
    queryKey: ["/api/all-agent-runs"],
    queryFn: () => apiRequest("GET", "/api/all-agent-runs"),
    staleTime: 30_000,
  });

  const { data: spend, isLoading: loadingSpend, isError: spendError } = useQuery<SpendStatus>({
    queryKey: ["/api/spend"],
    queryFn: () => apiRequest("GET", "/api/spend"),
    refetchInterval: 15_000,
  });

  const loading = loadingConvs || loadingRuns;

  // Enrich runs with session title, task info, usage
  const enrichedRuns = useMemo<EnrichedRun[]>(() => {
    if (!allRuns.length) return [];

    const convMap = new Map(conversations.map(c => [c.id, c]));

    return allRuns
      .map((run) => {
        const conv = run.conversationId ? convMap.get(run.conversationId) : undefined;
        return {
          ...run,
          usage: parseUsage(run.tokenUsage),
          sessionTitle: conv?.title ?? (run.conversationId ? `Session ${run.conversationId.slice(0, 8)}` : "—"),
          taskTitle: run.taskId ? `Task ${run.taskId.slice(0, 8)}` : "—",
          durationMs:
            run.completedAt && run.startedAt
              ? run.completedAt - run.startedAt
              : null,
        };
      })
      .sort((a, b) => b.startedAt - a.startedAt); // most recent first
  }, [allRuns, conversations]);

  // Filter by date range
  const dateFilteredRuns = useMemo(() => {
    const start = getDateRangeStart(dateRange);
    return enrichedRuns.filter(r => r.startedAt >= start);
  }, [enrichedRuns, dateRange]);

  // All unique models for filter dropdown
  const allModels = useMemo(() => {
    return Array.from(new Set(enrichedRuns.map(r => r.modelId))).sort();
  }, [enrichedRuns]);

  // Apply model filter
  const filteredRuns = useMemo(() => {
    if (modelFilter === "all") return dateFilteredRuns;
    return dateFilteredRuns.filter(r => r.modelId === modelFilter);
  }, [dateFilteredRuns, modelFilter]);

  if (convsError || runsError || spendError) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Failed to load token data. Please try again.
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-screen-2xl mx-auto">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold" data-testid="heading-token-dashboard">
            Token Usage
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Consumption across all sessions and models
          </p>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <Select
            value={dateRange}
            onValueChange={(v) => {
              setDateRange(v as typeof dateRange);
            }}
            data-testid="select-date-range"
          >
            <SelectTrigger className="w-32" data-testid="trigger-date-range">
              <SelectValue placeholder="Date range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">Last 7 days</SelectItem>
              <SelectItem value="all">All time</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={modelFilter}
            onValueChange={setModelFilter}
            data-testid="select-model-filter"
          >
            <SelectTrigger className="w-48" data-testid="trigger-model-filter">
              <SelectValue placeholder="All models" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All models</SelectItem>
              {allModels.map((m) => (
                <SelectItem key={m} value={m} data-testid={`option-model-${m}`}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary cards */}
      <SummaryCards runs={filteredRuns} loading={loading} />

      <Card data-testid="card-monthly-spend">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div>
            <CardTitle className="text-sm font-medium">Paid API spending — {spend?.month ?? "current month"}</CardTitle>
            <CardDescription>Recorded plus active or unresolved reservations; local loopback models are exempt.</CardDescription>
          </div>
          <DollarSign className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          {loadingSpend || !spend ? <Skeleton className="h-12 w-full" /> : (
            <div className="space-y-2">
              <div className="flex items-end justify-between gap-4">
                <div className="text-2xl font-bold">${spend.committedUsd.toFixed(2)} / ${spend.limitUsd.toFixed(2)}</div>
                <Badge variant={spend.blocked ? "destructive" : "outline"}>
                  ${spend.availableUsd.toFixed(2)} available
                </Badge>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full ${spend.blocked ? "bg-destructive" : "bg-primary"}`}
                  style={{ width: `${Math.min(100, spend.limitUsd > 0 ? (spend.committedUsd / spend.limitUsd) * 100 : 100)}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                ${spend.recordedUsd.toFixed(2)} recorded · ${spend.reservedUsd.toFixed(2)} reserved across {spend.reservationCount} active or unresolved call(s)
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Chart */}
      <TokensByModelChart runs={filteredRuns} loading={loading} />

      {/* Table */}
      <RunsTable runs={filteredRuns} loading={loading} />
    </div>
  );
}
