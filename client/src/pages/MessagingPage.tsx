import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, getSSEUrl } from "../lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../components/ui/select";
import { ScrollArea } from "../components/ui/scroll-area";
import { Separator } from "../components/ui/separator";
import { Skeleton } from "../components/ui/skeleton";
import { useToast } from "../hooks/use-toast";
import {
  MessageSquare, Mail, Webhook, Radio, Plus, Send, Bell, BarChart3,
  ArrowDownLeft, ArrowUpRight, Trash2, Settings2, CheckCircle2, XCircle,
  AlertCircle, Loader2, RefreshCw,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type ChannelType = "slack" | "gmail" | "webhook" | "websocket";
type ConnectionStatus = "connected" | "disconnected" | "error";
type MsgDirection = "inbound" | "outbound";
type Severity = "info" | "warning" | "error" | "success";
type EventType =
  | "task_complete" | "task_failed" | "agent_spawned"
  | "checkpoint_saved" | "skill_triggered" | "system_alert";

interface Channel {
  id: string;
  name: string;
  type: ChannelType;
  status: ConnectionStatus;
  capabilities: string[];
  config?: Record<string, string>;
}

interface Message {
  id: string;
  direction: MsgDirection;
  channelId: string;
  channelName?: string;
  sender?: string;
  recipient?: string;
  subject?: string;
  content: string;
  format?: "text" | "html";
  timestamp: number;
  metadata?: Record<string, any>;
}

interface Subscription {
  id: string;
  channelId: string;
  channelName?: string;
  conversationId?: string;
  conversationTitle?: string;
  eventTypes: EventType[];
  createdAt: number;
}

interface Stats {
  totalChannels: number;
  connected: number;
  sentLast24h: number;
  receivedLast24h: number;
  deliveryRate: number;
  queueDepth: number;
}

interface LiveEvent {
  type: string;
  timestamp: number;
  message: string;
  channelId?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(ts: number | string | undefined): string {
  if (!ts) return "—";
  const ms = typeof ts === "string" ? new Date(ts).getTime() : ts;
  if (isNaN(ms)) return "—";
  const diff = Math.floor((Date.now() - ms) / 1000);
  if (diff < 0) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function channelIcon(type: ChannelType) {
  switch (type) {
    case "slack": return <MessageSquare className="w-4 h-4" />;
    case "gmail": return <Mail className="w-4 h-4" />;
    case "webhook": return <Webhook className="w-4 h-4" />;
    case "websocket": return <Radio className="w-4 h-4" />;
  }
}

function statusDot(status: ConnectionStatus) {
  if (status === "connected")
    return <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />;
  if (status === "error")
    return <span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" />;
  return <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />;
}

function statusLabel(status: ConnectionStatus) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

// ─── Config Fields per channel type ───────────────────────────────────────────

function ChannelConfigFields({
  type,
  config,
  onChange,
}: {
  type: ChannelType;
  config: Record<string, string>;
  onChange: (k: string, v: string) => void;
}) {
  const field = (key: string, label: string, placeholder?: string, type?: string) => (
    <div key={key} className="space-y-1">
      <label className="text-xs text-muted-foreground">{label}</label>
      <Input
        value={config[key] ?? ""}
        onChange={(e) => onChange(key, e.target.value)}
        placeholder={placeholder}
        type={type}
        data-testid={`channel-config-${key}`}
        className="h-8 text-sm"
      />
    </div>
  );

  if (type === "slack") return (
    <div className="space-y-3">
      {field("workspaceId", "Workspace ID", "T1234ABCD")}
      {field("channelName", "Channel Name / ID", "#general")}
      {field("botToken", "Bot Token (hidden)", "xoxb-...", "password")}
    </div>
  );
  if (type === "gmail") return (
    <div className="space-y-3">
      {field("email", "Email Address", "you@gmail.com")}
      {field("filter", "Filter / Label", "INBOX")}
    </div>
  );
  if (type === "webhook") return (
    <div className="space-y-3">
      {field("url", "Webhook URL", "https://example.com/hook")}
      {field("secret", "Secret", "optional signing secret")}
      {field("method", "HTTP Method", "POST")}
    </div>
  );
  if (type === "websocket") return (
    <div className="space-y-3">
      {field("url", "WebSocket URL", "wss://example.com/ws")}
      {field("authToken", "Auth Token", "optional", "password")}
    </div>
  );
  return null;
}

// ─── Tab 1: Channels ──────────────────────────────────────────────────────────

function ChannelsTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState<string | null>(null);
  const [newType, setNewType] = useState<ChannelType>("slack");
  const [newName, setNewName] = useState("");
  const [newConfig, setNewConfig] = useState<Record<string, string>>({});
  const [editConfig, setEditConfig] = useState<Record<string, string>>({});

  const { data: channels = [], isLoading, isError: channelsError } = useQuery<Channel[]>({
    queryKey: ["/api/messaging/channels"],
  });

  const addMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/messaging/channels", { type: newType, name: newName, config: newConfig }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/messaging/channels"] });
      setAddOpen(false);
      setNewName("");
      setNewConfig({});
      toast({ title: "Channel added" });
    },
    onError: (e: Error) => toast({ title: "Failed to add channel", description: e.message, variant: "destructive" }),
  });

  const testMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/messaging/channels/${id}/test`),
    onSuccess: (_, id) => toast({ title: `Connection test passed`, description: `Channel ${id}` }),
    onError: (e: Error, id) =>
      toast({ title: `Test failed for ${id}`, description: e.message, variant: "destructive" }),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/messaging/channels/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/messaging/channels"] });
      toast({ title: "Channel removed" });
    },
    onError: (e: Error) =>
      toast({ title: "Remove failed", description: e.message, variant: "destructive" }),
  });

  const saveMutation = useMutation({
    mutationFn: (ch: Channel) =>
      apiRequest("PATCH", `/api/messaging/channels/${ch.id}`, { config: editConfig }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/messaging/channels"] });
      setConfigOpen(null);
      toast({ title: "Channel updated" });
    },
    onError: (e: Error) =>
      toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const configChannel = channels.find((c) => c.id === configOpen);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{channels.length} channel{channels.length !== 1 ? "s" : ""} registered</p>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm" data-testid="add-channel-btn">
              <Plus className="w-4 h-4 mr-1" /> Add Channel
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add Messaging Channel</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Channel Type</label>
                <Select value={newType} onValueChange={(v) => { setNewType(v as ChannelType); setNewConfig({}); }}>
                  <SelectTrigger data-testid="new-channel-type" className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="slack">Slack</SelectItem>
                    <SelectItem value="gmail">Gmail</SelectItem>
                    <SelectItem value="webhook">Webhook</SelectItem>
                    <SelectItem value="websocket">WebSocket</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Name</label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="My channel"
                  data-testid="new-channel-name"
                  className="h-8 text-sm"
                />
              </div>
              <ChannelConfigFields
                type={newType}
                config={newConfig}
                onChange={(k, v) => setNewConfig((p) => ({ ...p, [k]: v }))}
              />
              <Button
                className="w-full"
                onClick={() => addMutation.mutate()}
                disabled={!newName || addMutation.isPending}
                data-testid="add-channel-save"
              >
                {addMutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                Save Channel
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {channelsError ? (
        <div className="p-8 text-center text-muted-foreground">
          Failed to load channels. Please try again.
        </div>
      ) : isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-44 rounded-lg" />
          ))}
        </div>
      ) : channels.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground" data-testid="channels-empty">
          <MessageSquare className="w-10 h-10 mb-3 opacity-30" />
          <p className="text-sm">No channels yet. Add one to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {channels.map((ch) => (
            <Card key={ch.id} className="flex flex-col" data-testid={`channel-card-${ch.id}`}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-md bg-muted">{channelIcon(ch.type)}</div>
                    <div>
                      <CardTitle className="text-sm font-medium leading-tight">{ch.name}</CardTitle>
                      <Badge variant="secondary" className="text-[10px] px-1 py-0 mt-0.5">{ch.type}</Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0 pt-0.5">
                    {statusDot(ch.status)}
                    <span className="text-xs text-muted-foreground">{statusLabel(ch.status)}</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 flex-1">
                <div className="flex flex-wrap gap-1" data-testid={`channel-caps-${ch.id}`}>
                  {(ch.capabilities ?? []).map((cap) => (
                    <Badge key={cap} variant="outline" className="text-[10px] px-1.5 py-0">{cap}</Badge>
                  ))}
                </div>
                <div className="flex gap-2 mt-auto flex-wrap">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-7 px-2"
                    onClick={() => testMutation.mutate(ch.id)}
                    disabled={testMutation.isPending}
                    data-testid={`channel-test-${ch.id}`}
                  >
                    {testMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />}
                    Test
                  </Button>
                  <Dialog open={configOpen === ch.id} onOpenChange={(o) => {
                    setConfigOpen(o ? ch.id : null);
                    if (o) setEditConfig(ch.config ?? {});
                  }}>
                    <DialogTrigger asChild>
                      <Button size="sm" variant="outline" className="text-xs h-7 px-2" data-testid={`channel-configure-${ch.id}`}>
                        <Settings2 className="w-3 h-3 mr-1" /> Configure
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle>Configure — {ch.name}</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 pt-2">
                        <ChannelConfigFields
                          type={ch.type}
                          config={editConfig}
                          onChange={(k, v) => setEditConfig((p) => ({ ...p, [k]: v }))}
                        />
                        <Button
                          className="w-full"
                          onClick={() => saveMutation.mutate(ch)}
                          disabled={saveMutation.isPending}
                          data-testid={`channel-save-${ch.id}`}
                        >
                          {saveMutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                          Save
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-xs h-7 px-2 text-destructive hover:text-destructive"
                    onClick={() => {
                      if (confirm(`Remove channel "${ch.name}"?`)) removeMutation.mutate(ch.id);
                    }}
                    data-testid={`channel-remove-${ch.id}`}
                  >
                    <Trash2 className="w-3 h-3 mr-1" /> Remove
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Tab 2: Messages ──────────────────────────────────────────────────────────

function MessagesTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [dirFilter, setDirFilter] = useState<"" | "inbound" | "outbound">("");
  const [channelFilter, setChannelFilter] = useState("__all__");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sendChannel, setSendChannel] = useState("");
  const [recipient, setRecipient] = useState("");
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [format, setFormat] = useState<"text" | "html">("text");

  const { data: channels = [] } = useQuery<Channel[]>({ queryKey: ["/api/messaging/channels"] });

  const activeChannelFilter = channelFilter === "__all__" ? "" : channelFilter;
  const historyKey = `/api/messaging/history?limit=50${dirFilter ? `&direction=${dirFilter}` : ""}${activeChannelFilter ? `&channelId=${activeChannelFilter}` : ""}`;
  const { data: messages = [], isLoading: msgsLoading, isError: msgsError, refetch } = useQuery<Message[]>({
    queryKey: [historyKey],
  });

  const sendMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/messaging/send", {
        channelId: sendChannel,
        recipient: recipient || undefined,
        subject: subject || undefined,
        content,
        format,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [historyKey] });
      setContent("");
      setRecipient("");
      setSubject("");
      toast({ title: "Message sent" });
    },
    onError: (e: Error) =>
      toast({ title: "Send failed", description: e.message, variant: "destructive" }),
  });

  const filtered = messages.filter((m) => {
    if (!search) return true;
    return (
      m.content.toLowerCase().includes(search.toLowerCase()) ||
      (m.sender ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (m.recipient ?? "").toLowerCase().includes(search.toLowerCase())
    );
  });

  const connectedChannels = channels.filter((c) => c.status === "connected");

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 items-center" data-testid="messages-filter-bar">
        <div className="flex rounded-md border overflow-hidden">
          {(["", "inbound", "outbound"] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDirFilter(d)}
              data-testid={`dir-filter-${d || "all"}`}
              className={`text-xs px-3 py-1.5 transition-colors ${dirFilter === d ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
            >
              {d === "" ? "All" : d.charAt(0).toUpperCase() + d.slice(1)}
            </button>
          ))}
        </div>
        <Select value={channelFilter} onValueChange={setChannelFilter}>
          <SelectTrigger className="h-8 text-xs w-36" data-testid="channel-filter-select">
            <SelectValue placeholder="All channels" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All channels</SelectItem>
            {channels.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search messages…"
          className="h-8 text-xs w-48"
          data-testid="messages-search"
        />
        <Button size="sm" variant="ghost" onClick={() => refetch()} className="h-8" data-testid="messages-refresh">
          <RefreshCw className="w-3 h-3" />
        </Button>
      </div>

      {/* Message list */}
      <ScrollArea className="h-[380px] rounded-lg border" data-testid="messages-list">
        {msgsError ? (
          <div className="flex flex-col items-center justify-center h-40 text-center text-muted-foreground">
            <p className="text-sm">Failed to load messages. Please try again.</p>
          </div>
        ) : msgsLoading ? (
          <div className="p-4 space-y-3">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 rounded-md" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-center text-muted-foreground" data-testid="messages-empty">
            <Send className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-sm">No messages found</p>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {filtered.map((msg) => {
              const isIn = msg.direction === "inbound";
              const isExp = expanded === msg.id;
              return (
                <div
                  key={msg.id}
                  data-testid={`message-item-${msg.id}`}
                  onClick={() => setExpanded(isExp ? null : msg.id)}
                  className={`rounded-md px-3 py-2 cursor-pointer transition-colors hover:bg-muted border-l-2 ${
                    isIn ? "border-l-blue-500" : "border-l-green-500"
                  }`}
                >
                  <div className="flex items-center gap-2 text-xs">
                    {isIn
                      ? <ArrowDownLeft className="w-3 h-3 text-blue-500 flex-shrink-0" />
                      : <ArrowUpRight className="w-3 h-3 text-green-500 flex-shrink-0" />}
                    <span className="text-muted-foreground">
                      {msg.channelName ?? channels.find(c => c.id === msg.channelId)?.name ?? msg.channelId}
                    </span>
                    <span className="text-foreground font-medium truncate flex-1">
                      {isIn ? (msg.sender ?? "—") : (msg.recipient ?? "—")}
                    </span>
                    <span className="text-muted-foreground flex-shrink-0">{relativeTime(msg.timestamp)}</span>
                  </div>
                  <p className={`text-xs text-muted-foreground mt-1 ${isExp ? "whitespace-pre-wrap break-words" : "truncate"}`}>
                    {isExp ? msg.content : msg.content.slice(0, 200)}
                  </p>
                  {isExp && msg.metadata && (
                    <pre className="text-[10px] bg-muted rounded p-2 mt-2 overflow-auto max-h-24">
                      {JSON.stringify(msg.metadata, null, 2)}
                    </pre>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>

      <Separator />

      {/* Send section */}
      <div className="space-y-3" data-testid="send-message-section">
        <h3 className="text-sm font-medium flex items-center gap-1.5">
          <Send className="w-4 h-4" /> Send Message
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select value={sendChannel} onValueChange={setSendChannel}>
            <SelectTrigger className="h-8 text-sm" data-testid="send-channel-select">
              <SelectValue placeholder="Select channel…" />
            </SelectTrigger>
            <SelectContent>
              {connectedChannels.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={format} onValueChange={(v) => setFormat(v as "text" | "html")}>
            <SelectTrigger className="h-8 text-sm" data-testid="send-format-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="text">Plain text</SelectItem>
              <SelectItem value="html">HTML</SelectItem>
            </SelectContent>
          </Select>
          <Input
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder="Recipient (optional)"
            className="h-8 text-sm"
            data-testid="send-recipient"
          />
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject (optional)"
            className="h-8 text-sm"
            data-testid="send-subject"
          />
        </div>
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Message content…"
          rows={3}
          className="text-sm resize-none"
          data-testid="send-content"
        />
        <Button
          onClick={() => sendMutation.mutate()}
          disabled={!sendChannel || !content || sendMutation.isPending}
          className="w-full sm:w-auto"
          data-testid="send-btn"
        >
          {sendMutation.isPending
            ? <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            : <Send className="w-4 h-4 mr-1" />}
          Send
        </Button>
      </div>
    </div>
  );
}

// ─── Tab 3: Notifications ─────────────────────────────────────────────────────

const ALL_EVENT_TYPES: EventType[] = [
  "task_complete", "task_failed", "agent_spawned",
  "checkpoint_saved", "skill_triggered", "system_alert",
];

function NotificationsTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [subChannel, setSubChannel] = useState("");
  const [subConvId, setSubConvId] = useState("");
  const [allConvs, setAllConvs] = useState(true);
  const [subEvents, setSubEvents] = useState<EventType[]>([]);
  const [notifType, setNotifType] = useState("system_alert");
  const [notifTitle, setNotifTitle] = useState("");
  const [notifBody, setNotifBody] = useState("");
  const [notifSeverity, setNotifSeverity] = useState<Severity>("info");

  const { data: channels = [] } = useQuery<Channel[]>({ queryKey: ["/api/messaging/channels"] });
  const { data: subscriptions = [], isLoading: subsLoading } = useQuery<Subscription[]>({
    queryKey: ["/api/messaging/subscriptions"],
  });
  const { data: conversations = [] } = useQuery<{ id: string; title: string }[]>({
    queryKey: ["/api/conversations?limit=50"],
  });

  const subscribeMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/messaging/subscriptions", {
        channelId: subChannel,
        conversationId: allConvs ? undefined : subConvId || undefined,
        eventTypes: subEvents,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/messaging/subscriptions"] });
      setSubChannel("");
      setSubConvId("");
      setSubEvents([]);
      toast({ title: "Subscription created" });
    },
    onError: (e: Error) =>
      toast({ title: "Subscribe failed", description: e.message, variant: "destructive" }),
  });

  const removeSub = useMutation({
    mutationFn: ({ channelId, conversationId }: { channelId: string; conversationId?: string }) =>
      apiRequest("DELETE", `/api/messaging/subscriptions/${channelId}/${conversationId ?? "all"}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/messaging/subscriptions"] });
      toast({ title: "Subscription removed" });
    },
    onError: (e: Error) =>
      toast({ title: "Remove failed", description: e.message, variant: "destructive" }),
  });

  const notifyMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/messaging/notify", {
        type: notifType,
        title: notifTitle,
        body: notifBody,
        severity: notifSeverity,
      }),
    onSuccess: () => toast({ title: "Test notification sent" }),
    onError: (e: Error) =>
      toast({ title: "Notify failed", description: e.message, variant: "destructive" }),
  });

  function toggleEvent(ev: EventType) {
    setSubEvents((prev) =>
      prev.includes(ev) ? prev.filter((e) => e !== ev) : [...prev, ev]
    );
  }

  const connectedChannels = channels.filter((c) => c.status === "connected");

  return (
    <div className="space-y-6">
      {/* Subscription list */}
      <div>
        <h3 className="text-sm font-medium mb-3 flex items-center gap-1.5">
          <Bell className="w-4 h-4" /> Active Subscriptions
        </h3>
        {subsLoading ? (
          <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 rounded" />)}</div>
        ) : subscriptions.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-8 border rounded-lg" data-testid="subs-empty">
            No subscriptions configured
          </div>
        ) : (
          <div className="space-y-2" data-testid="subscriptions-list">
            {subscriptions.map((sub) => (
              <div key={sub.id} className="flex items-start justify-between gap-3 p-3 rounded-lg border" data-testid={`sub-item-${sub.id}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap gap-1 items-center">
                    <span className="text-sm font-medium">{sub.channelName ?? sub.channelId}</span>
                    <span className="text-xs text-muted-foreground">→</span>
                    <span className="text-xs text-muted-foreground">{sub.conversationTitle ?? "All Conversations"}</span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {sub.eventTypes.map((ev) => (
                      <Badge key={ev} variant="secondary" className="text-[10px] px-1 py-0">{ev}</Badge>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{relativeTime(sub.createdAt)}</p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-destructive hover:text-destructive flex-shrink-0"
                  onClick={() => removeSub.mutate({ channelId: sub.channelId, conversationId: sub.conversationId })}
                  data-testid={`sub-remove-${sub.id}`}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <Separator />

      {/* Add subscription */}
      <div className="space-y-3" data-testid="add-subscription-form">
        <h3 className="text-sm font-medium">Add Subscription</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select value={subChannel} onValueChange={setSubChannel}>
            <SelectTrigger className="h-8 text-sm" data-testid="sub-channel-select">
              <SelectValue placeholder="Select channel…" />
            </SelectTrigger>
            <SelectContent>
              {connectedChannels.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="all-convs"
              checked={allConvs}
              onChange={(e) => setAllConvs(e.target.checked)}
              className="rounded"
              data-testid="sub-all-convs"
            />
            <label htmlFor="all-convs" className="text-sm cursor-pointer">All Conversations</label>
          </div>
          {!allConvs && (
            <Select value={subConvId} onValueChange={setSubConvId}>
              <SelectTrigger className="h-8 text-sm sm:col-span-2" data-testid="sub-conv-select">
                <SelectValue placeholder="Select conversation…" />
              </SelectTrigger>
              <SelectContent>
                {(conversations as { id: string; title: string }[]).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-2">Event types</p>
          <div className="flex flex-wrap gap-2">
            {ALL_EVENT_TYPES.map((ev) => (
              <label key={ev} className="flex items-center gap-1.5 text-xs cursor-pointer" data-testid={`event-type-${ev}`}>
                <input
                  type="checkbox"
                  checked={subEvents.includes(ev)}
                  onChange={() => toggleEvent(ev)}
                  className="rounded"
                />
                {ev}
              </label>
            ))}
          </div>
        </div>
        <Button
          size="sm"
          onClick={() => subscribeMutation.mutate()}
          disabled={!subChannel || subEvents.length === 0 || subscribeMutation.isPending}
          data-testid="subscribe-btn"
        >
          {subscribeMutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
          Subscribe
        </Button>
      </div>

      <Separator />

      {/* Test notification */}
      <div className="space-y-3" data-testid="test-notification-section">
        <h3 className="text-sm font-medium">Test Notification</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select value={notifType} onValueChange={setNotifType}>
            <SelectTrigger className="h-8 text-sm" data-testid="notif-type-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ALL_EVENT_TYPES.map((ev) => (
                <SelectItem key={ev} value={ev}>{ev}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={notifSeverity} onValueChange={(v) => setNotifSeverity(v as Severity)}>
            <SelectTrigger className="h-8 text-sm" data-testid="notif-severity-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(["info", "warning", "error", "success"] as Severity[]).map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={notifTitle}
            onChange={(e) => setNotifTitle(e.target.value)}
            placeholder="Notification title"
            className="h-8 text-sm sm:col-span-2"
            data-testid="notif-title"
          />
        </div>
        <Textarea
          value={notifBody}
          onChange={(e) => setNotifBody(e.target.value)}
          placeholder="Notification body…"
          rows={2}
          className="text-sm resize-none"
          data-testid="notif-body"
        />
        <Button
          size="sm"
          onClick={() => notifyMutation.mutate()}
          disabled={!notifTitle || !notifBody || notifyMutation.isPending}
          data-testid="notif-send-btn"
        >
          {notifyMutation.isPending
            ? <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            : <Bell className="w-4 h-4 mr-1" />}
          Send Test
        </Button>
      </div>
    </div>
  );
}

// ─── Tab 4: Dashboard ─────────────────────────────────────────────────────────

function DashboardTab() {
  const { toast } = useToast();
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([]);
  const eventsEndRef = useRef<HTMLDivElement>(null);

  const { data: stats, isLoading: statsLoading } = useQuery<Stats>({
    queryKey: ["/api/messaging/stats"],
    refetchInterval: 15_000,
  });

  // SSE stream
  useEffect(() => {
    let es: EventSource;
    try {
      es = new EventSource(getSSEUrl("/api/messaging/stream"));
      es.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data) as LiveEvent;
          setLiveEvents((prev) => [data, ...prev].slice(0, 100));
        } catch {
          setLiveEvents((prev) => [
            { type: "raw", timestamp: Date.now(), message: ev.data },
            ...prev,
          ].slice(0, 100));
        }
      };
      es.onerror = () => {
        // silently handle SSE errors (backend may not have stream implemented)
      };
    } catch (e) {
      // SSE not supported or unavailable
    }
    return () => es?.close();
  }, []);

  const statCards = [
    { label: "Total Channels", value: stats?.totalChannels ?? "—", icon: <MessageSquare className="w-4 h-4" /> },
    { label: "Connected", value: stats?.connected ?? "—", icon: <CheckCircle2 className="w-4 h-4 text-green-500" /> },
    { label: "Sent (24h)", value: stats?.sentLast24h ?? "—", icon: <ArrowUpRight className="w-4 h-4 text-green-500" /> },
    { label: "Received (24h)", value: stats?.receivedLast24h ?? "—", icon: <ArrowDownLeft className="w-4 h-4 text-blue-500" /> },
    {
      label: "Delivery Rate",
      value: stats ? `${((stats.deliveryRate ?? 0) * 100).toFixed(1)}%` : "—",
      icon: <BarChart3 className="w-4 h-4 text-primary" />,
    },
    { label: "Queue Depth", value: stats?.queueDepth ?? "—", icon: <Loader2 className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3" data-testid="stats-cards">
        {statCards.map(({ label, value, icon }) => (
          <Card key={label} data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>
            <CardContent className="p-3">
              <div className="flex items-center gap-1.5 mb-1 text-muted-foreground">{icon}</div>
              {statsLoading ? (
                <Skeleton className="h-6 w-12 mb-1" />
              ) : (
                <p className="text-xl font-bold leading-tight">{value}</p>
              )}
              <p className="text-[10px] text-muted-foreground leading-tight">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Live activity */}
      <div>
        <h3 className="text-sm font-medium mb-2 flex items-center gap-1.5">
          <Radio className="w-4 h-4" />
          Live Activity
          <span className="ml-1 flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
          </span>
        </h3>
        <ScrollArea className="h-80 rounded-lg border bg-muted/30" data-testid="live-feed">
          {liveEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground" data-testid="live-empty">
              <Radio className="w-8 h-8 mb-2 opacity-20" />
              <p className="text-xs">Waiting for events…</p>
            </div>
          ) : (
            <div className="p-3 space-y-1 font-mono text-xs">
              {liveEvents.map((ev, i) => (
                <div key={i} className="flex gap-2 items-start" data-testid={`live-event-${i}`}>
                  <span className="text-muted-foreground flex-shrink-0">{relativeTime(ev.timestamp)}</span>
                  <Badge variant="outline" className="text-[10px] px-1 py-0 flex-shrink-0">{ev.type}</Badge>
                  <span className="text-foreground break-all">{ev.message}</span>
                </div>
              ))}
              <div ref={eventsEndRef} />
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export function MessagingPage() {
  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6" data-testid="messaging-page">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <MessageSquare className="w-6 h-6" />
          Messaging Hub
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Omni-channel messaging — manage channels, history, notifications, and live activity.
        </p>
      </div>

      <Tabs defaultValue="channels" data-testid="messaging-tabs">
        <TabsList>
          <TabsTrigger value="channels" data-testid="tab-channels">
            <Webhook className="w-4 h-4 mr-1.5" />Channels
          </TabsTrigger>
          <TabsTrigger value="messages" data-testid="tab-messages">
            <Send className="w-4 h-4 mr-1.5" />Messages
          </TabsTrigger>
          <TabsTrigger value="notifications" data-testid="tab-notifications">
            <Bell className="w-4 h-4 mr-1.5" />Notifications
          </TabsTrigger>
          <TabsTrigger value="dashboard" data-testid="tab-dashboard">
            <BarChart3 className="w-4 h-4 mr-1.5" />Dashboard
          </TabsTrigger>
        </TabsList>

        <TabsContent value="channels" className="mt-4">
          <ChannelsTab />
        </TabsContent>
        <TabsContent value="messages" className="mt-4">
          <MessagesTab />
        </TabsContent>
        <TabsContent value="notifications" className="mt-4">
          <NotificationsTab />
        </TabsContent>
        <TabsContent value="dashboard" className="mt-4">
          <DashboardTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
