import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../lib/queryClient";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { Skeleton } from "../components/ui/skeleton";
import { Alert, AlertDescription } from "../components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Slider } from "../components/ui/slider";
import { useToast } from "../hooks/use-toast";
import {
  Network, Server, Terminal, Globe, Webhook, Code, ChevronDown,
  ChevronRight, Plus, Trash2, Send, Play, RefreshCcw, AlertCircle,
  CheckCircle, XCircle, Zap, Package, Link, Unplug, Eye, EyeOff,
  ArrowRight, Cpu, Shield, Radio,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface AgentCard {
  name: string;
  description?: string;
  url?: string;
  version?: string;
  skills?: Array<{ id: string; name: string; description?: string }>;
  capabilities?: Record<string, boolean>;
}

interface RemoteAgent {
  id: string;
  name: string;
  description?: string;
  url: string;
  status?: "connected" | "disconnected" | "error";
  skills?: Array<{ id: string; name: string }>;
}

interface MCPServer {
  id: string;
  name: string;
  url: string;
  transport: "streamable-http" | "sse";
  status?: "connected" | "disconnected" | "error";
  toolCount?: number;
  resourceCount?: number;
}

interface MCPTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, any>;
}

interface CLITool {
  name: string;
  version?: string;
  path?: string;
  available: boolean;
}

interface ExecResult {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  error?: string;
  duration?: number;
}

interface Webhook {
  id: string;
  path: string;
  registeredAt: number;
  invocations: number;
}

interface DashboardData {
  protocols: {
    a2a: { available: boolean; agentCard: AgentCard | null; remoteAgents: RemoteAgent[] };
    mcp: { available: boolean; servers: MCPServer[] };
    cli: { available: boolean; installedTools: CLITool[] };
    http: { available: boolean; webhooks: Webhook[] };
  };
  timestamp: string;
}

interface HttpResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: any;
  ok: boolean;
}

// ─── Utility Components ───────────────────────────────────────────────────────

function StatusBadge({ status }: { status?: string }) {
  if (!status) return <Badge variant="outline" className="text-[10px] text-muted-foreground">unknown</Badge>;
  const map: Record<string, string> = {
    connected: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    disconnected: "bg-muted/50 text-muted-foreground border-border",
    error: "bg-red-500/10 text-red-400 border-red-500/30",
  };
  return (
    <Badge variant="outline" className={`text-[10px] gap-1 ${map[status] ?? map.disconnected}`}>
      <span className={`w-1.5 h-1.5 rounded-full inline-block ${status === "connected" ? "bg-emerald-400" : status === "error" ? "bg-red-400" : "bg-muted-foreground"}`} />
      {status}
    </Badge>
  );
}

function OutputPanel({ result, label }: { result: ExecResult | HttpResponse | null; label?: string }) {
  if (!result) return null;

  const isHttp = "status" in result && "statusText" in result;

  if (isHttp) {
    const r = result as HttpResponse;
    return (
      <div className="mt-3 space-y-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={`text-[10px] ${r.ok ? "text-emerald-400 border-emerald-500/30" : "text-red-400 border-red-500/30"}`}>
            {r.status} {r.statusText}
          </Badge>
        </div>
        <pre className="bg-muted/40 rounded-lg p-3 text-xs font-mono overflow-auto max-h-48 whitespace-pre-wrap break-all">
          {typeof r.body === "string" ? r.body : JSON.stringify(r.body, null, 2)}
        </pre>
      </div>
    );
  }

  const r = result as ExecResult;
  return (
    <div className="mt-3 space-y-2">
      {label && <p className="text-[10px] text-muted-foreground font-medium">{label}</p>}
      {r.error && (
        <Alert variant="destructive" className="py-2">
          <AlertCircle className="w-3 h-3" />
          <AlertDescription className="text-xs">{r.error}</AlertDescription>
        </Alert>
      )}
      {r.stdout && (
        <div>
          <p className="text-[10px] text-muted-foreground mb-1">stdout</p>
          <pre className="bg-muted/40 rounded-lg p-3 text-xs font-mono overflow-auto max-h-48 whitespace-pre-wrap">{r.stdout}</pre>
        </div>
      )}
      {r.stderr && (
        <div>
          <p className="text-[10px] text-muted-foreground mb-1 text-amber-400">stderr</p>
          <pre className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3 text-xs font-mono overflow-auto max-h-32 whitespace-pre-wrap text-amber-300">{r.stderr}</pre>
        </div>
      )}
      {r.exitCode !== undefined && (
        <div className="flex items-center gap-2">
          {r.exitCode === 0
            ? <CheckCircle className="w-3 h-3 text-emerald-400" />
            : <XCircle className="w-3 h-3 text-red-400" />}
          <span className="text-[10px] text-muted-foreground">Exit code: {r.exitCode}</span>
          {r.duration !== undefined && <span className="text-[10px] text-muted-foreground">· {r.duration}ms</span>}
        </div>
      )}
    </div>
  );
}

// ─── A2A Tab ─────────────────────────────────────────────────────────────────

function A2ATab({ dashboard }: { dashboard: DashboardData | undefined }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [discoverUrl, setDiscoverUrl] = useState("");
  const [messageAgentId, setMessageAgentId] = useState<string | null>(null);
  const [messageContent, setMessageContent] = useState("");
  const [cardExpanded, setCardExpanded] = useState(false);

  const a2aData = dashboard?.protocols?.a2a;

  const discoverMutation = useMutation({
    mutationFn: (url: string) => apiRequest("POST", "/api/protocols/a2a/agents/discover", { url }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/protocols/dashboard"] });
      setDiscoverUrl("");
      toast({ title: "Agent discovered successfully" });
    },
    onError: (e: any) => toast({ title: "Discovery failed", description: e.message, variant: "destructive" }),
  });

  const unregisterMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/protocols/a2a/agents/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/protocols/dashboard"] });
      toast({ title: "Agent unregistered" });
    },
    onError: (e: any) => toast({ title: "Failed to unregister", description: e.message, variant: "destructive" }),
  });

  const sendMessageMutation = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) =>
      apiRequest("POST", `/api/protocols/a2a/agents/${id}/send`, { message: content }),
    onSuccess: () => {
      setMessageAgentId(null);
      setMessageContent("");
      toast({ title: "Message sent" });
    },
    onError: (e: any) => toast({ title: "Send failed", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      {/* Agent Card */}
      <Card className="p-4">
        <button
          className="w-full flex items-center justify-between text-left"
          onClick={() => setCardExpanded(v => !v)}
          data-testid="a2a-card-toggle"
        >
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium">Ultra Computer Agent Card</span>
            {a2aData?.agentCard && (
              <Badge variant="secondary" className="text-[10px]">
                {a2aData.agentCard.skills?.length ?? 0} skills
              </Badge>
            )}
          </div>
          {cardExpanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
        </button>
        {cardExpanded && (
          <div className="mt-3">
            {a2aData?.agentCard ? (
              <pre className="bg-muted/40 rounded-lg p-3 text-xs font-mono overflow-auto max-h-72 whitespace-pre-wrap">
                {JSON.stringify(a2aData.agentCard, null, 2)}
              </pre>
            ) : (
              <Alert className="py-2">
                <AlertCircle className="w-3 h-3" />
                <AlertDescription className="text-xs">
                  a2aProtocol module not yet available. The <code>/.well-known/agent-card.json</code> endpoint returns a minimal fallback card.
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}
      </Card>

      {/* Discover Agent */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Radio className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Discover Remote Agent</span>
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="https://agent.example.com"
            value={discoverUrl}
            onChange={e => setDiscoverUrl(e.target.value)}
            className="h-8 text-xs flex-1"
            data-testid="a2a-discover-url-input"
          />
          <Button
            size="sm"
            className="h-8 gap-1.5 text-xs"
            disabled={!discoverUrl.trim() || discoverMutation.isPending}
            onClick={() => discoverMutation.mutate(discoverUrl.trim())}
            data-testid="a2a-discover-button"
          >
            <ArrowRight className="w-3 h-3" />
            Discover
          </Button>
        </div>
      </Card>

      {/* Remote Agents List */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Network className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Remote Agents</span>
          {a2aData?.remoteAgents && (
            <Badge variant="secondary" className="text-[10px]">{a2aData.remoteAgents.length}</Badge>
          )}
        </div>
        {!a2aData?.remoteAgents || a2aData.remoteAgents.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">No remote agents discovered yet</p>
        ) : (
          <div className="space-y-2">
            {a2aData.remoteAgents.map(agent => (
              <div key={agent.id} className="flex items-start justify-between p-3 rounded-lg border border-border bg-muted/20">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium truncate">{agent.name}</span>
                    <StatusBadge status={agent.status} />
                  </div>
                  {agent.description && (
                    <p className="text-xs text-muted-foreground mb-1 truncate">{agent.description}</p>
                  )}
                  <p className="text-[10px] text-muted-foreground font-mono truncate">{agent.url}</p>
                  {agent.skills && agent.skills.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {agent.skills.slice(0, 4).map(s => (
                        <Badge key={s.id} variant="secondary" className="text-[10px]">{s.name}</Badge>
                      ))}
                      {agent.skills.length > 4 && (
                        <Badge variant="secondary" className="text-[10px]">+{agent.skills.length - 4}</Badge>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 ml-2 shrink-0">
                  {messageAgentId === agent.id ? (
                    <div className="space-y-1.5">
                      <Textarea
                        placeholder="Message content..."
                        value={messageContent}
                        onChange={e => setMessageContent(e.target.value)}
                        className="text-xs h-16 w-56"
                        data-testid={`a2a-agent-message-textarea-${agent.id}`}
                      />
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 text-xs flex-1"
                          onClick={() => setMessageAgentId(null)}
                        >Cancel</Button>
                        <Button
                          size="sm"
                          className="h-6 text-xs flex-1 gap-1"
                          disabled={!messageContent.trim() || sendMessageMutation.isPending}
                          onClick={() => sendMessageMutation.mutate({ id: agent.id, content: messageContent })}
                          data-testid={`a2a-agent-send-button-${agent.id}`}
                        >
                          <Send className="w-2.5 h-2.5" />
                          Send
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs gap-1"
                        onClick={() => setMessageAgentId(agent.id)}
                        data-testid={`a2a-agent-message-button-${agent.id}`}
                      >
                        <Send className="w-3 h-3" />
                        Message
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-muted-foreground hover:text-red-400"
                        onClick={() => unregisterMutation.mutate(agent.id)}
                        data-testid={`a2a-agent-delete-button-${agent.id}`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── MCP Tab ─────────────────────────────────────────────────────────────────

function MCPTab({ dashboard }: { dashboard: DashboardData | undefined }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [connectUrl, setConnectUrl] = useState("");
  const [connectName, setConnectName] = useState("");
  const [connectTransport, setConnectTransport] = useState<"streamable-http" | "sse">("streamable-http");
  const [expandedServer, setExpandedServer] = useState<string | null>(null);

  const mcpData = dashboard?.protocols?.mcp;

  const connectMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/protocols/mcp/servers/connect", {
      url: connectUrl,
      name: connectName,
      transport: connectTransport,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/protocols/dashboard"] });
      setConnectUrl("");
      setConnectName("");
      toast({ title: "MCP server connected" });
    },
    onError: (e: any) => toast({ title: "Connection failed", description: e.message, variant: "destructive" }),
  });

  const disconnectMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/protocols/mcp/servers/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/protocols/dashboard"] });
      toast({ title: "Server disconnected" });
    },
    onError: (e: any) => toast({ title: "Disconnect failed", description: e.message, variant: "destructive" }),
  });

  const { data: serverTools } = useQuery<MCPTool[]>({
    queryKey: [`/api/protocols/mcp/servers/${expandedServer}/tools`],
    enabled: !!expandedServer,
  });

  const { data: serverResources } = useQuery<any[]>({
    queryKey: [`/api/protocols/mcp/servers/${expandedServer}/resources`],
    enabled: !!expandedServer,
  });

  return (
    <div className="space-y-4">
      {/* Connect Form */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Link className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Connect MCP Server</span>
        </div>
        <div className="space-y-2">
          <div className="flex gap-2">
            <Input
              placeholder="Server name"
              value={connectName}
              onChange={e => setConnectName(e.target.value)}
              className="h-8 text-xs w-40"
              data-testid="mcp-connect-name-input"
            />
            <Input
              placeholder="https://mcp.example.com"
              value={connectUrl}
              onChange={e => setConnectUrl(e.target.value)}
              className="h-8 text-xs flex-1"
              data-testid="mcp-connect-url-input"
            />
          </div>
          <div className="flex gap-2 items-center">
            <Select
              value={connectTransport}
              onValueChange={v => setConnectTransport(v as "streamable-http" | "sse")}
            >
              <SelectTrigger className="h-8 text-xs w-44" data-testid="mcp-transport-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="streamable-http">streamable-http</SelectItem>
                <SelectItem value="sse">sse</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="sm"
              className="h-8 gap-1.5 text-xs"
              disabled={!connectUrl.trim() || !connectName.trim() || connectMutation.isPending}
              onClick={() => connectMutation.mutate()}
              data-testid="mcp-connect-button"
            >
              <Zap className="w-3 h-3" />
              Connect
            </Button>
          </div>
        </div>
      </Card>

      {/* Connected Servers */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Server className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Connected Servers</span>
          {mcpData?.servers && (
            <Badge variant="secondary" className="text-[10px]">{mcpData.servers.length}</Badge>
          )}
        </div>
        {!mcpData?.servers || mcpData.servers.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">No MCP servers connected</p>
        ) : (
          <div className="space-y-2">
            {mcpData.servers.map(server => (
              <div key={server.id} className="border border-border rounded-lg overflow-hidden">
                <div className="flex items-center justify-between p-3 bg-muted/20">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <button
                      className="flex items-center gap-1.5 min-w-0"
                      onClick={() => setExpandedServer(expandedServer === server.id ? null : server.id)}
                      data-testid={`mcp-server-expand-${server.id}`}
                    >
                      {expandedServer === server.id
                        ? <ChevronDown className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                        : <ChevronRight className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />}
                      <span className="text-sm font-medium truncate">{server.name}</span>
                    </button>
                    <StatusBadge status={server.status} />
                    <Badge variant="outline" className="text-[10px] font-mono">{server.transport}</Badge>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    {server.toolCount !== undefined && (
                      <span className="text-[10px] text-muted-foreground">{server.toolCount} tools</span>
                    )}
                    {server.resourceCount !== undefined && (
                      <span className="text-[10px] text-muted-foreground">{server.resourceCount} resources</span>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-red-400"
                      onClick={() => disconnectMutation.mutate(server.id)}
                      data-testid={`mcp-server-disconnect-${server.id}`}
                    >
                      <Unplug className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
                <div className="px-3 py-1 bg-muted/5 border-t border-border">
                  <p className="text-[10px] text-muted-foreground font-mono truncate">{server.url}</p>
                </div>
                {expandedServer === server.id && (
                  <div className="p-3 border-t border-border space-y-3">
                    {/* Tools */}
                    <div>
                      <p className="text-[10px] text-muted-foreground font-medium mb-2 flex items-center gap-1">
                        <Package className="w-3 h-3" />
                        Tools
                      </p>
                      {!serverTools ? (
                        <div className="space-y-1">
                          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-5 w-full" />)}
                        </div>
                      ) : serverTools.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No tools</p>
                      ) : (
                        <div className="space-y-1">
                          {serverTools.map(tool => (
                            <div key={tool.name} className="flex items-start gap-2 p-2 rounded bg-muted/30">
                              <Code className="w-3 h-3 text-primary mt-0.5 shrink-0" />
                              <div className="min-w-0">
                                <p className="text-xs font-mono font-medium">{tool.name}</p>
                                {tool.description && (
                                  <p className="text-[10px] text-muted-foreground">{tool.description}</p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    {/* Resources */}
                    {serverResources && serverResources.length > 0 && (
                      <div>
                        <p className="text-[10px] text-muted-foreground font-medium mb-2 flex items-center gap-1">
                          <Globe className="w-3 h-3" />
                          Resources
                        </p>
                        <div className="space-y-1">
                          {serverResources.slice(0, 6).map((r: any, i: number) => (
                            <div key={i} className="text-xs text-muted-foreground font-mono p-1.5 rounded bg-muted/20">
                              {r.uri ?? r.name ?? JSON.stringify(r)}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── CLI & Scripts Tab ────────────────────────────────────────────────────────

function CLITab({ dashboard }: { dashboard: DashboardData | undefined }) {
  const { toast } = useToast();
  const [command, setCommand] = useState("");
  const [workDir, setWorkDir] = useState("/tmp");
  const [timeout, setTimeout_] = useState([30]);
  const [cmdResult, setCmdResult] = useState<ExecResult | null>(null);

  const [script, setScript] = useState("");
  const [language, setLanguage] = useState("bash");
  const [scriptResult, setScriptResult] = useState<ExecResult | null>(null);

  const cliTools = dashboard?.protocols?.cli?.installedTools ?? [];

  const executeMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/protocols/cli/execute", {
      command,
      workDir,
      timeout: timeout[0] * 1000,
    }),
    onSuccess: (data: ExecResult) => setCmdResult(data),
    onError: (e: any) => {
      setCmdResult({ error: e.message });
      toast({ title: "Execution failed", description: e.message, variant: "destructive" });
    },
  });

  const scriptMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/protocols/cli/script", {
      script,
      language,
      args: [],
    }),
    onSuccess: (data: ExecResult) => setScriptResult(data),
    onError: (e: any) => {
      setScriptResult({ error: e.message });
      toast({ title: "Script failed", description: e.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-4">
      {/* Execute Command */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Terminal className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Execute Command</span>
        </div>
        <div className="space-y-3">
          <Input
            placeholder="e.g. ls -la /tmp"
            value={command}
            onChange={e => setCommand(e.target.value)}
            className="h-8 text-xs font-mono"
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey && command.trim()) executeMutation.mutate();
            }}
            data-testid="cli-command-input"
          />
          <div className="flex gap-3 items-center">
            <div className="flex items-center gap-2 flex-1">
              <span className="text-[10px] text-muted-foreground whitespace-nowrap">Work Dir</span>
              <Input
                placeholder="/tmp"
                value={workDir}
                onChange={e => setWorkDir(e.target.value)}
                className="h-7 text-xs font-mono flex-1"
                data-testid="cli-workdir-input"
              />
            </div>
            <div className="flex items-center gap-2 flex-1">
              <span className="text-[10px] text-muted-foreground whitespace-nowrap">Timeout: {timeout[0]}s</span>
              <Slider
                min={1}
                max={300}
                step={1}
                value={timeout}
                onValueChange={setTimeout_}
                className="flex-1"
                data-testid="cli-timeout-slider"
              />
            </div>
            <Button
              size="sm"
              className="h-8 gap-1.5 text-xs shrink-0"
              disabled={!command.trim() || executeMutation.isPending}
              onClick={() => executeMutation.mutate()}
              data-testid="cli-run-button"
            >
              <Play className="w-3 h-3" />
              {executeMutation.isPending ? "Running..." : "Run"}
            </Button>
          </div>
          <OutputPanel result={cmdResult} />
        </div>
      </Card>

      {/* Execute Script */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Code className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Execute Script</span>
        </div>
        <div className="space-y-2">
          <div className="flex gap-2 items-center">
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger className="h-8 text-xs w-36" data-testid="cli-script-language-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bash">bash</SelectItem>
                <SelectItem value="python3">python3</SelectItem>
                <SelectItem value="node">node</SelectItem>
                <SelectItem value="typescript">typescript</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="sm"
              className="h-8 gap-1.5 text-xs ml-auto"
              disabled={!script.trim() || scriptMutation.isPending}
              onClick={() => scriptMutation.mutate()}
              data-testid="cli-script-run-button"
            >
              <Play className="w-3 h-3" />
              {scriptMutation.isPending ? "Running..." : "Run Script"}
            </Button>
          </div>
          <Textarea
            placeholder={`Write your ${language} code here...`}
            value={script}
            onChange={e => setScript(e.target.value)}
            className="text-xs font-mono min-h-[120px]"
            data-testid="cli-script-textarea"
          />
          <OutputPanel result={scriptResult} />
        </div>
      </Card>

      {/* Installed Tools Grid */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Package className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Installed CLI Tools</span>
          <Badge variant="secondary" className="text-[10px]">{cliTools.length}</Badge>
        </div>
        {cliTools.length === 0 ? (
          <Alert className="py-2">
            <AlertCircle className="w-3 h-3" />
            <AlertDescription className="text-xs">
              cliToolEngine module not yet available. Tool detection will appear here once implemented.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {cliTools.map(tool => (
              <div
                key={tool.name}
                className={`flex items-center justify-between p-2 rounded-lg border ${tool.available ? "border-emerald-500/20 bg-emerald-500/5" : "border-border bg-muted/20"}`}
              >
                <div className="min-w-0">
                  <p className="text-xs font-mono font-medium truncate">{tool.name}</p>
                  {tool.version && <p className="text-[10px] text-muted-foreground">{tool.version}</p>}
                </div>
                <Badge
                  variant="outline"
                  className={`text-[10px] shrink-0 ml-1 ${tool.available ? "text-emerald-400 border-emerald-500/30" : "text-muted-foreground"}`}
                >
                  {tool.available ? "ok" : "n/a"}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── HTTP & Webhooks Tab ──────────────────────────────────────────────────────

interface HeaderPair { key: string; value: string }

function HTTPTab({ dashboard }: { dashboard: DashboardData | undefined }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [method, setMethod] = useState("GET");
  const [url, setUrl] = useState("");
  const [headers, setHeaders] = useState<HeaderPair[]>([{ key: "", value: "" }]);
  const [body, setBody] = useState("");
  const [httpResult, setHttpResult] = useState<HttpResponse | null>(null);

  const [webhookPath, setWebhookPath] = useState("");

  const webhooks = dashboard?.protocols?.http?.webhooks ?? [];

  const requestMutation = useMutation({
    mutationFn: () => {
      const parsedHeaders = Object.fromEntries(
        headers.filter(h => h.key.trim()).map(h => [h.key.trim(), h.value.trim()])
      );
      return apiRequest("POST", "/api/protocols/http/request", {
        url,
        method,
        headers: Object.keys(parsedHeaders).length > 0 ? parsedHeaders : undefined,
        body: body.trim() ? body : undefined,
      });
    },
    onSuccess: (data: HttpResponse) => setHttpResult(data),
    onError: (e: any) => {
      toast({ title: "Request failed", description: e.message, variant: "destructive" });
    },
  });

  const registerWebhookMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/protocols/webhooks", { path: webhookPath }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/protocols/dashboard"] });
      setWebhookPath("");
      toast({ title: "Webhook registered" });
    },
    onError: (e: any) => toast({ title: "Registration failed", description: e.message, variant: "destructive" }),
  });

  const deleteWebhookMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/protocols/webhooks/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/protocols/dashboard"] });
      toast({ title: "Webhook deleted" });
    },
    onError: (e: any) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  const addHeader = () => setHeaders(h => [...h, { key: "", value: "" }]);
  const removeHeader = (i: number) => setHeaders(h => h.filter((_, idx) => idx !== i));
  const updateHeader = (i: number, field: "key" | "value", val: string) =>
    setHeaders(h => h.map((row, idx) => idx === i ? { ...row, [field]: val } : row));

  return (
    <div className="space-y-4">
      {/* HTTP Request */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Globe className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">HTTP Request</span>
        </div>
        <div className="space-y-2">
          <div className="flex gap-2">
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger className="h-8 text-xs w-24" data-testid="http-method-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"].map(m => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="https://api.example.com/endpoint"
              value={url}
              onChange={e => setUrl(e.target.value)}
              className="h-8 text-xs flex-1"
              data-testid="http-url-input"
            />
            <Button
              size="sm"
              className="h-8 gap-1.5 text-xs shrink-0"
              disabled={!url.trim() || requestMutation.isPending}
              onClick={() => requestMutation.mutate()}
              data-testid="http-send-button"
            >
              <Send className="w-3 h-3" />
              {requestMutation.isPending ? "Sending..." : "Send"}
            </Button>
          </div>

          {/* Headers */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[10px] text-muted-foreground font-medium">Headers</p>
              <Button
                size="sm"
                variant="ghost"
                className="h-5 text-[10px] gap-1 px-1.5"
                onClick={addHeader}
                data-testid="http-add-header-button"
              >
                <Plus className="w-2.5 h-2.5" />
                Add
              </Button>
            </div>
            <div className="space-y-1">
              {headers.map((h, i) => (
                <div key={i} className="flex gap-1.5 items-center">
                  <Input
                    placeholder="Content-Type"
                    value={h.key}
                    onChange={e => updateHeader(i, "key", e.target.value)}
                    className="h-7 text-xs flex-1"
                    data-testid={`http-header-key-${i}`}
                  />
                  <Input
                    placeholder="application/json"
                    value={h.value}
                    onChange={e => updateHeader(i, "value", e.target.value)}
                    className="h-7 text-xs flex-1"
                    data-testid={`http-header-value-${i}`}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400"
                    onClick={() => removeHeader(i)}
                    data-testid={`http-remove-header-${i}`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Body */}
          {!["GET", "HEAD"].includes(method) && (
            <div>
              <p className="text-[10px] text-muted-foreground font-medium mb-1">Request Body</p>
              <Textarea
                placeholder='{"key": "value"}'
                value={body}
                onChange={e => setBody(e.target.value)}
                className="text-xs font-mono min-h-[80px]"
                data-testid="http-body-textarea"
              />
            </div>
          )}

          {httpResult && (
            <OutputPanel result={httpResult} />
          )}
        </div>
      </Card>

      {/* Webhooks */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Webhook className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Webhooks</span>
          <Badge variant="secondary" className="text-[10px]">{webhooks.length}</Badge>
        </div>

        {/* Register form */}
        <div className="flex gap-2 mb-4">
          <div className="flex items-center text-xs text-muted-foreground shrink-0 font-mono">/api/webhooks/</div>
          <Input
            placeholder="my-webhook-id"
            value={webhookPath}
            onChange={e => setWebhookPath(e.target.value.replace(/[^a-zA-Z0-9_\-]/g, ""))}
            className="h-8 text-xs flex-1 font-mono"
            data-testid="webhook-path-input"
          />
          <Button
            size="sm"
            className="h-8 gap-1.5 text-xs shrink-0"
            disabled={!webhookPath.trim() || registerWebhookMutation.isPending}
            onClick={() => registerWebhookMutation.mutate()}
            data-testid="webhook-register-button"
          >
            <Plus className="w-3 h-3" />
            Register
          </Button>
        </div>

        {webhooks.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-3">No webhooks registered</p>
        ) : (
          <div className="space-y-2">
            {webhooks.map(wh => (
              <div key={wh.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/20">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <code className="text-xs font-mono text-primary">/api/webhooks/{wh.path}</code>
                    <Badge variant="secondary" className="text-[10px]">{wh.invocations} calls</Badge>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Registered {new Date(wh.registeredAt).toLocaleString()}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400 ml-2 shrink-0"
                  onClick={() => deleteWebhookMutation.mutate(wh.id)}
                  data-testid={`webhook-delete-${wh.id}`}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ProtocolsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("a2a");

  const { data: dashboard, isLoading, error, refetch } = useQuery<DashboardData>({
    queryKey: ["/api/protocols/dashboard"],
    refetchInterval: 15_000,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["/api/protocols/dashboard"] });
    refetch();
    toast({ title: "Refreshed" });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card/50 shrink-0">
        <Cpu className="w-4 h-4 text-primary" />
        <div className="flex-1 min-w-0">
          <h1 className="font-semibold text-sm leading-none">Protocol Hub</h1>
          <p className="text-[10px] text-muted-foreground mt-0.5">A2A, MCP, CLI &amp; Tool Integrations</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Protocol status pills */}
          {dashboard && (
            <div className="flex items-center gap-1.5">
              {[
                { label: "A2A", ok: dashboard.protocols.a2a.available },
                { label: "MCP", ok: dashboard.protocols.mcp.available },
                { label: "CLI", ok: dashboard.protocols.cli.available },
                { label: "HTTP", ok: dashboard.protocols.http.available },
              ].map(p => (
                <Badge
                  key={p.label}
                  variant="outline"
                  className={`text-[10px] gap-1 ${p.ok ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/5" : "text-muted-foreground"}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full inline-block ${p.ok ? "bg-emerald-400" : "bg-muted-foreground"}`} />
                  {p.label}
                </Badge>
              ))}
            </div>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 text-xs"
            onClick={refresh}
            disabled={isLoading}
            data-testid="protocols-refresh-button"
          >
            <RefreshCcw className={`w-3 h-3 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {error ? (
          <Alert variant="destructive">
            <AlertCircle className="w-4 h-4" />
            <AlertDescription>Failed to load protocol dashboard: {(error as any)?.message}</AlertDescription>
          </Alert>
        ) : isLoading ? (
          <div className="space-y-4">
            {[...Array(4)].map((_, i) => (
              <Card key={i} className="p-4">
                <Skeleton className="h-4 w-32 mb-3" />
                <Skeleton className="h-20 w-full" />
              </Card>
            ))}
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="h-8 mb-4" data-testid="protocols-tabs">
              <TabsTrigger value="a2a" className="text-xs h-7 gap-1.5" data-testid="tab-a2a">
                <Network className="w-3 h-3" />
                A2A
              </TabsTrigger>
              <TabsTrigger value="mcp" className="text-xs h-7 gap-1.5" data-testid="tab-mcp">
                <Server className="w-3 h-3" />
                MCP
              </TabsTrigger>
              <TabsTrigger value="cli" className="text-xs h-7 gap-1.5" data-testid="tab-cli">
                <Terminal className="w-3 h-3" />
                CLI &amp; Scripts
              </TabsTrigger>
              <TabsTrigger value="http" className="text-xs h-7 gap-1.5" data-testid="tab-http">
                <Globe className="w-3 h-3" />
                HTTP &amp; Webhooks
              </TabsTrigger>
            </TabsList>

            <TabsContent value="a2a" className="mt-0">
              <A2ATab dashboard={dashboard} />
            </TabsContent>

            <TabsContent value="mcp" className="mt-0">
              <MCPTab dashboard={dashboard} />
            </TabsContent>

            <TabsContent value="cli" className="mt-0">
              <CLITab dashboard={dashboard} />
            </TabsContent>

            <TabsContent value="http" className="mt-0">
              <HTTPTab dashboard={dashboard} />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}
