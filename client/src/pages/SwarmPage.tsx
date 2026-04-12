import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import {
  Bug,
  Plus,
  Trash2,
  Play,
  Square,
  Users,
  Target,
  MessageSquare,
  ArrowRightLeft,
  Vote,
  Activity,
  Layers,
  Zap,
  Brain,
  Globe,
  RefreshCw,
  Shield,
  AlertTriangle,
  Gauge,
  Network,
  Send,
  Eye,
  HandMetal,
  CircleStop,
  ChevronRight,
  Maximize2,
  XCircle,
  CheckCircle2,
  Clock,
  Loader2,
  Settings,
  Crosshair,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface SwarmSummary {
  id: string;
  name: string;
  description: string;
  mode: string;
  status: string;
  agentCount: number;
  taskCount: number;
  blackboardEntries: number;
  consensusRounds: number;
  startedAt: number | null;
  completedAt: number | null;
  totalTokensUsed: number;
  totalAgentsSpawned: number;
  circuitBroken: boolean;
  error: string | null;
  safety: {
    maxTotalTokens: number;
    maxAgents: number;
    maxSpawnDepth: number;
    maxWallClockMs: number;
    budgetWarningPct: number;
  };
  enableRoleNegotiation: boolean;
  enableDeadlockDetection: boolean;
  enableDynamicSpawning: boolean;
  enableStigmergy: boolean;
  enableHandoffs: boolean;
  consensusStrategy: string;
}

interface SwarmStats {
  swarmId: string;
  status: string;
  agentCount: number;
  activeAgents: number;
  taskCount: number;
  completedTasks: number;
  failedTasks: number;
  pendingTasks: number;
  runningTasks: number;
  blackboardEntries: number;
  handoffCount: number;
  consensusRounds: number;
  totalTokens: number;
  uptime: number;
  throughput: number;
}

interface SwarmAgent {
  id: string;
  name: string;
  role: string;
  status: string;
  instructions: string;
  modelId: string | null;
  tools: string[];
  canHandoffTo: string[];
  canSpawn: boolean;
  spawnDepth: number;
  currentTaskId: string | null;
  tokenUsage: { prompt: number; completion: number; total: number };
  messagesProcessed: number;
  handoffsMade: number;
  capabilityProfile: { speed: number; accuracy: number; cost: number; specialties: string[] };
  lastActiveAt: number;
  createdAt: number;
}

interface SwarmTask {
  id: string;
  description: string;
  taskType: string;
  priority: number;
  claimedBy: string | null;
  status: string;
  result: string | null;
  dependencies: string[];
  metadata: Record<string, unknown>;
  claimedAt: number | null;
  completedAt: number | null;
  createdAt: number;
}

interface BlackboardEntry {
  id: string;
  authorAgentId: string;
  entryType: string;
  topic: string;
  key: string;
  content: string;
  confidence: number;
  priority: number;
  version: number;
  supersedesEntryId: string | null;
  readByAgentIds: string[];
  ttlMs: number | null;
  expiresAt: number | null;
  createdAt: number;
  updatedAt: number;
}

interface HandoffRecord {
  id: string;
  fromAgentId: string;
  toAgentId: string;
  reason: string;
  context: string;
  taskId: string | null;
  timestamp: number;
}

interface ConsensusRound {
  id: string;
  subject: string;
  strategy: string;
  status: string;
  votes: Array<{ agentId: string; answer: string; confidence: number; reasoning: string; round: number; timestamp: number }>;
  result: { winner: string; confidence: number; reasoning: string } | null;
  participantAgentIds: string[];
  maxRounds: number;
  currentRound: number;
  createdAt: number;
  resolvedAt: number | null;
}

interface SwarmMessage {
  id: string;
  fromAgentId: string;
  toAgentId: string | null;
  messageType: string;
  content: string;
  metadata: Record<string, unknown>;
  timestamp: number;
}

interface SwarmEvent {
  type: string;
  swarmId: string;
  timestamp: number;
  data: Record<string, unknown>;
}

interface TopoNode {
  id: string;
  type: "agent" | "task";
  label: string;
  status: string;
  role?: string;
}

interface TopoEdge {
  from: string;
  to: string;
  type: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  idle: "bg-muted text-muted-foreground",
  running: "bg-green-500/20 text-green-400",
  paused: "bg-yellow-500/20 text-yellow-400",
  completed: "bg-blue-500/20 text-blue-400",
  failed: "bg-red-500/20 text-red-400",
  terminated: "bg-red-500/20 text-red-400",
  working: "bg-green-500/20 text-green-400",
  waiting: "bg-yellow-500/20 text-yellow-400",
  handed_off: "bg-purple-500/20 text-purple-400",
  pending: "bg-muted text-muted-foreground",
  claimed: "bg-yellow-500/20 text-yellow-400",
  voting: "bg-blue-500/20 text-blue-400",
  reconciling: "bg-purple-500/20 text-purple-400",
  resolved: "bg-green-500/20 text-green-400",
  deadlocked: "bg-red-500/20 text-red-400",
  open: "bg-blue-500/20 text-blue-400",
};

const STATUS_ICONS: Record<string, typeof CheckCircle2> = {
  idle: Clock,
  running: Loader2,
  paused: Clock,
  completed: CheckCircle2,
  failed: XCircle,
  terminated: CircleStop,
  working: Loader2,
  waiting: Clock,
  pending: Clock,
};

const MODE_ICONS: Record<string, typeof Users> = {
  collaborative: Users,
  competitive: Target,
  exploratory: Globe,
};

function formatTime(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(0)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

function formatTokens(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return `${n}`;
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function SwarmPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selectedSwarmId, setSelectedSwarmId] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const { data: swarms = [], isLoading } = useQuery<SwarmSummary[]>({
    queryKey: ["/api/swarm/sessions"],
  });

  const createSwarm = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiRequest("POST", "/api/swarm/sessions", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/swarm/sessions"] });
      setShowCreateDialog(false);
      toast({ title: "Swarm session created" });
    },
  });

  const deleteSwarm = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/swarm/sessions/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/swarm/sessions"] });
      if (selectedSwarmId) setSelectedSwarmId(null);
      toast({ title: "Swarm session deleted" });
    },
  });

  const startSwarm = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/swarm/sessions/${id}/start`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/swarm/sessions"] });
      toast({ title: "Swarm started" });
    },
    onError: (e: any) => toast({ title: "Start failed", description: e.message, variant: "destructive" }),
  });

  const stopSwarm = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/swarm/sessions/${id}/stop`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/swarm/sessions"] });
      toast({ title: "Swarm stopped" });
    },
  });

  const terminateSwarm = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiRequest("POST", `/api/swarm/sessions/${id}/terminate`, { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/swarm/sessions"] });
      toast({ title: "Swarm terminated" });
    },
  });

  const runSwarm = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/swarm/sessions/${id}/run`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/swarm/sessions"] });
      toast({ title: "Swarm execution complete" });
    },
    onError: (e: any) => toast({ title: "Execution failed", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="h-full overflow-auto" data-testid="page-swarm">
      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center">
              <Network className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold">Swarm Intelligence</h1>
              <p className="text-xs text-muted-foreground">
                Multi-agent coordination — topology, blackboard, consensus, role negotiation, HITL
              </p>
            </div>
          </div>
          <Button size="sm" className="gap-1.5" onClick={() => setShowCreateDialog(true)} data-testid="button-new-swarm">
            <Plus className="w-3.5 h-3.5" />
            New Session
          </Button>
        </div>

        {/* Swarm List */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-lg" />)}
          </div>
        ) : swarms.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">
            <Network className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm font-medium">No swarm sessions</p>
            <p className="text-xs mt-1">Create a session to coordinate multiple agents with shared state, consensus, and role negotiation</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {swarms.map(swarm => {
              const ModeIcon = MODE_ICONS[swarm.mode] || Users;
              const budgetPct = swarm.safety?.maxTotalTokens
                ? (swarm.totalTokensUsed / swarm.safety.maxTotalTokens) * 100
                : 0;
              const budgetWarning = budgetPct > (swarm.safety?.budgetWarningPct || 0.9) * 100;

              return (
                <Card
                  key={swarm.id}
                  className={`p-3 cursor-pointer transition-all hover:border-primary/50 ${selectedSwarmId === swarm.id ? "border-primary ring-1 ring-primary/30" : ""}`}
                  onClick={() => setSelectedSwarmId(swarm.id)}
                  data-testid={`card-swarm-${swarm.id}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <ModeIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                      <p className="text-sm font-semibold truncate">{swarm.name}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {swarm.circuitBroken && (
                        <Badge variant="outline" className="text-[10px] bg-red-500/20 text-red-400 border-red-500/30 gap-0.5">
                          <AlertTriangle className="w-2.5 h-2.5" /> Circuit
                        </Badge>
                      )}
                      <Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[swarm.status] || ""}`}>
                        {swarm.status}
                      </Badge>
                    </div>
                  </div>
                  {swarm.description && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{swarm.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground flex-wrap">
                    <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {swarm.agentCount}</span>
                    <span className="flex items-center gap-1"><Target className="w-3 h-3" /> {swarm.taskCount}</span>
                    <span className="flex items-center gap-1"><Layers className="w-3 h-3" /> {swarm.blackboardEntries}</span>
                    <span className="flex items-center gap-1"><Zap className="w-3 h-3" /> {formatTokens(swarm.totalTokensUsed)}</span>
                  </div>

                  {/* Budget gauge mini */}
                  {swarm.safety?.maxTotalTokens > 0 && (
                    <div className="mt-2">
                      <Progress
                        value={Math.min(budgetPct, 100)}
                        className={`h-1 ${budgetWarning ? "[&>div]:bg-red-500" : ""}`}
                      />
                      <p className="text-[9px] text-muted-foreground mt-0.5">
                        {formatTokens(swarm.totalTokensUsed)} / {formatTokens(swarm.safety.maxTotalTokens)} tokens
                      </p>
                    </div>
                  )}

                  <div className="flex items-center gap-1.5 mt-2">
                    {swarm.status === "running" ? (
                      <>
                        <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1" onClick={(e) => { e.stopPropagation(); stopSwarm.mutate(swarm.id); }}>
                          <Square className="w-3 h-3" /> Stop
                        </Button>
                        <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1 text-red-400 hover:text-red-300" onClick={(e) => { e.stopPropagation(); terminateSwarm.mutate({ id: swarm.id, reason: "Terminated by user" }); }}>
                          <CircleStop className="w-3 h-3" /> Kill
                        </Button>
                      </>
                    ) : swarm.status === "idle" ? (
                      <>
                        <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1" onClick={(e) => { e.stopPropagation(); startSwarm.mutate(swarm.id); }}>
                          <Play className="w-3 h-3" /> Start
                        </Button>
                        <Button size="sm" variant="default" className="h-6 text-[10px] gap-1" onClick={(e) => { e.stopPropagation(); runSwarm.mutate(swarm.id); }} disabled={runSwarm.isPending}>
                          {runSwarm.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />} Run
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1" onClick={(e) => { e.stopPropagation(); startSwarm.mutate(swarm.id); }}>
                        <RefreshCw className="w-3 h-3" /> Restart
                      </Button>
                    )}
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="ghost" className="h-6 text-[10px] text-muted-foreground hover:text-destructive ml-auto" onClick={(e) => e.stopPropagation()}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete "{swarm.name}"?</AlertDialogTitle>
                          <AlertDialogDescription>This removes the swarm session, all agents, tasks, blackboard entries, consensus rounds, and messages.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteSwarm.mutate(swarm.id)}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* Selected Swarm Detail */}
        {selectedSwarmId && (
          <SwarmDetail
            swarmId={selectedSwarmId}
            swarm={swarms.find(s => s.id === selectedSwarmId)}
          />
        )}
      </div>

      {/* Create Swarm Dialog */}
      <CreateSwarmDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onSubmit={(data) => createSwarm.mutate(data)}
        isPending={createSwarm.isPending}
      />
    </div>
  );
}

// ─── Swarm Detail Panel ─────────────────────────────────────────────────────

function SwarmDetail({ swarmId, swarm }: { swarmId: string; swarm?: SwarmSummary }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showAddAgentDialog, setShowAddAgentDialog] = useState(false);
  const [showAddTaskDialog, setShowAddTaskDialog] = useState(false);
  const [showBlackboardInject, setShowBlackboardInject] = useState(false);
  const [showSendMessage, setShowSendMessage] = useState(false);
  const [showConsensusDialog, setShowConsensusDialog] = useState(false);

  const { data: stats } = useQuery<SwarmStats>({
    queryKey: ["/api/swarm/sessions", swarmId, "stats"],
    queryFn: () => apiRequest("GET", `/api/swarm/sessions/${swarmId}/stats`),
    refetchInterval: 2000,
  });

  const { data: agents = [] } = useQuery<SwarmAgent[]>({
    queryKey: ["/api/swarm/sessions", swarmId, "agents"],
    queryFn: () => apiRequest("GET", `/api/swarm/sessions/${swarmId}/agents`),
    refetchInterval: 2000,
  });

  const { data: tasks = [] } = useQuery<SwarmTask[]>({
    queryKey: ["/api/swarm/sessions", swarmId, "tasks"],
    queryFn: () => apiRequest("GET", `/api/swarm/sessions/${swarmId}/tasks`),
    refetchInterval: 2000,
  });

  const { data: blackboard = [] } = useQuery<BlackboardEntry[]>({
    queryKey: ["/api/swarm/sessions", swarmId, "blackboard"],
    queryFn: () => apiRequest("GET", `/api/swarm/sessions/${swarmId}/blackboard`),
    refetchInterval: 3000,
  });

  const { data: handoffs = [] } = useQuery<HandoffRecord[]>({
    queryKey: ["/api/swarm/sessions", swarmId, "handoffs"],
    queryFn: () => apiRequest("GET", `/api/swarm/sessions/${swarmId}/handoffs`),
    refetchInterval: 5000,
  });

  const { data: consensusRounds = [] } = useQuery<ConsensusRound[]>({
    queryKey: ["/api/swarm/sessions", swarmId, "consensus"],
    queryFn: () => apiRequest("GET", `/api/swarm/sessions/${swarmId}/consensus`),
    refetchInterval: 3000,
  });

  const { data: messages = [] } = useQuery<SwarmMessage[]>({
    queryKey: ["/api/swarm/sessions", swarmId, "messages"],
    queryFn: () => apiRequest("GET", `/api/swarm/sessions/${swarmId}/messages?limit=100`),
    refetchInterval: 3000,
  });

  const { data: events = [] } = useQuery<SwarmEvent[]>({
    queryKey: ["/api/swarm/sessions", swarmId, "events"],
    queryFn: () => apiRequest("GET", `/api/swarm/sessions/${swarmId}/events?limit=50`),
    refetchInterval: 3000,
  });

  const { data: topology } = useQuery<{ nodes: TopoNode[]; edges: TopoEdge[] }>({
    queryKey: ["/api/swarm/sessions", swarmId, "topology"],
    queryFn: () => apiRequest("GET", `/api/swarm/sessions/${swarmId}/topology`),
    refetchInterval: 3000,
  });

  const removeAgent = useMutation({
    mutationFn: (agentId: string) => apiRequest("DELETE", `/api/swarm/sessions/${swarmId}/agents/${agentId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/swarm/sessions", swarmId] });
      toast({ title: "Agent terminated" });
    },
  });

  const claimTask = useMutation({
    mutationFn: (taskId: string) => apiRequest("POST", `/api/swarm/sessions/${swarmId}/tasks/${taskId}/claim`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/swarm/sessions", swarmId] });
      toast({ title: "Task negotiated and assigned" });
    },
    onError: (e: any) => toast({ title: "Claim failed", description: e.message, variant: "destructive" }),
  });

  if (!stats) return <Skeleton className="h-64 rounded-lg" />;

  const completionPct = stats.taskCount > 0 ? (stats.completedTasks / stats.taskCount) * 100 : 0;
  const maxTokens = swarm?.safety?.maxTotalTokens || 1000000;
  const budgetPct = (stats.totalTokens / maxTokens) * 100;
  const budgetWarning = budgetPct > 90;
  const budgetCritical = budgetPct > 100;

  // Build agent name lookup for display
  const agentNames: Record<string, string> = {};
  agents.forEach(a => { agentNames[a.id] = a.name; });
  agentNames["human_operator"] = "Human";
  agentNames["human_override"] = "Human Override";
  agentNames["consensus_system"] = "Consensus System";

  const getAgentName = (id: string) => agentNames[id] || shortId(id);

  return (
    <div className="space-y-4">
      {/* Stats Row with Budget Gauge */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card className="p-3">
          <div className="flex items-center gap-2 text-muted-foreground"><Users className="w-3.5 h-3.5" /><span className="text-xs">Agents</span></div>
          <p className="text-xl font-bold mt-1">{stats.activeAgents}<span className="text-xs text-muted-foreground font-normal ml-1">/ {stats.agentCount}</span></p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 text-muted-foreground"><Target className="w-3.5 h-3.5" /><span className="text-xs">Tasks</span></div>
          <p className="text-xl font-bold mt-1">{stats.completedTasks}<span className="text-xs text-muted-foreground font-normal ml-1">/ {stats.taskCount}</span></p>
          <Progress value={completionPct} className="h-1 mt-1" />
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 text-muted-foreground"><Layers className="w-3.5 h-3.5" /><span className="text-xs">Blackboard</span></div>
          <p className="text-xl font-bold mt-1">{stats.blackboardEntries}</p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 text-muted-foreground"><ArrowRightLeft className="w-3.5 h-3.5" /><span className="text-xs">Handoffs</span></div>
          <p className="text-xl font-bold mt-1">{stats.handoffCount}</p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 text-muted-foreground"><Zap className="w-3.5 h-3.5" /><span className="text-xs">Throughput</span></div>
          <p className="text-xl font-bold mt-1">{stats.throughput.toFixed(1)}<span className="text-xs text-muted-foreground font-normal ml-1">/min</span></p>
        </Card>
        {/* Budget Gauge */}
        <Card className={`p-3 ${budgetCritical ? "border-red-500/50" : budgetWarning ? "border-yellow-500/50" : ""}`}>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Gauge className="w-3.5 h-3.5" />
            <span className="text-xs">Budget</span>
            {budgetCritical && <AlertTriangle className="w-3 h-3 text-red-400" />}
          </div>
          <p className={`text-xl font-bold mt-1 ${budgetCritical ? "text-red-400" : budgetWarning ? "text-yellow-400" : ""}`}>
            {budgetPct.toFixed(0)}%
          </p>
          <Progress
            value={Math.min(budgetPct, 100)}
            className={`h-1 mt-1 ${budgetCritical ? "[&>div]:bg-red-500" : budgetWarning ? "[&>div]:bg-yellow-500" : ""}`}
          />
          <p className="text-[9px] text-muted-foreground mt-0.5">
            {formatTokens(stats.totalTokens)} / {formatTokens(maxTokens)}
          </p>
        </Card>
      </div>

      {/* Feature Badges */}
      {swarm && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {swarm.enableRoleNegotiation && <Badge variant="outline" className="text-[10px] gap-1"><Crosshair className="w-2.5 h-2.5" /> Contract Net</Badge>}
          {swarm.enableDeadlockDetection && <Badge variant="outline" className="text-[10px] gap-1"><Shield className="w-2.5 h-2.5" /> Deadlock Detection</Badge>}
          {swarm.enableDynamicSpawning && <Badge variant="outline" className="text-[10px] gap-1"><Plus className="w-2.5 h-2.5" /> Dynamic Spawn</Badge>}
          {swarm.enableStigmergy && <Badge variant="outline" className="text-[10px] gap-1"><Bug className="w-2.5 h-2.5" /> Stigmergy</Badge>}
          {swarm.enableHandoffs && <Badge variant="outline" className="text-[10px] gap-1"><ArrowRightLeft className="w-2.5 h-2.5" /> Handoffs</Badge>}
          <Badge variant="outline" className="text-[10px] gap-1 capitalize"><Vote className="w-2.5 h-2.5" /> {swarm.consensusStrategy?.replace(/_/g, " ")}</Badge>
          {stats.uptime > 0 && <Badge variant="outline" className="text-[10px] gap-1"><Clock className="w-2.5 h-2.5" /> {formatTime(stats.uptime)}</Badge>}
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="topology">
        <TabsList className="flex-wrap">
          <TabsTrigger value="topology" className="gap-1.5"><Network className="w-3.5 h-3.5" /> Topology</TabsTrigger>
          <TabsTrigger value="agents" className="gap-1.5"><Users className="w-3.5 h-3.5" /> Agents ({agents.length})</TabsTrigger>
          <TabsTrigger value="tasks" className="gap-1.5"><Target className="w-3.5 h-3.5" /> Tasks ({tasks.length})</TabsTrigger>
          <TabsTrigger value="blackboard" className="gap-1.5"><Layers className="w-3.5 h-3.5" /> Blackboard ({blackboard.length})</TabsTrigger>
          <TabsTrigger value="consensus" className="gap-1.5"><Vote className="w-3.5 h-3.5" /> Consensus ({consensusRounds.length})</TabsTrigger>
          <TabsTrigger value="messages" className="gap-1.5"><MessageSquare className="w-3.5 h-3.5" /> Messages ({messages.length})</TabsTrigger>
          <TabsTrigger value="events" className="gap-1.5"><Activity className="w-3.5 h-3.5" /> Events</TabsTrigger>
        </TabsList>

        {/* Topology Tab */}
        <TabsContent value="topology" className="mt-3">
          <TopologyGraph
            nodes={topology?.nodes || []}
            edges={topology?.edges || []}
            agentNames={agentNames}
          />
        </TabsContent>

        {/* Agents Tab */}
        <TabsContent value="agents" className="space-y-3 mt-3">
          <div className="flex justify-end">
            <Button size="sm" className="gap-1.5" onClick={() => setShowAddAgentDialog(true)} data-testid="button-add-agent">
              <Plus className="w-3.5 h-3.5" /> Add Agent
            </Button>
          </div>
          {agents.length === 0 ? (
            <Card className="p-6 text-center text-muted-foreground text-sm">No agents yet. Add agents to the swarm.</Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {agents.map(a => (
                <AgentCard key={a.id} agent={a} onRemove={() => removeAgent.mutate(a.id)} />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Tasks Tab */}
        <TabsContent value="tasks" className="space-y-3 mt-3">
          <div className="flex justify-end gap-2">
            <Button size="sm" className="gap-1.5" onClick={() => setShowAddTaskDialog(true)} data-testid="button-add-task">
              <Plus className="w-3.5 h-3.5" /> Add Task
            </Button>
          </div>
          {tasks.length === 0 ? (
            <Card className="p-6 text-center text-muted-foreground text-sm">No tasks in the pool. Add tasks for agents to claim.</Card>
          ) : (
            <div className="space-y-2">
              {tasks.sort((a, b) => b.priority - a.priority).map(t => (
                <Card key={t.id} className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[t.status] || ""}`}>{t.status}</Badge>
                        <span className="text-[10px] text-muted-foreground font-mono">P{t.priority}</span>
                        {t.taskType && <span className="text-[10px] text-muted-foreground capitalize">{t.taskType}</span>}
                        {t.claimedBy && (
                          <span className="text-[10px] text-blue-400">
                            <ChevronRight className="w-2.5 h-2.5 inline" /> {getAgentName(t.claimedBy)}
                          </span>
                        )}
                      </div>
                      <p className="text-xs mt-1">{t.description}</p>
                      {t.result && <p className="text-xs text-muted-foreground mt-1 line-clamp-3 bg-muted/50 rounded p-1.5">{t.result}</p>}
                    </div>
                    {t.status === "pending" && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 text-[10px] gap-1 shrink-0"
                              onClick={() => claimTask.mutate(t.id)}
                              disabled={claimTask.isPending}
                            >
                              <Crosshair className="w-3 h-3" /> Negotiate
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Auto-assign via Contract Net Protocol</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Blackboard Tab */}
        <TabsContent value="blackboard" className="space-y-3 mt-3">
          <div className="flex justify-end">
            <Button size="sm" className="gap-1.5" onClick={() => setShowBlackboardInject(true)} data-testid="button-inject-blackboard">
              <HandMetal className="w-3.5 h-3.5" /> Inject Entry (HITL)
            </Button>
          </div>
          {blackboard.length === 0 ? (
            <Card className="p-6 text-center text-muted-foreground text-sm">Blackboard is empty. Agents write here during execution, or inject entries via HITL.</Card>
          ) : (
            <div className="space-y-2">
              {blackboard.map(entry => (
                <BlackboardEntryCard key={entry.id} entry={entry} getAgentName={getAgentName} swarmId={swarmId} />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Consensus Tab */}
        <TabsContent value="consensus" className="space-y-3 mt-3">
          <div className="flex justify-end">
            <Button size="sm" className="gap-1.5" onClick={() => setShowConsensusDialog(true)} data-testid="button-start-consensus">
              <Vote className="w-3.5 h-3.5" /> Start Round
            </Button>
          </div>
          {consensusRounds.length === 0 ? (
            <Card className="p-6 text-center text-muted-foreground text-sm">No consensus rounds. Start one to have agents vote on a decision.</Card>
          ) : (
            <div className="space-y-3">
              {consensusRounds.map(r => (
                <ConsensusCard key={r.id} round={r} swarmId={swarmId} getAgentName={getAgentName} />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Messages Tab */}
        <TabsContent value="messages" className="space-y-3 mt-3">
          <div className="flex justify-end">
            <Button size="sm" className="gap-1.5" onClick={() => setShowSendMessage(true)} data-testid="button-send-message">
              <Send className="w-3.5 h-3.5" /> Inject Message (HITL)
            </Button>
          </div>
          <ScrollArea className="max-h-[500px]">
            {messages.length === 0 ? (
              <Card className="p-6 text-center text-muted-foreground text-sm">No lateral messages yet.</Card>
            ) : (
              <div className="space-y-1.5">
                {[...messages].reverse().map(m => (
                  <div key={m.id} className="flex items-start gap-2 text-xs py-1.5 border-b border-border/50 last:border-0">
                    <span className="text-[10px] text-muted-foreground w-14 shrink-0">{new Date(m.timestamp).toLocaleTimeString()}</span>
                    <Badge variant="outline" className="text-[10px] font-mono shrink-0">{m.messageType}</Badge>
                    <span className="text-blue-400 shrink-0">{getAgentName(m.fromAgentId)}</span>
                    {m.toAgentId ? (
                      <>
                        <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
                        <span className="text-green-400 shrink-0">{getAgentName(m.toAgentId)}</span>
                      </>
                    ) : (
                      <span className="text-muted-foreground text-[10px] shrink-0">(broadcast)</span>
                    )}
                    <span className="text-muted-foreground truncate">{m.content.slice(0, 120)}</span>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>

        {/* Events Tab */}
        <TabsContent value="events" className="mt-3">
          <ScrollArea className="max-h-[400px]">
            {events.length === 0 ? (
              <Card className="p-6 text-center text-muted-foreground text-sm">No events yet.</Card>
            ) : (
              <div className="space-y-1">
                {[...events].reverse().map((e, i) => (
                  <div key={i} className="flex items-center gap-2 text-[10px] py-1 border-b border-border/50 last:border-0">
                    <span className="text-muted-foreground w-16 shrink-0">{new Date(e.timestamp).toLocaleTimeString()}</span>
                    <Badge variant="outline" className="text-[10px] font-mono">{e.type}</Badge>
                    <span className="text-muted-foreground truncate">{JSON.stringify(e.data).slice(0, 120)}</span>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <AddAgentDialog open={showAddAgentDialog} onOpenChange={setShowAddAgentDialog} swarmId={swarmId} />
      <AddTaskDialog open={showAddTaskDialog} onOpenChange={setShowAddTaskDialog} swarmId={swarmId} />
      <BlackboardInjectDialog open={showBlackboardInject} onOpenChange={setShowBlackboardInject} swarmId={swarmId} />
      <SendMessageDialog open={showSendMessage} onOpenChange={setShowSendMessage} swarmId={swarmId} agents={agents} />
      <StartConsensusDialog open={showConsensusDialog} onOpenChange={setShowConsensusDialog} swarmId={swarmId} agents={agents} />
    </div>
  );
}

// ─── Topology Graph (Canvas-based) ──────────────────────────────────────────

function TopologyGraph({ nodes, edges, agentNames }: { nodes: TopoNode[]; edges: TopoEdge[]; agentNames: Record<string, string> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || nodes.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    // Clear
    ctx.clearRect(0, 0, w, h);

    // Layout: agents in a ring on the left, tasks in a column on the right
    const agentNodes = nodes.filter(n => n.type === "agent");
    const taskNodes = nodes.filter(n => n.type === "task");
    const positions: Record<string, { x: number; y: number }> = {};

    const centerX = w * 0.3;
    const centerY = h * 0.5;
    const radius = Math.min(w * 0.22, h * 0.35, 120);

    agentNodes.forEach((n, i) => {
      const angle = (2 * Math.PI * i) / Math.max(agentNodes.length, 1) - Math.PI / 2;
      positions[n.id] = {
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
      };
    });

    const taskStartY = Math.max(30, centerY - (taskNodes.length * 36) / 2);
    taskNodes.forEach((n, i) => {
      positions[n.id] = {
        x: w * 0.72,
        y: taskStartY + i * 36,
      };
    });

    // Draw edges
    edges.forEach(e => {
      const from = positions[e.from];
      const to = positions[e.to];
      if (!from || !to) return;

      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.strokeStyle = e.type === "handoff" ? "rgba(168,85,247,0.4)"
        : e.type === "claim" ? "rgba(59,130,246,0.4)"
        : e.type === "message" ? "rgba(34,197,94,0.3)"
        : "rgba(107,114,128,0.25)";
      ctx.lineWidth = e.type === "handoff" ? 2 : 1;
      ctx.setLineDash(e.type === "message" ? [4, 4] : []);
      ctx.stroke();
      ctx.setLineDash([]);

      // Arrow head
      const angle = Math.atan2(to.y - from.y, to.x - from.x);
      const headLen = 8;
      const endX = to.x - 14 * Math.cos(angle);
      const endY = to.y - 14 * Math.sin(angle);
      ctx.beginPath();
      ctx.moveTo(endX, endY);
      ctx.lineTo(endX - headLen * Math.cos(angle - 0.4), endY - headLen * Math.sin(angle - 0.4));
      ctx.moveTo(endX, endY);
      ctx.lineTo(endX - headLen * Math.cos(angle + 0.4), endY - headLen * Math.sin(angle + 0.4));
      ctx.stroke();
    });

    // Draw nodes
    const statusColors: Record<string, string> = {
      idle: "#6b7280",
      running: "#22c55e",
      working: "#22c55e",
      waiting: "#eab308",
      completed: "#3b82f6",
      failed: "#ef4444",
      terminated: "#ef4444",
      pending: "#6b7280",
      claimed: "#eab308",
    };

    nodes.forEach(n => {
      const pos = positions[n.id];
      if (!pos) return;

      const r = n.type === "agent" ? 14 : 10;
      const color = statusColors[n.status] || "#6b7280";

      ctx.beginPath();
      if (n.type === "agent") {
        ctx.arc(pos.x, pos.y, r, 0, 2 * Math.PI);
      } else {
        // Rectangle for tasks
        ctx.rect(pos.x - r, pos.y - r * 0.7, r * 2, r * 1.4);
      }
      ctx.fillStyle = color + "33";
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Label
      const label = n.type === "agent"
        ? (agentNames[n.id] || n.label || shortId(n.id))
        : (n.label?.slice(0, 20) || shortId(n.id));
      ctx.font = "10px Inter, system-ui, sans-serif";
      ctx.fillStyle = "#d1d5db";
      ctx.textAlign = "center";
      ctx.textBaseline = n.type === "agent" ? "top" : "middle";
      const textY = n.type === "agent" ? pos.y + r + 4 : pos.y;

      // Text background for readability
      const textWidth = ctx.measureText(label).width;
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(pos.x - textWidth / 2 - 2, textY - 5, textWidth + 4, 12);
      ctx.fillStyle = "#d1d5db";
      ctx.fillText(label, pos.x, textY);
    });

  }, [nodes, edges, agentNames]);

  if (nodes.length === 0) {
    return (
      <Card className="p-8 text-center text-muted-foreground text-sm">
        <Network className="w-8 h-8 mx-auto mb-2 opacity-40" />
        No topology data. Add agents and tasks to see the graph.
      </Card>
    );
  }

  return (
    <Card className="p-2">
      <div className="flex items-center gap-4 text-[10px] text-muted-foreground px-2 pb-2">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Agent</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-blue-500 inline-block" /> Task</span>
        <span className="flex items-center gap-1"><span className="w-4 border-t-2 border-purple-400 inline-block" /> Handoff</span>
        <span className="flex items-center gap-1"><span className="w-4 border-t border-blue-400 inline-block" /> Claim</span>
        <span className="flex items-center gap-1"><span className="w-4 border-t border-dashed border-green-400 inline-block" /> Message</span>
      </div>
      <canvas ref={canvasRef} className="w-full h-[280px]" style={{ imageRendering: "auto" }} />
    </Card>
  );
}

// ─── Agent Card ─────────────────────────────────────────────────────────────

function AgentCard({ agent, onRemove }: { agent: SwarmAgent; onRemove: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const StatusIcon = STATUS_ICONS[agent.status] || Clock;

  return (
    <Card className="p-3">
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <StatusIcon className={`w-3.5 h-3.5 ${agent.status === "working" || agent.status === "running" ? "animate-spin text-green-400" : "text-muted-foreground"}`} />
            <p className="text-sm font-semibold truncate">{agent.name}</p>
            <Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[agent.status] || ""}`}>{agent.status}</Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{agent.role}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {agent.canSpawn && (
            <Badge variant="outline" className="text-[10px] bg-purple-500/10 text-purple-400 border-purple-500/30">
              Spawn L{agent.spawnDepth}
            </Badge>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive">
                <XCircle className="w-3.5 h-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Terminate agent "{agent.name}"?</AlertDialogTitle>
                <AlertDialogDescription>This will remove the agent and release any claimed tasks back to the pool.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onRemove}>Terminate</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Capability bars */}
      <div className="grid grid-cols-3 gap-2 mt-2">
        <div>
          <p className="text-[9px] text-muted-foreground">Speed</p>
          <Progress value={agent.capabilityProfile.speed * 100} className="h-1" />
        </div>
        <div>
          <p className="text-[9px] text-muted-foreground">Accuracy</p>
          <Progress value={agent.capabilityProfile.accuracy * 100} className="h-1" />
        </div>
        <div>
          <p className="text-[9px] text-muted-foreground">Cost</p>
          <Progress value={agent.capabilityProfile.cost * 100} className="h-1" />
        </div>
      </div>

      <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground flex-wrap">
        <span>{formatTokens(agent.tokenUsage.total)} tokens</span>
        <span>{agent.messagesProcessed} msgs</span>
        <span>{agent.handoffsMade} handoffs</span>
        <span>{agent.tools.length} tools</span>
        {agent.capabilityProfile.specialties.length > 0 && (
          <span className="text-blue-400">{agent.capabilityProfile.specialties.join(", ")}</span>
        )}
      </div>

      {expanded && (
        <div className="mt-2 space-y-1.5 text-[10px]">
          <p className="text-muted-foreground">Instructions:</p>
          <p className="bg-muted/50 rounded p-1.5 text-xs">{agent.instructions}</p>
          {agent.tools.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-muted-foreground">Tools:</span>
              {agent.tools.map(t => <Badge key={t} variant="outline" className="text-[9px]">{t}</Badge>)}
            </div>
          )}
        </div>
      )}

      <Button size="sm" variant="ghost" className="h-5 text-[10px] text-muted-foreground mt-1 p-0" onClick={() => setExpanded(!expanded)}>
        {expanded ? "Less" : "Details"}
      </Button>
    </Card>
  );
}

// ─── Blackboard Entry Card ──────────────────────────────────────────────────

function BlackboardEntryCard({ entry, getAgentName, swarmId }: { entry: BlackboardEntry; getAgentName: (id: string) => string; swarmId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const boost = useMutation({
    mutationFn: () => apiRequest("POST", `/api/swarm/sessions/${swarmId}/blackboard/boost`, { topic: entry.topic, key: entry.key, amount: 10 }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/swarm/sessions", swarmId, "blackboard"] });
      toast({ title: "Signal boosted" });
    },
  });

  const typeColors: Record<string, string> = {
    fact: "bg-blue-500/10 text-blue-400 border-blue-500/30",
    hypothesis: "bg-purple-500/10 text-purple-400 border-purple-500/30",
    partial_result: "bg-green-500/10 text-green-400 border-green-500/30",
    signal: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
    request: "bg-orange-500/10 text-orange-400 border-orange-500/30",
    decision: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    conflict: "bg-red-500/10 text-red-400 border-red-500/30",
  };

  return (
    <Card className="p-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className={`text-[10px] ${typeColors[entry.entryType] || ""}`}>{entry.entryType}</Badge>
        <Badge variant="outline" className="text-[10px]">{entry.topic}</Badge>
        <span className="text-xs font-medium">{entry.key}</span>
        <span className="text-[10px] text-muted-foreground ml-auto">
          v{entry.version} | P{entry.priority} | {(entry.confidence * 100).toFixed(0)}% conf
        </span>
      </div>
      <p className="text-xs text-muted-foreground mt-1 line-clamp-4">{entry.content}</p>
      <div className="flex items-center gap-2 mt-1.5 text-[10px] text-muted-foreground">
        <span>by {getAgentName(entry.authorAgentId)}</span>
        {entry.readByAgentIds.length > 0 && <span>| read by {entry.readByAgentIds.length}</span>}
        {entry.expiresAt && <span>| expires {new Date(entry.expiresAt).toLocaleTimeString()}</span>}
        {entry.entryType === "signal" && (
          <Button size="sm" variant="ghost" className="h-5 text-[10px] ml-auto gap-1" onClick={() => boost.mutate()}>
            <Zap className="w-2.5 h-2.5" /> Boost
          </Button>
        )}
      </div>
    </Card>
  );
}

// ─── Consensus Round Card ───────────────────────────────────────────────────

function ConsensusCard({ round, swarmId, getAgentName }: { round: ConsensusRound; swarmId: string; getAgentName: (id: string) => string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showVote, setShowVote] = useState(false);
  const [humanAnswer, setHumanAnswer] = useState("");
  const [humanReasoning, setHumanReasoning] = useState("");

  const submitHumanVote = useMutation({
    mutationFn: (data: { answer: string; reasoning: string }) =>
      apiRequest("POST", `/api/swarm/sessions/${swarmId}/consensus/${round.id}/vote`, {
        answer: data.answer,
        reasoning: data.reasoning,
        isHumanOverride: true,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/swarm/sessions", swarmId, "consensus"] });
      setShowVote(false);
      setHumanAnswer("");
      setHumanReasoning("");
      toast({ title: "Human override vote submitted" });
    },
    onError: (e: any) => toast({ title: "Vote failed", description: e.message, variant: "destructive" }),
  });

  const isActive = round.status === "open" || round.status === "voting" || round.status === "reconciling";

  return (
    <Card className="p-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[round.status] || ""}`}>{round.status}</Badge>
        <span className="text-xs font-medium capitalize">{round.strategy.replace(/_/g, " ")}</span>
        <span className="text-[10px] text-muted-foreground ml-auto">
          Round {round.currentRound}/{round.maxRounds} | {round.votes.length} votes
        </span>
      </div>
      <p className="text-xs">{round.subject}</p>

      {/* Votes */}
      {round.votes.length > 0 && (
        <div className="space-y-1 bg-muted/30 rounded p-2">
          {round.votes.map((v, i) => (
            <div key={i} className="flex items-start gap-2 text-[10px]">
              <span className="text-blue-400 shrink-0 font-medium">{getAgentName(v.agentId)}</span>
              <span className="text-foreground">"{v.answer}"</span>
              <span className="text-muted-foreground">({(v.confidence * 100).toFixed(0)}%)</span>
              {v.reasoning && <span className="text-muted-foreground truncate">&mdash; {v.reasoning}</span>}
            </div>
          ))}
        </div>
      )}

      {/* Result */}
      {round.result && (
        <div className="bg-green-500/10 border border-green-500/30 rounded p-2">
          <p className="text-xs font-medium text-green-400">Result: {round.result.winner}</p>
          <p className="text-[10px] text-muted-foreground">{(round.result.confidence * 100).toFixed(0)}% confidence &mdash; {round.result.reasoning}</p>
        </div>
      )}

      {/* Human Override Button */}
      {isActive && (
        <div>
          {showVote ? (
            <div className="space-y-2 mt-1">
              <Input
                placeholder="Your answer / override decision"
                value={humanAnswer}
                onChange={e => setHumanAnswer(e.target.value)}
                className="h-7 text-xs"
                data-testid="input-human-vote"
              />
              <Input
                placeholder="Reasoning (optional)"
                value={humanReasoning}
                onChange={e => setHumanReasoning(e.target.value)}
                className="h-7 text-xs"
              />
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  className="h-6 text-[10px]"
                  disabled={!humanAnswer.trim() || submitHumanVote.isPending}
                  onClick={() => submitHumanVote.mutate({ answer: humanAnswer, reasoning: humanReasoning })}
                >
                  {submitHumanVote.isPending ? "Submitting..." : "Submit Override"}
                </Button>
                <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => setShowVote(false)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1" onClick={() => setShowVote(true)}>
              <HandMetal className="w-3 h-3" /> Human Override Vote
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

// ─── Create Swarm Dialog ────────────────────────────────────────────────────

function CreateSwarmDialog({ open, onOpenChange, onSubmit, isPending }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (data: Record<string, unknown>) => void;
  isPending: boolean;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [mode, setMode] = useState("collaborative");
  const [consensusStrategy, setConsensusStrategy] = useState("weighted_majority");
  const [enableRoleNegotiation, setEnableRoleNegotiation] = useState(true);
  const [enableDeadlockDetection, setEnableDeadlockDetection] = useState(true);
  const [enableDynamicSpawning, setEnableDynamicSpawning] = useState(true);
  const [enableStigmergy, setEnableStigmergy] = useState(true);
  const [enableHandoffs, setEnableHandoffs] = useState(true);
  const [maxTotalTokens, setMaxTotalTokens] = useState(1000000);
  const [maxAgents, setMaxAgents] = useState(15);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Swarm Session</DialogTitle>
          <DialogDescription>Configure a new multi-agent swarm with coordination features.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Name</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Research Swarm" data-testid="input-swarm-name" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Description</label>
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="What this swarm does" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Mode</label>
              <Select value={mode} onValueChange={setMode}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="collaborative">Collaborative</SelectItem>
                  <SelectItem value="competitive">Competitive</SelectItem>
                  <SelectItem value="exploratory">Exploratory</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Consensus</label>
              <Select value={consensusStrategy} onValueChange={setConsensusStrategy}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="majority_vote">Majority Vote</SelectItem>
                  <SelectItem value="weighted_majority">Weighted Majority</SelectItem>
                  <SelectItem value="unanimity">Unanimity</SelectItem>
                  <SelectItem value="reconciliation_agent">Reconciliation Agent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Max Agents</label>
              <Input type="number" min={2} max={50} value={maxAgents} onChange={e => setMaxAgents(parseInt(e.target.value) || 15)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Token Budget</label>
              <Input type="number" min={10000} max={10000000} step={100000} value={maxTotalTokens} onChange={e => setMaxTotalTokens(parseInt(e.target.value) || 1000000)} />
            </div>
          </div>
          <div className="space-y-2 pt-1">
            <p className="text-xs font-medium">Features</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              <div className="flex items-center gap-2"><Switch checked={enableRoleNegotiation} onCheckedChange={setEnableRoleNegotiation} /><label className="text-xs">Role Negotiation (CNP)</label></div>
              <div className="flex items-center gap-2"><Switch checked={enableDeadlockDetection} onCheckedChange={setEnableDeadlockDetection} /><label className="text-xs">Deadlock Detection</label></div>
              <div className="flex items-center gap-2"><Switch checked={enableDynamicSpawning} onCheckedChange={setEnableDynamicSpawning} /><label className="text-xs">Dynamic Spawning</label></div>
              <div className="flex items-center gap-2"><Switch checked={enableStigmergy} onCheckedChange={setEnableStigmergy} /><label className="text-xs">Stigmergy</label></div>
              <div className="flex items-center gap-2"><Switch checked={enableHandoffs} onCheckedChange={setEnableHandoffs} /><label className="text-xs">Agent Handoffs</label></div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!name.trim() || isPending} onClick={() => onSubmit({
            name, description, mode, consensusStrategy,
            enableRoleNegotiation, enableDeadlockDetection, enableDynamicSpawning,
            enableStigmergy, enableHandoffs,
            safety: { maxTotalTokens, maxAgents },
          })}>
            {isPending ? "Creating..." : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add Agent Dialog ───────────────────────────────────────────────────────

function AddAgentDialog({ open, onOpenChange, swarmId }: { open: boolean; onOpenChange: (v: boolean) => void; swarmId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [instructions, setInstructions] = useState("");
  const [canSpawn, setCanSpawn] = useState(false);
  const [speed, setSpeed] = useState([0.5]);
  const [accuracy, setAccuracy] = useState([0.5]);
  const [cost, setCost] = useState([0.5]);
  const [specialties, setSpecialties] = useState("");

  const addAgent = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiRequest("POST", `/api/swarm/sessions/${swarmId}/agents`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/swarm/sessions", swarmId] });
      qc.invalidateQueries({ queryKey: ["/api/swarm/sessions"] });
      onOpenChange(false);
      setName(""); setRole(""); setInstructions(""); setSpecialties("");
      toast({ title: "Agent added to swarm" });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Agent to Swarm</DialogTitle>
          <DialogDescription>Define a specialized agent with capabilities for Contract Net bidding.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Agent Name</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Researcher" data-testid="input-agent-name" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Role</label>
            <Input value={role} onChange={e => setRole(e.target.value)} placeholder="e.g. research" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Instructions (System Prompt)</label>
            <Textarea value={instructions} onChange={e => setInstructions(e.target.value)} rows={4} className="font-mono text-xs" placeholder="You are a research specialist..." />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Specialties (comma-separated)</label>
            <Input value={specialties} onChange={e => setSpecialties(e.target.value)} placeholder="e.g. research, data-analysis, fact-checking" />
          </div>
          <div className="space-y-2 pt-1">
            <p className="text-xs font-medium">Capability Profile (for Contract Net bidding)</p>
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <span className="text-xs w-16 text-muted-foreground">Speed</span>
                <Slider value={speed} onValueChange={setSpeed} min={0} max={1} step={0.1} className="flex-1" />
                <span className="text-xs w-8 text-right">{speed[0]}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs w-16 text-muted-foreground">Accuracy</span>
                <Slider value={accuracy} onValueChange={setAccuracy} min={0} max={1} step={0.1} className="flex-1" />
                <span className="text-xs w-8 text-right">{accuracy[0]}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs w-16 text-muted-foreground">Cost</span>
                <Slider value={cost} onValueChange={setCost} min={0} max={1} step={0.1} className="flex-1" />
                <span className="text-xs w-8 text-right">{cost[0]}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={canSpawn} onCheckedChange={setCanSpawn} />
            <label className="text-xs">Can dynamically spawn child agents</label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!name.trim() || !role.trim() || !instructions.trim() || addAgent.isPending}
            onClick={() => addAgent.mutate({
              name, role, instructions, canSpawn,
              capabilityProfile: {
                speed: speed[0],
                accuracy: accuracy[0],
                cost: cost[0],
                specialties: specialties.split(",").map(s => s.trim()).filter(Boolean),
              },
            })}>
            {addAgent.isPending ? "Adding..." : "Add Agent"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add Task Dialog ────────────────────────────────────────────────────────

function AddTaskDialog({ open, onOpenChange, swarmId }: { open: boolean; onOpenChange: (v: boolean) => void; swarmId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState(50);
  const [taskType, setTaskType] = useState("general");

  const addTask = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiRequest("POST", `/api/swarm/sessions/${swarmId}/tasks`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/swarm/sessions", swarmId] });
      qc.invalidateQueries({ queryKey: ["/api/swarm/sessions"] });
      onOpenChange(false);
      setDescription(""); setPriority(50);
      toast({ title: "Task added to pool" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Task to Pool</DialogTitle>
          <DialogDescription>Tasks attract agents via stigmergy priority signals. Higher priority = faster claim.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Task Description</label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="What needs to be done..." data-testid="input-task-desc" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Priority (0-100)</label>
              <Input type="number" min={0} max={100} value={priority} onChange={e => setPriority(parseInt(e.target.value) || 50)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Type</label>
              <Select value={taskType} onValueChange={setTaskType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="research">Research</SelectItem>
                  <SelectItem value="code">Code</SelectItem>
                  <SelectItem value="write">Write</SelectItem>
                  <SelectItem value="analyze">Analyze</SelectItem>
                  <SelectItem value="browse">Browse</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!description.trim() || addTask.isPending}
            onClick={() => addTask.mutate({ description, priority, taskType })}>
            {addTask.isPending ? "Adding..." : "Add Task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Blackboard Inject Dialog (HITL) ────────────────────────────────────────

function BlackboardInjectDialog({ open, onOpenChange, swarmId }: { open: boolean; onOpenChange: (v: boolean) => void; swarmId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [topic, setTopic] = useState("guidance");
  const [key, setKey] = useState("");
  const [content, setContent] = useState("");
  const [entryType, setEntryType] = useState("decision");
  const [confidence, setConfidence] = useState([1.0]);
  const [priority, setPriority] = useState(90);

  const inject = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiRequest("POST", `/api/swarm/sessions/${swarmId}/blackboard`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/swarm/sessions", swarmId, "blackboard"] });
      onOpenChange(false);
      setKey(""); setContent("");
      toast({ title: "Entry injected into blackboard" });
    },
    onError: (e: any) => toast({ title: "Injection failed", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><HandMetal className="w-4 h-4" /> Human-in-the-Loop: Inject Blackboard Entry</DialogTitle>
          <DialogDescription>Write directly to the shared blackboard. Agents will see this in their next read.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Topic</label>
              <Input value={topic} onChange={e => setTopic(e.target.value)} placeholder="e.g. guidance, constraints" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Key</label>
              <Input value={key} onChange={e => setKey(e.target.value)} placeholder="e.g. focus_area" />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Content</label>
            <Textarea value={content} onChange={e => setContent(e.target.value)} rows={4} placeholder="Your instruction, fact, or decision..." />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Type</label>
              <Select value={entryType} onValueChange={setEntryType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="decision">Decision</SelectItem>
                  <SelectItem value="fact">Fact</SelectItem>
                  <SelectItem value="signal">Signal</SelectItem>
                  <SelectItem value="request">Request</SelectItem>
                  <SelectItem value="hypothesis">Hypothesis</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Priority</label>
              <Input type="number" min={0} max={100} value={priority} onChange={e => setPriority(parseInt(e.target.value) || 90)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Confidence</label>
              <Slider value={confidence} onValueChange={setConfidence} min={0} max={1} step={0.05} className="mt-2" />
              <p className="text-[10px] text-muted-foreground text-center">{(confidence[0] * 100).toFixed(0)}%</p>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!topic.trim() || !key.trim() || !content.trim() || inject.isPending}
            onClick={() => inject.mutate({ topic, key, content, entryType, confidence: confidence[0], priority })}>
            {inject.isPending ? "Injecting..." : "Inject Entry"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Send Message Dialog (HITL) ─────────────────────────────────────────────

function SendMessageDialog({ open, onOpenChange, swarmId, agents }: { open: boolean; onOpenChange: (v: boolean) => void; swarmId: string; agents: SwarmAgent[] }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [toAgentId, setToAgentId] = useState<string>("__broadcast__");
  const [messageType, setMessageType] = useState("broadcast");
  const [content, setContent] = useState("");

  const send = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiRequest("POST", `/api/swarm/sessions/${swarmId}/messages`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/swarm/sessions", swarmId, "messages"] });
      onOpenChange(false);
      setContent("");
      toast({ title: "Message sent" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Send className="w-4 h-4" /> Inject Message (HITL)</DialogTitle>
          <DialogDescription>Send a message to all agents or a specific agent.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">To</label>
              <Select value={toAgentId} onValueChange={setToAgentId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__broadcast__">All Agents (Broadcast)</SelectItem>
                  {agents.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Type</label>
              <Select value={messageType} onValueChange={setMessageType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="broadcast">Broadcast</SelectItem>
                  <SelectItem value="info_request">Info Request</SelectItem>
                  <SelectItem value="delegation">Delegation</SelectItem>
                  <SelectItem value="signal">Signal</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Content</label>
            <Textarea value={content} onChange={e => setContent(e.target.value)} rows={3} placeholder="Your message to the swarm..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!content.trim() || send.isPending}
            onClick={() => send.mutate({
              toAgentId: toAgentId === "__broadcast__" ? null : toAgentId,
              messageType,
              content,
            })}>
            {send.isPending ? "Sending..." : "Send"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Start Consensus Dialog ─────────────────────────────────────────────────

function StartConsensusDialog({ open, onOpenChange, swarmId, agents }: { open: boolean; onOpenChange: (v: boolean) => void; swarmId: string; agents: SwarmAgent[] }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [subject, setSubject] = useState("");
  const [strategy, setStrategy] = useState("weighted_majority");
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);

  const start = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiRequest("POST", `/api/swarm/sessions/${swarmId}/consensus`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/swarm/sessions", swarmId, "consensus"] });
      onOpenChange(false);
      setSubject("");
      setSelectedAgents([]);
      toast({ title: "Consensus round started" });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const toggleAgent = (id: string) => {
    setSelectedAgents(prev => prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Start Consensus Round</DialogTitle>
          <DialogDescription>Select agents to deliberate on a subject.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Subject / Question</label>
            <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="What should the agents decide on?" data-testid="input-consensus-subject" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Strategy</label>
            <Select value={strategy} onValueChange={setStrategy}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="majority_vote">Majority Vote</SelectItem>
                <SelectItem value="weighted_majority">Weighted Majority</SelectItem>
                <SelectItem value="unanimity">Unanimity</SelectItem>
                <SelectItem value="reconciliation_agent">Reconciliation Agent</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Participants (min 2)</label>
            <div className="space-y-1.5">
              {agents.length === 0 ? (
                <p className="text-xs text-muted-foreground">No agents available. Add agents first.</p>
              ) : agents.map(a => (
                <div key={a.id} className="flex items-center gap-2">
                  <Switch checked={selectedAgents.includes(a.id)} onCheckedChange={() => toggleAgent(a.id)} />
                  <label className="text-xs">{a.name} ({a.role})</label>
                </div>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!subject.trim() || selectedAgents.length < 2 || start.isPending}
            onClick={() => start.mutate({ subject, strategy, agentIds: selectedAgents })}
          >
            {start.isPending ? "Starting..." : "Start Round"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
