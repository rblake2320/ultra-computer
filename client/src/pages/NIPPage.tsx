import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, connectEventSource } from "../lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { ScrollArea } from "../components/ui/scroll-area";
import { Separator } from "../components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "../components/ui/dialog";
import { useToast } from "../hooks/use-toast";
import {
  Plus, Send, Shield, Activity, MessageSquare, FileText, Users,
  AlertTriangle, CheckCircle2, XCircle, Pause, Play, StopCircle,
  RefreshCw, Loader2, ChevronDown, ChevronUp, Copy, Clock,
  Zap, Lock, Globe, Building2, Eye, Terminal, BarChart3, Wifi,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────────

type SessionState = "negotiating" | "active" | "paused" | "completed" | "terminated" | "locked";
type AccessTier = "public" | "verified" | "corporate" | "private";
type AlertSeverity = "info" | "warning" | "critical" | "lockdown";
type MessageRole = "instructor" | "executor" | "system" | "monitor";
type ReportOutcome = "success" | "partial" | "failure" | "terminated";

interface AgentProfile {
  agentName: string;
  organizationName: string;
  modelProvider: string;
  modelId: string;
  modelTier: string;
}

interface TaskScope {
  objective: string;
  allowedActions: string[];
  forbiddenActions: string[];
  maxDuration: number;
  maxMessages: number;
}

interface NIPSession {
  id: string;
  state: SessionState;
  instructorProfile: AgentProfile;
  executorProfile: AgentProfile;
  taskScope: TaskScope;
  accessTier: AccessTier;
  messageCount: number;
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  endedAt?: number;
}

interface NIPMessage {
  id: string;
  sessionId: string;
  role: MessageRole;
  type: string;
  content: string;
  sequence: number;
  timestamp: number;
  metadata?: {
    toolsUsed?: string[];
    executionResult?: string;
    confidenceScore?: number;
    [key: string]: any;
  };
}

interface NIPAlert {
  id: string;
  sessionId: string;
  severity: AlertSeverity;
  type: string;
  message: string;
  triggeredBy?: string;
  timestamp: number;
  autoAction?: string;
}

interface NIPStats {
  activeSessions: number;
  completedSessions: number;
  totalMessages: number;
  alertCount: number;
}

interface NIPReport {
  id: string;
  sessionId: string;
  title: string;
  outcome: ReportOutcome;
  metrics: {
    totalMessages: number;
    durationMinutes: number;
    alertCount: number;
    toolsUsed: number;
    adaptations: number;
  };
  summary: string;
  readableReport: string;
  generatedAt: number;
}

interface TrustedParty {
  id: string;
  organizationId: string;
  organizationName: string;
  accessTier: AccessTier;
  allowedScopes: string[];
  maxConcurrentSessions: number;
  approved: boolean;
  lastActivity?: number;
  createdAt: number;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function formatDuration(startMs: number, endMs?: number): string {
  const diff = Math.floor(((endMs ?? Date.now()) - startMs) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ${diff % 60}s`;
  return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`;
}

function truncateId(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

function stateColor(state: SessionState): string {
  switch (state) {
    case "negotiating": return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
    case "active":      return "bg-green-500/20 text-green-400 border-green-500/30";
    case "paused":      return "bg-blue-500/20 text-blue-400 border-blue-500/30";
    case "completed":   return "bg-slate-500/20 text-slate-400 border-slate-500/30";
    case "terminated":  return "bg-red-500/20 text-red-400 border-red-500/30";
    case "locked":      return "bg-purple-500/20 text-purple-400 border-purple-500/30";
  }
}

function severityColor(s: AlertSeverity): string {
  switch (s) {
    case "info":     return "bg-blue-500/20 text-blue-400 border-blue-500/30";
    case "warning":  return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
    case "critical": return "bg-orange-500/20 text-orange-400 border-orange-500/30";
    case "lockdown": return "bg-red-600/30 text-red-400 border-red-600/40";
  }
}

function tierColor(t: AccessTier): string {
  switch (t) {
    case "public":    return "bg-slate-500/20 text-slate-400 border-slate-500/30";
    case "verified":  return "bg-blue-500/20 text-blue-400 border-blue-500/30";
    case "corporate": return "bg-indigo-500/20 text-indigo-400 border-indigo-500/30";
    case "private":   return "bg-purple-500/20 text-purple-400 border-purple-500/30";
  }
}

function outcomeColor(o: ReportOutcome): string {
  switch (o) {
    case "success":    return "bg-green-500/20 text-green-400 border-green-500/30";
    case "partial":    return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
    case "failure":    return "bg-red-500/20 text-red-400 border-red-500/30";
    case "terminated": return "bg-slate-500/20 text-slate-400 border-slate-500/30";
  }
}

function tierIcon(t: AccessTier) {
  switch (t) {
    case "public":    return <Globe className="w-3 h-3" />;
    case "verified":  return <CheckCircle2 className="w-3 h-3" />;
    case "corporate": return <Building2 className="w-3 h-3" />;
    case "private":   return <Lock className="w-3 h-3" />;
  }
}

// ─── Tab 1: Sessions ───────────────────────────────────────────────────────────

function SessionsTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [newSessionOpen, setNewSessionOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [stateFilter, setStateFilter] = useState<string>("all");
  const [confirmTerminate, setConfirmTerminate] = useState<string | null>(null);

  // Stats
  const { data: stats } = useQuery<NIPStats>({ queryKey: ["/api/nip/sessions/stats"] });

  // Sessions list
  const queryKey = stateFilter === "all" ? "/api/nip/sessions" : `/api/nip/sessions?state=${stateFilter}`;
  const { data: sessions = [], isLoading } = useQuery<NIPSession[]>({ queryKey: [queryKey] });

  // Session detail
  const { data: sessionDetail, isLoading: detailLoading, isError: detailError } = useQuery<NIPSession>({
    queryKey: [`/api/nip/sessions/${expandedId}`],
    enabled: !!expandedId,
  });

  // Mutations
  const pauseMut = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/nip/sessions/${id}/pause`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/nip/sessions"] }); toast({ title: "Session paused" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const resumeMut = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/nip/sessions/${id}/resume`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/nip/sessions"] }); toast({ title: "Session resumed" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const terminateMut = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/nip/sessions/${id}/terminate`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/nip/sessions"] }); toast({ title: "Session terminated" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const completeMut = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/nip/sessions/${id}/complete`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/nip/sessions"] }); toast({ title: "Session completed" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const reportMut = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/nip/sessions/${id}/report`),
    onSuccess: () => { toast({ title: "Report generated" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-6">
      {/* Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Active Sessions", value: stats?.activeSessions ?? "—", icon: <Activity className="w-4 h-4 text-green-400" />, color: "text-green-400" },
          { label: "Completed", value: stats?.completedSessions ?? "—", icon: <CheckCircle2 className="w-4 h-4 text-slate-400" />, color: "text-slate-300" },
          { label: "Total Messages", value: stats?.totalMessages ?? "—", icon: <MessageSquare className="w-4 h-4 text-indigo-400" />, color: "text-indigo-400" },
          { label: "Alerts", value: stats?.alertCount ?? "—", icon: <AlertTriangle className="w-4 h-4 text-amber-400" />, color: "text-amber-400" },
        ].map((s) => (
          <Card key={s.label} className="bg-card border-border">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-background">{s.icon}</div>
              <div>
                <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
                <div className="text-xs text-muted-foreground">{s.label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={stateFilter} onValueChange={setStateFilter}>
          <SelectTrigger className="w-44 h-9">
            <SelectValue placeholder="Filter by state" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All States</SelectItem>
            <SelectItem value="negotiating">Negotiating</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="paused">Paused</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="terminated">Terminated</SelectItem>
            <SelectItem value="locked">Locked</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="ghost" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ["/api/nip/sessions"] })}>
          <RefreshCw className="w-4 h-4 mr-1.5" /> Refresh
        </Button>
        <div className="ml-auto">
          <Dialog open={newSessionOpen} onOpenChange={setNewSessionOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white">
                <Plus className="w-4 h-4 mr-1.5" /> New Session
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create NIP Session</DialogTitle>
              </DialogHeader>
              <NewSessionForm onSuccess={() => { setNewSessionOpen(false); qc.invalidateQueries({ queryKey: ["/api/nip/sessions"] }); }} />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Session Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : sessions.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Terminal className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>No sessions found. Create one to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => (
            <div key={session.id}>
              <Card
                className={`bg-card border-border cursor-pointer transition-all hover:border-indigo-500/40 ${expandedId === session.id ? "border-indigo-500/50" : ""}`}
                onClick={() => setExpandedId(expandedId === session.id ? null : session.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs text-muted-foreground bg-muted px-2 py-1 rounded">{truncateId(session.id)}</span>
                      <Badge className={`text-xs border ${stateColor(session.state)}`}>{session.state}</Badge>
                      <Badge className={`text-xs border ${tierColor(session.accessTier)}`}>
                        <span className="flex items-center gap-1">{tierIcon(session.accessTier)}{session.accessTier}</span>
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" />{session.messageCount} msgs</span>
                      {session.startedAt && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatDuration(session.startedAt, session.endedAt)}</span>}
                      <span>{relativeTime(session.createdAt)}</span>
                      {expandedId === session.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-sm">
                    <span className="text-indigo-400 font-medium">{session.instructorProfile.organizationName}</span>
                    <span className="text-muted-foreground">→</span>
                    <span className="text-emerald-400 font-medium">{session.executorProfile.organizationName}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground truncate">{session.taskScope.objective}</p>
                </CardContent>
              </Card>

              {/* Expanded Detail */}
              {expandedId === session.id && (
                <Card className="bg-background border-indigo-500/30 border-t-0 rounded-t-none">
                  <CardContent className="p-5 space-y-4">
                    {detailLoading && (
                      <p className="text-xs text-muted-foreground">Loading session details...</p>
                    )}
                    {detailError && (
                      <p className="text-xs text-destructive">Failed to load session details.</p>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Instructor */}
                      <div className="space-y-2">
                        <h4 className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">Instructor Agent</h4>
                        <div className="space-y-1 text-sm">
                          <div className="flex gap-2"><span className="text-muted-foreground w-28">Agent Name</span><span>{session.instructorProfile.agentName}</span></div>
                          <div className="flex gap-2"><span className="text-muted-foreground w-28">Organization</span><span>{session.instructorProfile.organizationName}</span></div>
                          <div className="flex gap-2"><span className="text-muted-foreground w-28">Provider</span><span>{session.instructorProfile.modelProvider}</span></div>
                          <div className="flex gap-2"><span className="text-muted-foreground w-28">Model</span><span className="font-mono text-xs">{session.instructorProfile.modelId}</span></div>
                          <div className="flex gap-2"><span className="text-muted-foreground w-28">Tier</span><span>{session.instructorProfile.modelTier}</span></div>
                        </div>
                      </div>
                      {/* Executor */}
                      <div className="space-y-2">
                        <h4 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Executor Agent</h4>
                        <div className="space-y-1 text-sm">
                          <div className="flex gap-2"><span className="text-muted-foreground w-28">Agent Name</span><span>{session.executorProfile.agentName}</span></div>
                          <div className="flex gap-2"><span className="text-muted-foreground w-28">Organization</span><span>{session.executorProfile.organizationName}</span></div>
                          <div className="flex gap-2"><span className="text-muted-foreground w-28">Provider</span><span>{session.executorProfile.modelProvider}</span></div>
                          <div className="flex gap-2"><span className="text-muted-foreground w-28">Model</span><span className="font-mono text-xs">{session.executorProfile.modelId}</span></div>
                          <div className="flex gap-2"><span className="text-muted-foreground w-28">Tier</span><span>{session.executorProfile.modelTier}</span></div>
                        </div>
                      </div>
                    </div>
                    <Separator />
                    {/* Task Scope */}
                    <div className="space-y-2">
                      <h4 className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Task Scope</h4>
                      <p className="text-sm">{session.taskScope.objective}</p>
                      <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                        <div><span className="font-medium text-foreground">Allowed: </span>{session.taskScope.allowedActions.join(", ") || "none"}</div>
                        <div><span className="font-medium text-foreground">Forbidden: </span>{session.taskScope.forbiddenActions.join(", ") || "none"}</div>
                        <div><span className="font-medium text-foreground">Max Duration: </span>{Math.round(session.taskScope.maxDuration / 60_000)}m</div>
                        <div><span className="font-medium text-foreground">Max Messages: </span>{session.taskScope.maxMessages}</div>
                      </div>
                    </div>
                    <Separator />
                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {session.state === "active" && (
                        <Button size="sm" variant="outline" className="border-blue-500/40 text-blue-400 hover:bg-blue-500/10" onClick={(e) => { e.stopPropagation(); pauseMut.mutate(session.id); }}>
                          <Pause className="w-3.5 h-3.5 mr-1.5" /> Pause
                        </Button>
                      )}
                      {session.state === "paused" && (
                        <Button size="sm" variant="outline" className="border-green-500/40 text-green-400 hover:bg-green-500/10" onClick={(e) => { e.stopPropagation(); resumeMut.mutate(session.id); }}>
                          <Play className="w-3.5 h-3.5 mr-1.5" /> Resume
                        </Button>
                      )}
                      {(session.state === "active" || session.state === "paused") && (
                        <Button size="sm" variant="outline" className="border-slate-500/40 text-slate-400 hover:bg-slate-500/10" onClick={(e) => { e.stopPropagation(); completeMut.mutate(session.id); }}>
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Complete
                        </Button>
                      )}
                      {session.state !== "terminated" && session.state !== "completed" && (
                        <Button size="sm" variant="outline" className="border-red-500/40 text-red-400 hover:bg-red-500/10" onClick={(e) => { e.stopPropagation(); setConfirmTerminate(session.id); }}>
                          <StopCircle className="w-3.5 h-3.5 mr-1.5" /> Terminate
                        </Button>
                      )}
                      <Button size="sm" variant="outline" className="border-amber-500/40 text-amber-400 hover:bg-amber-500/10" onClick={(e) => { e.stopPropagation(); reportMut.mutate(session.id); }}>
                        <FileText className="w-3.5 h-3.5 mr-1.5" /> Generate Report
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Terminate Confirm Dialog */}
      <Dialog open={!!confirmTerminate} onOpenChange={() => setConfirmTerminate(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle className="text-red-400">Terminate Session</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This will immediately stop the session. This action cannot be undone.</p>
          <div className="flex gap-2 mt-2">
            <Button variant="outline" onClick={() => setConfirmTerminate(null)}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={() => { terminateMut.mutate(confirmTerminate!); setConfirmTerminate(null); }}>
              Terminate
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── New Session Form ──────────────────────────────────────────────────────────

function NewSessionForm({ onSuccess }: { onSuccess: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    instructorAgentId: "", instructorAgentName: "", instructorOrgId: "", instructorOrgName: "", instructorProvider: "", instructorModelId: "", instructorModelTier: "standard",
    executorAgentId: "", executorAgentName: "", executorOrgId: "", executorOrgName: "", executorProvider: "", executorModelId: "", executorModelTier: "standard",
    objective: "", allowedActions: "", forbiddenActions: "", maxDuration: "60", maxMessages: "100",
    accessTier: "verified" as AccessTier,
  });

  const createMut = useMutation({
    mutationFn: async (data: typeof form) => {
      const now = Date.now();
      const instructorOrgId = data.instructorOrgId || `org-instructor-${now}`;
      const executorOrgId = data.executorOrgId || `org-executor-${now}`;
      // Use "public" as the tier for trusted-party registration since the access tier
      // enum on the party endpoint is the same as on the session.
      const partyTier = (["public","verified","corporate","private"].includes(data.accessTier)
        ? data.accessTier : "public") as string;

      // Auto-register and approve both organizations as trusted parties
      async function ensureTrustedParty(orgId: string, orgName: string, tier: string) {
        const parties: any[] = await apiRequest("GET", "/api/nip/trusted-parties");
        let party = parties.find((p: any) => p.organizationId === orgId);
        if (!party) {
          party = await apiRequest("POST", "/api/nip/trusted-parties", {
            organizationId: orgId,
            organizationName: orgName,
            accessTier: tier,
            allowedScopes: ["*"],
            maxConcurrentSessions: 10,
          });
        }
        if (!party.approved) {
          party = await apiRequest("POST", `/api/nip/trusted-parties/${party.id}/approve`, {
            approvedBy: "system-auto",
          });
        }
        return party;
      }

      await Promise.all([
        ensureTrustedParty(instructorOrgId, data.instructorOrgName || instructorOrgId, partyTier),
        ensureTrustedParty(executorOrgId, data.executorOrgName || executorOrgId, partyTier),
      ]);

      const session = await apiRequest("POST", "/api/nip/sessions", {
        instructorProfile: {
          agentId: data.instructorAgentId || `instructor-${now}`,
          agentName: data.instructorAgentName,
          organizationId: instructorOrgId,
          organizationName: data.instructorOrgName || instructorOrgId,
          modelProvider: data.instructorProvider || "local",
          modelId: data.instructorModelId || "unknown",
          modelTier: data.instructorModelTier || "standard",
        },
        executorProfile: {
          agentId: data.executorAgentId || `executor-${now}`,
          agentName: data.executorAgentName,
          organizationId: executorOrgId,
          organizationName: data.executorOrgName || executorOrgId,
          modelProvider: data.executorProvider || "local",
          modelId: data.executorModelId || "unknown",
          modelTier: data.executorModelTier || "standard",
        },
        taskScope: {
          objective: data.objective,
          allowedActions: data.allowedActions.split(",").map(s => s.trim()).filter(Boolean),
          forbiddenActions: data.forbiddenActions.split(",").map(s => s.trim()).filter(Boolean),
          maxDuration: (parseInt(data.maxDuration) || 60) * 60_000,
          maxMessages: parseInt(data.maxMessages) || 100,
        },
        accessTier: data.accessTier,
      });
      // Auto-negotiate after creation
      await apiRequest("POST", `/api/nip/sessions/${session.id}/negotiate`);
      return session;
    },
    onSuccess: () => { toast({ title: "Session created and negotiation started" }); onSuccess(); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const field = (key: keyof typeof form, label: string, placeholder?: string, type?: string) => (
    <div className="space-y-1">
      <label className="text-xs text-muted-foreground">{label}</label>
      <Input
        value={form[key]}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        placeholder={placeholder}
        type={type}
        className="h-8 text-sm"
      />
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Instructor */}
      <div>
        <h3 className="text-sm font-semibold text-indigo-400 mb-3">Instructor Agent</h3>
        <div className="grid grid-cols-2 gap-3">
          {field("instructorAgentId", "Agent ID", "instructor-agent-001")}
          {field("instructorAgentName", "Agent Name", "InstructorBot-v2")}
          {field("instructorOrgId", "Org ID", "acme-corp")}
          {field("instructorOrgName", "Org Name", "Acme Corp")}
          {field("instructorProvider", "Model Provider", "openai")}
          {field("instructorModelId", "Model ID", "gpt-4o")}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Model Tier</label>
            <Select value={form.instructorModelTier} onValueChange={v => setForm(f => ({ ...f, instructorModelTier: v }))}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["standard", "advanced", "premium", "frontier"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
      <Separator />
      {/* Executor */}
      <div>
        <h3 className="text-sm font-semibold text-emerald-400 mb-3">Executor Agent</h3>
        <div className="grid grid-cols-2 gap-3">
          {field("executorAgentId", "Agent ID", "executor-agent-001")}
          {field("executorAgentName", "Agent Name", "ExecutorBot-v1")}
          {field("executorOrgId", "Org ID", "beta-llc")}
          {field("executorOrgName", "Org Name", "Beta LLC")}
          {field("executorProvider", "Model Provider", "anthropic")}
          {field("executorModelId", "Model ID", "claude-3-5-sonnet")}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Model Tier</label>
            <Select value={form.executorModelTier} onValueChange={v => setForm(f => ({ ...f, executorModelTier: v }))}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["standard", "advanced", "premium", "frontier"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
      <Separator />
      {/* Task Scope */}
      <div>
        <h3 className="text-sm font-semibold text-amber-400 mb-3">Task Scope</h3>
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Objective</label>
            <Textarea
              value={form.objective}
              onChange={e => setForm(f => ({ ...f, objective: e.target.value }))}
              placeholder="Describe the task objective in detail..."
              rows={3}
              className="text-sm resize-none"
            />
          </div>
          <div className="grid grid-cols-1 gap-3">
            {field("allowedActions", "Allowed Actions (comma-separated)", "read_file, write_file, search_web")}
            {field("forbiddenActions", "Forbidden Actions (comma-separated)", "delete_data, access_prod, send_email")}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {field("maxDuration", "Max Duration (minutes)", "60", "number")}
            {field("maxMessages", "Max Messages", "100", "number")}
          </div>
        </div>
      </div>
      <Separator />
      {/* Access */}
      <div>
        <h3 className="text-sm font-semibold text-slate-300 mb-3">Access Tier</h3>
        <Select value={form.accessTier} onValueChange={v => setForm(f => ({ ...f, accessTier: v as AccessTier }))}>
          <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="public">Public — any agent can connect</SelectItem>
            <SelectItem value="verified">Verified — requires identity verification</SelectItem>
            <SelectItem value="corporate">Corporate — registered corporations only</SelectItem>
            <SelectItem value="private">Private — invitation only</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button
        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
        onClick={() => createMut.mutate(form)}
        disabled={createMut.isPending || !form.objective || !form.instructorAgentName || !form.executorAgentName}
      >
        {createMut.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating…</> : <>Create & Negotiate</>}
      </Button>
    </div>
  );
}

// ─── Tab 2: Live Conversation ──────────────────────────────────────────────────

function ConversationTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string>("");
  const [msgRole, setMsgRole] = useState<MessageRole>("instructor");
  const [msgType, setMsgType] = useState("instruction");
  const [msgContent, setMsgContent] = useState("");
  const [expandedMsgId, setExpandedMsgId] = useState<string | null>(null);

  // Active sessions for selector
  const { data: activeSessions = [] } = useQuery<NIPSession[]>({ queryKey: ["/api/nip/sessions?state=active"] });

  // Messages
  const { data: messages = [], refetch: refetchMessages } = useQuery<NIPMessage[]>({
    queryKey: [`/api/nip/sessions/${selectedSessionId}/messages`],
    enabled: !!selectedSessionId,
    refetchInterval: 0,
  });

  // SSE for real-time updates
  useEffect(() => {
    if (!selectedSessionId) return;
    return connectEventSource(
      `/api/nip/sessions/${selectedSessionId}/stream`,
      {
        onMessage: (ev) => {
        try {
          const data = JSON.parse(ev.data);
          if (data.type === "message" || data.type === "new_message") {
            qc.setQueryData<NIPMessage[]>([`/api/nip/sessions/${selectedSessionId}/messages`], (old = []) => {
              if (old.find(m => m.id === data.message?.id)) return old;
              return [...old, data.message];
            });
          }
        } catch (_) {}
        },
      },
    );
  }, [selectedSessionId, qc]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  const sendMut = useMutation({
    mutationFn: () => apiRequest("POST", `/api/nip/sessions/${selectedSessionId}/messages`, {
      role: msgRole, type: msgType, content: msgContent,
    }),
    onSuccess: () => {
      setMsgContent("");
      refetchMessages();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function bubbleClass(role: MessageRole): string {
    switch (role) {
      case "instructor": return "ml-auto bg-indigo-600/30 border-indigo-500/40 text-right";
      case "executor":   return "mr-auto bg-emerald-700/30 border-emerald-600/40";
      case "monitor":    return "mx-auto bg-amber-700/30 border-amber-600/40 text-center";
      case "system":     return "mx-auto bg-slate-700/30 border-slate-600/40 text-center";
    }
  }

  function roleBadgeClass(role: MessageRole): string {
    switch (role) {
      case "instructor": return "bg-indigo-500/20 text-indigo-300 border-indigo-500/30";
      case "executor":   return "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";
      case "monitor":    return "bg-amber-500/20 text-amber-300 border-amber-500/30";
      case "system":     return "bg-slate-500/20 text-slate-300 border-slate-500/30";
    }
  }

  const msgTypes = {
    instructor: ["instruction", "clarification", "correction", "approval", "rejection", "query"],
    executor: ["acknowledgment", "progress_update", "result", "question", "error_report", "completion"],
    system: ["session_start", "session_end", "negotiation_complete", "limit_warning", "heartbeat"],
    monitor: ["safety_check", "policy_violation", "performance_alert", "lockdown_warning", "audit_log"],
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Session Selector */}
      <div className="flex items-center gap-3">
        <Select value={selectedSessionId} onValueChange={setSelectedSessionId}>
          <SelectTrigger className="w-72 h-9">
            <SelectValue placeholder="Select an active session…" />
          </SelectTrigger>
          <SelectContent>
            {activeSessions.length === 0 && <SelectItem value="__none__" disabled>No active sessions</SelectItem>}
            {activeSessions.map(s => (
              <SelectItem key={s.id} value={s.id}>
                {truncateId(s.id)} — {s.instructorProfile.organizationName} → {s.executorProfile.organizationName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedSessionId && (
          <Button variant="ghost" size="sm" onClick={() => refetchMessages()}>
            <RefreshCw className="w-4 h-4 mr-1.5" /> Sync
          </Button>
        )}
        {selectedSessionId && (
          <div className="flex items-center gap-1.5 text-xs text-green-400 ml-auto">
            <Wifi className="w-3.5 h-3.5 animate-pulse" /> Live
          </div>
        )}
      </div>

      {!selectedSessionId ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <div className="text-center">
            <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>Select an active session to view the conversation</p>
          </div>
        </div>
      ) : (
        <>
          {/* Chat Area */}
          <ScrollArea className="flex-1 min-h-0 h-[480px]">
            <div ref={scrollRef} className="p-4 space-y-3">
              {messages.length === 0 && (
                <p className="text-center text-muted-foreground text-sm py-8">No messages yet in this session.</p>
              )}
              {messages.map((msg) => (
                <div key={msg.id} className={`max-w-[80%] rounded-xl border p-3 space-y-1 ${bubbleClass(msg.role)}`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={`text-xs border px-1.5 py-0 ${roleBadgeClass(msg.role)}`}>{msg.role}</Badge>
                    <Badge variant="outline" className="text-xs px-1.5 py-0 text-muted-foreground">{msg.type}</Badge>
                    <span className="text-xs text-muted-foreground ml-auto">#{msg.sequence}</span>
                    <span className="text-xs text-muted-foreground">{relativeTime(msg.timestamp)}</span>
                  </div>
                  <p className="text-sm leading-relaxed">{msg.content}</p>
                  {msg.metadata && Object.keys(msg.metadata).length > 0 && (
                    <div>
                      <button
                        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                        onClick={() => setExpandedMsgId(expandedMsgId === msg.id ? null : msg.id)}
                      >
                        {expandedMsgId === msg.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        Details
                      </button>
                      {expandedMsgId === msg.id && (
                        <div className="mt-2 text-xs space-y-1 text-muted-foreground bg-background/50 rounded p-2">
                          {msg.metadata.toolsUsed && <div><span className="text-foreground">Tools: </span>{msg.metadata.toolsUsed.join(", ")}</div>}
                          {msg.metadata.executionResult !== undefined && <div><span className="text-foreground">Result: </span>{msg.metadata.executionResult}</div>}
                          {msg.metadata.confidenceScore !== undefined && <div><span className="text-foreground">Confidence: </span>{(msg.metadata.confidenceScore * 100).toFixed(1)}%</div>}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>

          {/* Send Form */}
          <Card className="bg-card border-border">
            <CardContent className="p-4 space-y-3">
              <div className="flex gap-2">
                <Select value={msgRole} onValueChange={v => { setMsgRole(v as MessageRole); setMsgType((msgTypes as any)[v][0]); }}>
                  <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="instructor">Instructor</SelectItem>
                    <SelectItem value="executor">Executor</SelectItem>
                    <SelectItem value="system">System</SelectItem>
                    <SelectItem value="monitor">Monitor</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={msgType} onValueChange={setMsgType}>
                  <SelectTrigger className="h-8 flex-1 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(msgTypes[msgRole] || []).map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Textarea
                  value={msgContent}
                  onChange={e => setMsgContent(e.target.value)}
                  placeholder="Type your message…"
                  rows={2}
                  className="text-sm resize-none flex-1"
                  onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && msgContent.trim()) sendMut.mutate(); }}
                />
                <Button
                  className="self-end bg-indigo-600 hover:bg-indigo-700"
                  onClick={() => sendMut.mutate()}
                  disabled={sendMut.isPending || !msgContent.trim()}
                >
                  {sendMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Ctrl+Enter to send</p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ─── Tab 3: Monitor ────────────────────────────────────────────────────────────

function MonitorTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [sessionFilter, setSessionFilter] = useState<string>("all");
  const [confirmPauseAll, setConfirmPauseAll] = useState(false);

  const { data: alerts = [], isLoading: alertsLoading, refetch: refetchAlerts } = useQuery<NIPAlert[]>({
    queryKey: ["/api/nip/alerts"],
    refetchInterval: 8000,
  });
  const { data: sessions = [] } = useQuery<NIPSession[]>({ queryKey: ["/api/nip/sessions"] });

  const activeSessions = sessions.filter(s => s.state === "active");
  const hasLockdown = alerts.some(a => a.severity === "lockdown");

  const filtered = alerts.filter(a => {
    if (severityFilter !== "all" && a.severity !== severityFilter) return false;
    if (sessionFilter !== "all" && a.sessionId !== sessionFilter) return false;
    return true;
  });

  const pauseAllMut = useMutation({
    mutationFn: async () => {
      await Promise.all(activeSessions.map(s => apiRequest("POST", `/api/nip/sessions/${s.id}/pause`)));
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/nip/sessions"] }); toast({ title: "All active sessions paused" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function alertsForSession(sessionId: string) {
    return alerts.filter(a => a.sessionId === sessionId);
  }

  const severityIcon = (s: AlertSeverity) => {
    switch (s) {
      case "info":     return <Activity className="w-4 h-4 text-blue-400" />;
      case "warning":  return <AlertTriangle className="w-4 h-4 text-yellow-400" />;
      case "critical": return <AlertTriangle className="w-4 h-4 text-orange-400" />;
      case "lockdown": return <Lock className="w-4 h-4 text-red-400" />;
    }
  };

  return (
    <div className="space-y-5">
      {/* Lockdown Banner */}
      {hasLockdown && (
        <div className="bg-red-900/40 border border-red-600/60 rounded-lg p-4 flex items-center gap-3">
          <Lock className="w-5 h-5 text-red-400 flex-shrink-0" />
          <div>
            <div className="font-semibold text-red-400">LOCKDOWN ALERT DETECTED</div>
            <div className="text-sm text-red-300/80">One or more sessions have triggered lockdown alerts. Immediate action may be required.</div>
          </div>
          <Button
            className="ml-auto bg-red-700 hover:bg-red-800 text-white flex-shrink-0"
            size="sm"
            onClick={() => setConfirmPauseAll(true)}
          >
            Pause All Sessions
          </Button>
        </div>
      )}

      {/* Quick Actions + Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={severityFilter} onValueChange={setSeverityFilter}>
          <SelectTrigger className="w-40 h-8 text-xs"><SelectValue placeholder="Severity" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Severities</SelectItem>
            <SelectItem value="info">Info</SelectItem>
            <SelectItem value="warning">Warning</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="lockdown">Lockdown</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sessionFilter} onValueChange={setSessionFilter}>
          <SelectTrigger className="w-52 h-8 text-xs"><SelectValue placeholder="Filter session" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sessions</SelectItem>
            {sessions.map(s => <SelectItem key={s.id} value={s.id}>{truncateId(s.id)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="ghost" size="sm" onClick={() => refetchAlerts()}><RefreshCw className="w-3.5 h-3.5 mr-1.5" />Refresh</Button>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto border-yellow-500/40 text-yellow-400 hover:bg-yellow-500/10"
          onClick={() => setConfirmPauseAll(true)}
          disabled={activeSessions.length === 0}
        >
          <Pause className="w-3.5 h-3.5 mr-1.5" /> Pause All Active
        </Button>
      </div>

      {/* Session Health Overview */}
      {activeSessions.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Active Session Health</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {activeSessions.map(s => {
              const sAlerts = alertsForSession(s.id);
              const hasCrit = sAlerts.some(a => a.severity === "critical" || a.severity === "lockdown");
              return (
                <Card key={s.id} className={`bg-card border-border ${hasCrit ? "border-red-500/40" : ""}`}>
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs text-muted-foreground">{truncateId(s.id)}</span>
                      <Badge className={`text-xs border ${stateColor(s.state)}`}>{s.state}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">{s.instructorProfile.organizationName} → {s.executorProfile.organizationName}</div>
                    <div className="grid grid-cols-3 gap-1 text-xs">
                      <div className="text-center">
                        <div className="font-semibold text-foreground">{s.messageCount}</div>
                        <div className="text-muted-foreground">msgs</div>
                      </div>
                      <div className="text-center">
                        <div className={`font-semibold ${hasCrit ? "text-red-400" : "text-foreground"}`}>{sAlerts.length}</div>
                        <div className="text-muted-foreground">alerts</div>
                      </div>
                      <div className="text-center">
                        <div className="font-semibold text-foreground">{s.startedAt ? formatDuration(s.startedAt) : "—"}</div>
                        <div className="text-muted-foreground">running</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Alert Feed */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">
          Alert Feed {filtered.length > 0 && <span className="ml-1 text-foreground">{filtered.length}</span>}
        </h3>
        {alertsLoading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Shield className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No alerts matching current filters</p>
          </div>
        ) : (
          <div className="space-y-2">
            {[...filtered].sort((a, b) => b.timestamp - a.timestamp).map(alert => (
              <div key={alert.id} className={`rounded-lg border p-3 flex items-start gap-3 ${severityColor(alert.severity)}`}>
                <div className="flex-shrink-0 pt-0.5">{severityIcon(alert.severity)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <Badge className={`text-xs border ${severityColor(alert.severity)}`}>{alert.severity}</Badge>
                    <span className="text-xs font-medium">{alert.type}</span>
                    <span className="text-xs text-muted-foreground ml-auto">{relativeTime(alert.timestamp)}</span>
                  </div>
                  <p className="text-sm">{alert.message}</p>
                  <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                    <span>Session: <span className="font-mono">{truncateId(alert.sessionId)}</span></span>
                    {alert.triggeredBy && <span>By: {alert.triggeredBy}</span>}
                    {alert.autoAction && <span className="text-foreground">Auto-action: {alert.autoAction}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pause All Confirmation */}
      <Dialog open={confirmPauseAll} onOpenChange={setConfirmPauseAll}>
        <DialogContent>
          <DialogHeader><DialogTitle className="text-yellow-400">Pause All Active Sessions</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This will pause all {activeSessions.length} active session(s). They can be resumed individually.</p>
          <div className="flex gap-2 mt-2">
            <Button variant="outline" onClick={() => setConfirmPauseAll(false)}>Cancel</Button>
            <Button className="bg-yellow-600 hover:bg-yellow-700 text-white" onClick={() => { pauseAllMut.mutate(); setConfirmPauseAll(false); }}>
              Pause All
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Tab 4: Transcripts ────────────────────────────────────────────────────────

function TranscriptsTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [expandTranscript, setExpandTranscript] = useState(false);

  const { data: sessions = [] } = useQuery<NIPSession[]>({ queryKey: ["/api/nip/sessions"] });
  const closedSessions = sessions.filter(s => s.state === "completed" || s.state === "terminated");

  const { data: report, isLoading: reportLoading } = useQuery<NIPReport>({
    queryKey: [`/api/nip/sessions/${selectedSessionId}/report`],
    enabled: !!selectedSessionId,
  });

  const { data: transcript = [] } = useQuery<NIPMessage[]>({
    queryKey: [`/api/nip/sessions/${selectedSessionId}/messages`],
    enabled: !!selectedSessionId && expandTranscript,
  });

  const genReportMut = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/nip/sessions/${id}/report`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/nip/sessions/${selectedSessionId}/report`] });
      toast({ title: "Report generated" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function copyReport() {
    if (report?.readableReport) {
      navigator.clipboard.writeText(report.readableReport).then(() => toast({ title: "Copied to clipboard" }));
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Session List */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Closed Sessions</h3>
          {closedSessions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No completed or terminated sessions.</p>
          ) : (
            <div className="space-y-1.5">
              {closedSessions.map(s => (
                <button
                  key={s.id}
                  onClick={() => { setSelectedSessionId(s.id); setExpandTranscript(false); }}
                  className={`w-full text-left rounded-lg border p-3 space-y-1 transition-all hover:border-indigo-500/40 ${selectedSessionId === s.id ? "border-indigo-500/50 bg-indigo-500/5" : "border-border bg-card"}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{truncateId(s.id)}</span>
                    <Badge className={`text-xs border ml-auto ${stateColor(s.state)}`}>{s.state}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">{s.instructorProfile.organizationName} → {s.executorProfile.organizationName}</div>
                  <div className="text-xs text-muted-foreground">{relativeTime(s.createdAt)}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Report Viewer */}
        <div className="md:col-span-2">
          {!selectedSessionId ? (
            <div className="flex items-center justify-center h-64 text-muted-foreground border border-dashed border-border rounded-lg">
              <div className="text-center">
                <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Select a session to view its report</p>
              </div>
            </div>
          ) : reportLoading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : !report ? (
            <Card className="bg-card border-border">
              <CardContent className="p-8 text-center space-y-3">
                <FileText className="w-10 h-10 mx-auto opacity-30" />
                <p className="text-muted-foreground text-sm">No report generated yet for this session.</p>
                <Button
                  size="sm"
                  className="bg-amber-600 hover:bg-amber-700 text-white"
                  onClick={() => genReportMut.mutate(selectedSessionId)}
                  disabled={genReportMut.isPending}
                >
                  {genReportMut.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generating…</> : <><Zap className="w-4 h-4 mr-2" />Generate Report</>}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {/* Report Header */}
              <Card className="bg-card border-border">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">{report.title}</CardTitle>
                      <p className="text-xs text-muted-foreground font-mono mt-1">{report.sessionId}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={`text-xs border ${outcomeColor(report.outcome)}`}>{report.outcome}</Badge>
                      <Button size="sm" variant="ghost" onClick={copyReport}><Copy className="w-3.5 h-3.5 mr-1.5" />Export</Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Metrics */}
                  <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                    {[
                      { label: "Messages", value: report.metrics.totalMessages, color: "text-indigo-400" },
                      { label: "Duration", value: `${report.metrics.durationMinutes}m`, color: "text-emerald-400" },
                      { label: "Alerts", value: report.metrics.alertCount, color: "text-amber-400" },
                      { label: "Tools", value: report.metrics.toolsUsed, color: "text-blue-400" },
                      { label: "Adaptations", value: report.metrics.adaptations, color: "text-purple-400" },
                    ].map(m => (
                      <div key={m.label} className="text-center bg-background rounded-lg p-2">
                        <div className={`text-lg font-bold ${m.color}`}>{m.value}</div>
                        <div className="text-xs text-muted-foreground">{m.label}</div>
                      </div>
                    ))}
                  </div>
                  <Separator />
                  {/* Summary */}
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Summary</h4>
                    <p className="text-sm leading-relaxed">{report.summary}</p>
                  </div>
                  <Separator />
                  {/* Full Report */}
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Full Report</h4>
                    <ScrollArea className="h-48">
                      <div className="text-sm leading-relaxed whitespace-pre-wrap pr-3">{report.readableReport}</div>
                    </ScrollArea>
                  </div>
                </CardContent>
              </Card>

              {/* Transcript Toggle */}
              <Card className="bg-card border-border">
                <CardHeader className="pb-2 cursor-pointer" onClick={() => setExpandTranscript(!expandTranscript)}>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <MessageSquare className="w-4 h-4" /> Full Transcript
                    </CardTitle>
                    {expandTranscript ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                </CardHeader>
                {expandTranscript && (
                  <CardContent>
                    <ScrollArea className="h-72">
                      <div className="space-y-2 pr-3">
                        {transcript.length === 0 && <p className="text-sm text-muted-foreground">No messages.</p>}
                        {transcript.map(msg => (
                          <div key={msg.id} className="text-xs border-b border-border pb-2 last:border-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className={`font-semibold ${msg.role === "instructor" ? "text-indigo-400" : msg.role === "executor" ? "text-emerald-400" : msg.role === "monitor" ? "text-amber-400" : "text-slate-400"}`}>{msg.role}</span>
                              <span className="text-muted-foreground">{msg.type}</span>
                              <span className="text-muted-foreground ml-auto">{relativeTime(msg.timestamp)}</span>
                            </div>
                            <p className="text-muted-foreground">{msg.content}</p>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                )}
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Tab 5: Access Control ─────────────────────────────────────────────────────

function AccessControlTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [testOrgId, setTestOrgId] = useState("");
  const [testScope, setTestScope] = useState("");
  const [testResult, setTestResult] = useState<{ allowed: boolean; reason: string } | null>(null);
  const [newParty, setNewParty] = useState({
    organizationId: "", organizationName: "", accessTier: "verified" as AccessTier,
    allowedScopes: "", maxConcurrentSessions: "5",
  });

  const { data: trustedParties = [], isLoading } = useQuery<TrustedParty[]>({ queryKey: ["/api/nip/trusted-parties"] });

  const addMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/nip/trusted-parties", {
      organizationId: newParty.organizationId,
      organizationName: newParty.organizationName,
      accessTier: newParty.accessTier,
      allowedScopes: newParty.allowedScopes.split(",").map(s => s.trim()).filter(Boolean),
      maxConcurrentSessions: parseInt(newParty.maxConcurrentSessions) || 5,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/nip/trusted-parties"] }); setAddOpen(false); toast({ title: "Trusted party added" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const approveMut = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/nip/trusted-parties/${id}/approve`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/nip/trusted-parties"] }); toast({ title: "Party approved" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const revokeMut = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/nip/trusted-parties/${id}/revoke`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/nip/trusted-parties"] }); toast({ title: "Access revoked" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const validateMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/nip/access/validate", { organizationId: testOrgId, scope: testScope }),
    onSuccess: (data) => setTestResult(data),
    onError: (e: any) => toast({ title: "Validation error", description: e.message, variant: "destructive" }),
  });

  const tierDescriptions: Record<AccessTier, string> = {
    public: "Any agent can connect — not recommended for production use.",
    verified: "Requires identity verification before connecting.",
    corporate: "Only registered corporate entities are permitted.",
    private: "Invitation-only access, maximum control.",
  };

  return (
    <div className="space-y-6">
      {/* Tier Info Banner */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><Shield className="w-4 h-4 text-indigo-400" />Access Tier Reference</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {(["public", "verified", "corporate", "private"] as AccessTier[]).map(tier => (
              <div key={tier} className={`flex items-start gap-2 p-2 rounded-lg border ${tierColor(tier)}`}>
                <div className="flex-shrink-0 mt-0.5">{tierIcon(tier)}</div>
                <div>
                  <div className="font-semibold text-xs capitalize">{tier}</div>
                  <div className="text-xs opacity-80">{tierDescriptions[tier]}</div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <h3 className="text-sm font-semibold">Trusted Parties <span className="text-muted-foreground font-normal">({trustedParties.length})</span></h3>
        <div className="ml-auto">
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white">
                <Plus className="w-4 h-4 mr-1.5" /> Add Trusted Party
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>Add Trusted Party</DialogTitle></DialogHeader>
              <div className="space-y-3 py-2">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Organization ID</label>
                  <Input value={newParty.organizationId} onChange={e => setNewParty(p => ({ ...p, organizationId: e.target.value }))} placeholder="org_abc123" className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Organization Name</label>
                  <Input value={newParty.organizationName} onChange={e => setNewParty(p => ({ ...p, organizationName: e.target.value }))} placeholder="Acme Corp" className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Access Tier</label>
                  <Select value={newParty.accessTier} onValueChange={v => setNewParty(p => ({ ...p, accessTier: v as AccessTier }))}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="public">Public</SelectItem>
                      <SelectItem value="verified">Verified</SelectItem>
                      <SelectItem value="corporate">Corporate</SelectItem>
                      <SelectItem value="private">Private</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Allowed Scopes (comma-separated)</label>
                  <Input value={newParty.allowedScopes} onChange={e => setNewParty(p => ({ ...p, allowedScopes: e.target.value }))} placeholder="read, write, execute" className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Max Concurrent Sessions</label>
                  <Input value={newParty.maxConcurrentSessions} onChange={e => setNewParty(p => ({ ...p, maxConcurrentSessions: e.target.value }))} type="number" min="1" className="h-8 text-sm" />
                </div>
                <Button
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
                  onClick={() => addMut.mutate()}
                  disabled={addMut.isPending || !newParty.organizationId || !newParty.organizationName}
                >
                  {addMut.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Adding…</> : "Add Party"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Trusted Parties Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : trustedParties.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground border border-dashed border-border rounded-lg">
          <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No trusted parties configured yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {trustedParties.map(party => (
            <Card key={party.id} className="bg-card border-border">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{party.organizationName}</span>
                      <Badge className={`text-xs border ${tierColor(party.accessTier)}`}>
                        <span className="flex items-center gap-1">{tierIcon(party.accessTier)}{party.accessTier}</span>
                      </Badge>
                      {party.approved ? (
                        <Badge className="text-xs border bg-green-500/20 text-green-400 border-green-500/30">Approved</Badge>
                      ) : (
                        <Badge className="text-xs border bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Pending</Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground font-mono">{party.organizationId}</div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                      <span><span className="text-foreground">Scopes: </span>{party.allowedScopes.join(", ") || "none"}</span>
                      <span><span className="text-foreground">Max sessions: </span>{party.maxConcurrentSessions}</span>
                      {party.lastActivity && <span><span className="text-foreground">Last active: </span>{relativeTime(party.lastActivity)}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!party.approved && (
                      <Button size="sm" variant="outline" className="border-green-500/40 text-green-400 hover:bg-green-500/10" onClick={() => approveMut.mutate(party.id)}>
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Approve
                      </Button>
                    )}
                    {party.approved && (
                      <Button size="sm" variant="outline" className="border-red-500/40 text-red-400 hover:bg-red-500/10" onClick={() => revokeMut.mutate(party.id)}>
                        <XCircle className="w-3.5 h-3.5 mr-1" /> Revoke
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Access Validation Tester */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><Eye className="w-4 h-4 text-blue-400" />Access Validation Tester</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2 flex-wrap">
            <Input
              value={testOrgId}
              onChange={e => setTestOrgId(e.target.value)}
              placeholder="Organization ID"
              className="h-8 text-sm flex-1 min-w-32"
            />
            <Input
              value={testScope}
              onChange={e => setTestScope(e.target.value)}
              placeholder="Scope (e.g. read)"
              className="h-8 text-sm flex-1 min-w-32"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => { setTestResult(null); validateMut.mutate(); }}
              disabled={validateMut.isPending || !testOrgId || !testScope}
            >
              {validateMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Test Access"}
            </Button>
          </div>
          {testResult && (
            <div className={`rounded-lg border p-3 flex items-center gap-2 text-sm ${testResult.allowed ? "bg-green-500/10 border-green-500/30 text-green-400" : "bg-red-500/10 border-red-500/30 text-red-400"}`}>
              {testResult.allowed ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
              <span className="font-medium">{testResult.allowed ? "Access Allowed" : "Access Denied"}</span>
              {testResult.reason && <span className="text-muted-foreground ml-1">— {testResult.reason}</span>}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main NIPPage ──────────────────────────────────────────────────────────────

export function NIPPage() {
  return (
    <div className="h-full flex flex-col p-6 space-y-6 overflow-y-auto">
      {/* Page Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <Zap className="w-5 h-5 text-indigo-400" />
            NLP Instruction Protocol
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">AI-to-AI bidirectional instruction management and safety monitoring</p>
        </div>
        <Badge variant="outline" className="border-indigo-500/40 text-indigo-400 text-xs">
          <Activity className="w-3 h-3 mr-1.5 animate-pulse" /> NIP v1
        </Badge>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="sessions" className="flex-1">
        <TabsList className="bg-muted/50 border border-border mb-4 h-9">
          <TabsTrigger value="sessions" className="text-xs gap-1.5"><Terminal className="w-3.5 h-3.5" />Sessions</TabsTrigger>
          <TabsTrigger value="conversation" className="text-xs gap-1.5"><MessageSquare className="w-3.5 h-3.5" />Live Conversation</TabsTrigger>
          <TabsTrigger value="monitor" className="text-xs gap-1.5"><Shield className="w-3.5 h-3.5" />Monitor</TabsTrigger>
          <TabsTrigger value="transcripts" className="text-xs gap-1.5"><FileText className="w-3.5 h-3.5" />Transcripts</TabsTrigger>
          <TabsTrigger value="access" className="text-xs gap-1.5"><Users className="w-3.5 h-3.5" />Access Control</TabsTrigger>
        </TabsList>

        <TabsContent value="sessions"><SessionsTab /></TabsContent>
        <TabsContent value="conversation"><ConversationTab /></TabsContent>
        <TabsContent value="monitor"><MonitorTab /></TabsContent>
        <TabsContent value="transcripts"><TranscriptsTab /></TabsContent>
        <TabsContent value="access"><AccessControlTab /></TabsContent>
      </Tabs>
    </div>
  );
}
