import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../lib/queryClient";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { useToast } from "../hooks/use-toast";
import { Plug, Check, X, Key, Globe, Unplug, Plus } from "lucide-react";
import type { Connector } from "../../../shared/schema";

const CATEGORY_LABELS: Record<string, string> = {
  productivity: "Productivity",
  dev: "Developer Tools",
  data: "Data & Analytics",
  crm: "CRM & Sales",
  custom: "Custom",
};

const CATEGORY_ORDER = ["productivity", "dev", "data", "crm", "custom"];

export function ConnectorsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [serverUrlInput, setServerUrlInput] = useState("");
  const [showAddCustom, setShowAddCustom] = useState(false);
  const [customForm, setCustomForm] = useState({ name: "", description: "", mcpServerUrl: "" });

  const { data: connectors = [] } = useQuery<Connector[]>({ queryKey: ["/api/connectors"] });

  // Handle OAuth redirect result (backend redirects to /#/connectors?oauth=success|error&...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.split("?")[1] || "");
    const oauthResult = params.get("oauth");
    if (oauthResult === "success") {
      const connectorName = params.get("connector") || "Connector";
      toast({ title: "OAuth Connected", description: `${connectorName} connected successfully.` });
      qc.invalidateQueries({ queryKey: ["/api/connectors"] });
      // Remove query params from hash to avoid re-triggering on re-renders
      window.history.replaceState(null, "", window.location.pathname + window.location.search + "#/connectors");
    } else if (oauthResult === "error") {
      const message = params.get("message") || "OAuth flow failed";
      toast({ title: "OAuth Error", description: decodeURIComponent(message), variant: "destructive" });
      window.history.replaceState(null, "", window.location.pathname + window.location.search + "#/connectors");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = useMutation({
    mutationFn: ({ id, apiKey, serverUrl }: { id: string; apiKey?: string; serverUrl?: string }) =>
      apiRequest("POST", `/api/connectors/${id}/connect`, { apiKey, serverUrl }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/connectors"] });
      setConnectingId(null);
      setApiKeyInput("");
      setServerUrlInput("");
      toast({ title: "Connected" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const disconnect = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/connectors/${id}/disconnect`, {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/connectors"] }); toast({ title: "Disconnected" }); },
  });

  const addCustom = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/connectors", { ...data, type: "mcp", category: "custom" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/connectors"] });
      setShowAddCustom(false);
      setCustomForm({ name: "", description: "", mcpServerUrl: "" });
      toast({ title: "Connector added" });
    },
  });

  const grouped = CATEGORY_ORDER.reduce((acc, cat) => {
    acc[cat] = connectors.filter(c => c.category === cat);
    return acc;
  }, {} as Record<string, Connector[]>);

  const selectedConnector = connectors.find(c => c.id === connectingId);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card/50">
        <Plug className="w-4 h-4 text-primary" />
        <h1 className="font-semibold text-sm">Connectors</h1>
        <p className="text-xs text-muted-foreground flex-1">14+ built-in integrations · MCP support for any tool</p>
        <Button size="sm" onClick={() => setShowAddCustom(true)} className="gap-1">
          <Plus className="w-3 h-3" />Add MCP
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-6">
        {CATEGORY_ORDER.map(cat => {
          const items = grouped[cat];
          if (!items || items.length === 0) return null;
          return (
            <div key={cat}>
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                {CATEGORY_LABELS[cat]}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {items.map(conn => (
                  <Card key={conn.id} className="p-3" data-testid={`connector-${conn.id}`}>
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                        {conn.type === "oauth" ? <Globe className="w-4 h-4 text-blue-400" /> :
                         conn.type === "mcp" ? <Plug className="w-4 h-4 text-purple-400" /> :
                         <Key className="w-4 h-4 text-yellow-400" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-semibold text-sm">{conn.name}</span>
                          <Badge variant={conn.status === "connected" ? "default" : "secondary"}
                            className={`text-[10px] ${conn.status === "connected" ? "bg-green-500/20 text-green-400 border-green-500/30" : ""}`}>
                            {conn.status === "connected" ? <><Check className="w-2.5 h-2.5 mr-0.5" />Connected</> : conn.status}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{conn.description}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5 uppercase">{conn.type}</p>
                      </div>
                      <div className="shrink-0">
                        {conn.status === "connected" ? (
                          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 hover:text-destructive"
                            onClick={() => disconnect.mutate(conn.id)}
                            data-testid={`button-disconnect-${conn.id}`}>
                            <Unplug className="w-3 h-3" />
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                            onClick={() => setConnectingId(conn.id)}
                            data-testid={`button-connect-${conn.id}`}>
                            <Plug className="w-3 h-3" />Connect
                          </Button>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Connect dialog */}
      <Dialog open={!!connectingId} onOpenChange={() => setConnectingId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-sm">Connect {selectedConnector?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            {selectedConnector?.type === "oauth" && (
              <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg text-xs text-blue-400 space-y-2">
                <p>OAuth connectors require a registered OAuth application. You can either paste a pre-obtained access token below, or use the OAuth flow if your connector has <code>auth_url</code> / <code>token_url</code> configured.</p>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs h-7 gap-1"
                  onClick={async () => {
                    if (!connectingId) return;
                    try {
                      const data = await apiRequest("GET", `/api/oauth/${connectingId}/authorize`);
                      if (data.authUrl) {
                        window.location.href = data.authUrl;
                      } else {
                        toast({ title: "No auth URL", description: "Connector is missing auth_url config.", variant: "destructive" });
                      }
                    } catch (e: any) {
                      toast({ title: "OAuth Error", description: e.message, variant: "destructive" });
                    }
                  }}
                  data-testid="button-oauth-authorize"
                >
                  <Globe className="w-3 h-3" />
                  Authorize with OAuth
                </Button>
              </div>
            )}
            {selectedConnector?.type === "mcp" && (
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">MCP Server URL</label>
                <Input value={serverUrlInput} onChange={e => setServerUrlInput(e.target.value)}
                  placeholder="https://your-mcp-server.com" className="h-8 text-sm" data-testid="input-mcp-url" />
              </div>
            )}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">API Key / Token</label>
              <Input type="password" value={apiKeyInput} onChange={e => setApiKeyInput(e.target.value)}
                placeholder="Paste your key or token here" className="h-8 text-sm" data-testid="input-connector-key" />
            </div>
            <p className="text-[10px] text-muted-foreground">
              Credentials are stored server-side and never exposed to agents.
            </p>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => connect.mutate({ id: connectingId!, apiKey: apiKeyInput, serverUrl: serverUrlInput })}
                disabled={!apiKeyInput && !serverUrlInput}>
                Connect
              </Button>
              <Button size="sm" variant="outline" onClick={() => setConnectingId(null)}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add custom MCP dialog */}
      <Dialog open={showAddCustom} onOpenChange={setShowAddCustom}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-sm">Add Custom MCP Connector</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Name *</label>
              <Input value={customForm.name} onChange={e => setCustomForm(f => ({ ...f, name: e.target.value }))}
                placeholder="My Custom Tool" className="h-8 text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Description</label>
              <Input value={customForm.description} onChange={e => setCustomForm(f => ({ ...f, description: e.target.value }))}
                placeholder="What this connector does" className="h-8 text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">MCP Server URL</label>
              <Input value={customForm.mcpServerUrl} onChange={e => setCustomForm(f => ({ ...f, mcpServerUrl: e.target.value }))}
                placeholder="https://your-mcp-server.com" className="h-8 text-sm" />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => addCustom.mutate(customForm)} disabled={!customForm.name}>Add</Button>
              <Button size="sm" variant="outline" onClick={() => setShowAddCustom(false)}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
