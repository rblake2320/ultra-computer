import { useState, useEffect } from "react";
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
  ChevronDown,
  ChevronUp,
  Brain,
  Globe,
  RefreshCw,
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
  maxAgents: number;
  startedAt: number | null;
  completedAt: number | null;
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
  modelId: string | null;
  tools: string[];
  canHandoffTo: string[];
  canSpawn: boolean;
  currentTaskId: string | null;
  tokenUsage: { prompt: number; completion: number; total: number };
  messagesProcessed: number;
  handoffsMade: number;
}

interface SwarmTask {
  id: string;
  description: string;
  priority: number;
  claimedBy: string | null;
  status: string;
  result: string | null;
  createdAt: number;
}

interface BlackboardEntry {
  id: string;
  topic: string;
  key: string;
  value: string;
  author: string;
  priority: number;
  version: number;
  updatedAt: number;
}

interface HandoffRecord {
  id: string;
  fromAgentId: string;
  toAgentId: string;
  reason: string;
  timestamp: number;
}

interface ConsensusRound {
  id: string;
  question: string;
  strategy: string;
  agents: string[];
  votes: Array<{ agentId: string; answer: string; confidence: number; reasoning: string; round: number }>;
  result: string | null;
  confidence: number;
  status: string;
  rounds: number;
  maxRounds: number;
}

interface SwarmEvent {
  type: string;
  swarmId: string;
  timestamp: number;
  data: Record<string, unknown>;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  idle: "bg-muted text-muted-foreground",
  running: "bg-green-500/20 text-green-400",
  paused: "bg-yellow-500/20 text-yellow-400",
  completed: "bg-blue-500/20 text-blue-400",
  failed: "bg-red-500/20 text-red-400",
  working: "bg-green-500/20 text-green-400",
  waiting: "bg-yellow-500/20 text-yellow-400",
  handed_off: "bg-purple-500/20 text-purple-400",
  pending: "bg-muted text-muted-foreground",
  claimed: "bg-yellow-500/20 text-yellow-400",
  voting: "bg-blue-500/20 text-blue-400",
  debating: "bg-purple-500/20 text-purple-400",
  resolved: "bg-green-500/20 text-green-400",
  deadlocked: "bg-red-500/20 text-red-400",
};

const MODE_ICONS: Record<string, typeof Users> = {
  collaborative: Users,
  competitive: Target,
  exploratory: Globe,
};

function formatTime(ms: number): string {
  if (ms < 60000) return `${(ms / 1000).toFixed(0)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

function formatTokens(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return `${n}`;
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function SwarmPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selectedSwarmId, setSelectedSwarmId] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showAddAgentDialog, setShowAddAgentDialog] = useState(false);
  const [showAddTaskDialog, setShowAddTaskDialog] = useState(false);

  const { data: swarms = [], isLoading } = useQuery<SwarmSummary[]>({
    queryKey: ["/api/swarm"],
  });

  const createSwarm = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiRequest("POST", "/api/swarm", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/swarm"] });
      setShowCreateDialog(false);
      toast({ title: "Swarm created" });
    },
  });

  const deleteSwarm = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/swarm/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/swarm"] });
      if (selectedSwarmId) setSelectedSwarmId(null);
      toast({ title: "Swarm deleted" });
    },
  });

  const startSwarm = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/swarm/${id}/start`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/swarm"] });
      if (selectedSwarmId) qc.invalidateQueries({ queryKey: ["/api/swarm", selectedSwarmId] });
    },
  });

  const stopSwarm = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/swarm/${id}/stop`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/swarm"] });
      if (selectedSwarmId) qc.invalidateQueries({ queryKey: ["/api/swarm", selectedSwarmId] });
    },
  });

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center">
              <Bug className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold">Swarm Intelligence</h1>
              <p className="text-xs text-muted-foreground">
                Multi-agent coordination — blackboard, handoffs, consensus, dynamic spawning
              </p>
            </div>
          </div>
          <Button size="sm" className="gap-1.5" onClick={() => setShowCreateDialog(true)}>
            <Plus className="w-3.5 h-3.5" />
            New Swarm
          </Button>
        </div>

        {/* Swarm List */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-lg" />)}
          </div>
        ) : swarms.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">
            <Bug className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm font-medium">No swarms yet</p>
            <p className="text-xs mt-1">Create a swarm to coordinate multiple agents with shared state and consensus</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {swarms.map(swarm => {
              const ModeIcon = MODE_ICONS[swarm.mode] || Users;
              return (
                <Card
                  key={swarm.id}
                  className={`p-3 cursor-pointer transition-all hover:border-primary/50 ${selectedSwarmId === swarm.id ? "border-primary ring-1 ring-primary/30" : ""}`}
                  onClick={() => setSelectedSwarmId(swarm.id)}
                  data-testid={`card-swarm-${swarm.id}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <ModeIcon className="w-4 h-4 text-muted-foreground" />
                      <p className="text-sm font-semibold">{swarm.name}</p>
                    </div>
                    <Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[swarm.status] || ""}`}>
                      {swarm.status}
                    </Badge>
                  </div>
                  {swarm.description && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{swarm.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {swarm.agentCount}/{swarm.maxAgents}</span>
                    <span className="flex items-center gap-1"><Target className="w-3 h-3" /> {swarm.taskCount} tasks</span>
                    <span className="capitalize">{swarm.mode}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-2">
                    {swarm.status === "running" ? (
                      <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1" onClick={(e) => { e.stopPropagation(); stopSwarm.mutate(swarm.id); }}>
                        <Square className="w-3 h-3" /> Stop
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1" onClick={(e) => { e.stopPropagation(); startSwarm.mutate(swarm.id); }}>
                        <Play className="w-3 h-3" /> Start
                      </Button>
                    )}
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="ghost" className="h-6 text-[10px] text-muted-foreground hover:text-destructive" onClick={(e) => e.stopPropagation()}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete "{swarm.name}"?</AlertDialogTitle>
                          <AlertDialogDescription>This will remove the swarm, all its agents, tasks, and blackboard entries.</AlertDialogDescription>
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
            onAddAgent={() => setShowAddAgentDialog(true)}
            onAddTask={() => setShowAddTaskDialog(true)}
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

      {/* Add Agent Dialog */}
      {selectedSwarmId && (
        <AddAgentDialog
          open={showAddAgentDialog}
          onOpenChange={setShowAddAgentDialog}
          swarmId={selectedSwarmId}
        />
      )}

      {/* Add Task Dialog */}
      {selectedSwarmId && (
        <AddTaskDialog
          open={showAddTaskDialog}
          onOpenChange={setShowAddTaskDialog}
          swarmId={selectedSwarmId}
        />
      )}
    </div>
  );
}

// ─── Swarm Detail Panel ─────────────────────────────────────────────────────

function SwarmDetail({ swarmId, onAddAgent, onAddTask }: { swarmId: string; onAddAgent: () => void; onAddTask: () => void }) {
  const { data: stats } = useQuery<SwarmStats>({
    queryKey: ["/api/swarm", swarmId, "stats"],
    queryFn: () => apiRequest("GET", `/api/swarm/${swarmId}/stats`),
    refetchInterval: 3000,
  });

  const { data: agents = [] } = useQuery<SwarmAgent[]>({
    queryKey: ["/api/swarm", swarmId, "agents"],
    queryFn: () => apiRequest("GET", `/api/swarm/${swarmId}/agents`),
    refetchInterval: 3000,
  });

  const { data: tasks = [] } = useQuery<SwarmTask[]>({
    queryKey: ["/api/swarm", swarmId, "tasks"],
    queryFn: () => apiRequest("GET", `/api/swarm/${swarmId}/tasks`),
    refetchInterval: 3000,
  });

  const { data: blackboard = [] } = useQuery<BlackboardEntry[]>({
    queryKey: ["/api/swarm", swarmId, "blackboard"],
    queryFn: () => apiRequest("GET", `/api/swarm/${swarmId}/blackboard`),
    refetchInterval: 5000,
  });

  const { data: handoffs = [] } = useQuery<HandoffRecord[]>({
    queryKey: ["/api/swarm", swarmId, "handoffs"],
    queryFn: () => apiRequest("GET", `/api/swarm/${swarmId}/handoffs`),
  });

  const { data: consensusRounds = [] } = useQuery<ConsensusRound[]>({
    queryKey: ["/api/swarm", swarmId, "consensus"],
    queryFn: () => apiRequest("GET", `/api/swarm/${swarmId}/consensus`),
    refetchInterval: 3000,
  });

  const { data: events = [] } = useQuery<SwarmEvent[]>({
    queryKey: ["/api/swarm", swarmId, "events"],
    queryFn: () => apiRequest("GET", `/api/swarm/${swarmId}/events?limit=30`),
    refetchInterval: 3000,
  });

  if (!stats) return <Skeleton className="h-64 rounded-lg" />;

  const completionPct = stats.taskCount > 0 ? (stats.completedTasks / stats.taskCount) * 100 : 0;

  return (
    <div className="space-y-4">
      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
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
      </div>

      {/* Tabs */}
      <Tabs defaultValue="agents">
        <TabsList className="flex-wrap">
          <TabsTrigger value="agents" className="gap-1.5"><Users className="w-3.5 h-3.5" /> Agents ({agents.length})</TabsTrigger>
          <TabsTrigger value="tasks" className="gap-1.5"><Target className="w-3.5 h-3.5" /> Tasks ({tasks.length})</TabsTrigger>
          <TabsTrigger value="blackboard" className="gap-1.5"><Layers className="w-3.5 h-3.5" /> Blackboard ({blackboard.length})</TabsTrigger>
          <TabsTrigger value="handoffs" className="gap-1.5"><ArrowRightLeft className="w-3.5 h-3.5" /> Handoffs ({handoffs.length})</TabsTrigger>
          <TabsTrigger value="consensus" className="gap-1.5"><Vote className="w-3.5 h-3.5" /> Consensus ({consensusRounds.length})</TabsTrigger>
          <TabsTrigger value="events" className="gap-1.5"><Activity className="w-3.5 h-3.5" /> Events</TabsTrigger>
        </TabsList>

        {/* Agents Tab */}
        <TabsContent value="agents" className="space-y-3 mt-3">
          <div className="flex justify-end">
            <Button size="sm" className="gap-1.5" onClick={onAddAgent}><Plus className="w-3.5 h-3.5" /> Add Agent</Button>
          </div>
          {agents.length === 0 ? (
            <Card className="p-6 text-center text-muted-foreground text-sm">No agents yet. Add one to get started.</Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {agents.map(a => (
                <Card key={a.id} className="p-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold">{a.name}</p>
                        <Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[a.status] || ""}`}>{a.status}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{a.role}</p>
                    </div>
                    {a.canSpawn && <Badge variant="outline" className="text-[10px] bg-purple-500/10 text-purple-400 border-purple-500/30">Can Spawn</Badge>}
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
                    <span>{formatTokens(a.tokenUsage.total)} tokens</span>
                    <span>{a.messagesProcessed} msgs</span>
                    <span>{a.handoffsMade} handoffs</span>
                    <span>{a.tools.length} tools</span>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Tasks Tab */}
        <TabsContent value="tasks" className="space-y-3 mt-3">
          <div className="flex justify-end">
            <Button size="sm" className="gap-1.5" onClick={onAddTask}><Plus className="w-3.5 h-3.5" /> Add Task</Button>
          </div>
          {tasks.length === 0 ? (
            <Card className="p-6 text-center text-muted-foreground text-sm">No tasks in the pool. Add tasks for agents to claim.</Card>
          ) : (
            <div className="space-y-2">
              {tasks.map(t => (
                <Card key={t.id} className="p-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[t.status] || ""}`}>{t.status}</Badge>
                        <span className="text-[10px] text-muted-foreground">P{t.priority}</span>
                      </div>
                      <p className="text-xs mt-1">{t.description}</p>
                      {t.result && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{t.result}</p>}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Blackboard Tab */}
        <TabsContent value="blackboard" className="space-y-3 mt-3">
          {blackboard.length === 0 ? (
            <Card className="p-6 text-center text-muted-foreground text-sm">Blackboard is empty. Agents write here during execution.</Card>
          ) : (
            <div className="space-y-2">
              {blackboard.map(entry => (
                <Card key={entry.id} className="p-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-400 border-blue-500/30">{entry.topic}</Badge>
                    <span className="text-xs font-medium">{entry.key}</span>
                    <span className="text-[10px] text-muted-foreground ml-auto">v{entry.version} | P{entry.priority}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-3">{entry.value}</p>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Handoffs Tab */}
        <TabsContent value="handoffs" className="space-y-3 mt-3">
          {handoffs.length === 0 ? (
            <Card className="p-6 text-center text-muted-foreground text-sm">No handoffs yet. Agents transfer control to each other here.</Card>
          ) : (
            <div className="space-y-2">
              {handoffs.map(h => (
                <Card key={h.id} className="p-3">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-medium">{h.fromAgentId.slice(0, 8)}...</span>
                    <ArrowRightLeft className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="font-medium">{h.toAgentId.slice(0, 8)}...</span>
                    <span className="text-[10px] text-muted-foreground ml-auto">{new Date(h.timestamp).toLocaleTimeString()}</span>
                  </div>
                  {h.reason && <p className="text-xs text-muted-foreground mt-1">{h.reason}</p>}
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Consensus Tab */}
        <TabsContent value="consensus" className="space-y-3 mt-3">
          {consensusRounds.length === 0 ? (
            <Card className="p-6 text-center text-muted-foreground text-sm">No consensus rounds. Agents vote here to resolve disagreements.</Card>
          ) : (
            <div className="space-y-2">
              {consensusRounds.map(r => (
                <Card key={r.id} className="p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[r.status] || ""}`}>{r.status}</Badge>
                    <span className="text-xs font-medium capitalize">{r.strategy.replace(/_/g, " ")}</span>
                    <span className="text-[10px] text-muted-foreground ml-auto">Round {r.rounds}/{r.maxRounds}</span>
                  </div>
                  <p className="text-xs">{r.question}</p>
                  {r.result && (
                    <div className="bg-muted/50 rounded p-2">
                      <p className="text-xs font-medium">Result: {r.result}</p>
                      <p className="text-[10px] text-muted-foreground">{(r.confidence * 100).toFixed(0)}% confidence, {r.votes.length} votes</p>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
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
                    <span className="text-muted-foreground truncate">{JSON.stringify(e.data).slice(0, 100)}</span>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
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
  const [maxAgents, setMaxAgents] = useState(10);
  const [consensusStrategy, setConsensusStrategy] = useState("majority_vote");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Swarm</DialogTitle>
          <DialogDescription>Configure a new multi-agent swarm.</DialogDescription>
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
              <label className="text-xs font-medium">Max Agents</label>
              <Input type="number" min={2} max={50} value={maxAgents} onChange={e => setMaxAgents(parseInt(e.target.value) || 10)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Consensus Strategy</label>
            <Select value={consensusStrategy} onValueChange={setConsensusStrategy}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="majority_vote">Majority Vote</SelectItem>
                <SelectItem value="weighted_confidence">Weighted Confidence</SelectItem>
                <SelectItem value="debate">Debate Rounds</SelectItem>
                <SelectItem value="unanimous">Unanimous</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!name.trim() || isPending} onClick={() => onSubmit({ name, description, mode, maxAgents, consensusStrategy })}>
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

  const addAgent = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiRequest("POST", `/api/swarm/${swarmId}/agents`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/swarm", swarmId] });
      qc.invalidateQueries({ queryKey: ["/api/swarm"] });
      onOpenChange(false);
      setName(""); setRole(""); setInstructions("");
      toast({ title: "Agent added" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Agent to Swarm</DialogTitle>
          <DialogDescription>Define a specialized agent with a role and instructions.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Agent Name</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Researcher" data-testid="input-agent-name" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Role</label>
            <Input value={role} onChange={e => setRole(e.target.value)} placeholder="e.g. Deep web research and data gathering" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Instructions (System Prompt)</label>
            <Textarea value={instructions} onChange={e => setInstructions(e.target.value)} rows={5} className="font-mono text-xs" placeholder="You are a research specialist..." />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={canSpawn} onCheckedChange={setCanSpawn} />
            <label className="text-xs">Can dynamically spawn new agents</label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!name.trim() || !role.trim() || !instructions.trim() || addAgent.isPending}
            onClick={() => addAgent.mutate({ name, role, instructions, canSpawn })}>
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

  const addTask = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiRequest("POST", `/api/swarm/${swarmId}/tasks`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/swarm", swarmId] });
      qc.invalidateQueries({ queryKey: ["/api/swarm"] });
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
          <DialogDescription>Tasks are claimed by agents based on priority (stigmergy).</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Task Description</label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="What needs to be done..." data-testid="input-task-desc" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Priority (0-100)</label>
            <Input type="number" min={0} max={100} value={priority} onChange={e => setPriority(parseInt(e.target.value) || 50)} />
            <p className="text-[10px] text-muted-foreground">Higher priority attracts agents faster (stigmergy signal)</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!description.trim() || addTask.isPending}
            onClick={() => addTask.mutate({ description, priority })}>
            {addTask.isPending ? "Adding..." : "Add Task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
