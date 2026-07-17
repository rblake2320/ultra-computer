/**
 * ConnectorsPage
 * ─────────────────────────────────────────────────────────────────────────────
 * Full connector management UI — works exactly like Manus connectors:
 *   • OAuth connectors: enter client_id + client_secret → popup OAuth flow
 *   • API key connectors: enter key → live validation → connect
 *   • MCP connectors: enter server URL + optional key → connect
 *   • Category filtering, status badges, disconnect, custom connector creation
 */

import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../lib/queryClient";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Label } from "../components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../components/ui/dialog";
import { useToast } from "../hooks/use-toast";
import {
  Plug,
  Check,
  X,
  Key,
  Globe,
  Unplug,
  Plus,
  ExternalLink,
  Loader2,
  Zap,
  Lock,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Search,
} from "lucide-react";
import type { Connector } from "../../../shared/schema";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ConnectorFieldDef {
  key: string;
  label: string;
  placeholder: string;
  type: "text" | "password" | "url";
  required: boolean;
  helpUrl?: string;
}

interface ConnectorDef {
  id: string;
  name: string;
  type: "oauth" | "api_key" | "mcp";
  category: string;
  description: string;
  logoUrl: string | null;
  fields: ConnectorFieldDef[];
  scopes: string[];
  mcpServerUrl: string | null;
  oauthAuthUrl: string | null;
  validateUrl: string | null;
}

interface ConnectorConnectResult {
  oauthUrl?: string;
}

// ─── Category metadata ────────────────────────────────────────────────────────

const CATEGORY_META: Record<string, { label: string; order: number }> = {
  productivity: { label: "Productivity", order: 0 },
  communication: { label: "Communication", order: 1 },
  dev: { label: "Developer Tools", order: 2 },
  data: { label: "Data & Analytics", order: 3 },
  crm: { label: "CRM & Sales", order: 4 },
  ai: { label: "AI & MCP Servers", order: 5 },
  custom: { label: "Custom", order: 6 },
};

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  if (status === "connected") {
    return (
      <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs">
        <Check className="w-3 h-3 mr-1" /> Connected
      </Badge>
    );
  }
  if (status === "pending") {
    return (
      <Badge className="bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 text-xs">
        <Loader2 className="w-3 h-3 mr-1 animate-spin" /> Pending
      </Badge>
    );
  }
  if (status === "error") {
    return (
      <Badge className="bg-red-500/20 text-red-400 border border-red-500/30 text-xs">
        <X className="w-3 h-3 mr-1" /> Error
      </Badge>
    );
  }
  return (
    <Badge className="bg-zinc-700/50 text-zinc-400 border border-zinc-600/30 text-xs">
      <Unplug className="w-3 h-3 mr-1" /> Disconnected
    </Badge>
  );
}

// ─── Connector type icon ──────────────────────────────────────────────────────

function TypeIcon({ type }: { type: string }) {
  if (type === "oauth") return <Lock className="w-3.5 h-3.5 text-blue-400" />;
  if (type === "mcp") return <Zap className="w-3.5 h-3.5 text-purple-400" />;
  return <Key className="w-3.5 h-3.5 text-amber-400" />;
}

// ─── Connect Dialog ───────────────────────────────────────────────────────────

interface ConnectDialogProps {
  connector: Connector;
  def: ConnectorDef | undefined;
  onClose: () => void;
  onConnected: () => void;
}

function ConnectDialog({ connector, def, onClose, onConnected }: ConnectDialogProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [isConnecting, setIsConnecting] = useState(false);
  const [oauthWindow, setOauthWindow] = useState<Window | null>(null);

  // Poll for OAuth window close
  useEffect(() => {
    if (!oauthWindow) return;
    const interval = setInterval(() => {
      if (oauthWindow.closed) {
        clearInterval(interval);
        setOauthWindow(null);
        // Refresh connector status
        qc.invalidateQueries({ queryKey: ["/api/connectors"] });
        onConnected();
      }
    }, 500);
    return () => clearInterval(interval);
  }, [oauthWindow, qc, onConnected]);

  const fields = def?.fields || [];
  const isOAuth = def?.type === "oauth";
  const isMCP = def?.type === "mcp";

  const handleConnect = async () => {
    // Validate required fields
    for (const field of fields) {
      if (field.required && !fieldValues[field.key]?.trim()) {
        toast({ title: `${field.label} is required`, variant: "destructive" });
        return;
      }
    }

    setIsConnecting(true);
    try {
      const body: Record<string, string> = { ...fieldValues };

      const data = await apiRequest<ConnectorConnectResult>(
        "POST",
        `/api/connectors/${connector.id}/connect`,
        body,
      );

      // OAuth flow: open popup window
      if (data.oauthUrl) {
        const popup = window.open(
          data.oauthUrl,
          `oauth_${connector.id}`,
          "width=600,height=700,scrollbars=yes,resizable=yes"
        );
        if (!popup) {
          toast({
            title: "Popup blocked",
            description: "Please allow popups for this site and try again.",
            variant: "destructive",
          });
          setIsConnecting(false);
          return;
        }
        setOauthWindow(popup);
        toast({ title: "OAuth window opened", description: "Complete authorization in the popup window." });
        setIsConnecting(false);
        return;
      }

      // Direct connection (API key / MCP)
      toast({ title: `${connector.name} connected!`, description: "Successfully connected." });
      qc.invalidateQueries({ queryKey: ["/api/connectors"] });
      onConnected();
    } catch (err: any) {
      toast({ title: "Connection error", description: err.message, variant: "destructive" });
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-zinc-900 border-zinc-700 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TypeIcon type={def?.type || "api_key"} />
            Connect {connector.name}
          </DialogTitle>
          <DialogDescription className="text-zinc-400 text-sm">
            {connector.description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Type badge */}
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            {isOAuth && (
              <span className="flex items-center gap-1 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded px-2 py-0.5">
                <Lock className="w-3 h-3" /> OAuth 2.0
              </span>
            )}
            {isMCP && (
              <span className="flex items-center gap-1 bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded px-2 py-0.5">
                <Zap className="w-3 h-3" /> MCP Server
              </span>
            )}
            {!isOAuth && !isMCP && (
              <span className="flex items-center gap-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded px-2 py-0.5">
                <Key className="w-3 h-3" /> API Key
              </span>
            )}
          </div>

          {/* Dynamic fields from schema */}
          {fields.map(field => (
            <div key={field.key} className="space-y-1.5">
              <Label className="text-zinc-300 text-sm flex items-center gap-2">
                {field.label}
                {field.required && <span className="text-red-400 text-xs">*</span>}
                {field.helpUrl && (
                  <a
                    href={field.helpUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 ml-auto"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </Label>
              <Input
                type={field.type === "password" ? "password" : field.type === "url" ? "url" : "text"}
                placeholder={field.placeholder}
                value={fieldValues[field.key] || ""}
                onChange={e => setFieldValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                className="bg-zinc-800 border-zinc-600 text-white placeholder:text-zinc-500 focus:border-blue-500"
                autoComplete={field.type === "password" ? "new-password" : "off"}
              />
            </div>
          ))}

          {/* OAuth info */}
          {isOAuth && (
            <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-3 text-xs text-zinc-400 space-y-1">
              <p className="text-blue-400 font-medium">OAuth Authorization Flow</p>
              <p>After entering your credentials, a popup window will open for you to authorize access. Your tokens are stored securely on the server.</p>
              {def?.scopes && def.scopes.length > 0 && (
                <p className="text-zinc-500">Scopes: {def.scopes.join(", ")}</p>
              )}
            </div>
          )}

          {/* MCP info */}
          {isMCP && (
            <div className="bg-purple-500/5 border border-purple-500/20 rounded-lg p-3 text-xs text-zinc-400 space-y-1">
              <p className="text-purple-400 font-medium">MCP Server Connection</p>
              <p>This connector uses the Model Context Protocol. With Scout's 10M token context window, you can inject full MCP tool outputs directly into your agent's context.</p>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              onClick={onClose}
              className="flex-1 border-zinc-600 text-zinc-300 hover:bg-zinc-800"
              disabled={isConnecting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConnect}
              disabled={isConnecting}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isConnecting ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Connecting...</>
              ) : isOAuth ? (
                <><Lock className="w-4 h-4 mr-2" /> Authorize</>
              ) : (
                <><Plug className="w-4 h-4 mr-2" /> Connect</>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Connector Card ───────────────────────────────────────────────────────────

interface ConnectorCardProps {
  connector: Connector;
  def: ConnectorDef | undefined;
  onConnect: () => void;
  onDisconnect: () => void;
}

function ConnectorCard({ connector, def, onConnect, onDisconnect }: ConnectorCardProps) {
  const isConnected = connector.status === "connected";
  const isPending = connector.status === "pending";

  return (
    <Card className="bg-zinc-800/50 border-zinc-700/50 p-4 flex flex-col gap-3 hover:border-zinc-600/70 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {connector.logoUrl ? (
            <img src={connector.logoUrl} alt={connector.name} className="w-8 h-8 rounded object-contain bg-white/5 p-1" />
          ) : (
            <div className="w-8 h-8 rounded bg-zinc-700 flex items-center justify-center flex-shrink-0">
              <TypeIcon type={def?.type || connector.type} />
            </div>
          )}
          <div className="min-w-0">
            <h3 className="text-white font-medium text-sm truncate">{connector.name}</h3>
            <p className="text-zinc-500 text-xs truncate">{connector.description}</p>
          </div>
        </div>
        <StatusBadge status={connector.status} />
      </div>

      <div className="flex items-center justify-between gap-2 mt-auto">
        <div className="flex items-center gap-1.5 text-xs text-zinc-500">
          <TypeIcon type={def?.type || connector.type} />
          <span className="capitalize">{def?.type || connector.type}</span>
        </div>
        <div className="flex gap-2">
          {isConnected ? (
            <Button
              size="sm"
              variant="outline"
              onClick={onDisconnect}
              className="border-zinc-600 text-zinc-400 hover:text-red-400 hover:border-red-500/50 text-xs h-7 px-2"
            >
              <Unplug className="w-3 h-3 mr-1" /> Disconnect
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={onConnect}
              disabled={isPending}
              className="bg-blue-600/80 hover:bg-blue-600 text-white text-xs h-7 px-3"
            >
              {isPending ? (
                <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Pending</>
              ) : (
                <><Plug className="w-3 h-3 mr-1" /> Connect</>
              )}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

// ─── Add Custom Connector Dialog ──────────────────────────────────────────────

function AddCustomDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: "", description: "", mcpServerUrl: "", type: "mcp" });
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async () => {
    if (!form.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    setIsCreating(true);
    try {
      await apiRequest<Connector>("POST", "/api/connectors", {
        name: form.name.trim(),
        description: form.description.trim(),
        type: form.type,
        category: "custom",
        mcpServerUrl: form.mcpServerUrl.trim() || undefined,
      });
      toast({ title: "Connector created!", description: `${form.name} added to your connectors.` });
      qc.invalidateQueries({ queryKey: ["/api/connectors"] });
      onCreated();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-zinc-900 border-zinc-700 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add Custom Connector
          </DialogTitle>
          <DialogDescription className="text-zinc-400 text-sm">
            Add a custom API, MCP server, or integration.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label className="text-zinc-300 text-sm">Name <span className="text-red-400">*</span></Label>
            <Input
              placeholder="My Custom API"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="bg-zinc-800 border-zinc-600 text-white placeholder:text-zinc-500"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-zinc-300 text-sm">Description</Label>
            <Input
              placeholder="What does this connector do?"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="bg-zinc-800 border-zinc-600 text-white placeholder:text-zinc-500"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-zinc-300 text-sm">Type</Label>
            <select
              value={form.type}
              onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
              className="w-full bg-zinc-800 border border-zinc-600 text-white rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            >
              <option value="mcp">MCP Server</option>
              <option value="api_key">API Key</option>
              <option value="oauth">OAuth</option>
            </select>
          </div>
          {form.type === "mcp" && (
            <div className="space-y-1.5">
              <Label className="text-zinc-300 text-sm">MCP Server URL</Label>
              <Input
                type="url"
                placeholder="https://your-mcp-server.com"
                value={form.mcpServerUrl}
                onChange={e => setForm(f => ({ ...f, mcpServerUrl: e.target.value }))}
                className="bg-zinc-800 border-zinc-600 text-white placeholder:text-zinc-500"
              />
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={onClose} className="flex-1 border-zinc-600 text-zinc-300 hover:bg-zinc-800" disabled={isCreating}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={isCreating} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white">
              {isCreating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating...</> : <><Plus className="w-4 h-4 mr-2" /> Create</>}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function ConnectorsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [connectingConnector, setConnectingConnector] = useState<Connector | null>(null);
  const [showAddCustom, setShowAddCustom] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  // Fetch connectors (status from DB)
  const { data: connectors = [], isLoading: connectorsLoading } = useQuery<Connector[]>({
    queryKey: ["/api/connectors"],
    refetchInterval: 5000,
  });

  // Fetch connector definitions (field schemas, OAuth URLs, etc.)
  const { data: defs = [] } = useQuery<ConnectorDef[]>({
    queryKey: ["/api/connectors/defs"],
  });

  const defsMap = Object.fromEntries(defs.map(d => [d.id, d]));

  // Handle OAuth callback params in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connector_connected");
    const error = params.get("connector_error");
    if (connected) {
      toast({ title: "Connected!", description: `${connected} connected successfully.` });
      qc.invalidateQueries({ queryKey: ["/api/connectors"] });
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (error) {
      toast({ title: "Connection failed", description: error.replace(/_/g, " "), variant: "destructive" });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  // Disconnect mutation
  const disconnectMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest<{ ok: true }>("POST", `/api/connectors/${id}/disconnect`, {}),
    onSuccess: (_, id) => {
      const c = connectors.find(c => c.id === id);
      toast({ title: `${c?.name || id} disconnected` });
      qc.invalidateQueries({ queryKey: ["/api/connectors"] });
    },
    onError: (err: any) => {
      toast({ title: "Disconnect failed", description: err.message, variant: "destructive" });
    },
  });

  // Filter and group connectors
  const filtered = connectors.filter(c => {
    const matchesSearch = !searchQuery ||
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = activeCategory === "all" || c.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  const categories = Object.entries(CATEGORY_META)
    .sort((a, b) => a[1].order - b[1].order)
    .map(([key, meta]) => ({
      key,
      label: meta.label,
      connectors: filtered.filter(c => c.category === key),
      total: connectors.filter(c => c.category === key).length,
      connected: connectors.filter(c => c.category === key && c.status === "connected").length,
    }))
    .filter(cat => cat.connectors.length > 0 || activeCategory === "all");

  const allCategories = [...new Set(connectors.map(c => c.category))];
  const totalConnected = connectors.filter(c => c.status === "connected").length;

  const toggleCategory = (key: string) => {
    setCollapsedCategories(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-white">
      {/* Header */}
      <div className="border-b border-zinc-800 px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-semibold text-white flex items-center gap-2">
              <Plug className="w-5 h-5 text-blue-400" />
              Connectors
            </h1>
            <p className="text-zinc-400 text-sm mt-0.5">
              {totalConnected} of {connectors.length} connected
            </p>
          </div>
          <Button
            onClick={() => setShowAddCustom(true)}
            className="bg-blue-600/80 hover:bg-blue-600 text-white text-sm"
            size="sm"
          >
            <Plus className="w-4 h-4 mr-1.5" /> Add Custom
          </Button>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <Input
            placeholder="Search connectors..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-9 bg-zinc-800/50 border-zinc-700 text-white placeholder:text-zinc-500 focus:border-blue-500"
          />
        </div>

        {/* Category filter tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
          <button
            onClick={() => setActiveCategory("all")}
            className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              activeCategory === "all"
                ? "bg-blue-600 text-white"
                : "bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700"
            }`}
          >
            All ({connectors.length})
          </button>
          {Object.entries(CATEGORY_META)
            .sort((a, b) => a[1].order - b[1].order)
            .filter(([key]) => allCategories.includes(key))
            .map(([key, meta]) => {
              const count = connectors.filter(c => c.category === key).length;
              const connectedCount = connectors.filter(c => c.category === key && c.status === "connected").length;
              return (
                <button
                  key={key}
                  onClick={() => setActiveCategory(key)}
                  className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors flex items-center gap-1 ${
                    activeCategory === key
                      ? "bg-blue-600 text-white"
                      : "bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700"
                  }`}
                >
                  {meta.label}
                  {connectedCount > 0 && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                  )}
                  <span className="text-zinc-500">({count})</span>
                </button>
              );
            })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
        {connectorsLoading ? (
          <div className="flex items-center justify-center py-16 text-zinc-500">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            Loading connectors...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-zinc-500 gap-2">
            <Plug className="w-10 h-10 opacity-30" />
            <p className="text-sm">No connectors found</p>
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="text-blue-400 text-xs hover:underline">
                Clear search
              </button>
            )}
          </div>
        ) : (
          categories.map(cat => (
            <div key={cat.key}>
              {/* Category header */}
              <button
                onClick={() => toggleCategory(cat.key)}
                className="flex items-center gap-2 w-full text-left mb-3 group"
              >
                <h2 className="text-zinc-300 font-medium text-sm">{cat.label}</h2>
                {cat.connected > 0 && (
                  <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs">
                    {cat.connected} connected
                  </Badge>
                )}
                <span className="text-zinc-600 text-xs ml-1">({cat.connectors.length})</span>
                <div className="ml-auto text-zinc-600 group-hover:text-zinc-400 transition-colors">
                  {collapsedCategories.has(cat.key) ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronUp className="w-4 h-4" />
                  )}
                </div>
              </button>

              {!collapsedCategories.has(cat.key) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {cat.connectors.map(connector => (
                    <ConnectorCard
                      key={connector.id}
                      connector={connector}
                      def={defsMap[connector.id]}
                      onConnect={() => setConnectingConnector(connector)}
                      onDisconnect={() => disconnectMutation.mutate(connector.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          ))
        )}

        {/* MCP Scout info banner */}
        <div className="bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/20 rounded-xl p-4 mt-4">
          <div className="flex items-start gap-3">
            <Zap className="w-5 h-5 text-purple-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-white font-medium text-sm">Scout's 10M Token Context Window</p>
              <p className="text-zinc-400 text-xs mt-1">
                With NVIDIA Scout's 10 million token context window, you can inject full MCP tool outputs, CLI results, SDK responses, and documentation directly into your agent's context — enabling seamless multi-tool orchestration at scale.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Connect Dialog */}
      {connectingConnector && (
        <ConnectDialog
          connector={connectingConnector}
          def={defsMap[connectingConnector.id]}
          onClose={() => setConnectingConnector(null)}
          onConnected={() => setConnectingConnector(null)}
        />
      )}

      {/* Add Custom Dialog */}
      {showAddCustom && (
        <AddCustomDialog
          onClose={() => setShowAddCustom(false)}
          onCreated={() => setShowAddCustom(false)}
        />
      )}
    </div>
  );
}
