import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../lib/queryClient";
import { useTheme } from "./ThemeProvider";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import { Separator } from "./ui/separator";
import {
  Plus, Cpu, Brain, Plug, Sun, Moon,
  ChevronLeft, ChevronRight, Trash2, BookOpen,
  Container, Library, Settings, FolderOpen, BarChart3, Globe, Store, Activity,
  MessageSquare, Zap, Shield, Database, FileText, Bug,
} from "lucide-react";
import { MobileSidebar, MobileMenuButton } from "./MobileSidebar";
import { NotificationCenter } from "./NotificationCenter";
import { useToast } from "../hooks/use-toast";
import type { Conversation } from "../../../shared/schema";

const NAV = [
  { href: "/models", icon: Cpu, label: "Models" },
  { href: "/skills", icon: BookOpen, label: "Skills" },
  { href: "/connectors", icon: Plug, label: "Connectors" },
  { href: "/memory", icon: Brain, label: "Memory" },
  { href: "/library", icon: Library, label: "Library" },
  { href: "/sandbox", icon: Container, label: "Sandbox" },
  { href: "/browser", icon: Globe, label: "Browser" },
  { href: "/files", icon: FolderOpen, label: "Files" },
  { href: "/marketplace", icon: Store, label: "Marketplace" },
  { href: "/autonomy", icon: Activity, label: "Autonomy" },
  { href: "/protocols", icon: Plug, label: "Protocols" },
  { href: "/messaging", icon: MessageSquare, label: "Messaging" },
  { href: "/nip", icon: Zap, label: "NIP" },
  { href: "/identity", icon: Shield, label: "Identity" },
  { href: "/cache", icon: Database, label: "Cache" },
  { href: "/knowledge", icon: FileText, label: "Knowledge" },
  { href: "/swarm", icon: Bug, label: "Swarm" },
  { href: "/tokens", icon: BarChart3, label: "Tokens" },
  { href: "/settings", icon: Settings, label: "Settings" },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [location, setLocation] = useLocation();
  const { theme, toggle } = useTheme();
  const qc = useQueryClient();

  // Inline rename state
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Delete confirmation state
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [showClearAll, setShowClearAll] = useState(false);

  const { data: conversations = [], isError: convsError } = useQuery<Conversation[]>({ queryKey: ["/api/conversations"] });

  const { toast } = useToast();

  const createConv = useMutation({
    mutationFn: () => apiRequest("POST", "/api/conversations", { title: "New Session" }),
    onSuccess: (data: Conversation) => {
      qc.invalidateQueries({ queryKey: ["/api/conversations"] });
      setLocation(`/chat/${data.id}`);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteConv = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/conversations/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/conversations"] });
      setPendingDeleteId(null);
      if (location.includes("/chat/")) setLocation("/");
    },
    onError: (e: any) => { setPendingDeleteId(null); toast({ title: "Error", description: e.message, variant: "destructive" }); },
  });

  const confirmDelete = useCallback((id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setPendingDeleteId(id);
  }, []);

  const executeDelete = useCallback(() => {
    if (pendingDeleteId) deleteConv.mutate(pendingDeleteId);
  }, [pendingDeleteId, deleteConv]);

  const cancelDelete = useCallback(() => {
    setPendingDeleteId(null);
  }, []);

  const clearAllSessions = useCallback(async () => {
    for (const conv of conversations) {
      await apiRequest("DELETE", `/api/conversations/${conv.id}`);
    }
    qc.invalidateQueries({ queryKey: ["/api/conversations"] });
    setShowClearAll(false);
    setLocation("/");
    toast({ title: "Cleared", description: "All sessions deleted." });
  }, [conversations, qc, setLocation, toast]);

  const renameConv = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      apiRequest("PATCH", `/api/conversations/${id}`, { title }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/conversations"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const startRename = (conv: Conversation) => {
    setRenamingId(conv.id);
    setRenameValue(conv.title);
    // Focus input on next tick after render
    setTimeout(() => renameInputRef.current?.select(), 0);
  };

  const commitRename = () => {
    if (renamingId && renameValue.trim()) {
      renameConv.mutate({ id: renamingId, title: renameValue.trim() });
    }
    setRenamingId(null);
    setRenameValue("");
  };

  const cancelRename = () => {
    setRenamingId(null);
    setRenameValue("");
  };

  // Listen for keyboard shortcut events dispatched by useKeyboardShortcuts
  useEffect(() => {
    const handleNewSession = () => createConv.mutate();
    const handleNavigate = (e: Event) => {
      const path = (e as CustomEvent).detail?.path;
      if (path) setLocation(path);
    };
    const handleToggleSidebar = () => setCollapsed(c => !c);

    window.addEventListener("ultra:new-session", handleNewSession);
    window.addEventListener("ultra:navigate", handleNavigate);
    window.addEventListener("ultra:toggle-sidebar", handleToggleSidebar);

    return () => {
      window.removeEventListener("ultra:new-session", handleNewSession);
      window.removeEventListener("ultra:navigate", handleNavigate);
      window.removeEventListener("ultra:toggle-sidebar", handleToggleSidebar);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const statusColors: Record<string, string> = {
    idle: "bg-muted",
    planning: "bg-yellow-500/20 text-yellow-400",
    running: "bg-primary/20 text-primary",
    complete: "bg-green-500/20 text-green-400",
    error: "bg-destructive/20 text-destructive",
  };

  // Build the sidebar nav content (shared between desktop sidebar and MobileSidebar)
  const sidebarContent = (
    <>
      {/* New Session button */}
      <div className="p-2">
        <Button
          size="sm"
          className="w-full gap-2"
          onClick={() => createConv.mutate()}
          disabled={createConv.isPending}
          data-testid="button-new-session-mobile"
        >
          <Plus className="w-4 h-4" />
          <span>New Session</span>
        </Button>
      </div>

      {/* Conversations */}
      <ScrollArea className="flex-1 px-2">
        <div className="space-y-0.5 pb-2">
          {conversations.map(conv => (
            <div
              key={conv.id}
              className={`group flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer hover:bg-muted/60 transition-colors ${location === `/chat/${conv.id}` ? "bg-muted" : ""}`}
              onClick={() => setLocation(`/chat/${conv.id}`)}
            >
              <p className="text-xs font-medium truncate flex-1 min-w-0">{conv.title}</p>
              <button
                onClick={(e) => confirmDelete(conv.id, e)}
                className="p-1 rounded hover:bg-destructive/20 text-muted-foreground/70 hover:text-destructive transition-all shrink-0"
                aria-label={`Delete session: ${conv.title}`}
                title="Delete session"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          {conversations.length > 0 && (
            <button
              onClick={() => setShowClearAll(true)}
              className="w-full text-xs text-muted-foreground hover:text-destructive py-2 mt-1 border border-dashed border-muted-foreground/30 hover:border-destructive/50 rounded transition-colors"
            >
              Clear all sessions
            </button>
          )}
          {conversations.length === 0 && !convsError && (
            <p className="text-xs text-muted-foreground text-center py-4">No sessions yet</p>
          )}
          {convsError && (
            <p className="text-xs text-destructive text-center py-4">Failed to load sessions</p>
          )}
        </div>
      </ScrollArea>

      {/* Bottom nav */}
      <div className="border-t border-border p-2 space-y-0.5">
        {NAV.map(({ href, icon: Icon, label }) => (
          <div
            key={href}
            onClick={() => setLocation(href)}
            className={`flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer text-sm hover:bg-muted transition-colors ${location === href ? "bg-muted text-foreground" : "text-muted-foreground"}`}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setLocation(href); } }}
          >
            <Icon className="w-4 h-4 shrink-0" />
            <span>{label}</span>
          </div>
        ))}
      </div>
    </>
  );

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Mobile sidebar overlay — visible only on small screens */}
      <MobileSidebar>{sidebarContent}</MobileSidebar>

      {/* Desktop Sidebar */}
      <aside className={`hidden md:flex flex-col bg-card border-r border-border transition-all duration-200 ${collapsed ? "w-14" : "w-[260px]"} shrink-0`}>
        {/* Logo + header row */}
        <div className={`flex items-center gap-2 p-3 border-b border-border ${collapsed ? "justify-center" : ""}`}>
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 border border-primary/30 shrink-0">
            <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" aria-label="Ultra Computer">
              <polygon points="12,2 22,8 22,16 12,22 2,16 2,8" stroke="hsl(195,90%,48%)" strokeWidth="1.5" fill="none"/>
              <circle cx="12" cy="12" r="3" fill="hsl(265,70%,60%)"/>
              <line x1="12" y1="2" x2="12" y2="9" stroke="hsl(195,90%,48%)" strokeWidth="1.5"/>
              <line x1="12" y1="15" x2="12" y2="22" stroke="hsl(195,90%,48%)" strokeWidth="1.5"/>
              <line x1="22" y1="8" x2="15.5" y2="10.5" stroke="hsl(195,90%,48%)" strokeWidth="1.5"/>
              <line x1="8.5" y1="13.5" x2="2" y2="16" stroke="hsl(195,90%,48%)" strokeWidth="1.5"/>
              <line x1="2" y1="8" x2="8.5" y2="10.5" stroke="hsl(195,90%,48%)" strokeWidth="1.5"/>
              <line x1="15.5" y1="13.5" x2="22" y2="16" stroke="hsl(195,90%,48%)" strokeWidth="1.5"/>
            </svg>
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <span className="font-bold text-sm gradient-text">Ultra Computer</span>
              <p className="text-xs text-muted-foreground truncate">Agent Harness v1.0</p>
            </div>
          )}
          {!collapsed && <NotificationCenter />}
          <button
            onClick={() => setCollapsed(c => !c)}
            className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* New Session button */}
        <div className="p-2">
          <Button
            size="sm"
            className="w-full gap-2"
            onClick={() => createConv.mutate()}
            disabled={createConv.isPending}
            data-testid="button-new-session"
          >
            <Plus className="w-4 h-4" />
            {!collapsed && <span>New Session</span>}
          </Button>
        </div>

        {/* Conversations */}
        {!collapsed && (
          <ScrollArea className="flex-1 px-2">
            <div className="space-y-0.5 pb-2">
              {conversations.map(conv => (
                <div
                  key={conv.id}
                  className={`group flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer hover:bg-muted/60 transition-colors ${location === `/chat/${conv.id}` ? "bg-muted" : ""}`}
                  data-testid={`conv-item-${conv.id}`}
                  role="listitem"
                >
                  {renamingId === conv.id ? (
                    <input
                      ref={renameInputRef}
                      className="flex-1 min-w-0 bg-transparent border-0 border-b border-primary text-xs font-medium outline-none text-foreground"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename();
                        if (e.key === "Escape") cancelRename();
                      }}
                      onBlur={commitRename}
                      data-testid={`input-rename-${conv.id}`}
                      autoFocus
                    />
                  ) : (
                    <div
                      className="flex-1 min-w-0"
                      role="button"
                      tabIndex={0}
                      aria-label={`Open conversation: ${conv.title}`}
                      onClick={() => setLocation(`/chat/${conv.id}`)}
                      onDoubleClick={() => startRename(conv)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setLocation(`/chat/${conv.id}`);
                        }
                      }}
                    >
                      <p className="text-xs font-medium truncate">{conv.title}</p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${statusColors[conv.status] || "bg-muted text-muted-foreground"}`}>
                          {conv.status}
                        </span>
                      </div>
                    </div>
                  )}
                  {renamingId !== conv.id && (
                    <button
                      onClick={(e) => confirmDelete(conv.id, e)}
                      className="shrink-0 p-1 rounded hover:bg-destructive/20 text-muted-foreground/70 hover:text-destructive transition-all"
                      aria-label={`Delete session: ${conv.title}`}
                      title="Delete session"
                      tabIndex={0}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              {conversations.length > 0 && (
                <button
                  onClick={() => setShowClearAll(true)}
                  className="w-full text-xs text-muted-foreground hover:text-destructive py-2 mt-1 border border-dashed border-muted-foreground/30 hover:border-destructive/50 rounded transition-colors"
                >
                  Clear all sessions
                </button>
              )}
              {conversations.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">No sessions yet</p>
              )}
            </div>
          </ScrollArea>
        )}
        {collapsed && <div className="flex-1" />}

        {/* Bottom nav */}
        <div className="border-t border-border p-2 space-y-0.5">
          {NAV.map(({ href, icon: Icon, label }) => (
            <div
              key={href}
              onClick={() => setLocation(href)}
              className={`flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer text-sm hover:bg-muted transition-colors ${location === href ? "bg-muted text-foreground" : "text-muted-foreground"} ${collapsed ? "justify-center" : ""}`}
              data-testid={`nav-${label.toLowerCase()}`}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setLocation(href); } }}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {!collapsed && <span>{label}</span>}
            </div>
          ))}
          <Separator className="my-1" />
          <button
            onClick={toggle}
            className={`flex items-center gap-2 rounded-md px-2 py-1.5 w-full text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors ${collapsed ? "justify-center" : ""}`}
            data-testid="button-theme-toggle"
          >
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            {!collapsed && <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>}
          </button>
        </div>
      </aside>

      {/* Delete confirmation dialog */}
      {pendingDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={cancelDelete}>
          <div className="bg-card border border-border rounded-lg shadow-lg p-6 max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold mb-2">Delete Session?</h3>
            <p className="text-xs text-muted-foreground mb-4">This will permanently delete this session and all its messages, tasks, and agent runs. This cannot be undone.</p>
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="outline" onClick={cancelDelete}>Cancel</Button>
              <Button size="sm" variant="destructive" onClick={executeDelete} disabled={deleteConv.isPending}>
                {deleteConv.isPending ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Clear all confirmation dialog */}
      {showClearAll && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowClearAll(false)}>
          <div className="bg-card border border-border rounded-lg shadow-lg p-6 max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold mb-2">Clear All Sessions?</h3>
            <p className="text-xs text-muted-foreground mb-4">This will permanently delete all {conversations.length} sessions and their messages. This cannot be undone.</p>
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="outline" onClick={() => setShowClearAll(false)}>Cancel</Button>
              <Button size="sm" variant="destructive" onClick={clearAllSessions}>
                Delete All ({conversations.length})
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 min-w-0 overflow-hidden flex flex-col">
        {/* Mobile top bar — visible only on small screens */}
        <div className="md:hidden flex items-center gap-2 px-3 py-2 border-b border-border bg-card shrink-0">
          <MobileMenuButton />
          <span className="font-bold text-sm gradient-text flex-1">Ultra Computer</span>
          <NotificationCenter />
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">
          {children}
        </div>
      </main>
    </div>
  );
}
