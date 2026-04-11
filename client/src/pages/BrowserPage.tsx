import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest, getSSEUrl } from "@/lib/queryClient";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Globe,
  Play,
  RefreshCw,
  Camera,
  Smartphone,
  Tablet,
  Monitor,
  Code,
  MousePointer,
  Type,
  ArrowDown,
  X,
  Terminal,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BrowserSession {
  id: string;
  url?: string;
  width?: number;
  height?: number;
}

interface ConsoleEntry {
  ts: string;
  type: "navigate" | "action" | "evaluate" | "screenshot" | "error" | "resize";
  message: string;
  result?: string;
}

const DEVICE_PRESETS = [
  { label: "Mobile", icon: Smartphone, width: 390, height: 844 },
  { label: "Tablet", icon: Tablet, width: 768, height: 1024 },
  { label: "Desktop", icon: Monitor, width: 1280, height: 800 },
];

const ACTION_OPTIONS = [
  { value: "click", label: "Click" },
  { value: "type", label: "Type" },
  { value: "select", label: "Select" },
  { value: "scroll", label: "Scroll" },
  { value: "hover", label: "Hover" },
  { value: "clear", label: "Clear" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function now() {
  return new Date().toLocaleTimeString([], { hour12: false });
}

function formatViewport(w?: number, h?: number) {
  if (!w || !h) return "—";
  return `${w} × ${h}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function BrowserPage() {
  // ── URL bar
  const [urlInput, setUrlInput] = useState("https://");
  const urlInputRef = useRef<HTMLInputElement>(null);

  // ── Active session
  const [activeSession, setActiveSession] = useState<string | undefined>();

  // ── Screenshot
  const [screenshotSrc, setScreenshotSrc] = useState<string | null>(null);
  const [screenshotTime, setScreenshotTime] = useState<number>(Date.now());

  // ── Action panel
  const [actionType, setActionType] = useState("click");
  const [selector, setSelector] = useState("");
  const [actionValue, setActionValue] = useState("");
  const [actionResult, setActionResult] = useState<string | null>(null);

  // ── Evaluate panel
  const [evalScript, setEvalScript] = useState("document.title");
  const [evalResult, setEvalResult] = useState<string | null>(null);

  // ── Console log
  const [consoleLogs, setConsoleLogs] = useState<ConsoleEntry[]>([]);
  const consoleEndRef = useRef<HTMLDivElement>(null);

  // ── Status
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  // ── Viewport display
  const [viewport, setViewport] = useState<{ w?: number; h?: number }>({});

  // ─── Append to console ────────────────────────────────────────────────────

  const log = useCallback((entry: Omit<ConsoleEntry, "ts">) => {
    setConsoleLogs((prev) => [...prev, { ...entry, ts: now() }]);
  }, []);

  useEffect(() => {
    consoleEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [consoleLogs]);

  // ─── Sessions query ───────────────────────────────────────────────────────

  const { data: rawSessions, refetch: refetchSessions } = useQuery<
    { sessions: BrowserSession[] } | BrowserSession[]
  >({
    queryKey: ["/api/browser/sessions"],
    refetchInterval: 5000,
  });
  // Backend returns { sessions: [...] } — unwrap it, with fallback for safety
  const sessions: BrowserSession[] = Array.isArray(rawSessions)
    ? rawSessions
    : Array.isArray((rawSessions as any)?.sessions)
      ? (rawSessions as any).sessions
      : [];

  // Auto-select first available session
  useEffect(() => {
    if (sessions.length > 0 && !activeSession) {
      setActiveSession(sessions[0].id);
    }
    if (activeSession && !sessions.find((s) => s.id === activeSession)) {
      setActiveSession(sessions[0]?.id);
    }
  }, [sessions, activeSession]);

  // Sync viewport from active session
  useEffect(() => {
    const s = sessions.find((s) => s.id === activeSession);
    if (s) {
      setViewport({ w: s.width, h: s.height });
      if (s.url) setUrlInput(s.url);
    }
  }, [activeSession, sessions]);

  // ─── Screenshot refresh ───────────────────────────────────────────────────

  const refreshScreenshot = useCallback(() => {
    if (!activeSession) return;
    setScreenshotTime(Date.now());
    setScreenshotSrc(
      getSSEUrl(`/api/browser/screenshot/${activeSession}`) +
        `?t=${Date.now()}`
    );
  }, [activeSession]);

  // Auto-refresh screenshot every 3 seconds when session active
  useEffect(() => {
    if (!activeSession) return;
    refreshScreenshot();
    const interval = setInterval(refreshScreenshot, 3000);
    return () => clearInterval(interval);
  }, [activeSession, refreshScreenshot]);

  // ─── Navigate mutation ────────────────────────────────────────────────────

  const navigateMutation = useMutation({
    mutationFn: (url: string) =>
      apiRequest("POST", "/api/browser/navigate", {
        url,
        session: activeSession,
        screenshot: true,
      }),
    onMutate: () => setStatus("loading"),
    onSuccess: (data) => {
      setStatus("idle");
      if (data?.session) setActiveSession(data.session);
      log({
        type: "navigate",
        message: `Navigated to ${urlInput}`,
        result: data?.url || urlInput,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/browser/sessions"] });
      setTimeout(refreshScreenshot, 300);
    },
    onError: (err: Error) => {
      setStatus("error");
      log({ type: "error", message: `Navigate failed: ${err.message}` });
    },
  });

  const handleNavigate = () => {
    let url = urlInput.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    setUrlInput(url);
    navigateMutation.mutate(url);
  };

  // ─── Action mutation ──────────────────────────────────────────────────────

  const actionMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/browser/action", {
        action: actionType,
        selector: selector || undefined,
        value: actionValue || undefined,
        direction: actionType === "scroll" ? (actionValue || "down") : undefined,
        session: activeSession,
      }),
    onMutate: () => setStatus("loading"),
    onSuccess: (data) => {
      setStatus("idle");
      const result = JSON.stringify(data, null, 2);
      setActionResult(result);
      log({
        type: "action",
        message: `${actionType}${selector ? ` on "${selector}"` : ""}${actionValue ? ` value="${actionValue}"` : ""}`,
        result,
      });
      setTimeout(refreshScreenshot, 300);
    },
    onError: (err: Error) => {
      setStatus("error");
      setActionResult(`Error: ${err.message}`);
      log({ type: "error", message: `Action failed: ${err.message}` });
    },
  });

  // ─── Evaluate mutation ────────────────────────────────────────────────────

  const evalMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/browser/evaluate", {
        script: evalScript,
        session: activeSession,
      }),
    onMutate: () => setStatus("loading"),
    onSuccess: (data) => {
      setStatus("idle");
      const result = JSON.stringify(data?.result ?? data, null, 2);
      setEvalResult(result);
      log({
        type: "evaluate",
        message: evalScript.length > 60 ? evalScript.slice(0, 60) + "…" : evalScript,
        result,
      });
    },
    onError: (err: Error) => {
      setStatus("error");
      setEvalResult(`Error: ${err.message}`);
      log({ type: "error", message: `Evaluate failed: ${err.message}` });
    },
  });

  // ─── Screenshot mutation ──────────────────────────────────────────────────

  const screenshotMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/browser/navigate", {
        url: urlInput,
        session: activeSession,
        screenshot: true,
      }),
    onMutate: () => setStatus("loading"),
    onSuccess: () => {
      setStatus("idle");
      log({ type: "screenshot", message: "Screenshot captured" });
      refreshScreenshot();
    },
    onError: (err: Error) => {
      setStatus("error");
      log({ type: "error", message: `Screenshot failed: ${err.message}` });
    },
  });

  // ─── Resize mutation ──────────────────────────────────────────────────────

  const resizeMutation = useMutation({
    mutationFn: ({ width, height }: { width: number; height: number }) =>
      apiRequest("POST", "/api/browser/resize", {
        width,
        height,
        session: activeSession,
      }),
    onMutate: () => setStatus("loading"),
    onSuccess: (_data, vars) => {
      setStatus("idle");
      setViewport({ w: vars.width, h: vars.height });
      log({
        type: "resize",
        message: `Resized to ${vars.width} × ${vars.height}`,
      });
      setTimeout(refreshScreenshot, 300);
    },
    onError: (err: Error) => {
      setStatus("error");
      log({ type: "error", message: `Resize failed: ${err.message}` });
    },
  });

  // ─── Close session ────────────────────────────────────────────────────────

  const closeSessionMutation = useMutation({
    mutationFn: (sessionId: string) =>
      apiRequest("DELETE", `/api/browser/sessions/${sessionId}`),
    onSuccess: (_data, sessionId) => {
      log({ type: "action", message: `Closed session ${sessionId}` });
      if (activeSession === sessionId) {
        setActiveSession(undefined);
        setScreenshotSrc(null);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/browser/sessions"] });
    },
    onError: (err: Error) => {
      log({ type: "error", message: `Close session failed: ${err.message}` });
    },
  });

  // ─── Status badge ─────────────────────────────────────────────────────────

  const statusConfig = {
    idle: { label: "Idle", className: "bg-muted text-muted-foreground" },
    loading: { label: "Loading…", className: "bg-yellow-500/20 text-yellow-400" },
    error: { label: "Error", className: "bg-destructive/20 text-destructive" },
  };

  const isLoading =
    navigateMutation.isPending ||
    actionMutation.isPending ||
    evalMutation.isPending ||
    screenshotMutation.isPending ||
    resizeMutation.isPending;

  const displayStatus = isLoading ? "loading" : status;

  // ─── Console icon map ─────────────────────────────────────────────────────

  const logIcon: Record<ConsoleEntry["type"], string> = {
    navigate: "→",
    action: "▶",
    evaluate: "⟩",
    screenshot: "📷",
    resize: "⤢",
    error: "✕",
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      {/* ── TOP BAR ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-card shrink-0 flex-wrap">
        {/* URL input */}
        <Globe className="w-4 h-4 text-muted-foreground shrink-0" />
        <Input
          ref={urlInputRef}
          data-testid="input-url"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleNavigate();
          }}
          className="flex-1 min-w-[160px] font-mono text-sm h-8"
          placeholder="https://example.com"
        />
        <Button
          data-testid="button-go"
          size="sm"
          onClick={handleNavigate}
          disabled={isLoading}
          className="h-8 px-3 gap-1.5"
        >
          <Play className="w-3.5 h-3.5" />
          Go
        </Button>
        <Button
          data-testid="button-refresh"
          size="sm"
          variant="outline"
          onClick={refreshScreenshot}
          disabled={!activeSession || isLoading}
          className="h-8 px-2"
          title="Refresh screenshot"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>

        <Separator orientation="vertical" className="h-6" />

        {/* Device presets */}
        {DEVICE_PRESETS.map(({ label, icon: Icon, width, height }) => (
          <Button
            key={label}
            data-testid={`button-device-${label.toLowerCase()}`}
            size="sm"
            variant="outline"
            className="h-8 px-2 gap-1"
            title={`${label} (${width}×${height})`}
            disabled={!activeSession || isLoading}
            onClick={() => resizeMutation.mutate({ width, height })}
          >
            <Icon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline text-xs">{label}</span>
          </Button>
        ))}

        <Separator orientation="vertical" className="h-6" />

        {/* Screenshot */}
        <Button
          data-testid="button-screenshot"
          size="sm"
          variant="outline"
          className="h-8 px-2 gap-1"
          title="Capture screenshot"
          disabled={!activeSession || isLoading}
          onClick={() => {
            log({ type: "screenshot", message: "Screenshot captured" });
            refreshScreenshot();
          }}
        >
          <Camera className="w-3.5 h-3.5" />
          <span className="hidden sm:inline text-xs">Screenshot</span>
        </Button>
      </div>

      {/* ── MAIN AREA ────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left: Screenshot preview (60%) */}
        <div className="flex flex-col border-r border-border" style={{ flex: "0 0 60%" }}>
          {/* Preview toolbar */}
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-card/50 shrink-0">
            <span className="text-xs font-medium text-muted-foreground">
              Preview
            </span>
            <Button
              data-testid="button-refresh-preview"
              size="sm"
              variant="ghost"
              className="h-6 px-2 gap-1 text-xs"
              onClick={refreshScreenshot}
              disabled={!activeSession}
            >
              <RefreshCw className="w-3 h-3" />
              Refresh
            </Button>
          </div>

          {/* Screenshot area */}
          <div className="flex-1 overflow-auto bg-muted/30 flex items-start justify-center p-4">
            {!activeSession ? (
              <div
                data-testid="empty-state-browser"
                className="flex flex-col items-center justify-center gap-3 text-center mt-16"
              >
                <Globe className="w-12 h-12 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground font-medium">
                  No active session
                </p>
                <p className="text-xs text-muted-foreground/60 max-w-[200px]">
                  Enter a URL above and press Go to start a browser session.
                </p>
              </div>
            ) : screenshotSrc ? (
              <img
                data-testid="img-screenshot"
                key={screenshotTime}
                src={screenshotSrc}
                alt="Browser screenshot"
                className="max-w-full rounded border border-border shadow-sm"
                onError={() => setScreenshotSrc(null)}
              />
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 mt-16">
                <RefreshCw className="w-8 h-8 text-muted-foreground/40 animate-spin" />
                <p className="text-sm text-muted-foreground">
                  Loading screenshot…
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right: Action panel (40%) */}
        <div className="flex flex-col min-w-0" style={{ flex: "0 0 40%" }}>
          <Tabs defaultValue="actions" className="flex flex-col h-full">
            <TabsList className="w-full rounded-none border-b border-border bg-card/50 shrink-0 h-9 px-2 justify-start gap-0">
              <TabsTrigger
                value="actions"
                data-testid="tab-actions"
                className="text-xs h-7 px-3 gap-1.5"
              >
                <MousePointer className="w-3 h-3" />
                Actions
              </TabsTrigger>
              <TabsTrigger
                value="evaluate"
                data-testid="tab-evaluate"
                className="text-xs h-7 px-3 gap-1.5"
              >
                <Code className="w-3 h-3" />
                Evaluate
              </TabsTrigger>
              <TabsTrigger
                value="sessions"
                data-testid="tab-sessions"
                className="text-xs h-7 px-3 gap-1.5"
              >
                <Globe className="w-3 h-3" />
                Sessions
                {sessions.length > 0 && (
                  <Badge
                    variant="secondary"
                    className="ml-1 h-4 px-1 text-[10px]"
                  >
                    {sessions.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger
                value="console"
                data-testid="tab-console"
                className="text-xs h-7 px-3 gap-1.5"
              >
                <Terminal className="w-3 h-3" />
                Console
                {consoleLogs.length > 0 && (
                  <Badge
                    variant="secondary"
                    className="ml-1 h-4 px-1 text-[10px]"
                  >
                    {consoleLogs.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            {/* ── Actions tab ─────────────────────────────────────────── */}
            <TabsContent
              value="actions"
              className="flex-1 overflow-y-auto m-0 p-3 space-y-3"
            >
              <div className="space-y-2">
                {/* Action type */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Action
                  </label>
                  <Select
                    value={actionType}
                    onValueChange={setActionType}
                  >
                    <SelectTrigger
                      data-testid="select-action-type"
                      className="h-8 text-sm"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ACTION_OPTIONS.map((opt) => (
                        <SelectItem
                          key={opt.value}
                          value={opt.value}
                          data-testid={`option-action-${opt.value}`}
                        >
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Selector */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Selector (CSS / XPath)
                  </label>
                  <Input
                    data-testid="input-selector"
                    value={selector}
                    onChange={(e) => setSelector(e.target.value)}
                    placeholder="#submit-btn, .nav-link, button[type='submit']"
                    className="h-8 text-sm font-mono"
                  />
                </div>

                {/* Value */}
                {["type", "select", "scroll"].includes(actionType) && (
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">
                      {actionType === "scroll"
                        ? "Direction (up / down)"
                        : "Value"}
                    </label>
                    <Input
                      data-testid="input-action-value"
                      value={actionValue}
                      onChange={(e) => setActionValue(e.target.value)}
                      placeholder={
                        actionType === "scroll"
                          ? "down"
                          : actionType === "type"
                          ? "Text to type…"
                          : "Option value"
                      }
                      className="h-8 text-sm"
                    />
                  </div>
                )}

                <Button
                  data-testid="button-execute-action"
                  size="sm"
                  className="w-full gap-2"
                  onClick={() => actionMutation.mutate()}
                  disabled={!activeSession || actionMutation.isPending}
                >
                  {actionMutation.isPending ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Play className="w-3.5 h-3.5" />
                  )}
                  Execute
                </Button>
              </div>

              {/* Result */}
              {actionResult && (
                <Card className="border-border bg-muted/30">
                  <CardContent className="p-3">
                    <p className="text-xs font-medium text-muted-foreground mb-1.5">
                      Result
                    </p>
                    <pre
                      data-testid="text-action-result"
                      className="text-xs font-mono text-foreground whitespace-pre-wrap break-all"
                    >
                      {actionResult}
                    </pre>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* ── Evaluate tab ─────────────────────────────────────────── */}
            <TabsContent
              value="evaluate"
              className="flex-1 overflow-y-auto m-0 p-3 space-y-3"
            >
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">
                  JavaScript
                </label>
                <Textarea
                  data-testid="textarea-eval-script"
                  value={evalScript}
                  onChange={(e) => setEvalScript(e.target.value)}
                  placeholder="document.title"
                  rows={6}
                  className="text-sm font-mono resize-none"
                  onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                      e.preventDefault();
                      evalMutation.mutate();
                    }
                  }}
                />
                <p className="text-[10px] text-muted-foreground">
                  Press Ctrl+Enter to run
                </p>
                <Button
                  data-testid="button-run-eval"
                  size="sm"
                  className="w-full gap-2"
                  onClick={() => evalMutation.mutate()}
                  disabled={!activeSession || evalMutation.isPending}
                >
                  {evalMutation.isPending ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Code className="w-3.5 h-3.5" />
                  )}
                  Run
                </Button>
              </div>

              {evalResult && (
                <Card className="border-border bg-muted/30">
                  <CardContent className="p-3">
                    <p className="text-xs font-medium text-muted-foreground mb-1.5">
                      Output
                    </p>
                    <pre
                      data-testid="text-eval-result"
                      className="text-xs font-mono text-foreground whitespace-pre-wrap break-all"
                    >
                      {evalResult}
                    </pre>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* ── Sessions tab ─────────────────────────────────────────── */}
            <TabsContent
              value="sessions"
              className="flex-1 overflow-y-auto m-0 p-3"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-muted-foreground">
                  Active Sessions
                </span>
                <Button
                  data-testid="button-refresh-sessions"
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-xs gap-1"
                  onClick={() => refetchSessions()}
                >
                  <RefreshCw className="w-3 h-3" />
                  Refresh
                </Button>
              </div>

              {sessions.length === 0 ? (
                <div
                  data-testid="empty-state-sessions"
                  className="text-center py-8"
                >
                  <Globe className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    No active sessions
                  </p>
                  <p className="text-xs text-muted-foreground/60 mt-1">
                    Navigate to a URL to create one.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {sessions.map((session) => (
                    <Card
                      key={session.id}
                      data-testid={`card-session-${session.id}`}
                      className={`border-border transition-colors cursor-pointer ${
                        activeSession === session.id
                          ? "bg-primary/5 border-primary/30"
                          : "hover:bg-muted/40"
                      }`}
                      onClick={() => setActiveSession(session.id)}
                    >
                      <CardContent className="p-2.5 flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-mono font-medium truncate text-foreground">
                            {session.id}
                          </p>
                          {session.url && (
                            <p className="text-[11px] text-muted-foreground truncate mt-0.5 font-mono">
                              {session.url}
                            </p>
                          )}
                          {session.width && session.height && (
                            <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                              {session.width} × {session.height}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {activeSession === session.id && (
                            <Badge
                              variant="secondary"
                              className="text-[10px] h-4 px-1.5"
                            >
                              active
                            </Badge>
                          )}
                          <Button
                            data-testid={`button-close-session-${session.id}`}
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                            title="Close session"
                            onClick={(e) => {
                              e.stopPropagation();
                              closeSessionMutation.mutate(session.id);
                            }}
                          >
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* ── Console tab ──────────────────────────────────────────── */}
            <TabsContent
              value="console"
              className="flex-1 min-h-0 m-0 flex flex-col"
            >
              <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
                <span className="text-xs font-medium text-muted-foreground">
                  Action Log
                </span>
                <Button
                  data-testid="button-clear-console"
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-xs"
                  onClick={() => setConsoleLogs([])}
                >
                  Clear
                </Button>
              </div>
              <ScrollArea className="flex-1">
                <div
                  data-testid="scroll-console"
                  className="p-3 space-y-1.5 font-mono text-xs"
                >
                  {consoleLogs.length === 0 ? (
                    <p className="text-muted-foreground/50 text-center py-8">
                      No actions yet.
                    </p>
                  ) : (
                    consoleLogs.map((entry, i) => (
                      <div
                        key={i}
                        data-testid={`log-entry-${i}`}
                        className={`flex gap-2 ${
                          entry.type === "error"
                            ? "text-destructive"
                            : "text-foreground/80"
                        }`}
                      >
                        <span className="text-muted-foreground/50 shrink-0 select-none">
                          {entry.ts}
                        </span>
                        <span className="shrink-0 select-none w-4 text-center">
                          {logIcon[entry.type]}
                        </span>
                        <span className="break-all">{entry.message}</span>
                      </div>
                    ))
                  )}
                  <div ref={consoleEndRef} />
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* ── BOTTOM BAR ───────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-3 py-1.5 border-t border-border bg-card shrink-0 text-xs">
        {/* Session selector */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-muted-foreground shrink-0">Session:</span>
          {sessions.length > 0 ? (
            <Select
              value={activeSession ?? ""}
              onValueChange={(v) => setActiveSession(v)}
            >
              <SelectTrigger
                data-testid="select-session"
                className="h-6 text-xs font-mono w-auto min-w-[140px] max-w-[200px] border-0 bg-transparent p-0 pr-6 focus:ring-0"
              >
                <SelectValue placeholder="Select session…" />
              </SelectTrigger>
              <SelectContent>
                {sessions.map((s) => (
                  <SelectItem
                    key={s.id}
                    value={s.id}
                    data-testid={`option-session-${s.id}`}
                    className="font-mono text-xs"
                  >
                    {s.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span
              data-testid="text-no-session"
              className="text-muted-foreground/50"
            >
              None
            </span>
          )}
        </div>

        <Separator orientation="vertical" className="h-4" />

        {/* Viewport */}
        <div className="flex items-center gap-1.5">
          <Monitor className="w-3.5 h-3.5 text-muted-foreground" />
          <span
            data-testid="text-viewport"
            className="text-muted-foreground font-mono"
          >
            {formatViewport(viewport.w, viewport.h)}
          </span>
        </div>

        <Separator orientation="vertical" className="h-4" />

        {/* Status */}
        <div className="flex items-center gap-1.5 ml-auto">
          <span
            data-testid="badge-status"
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${statusConfig[displayStatus].className}`}
          >
            {displayStatus === "loading" && (
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse inline-block" />
            )}
            {statusConfig[displayStatus].label}
          </span>
        </div>
      </div>
    </div>
  );
}
