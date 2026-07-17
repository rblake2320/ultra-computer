import { useState, useRef, useEffect } from "react";
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
  MoreHorizontal, Pencil, Check, X as XIcon,
} from "lucide-react";
import { Input } from "./ui/input";
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
  { href: "/marketplace", icon: Store, label: "Marketplace", experimental: true },
  { href: "/autonomy", icon: Activity, label: "Autonomy", experimental: true },
  { href: "/protocols", icon: Plug, label: "Protocols" },
  { href: "/messaging", icon: MessageSquare, label: "Messaging" },
  { href: "/nip", icon: Zap, label: "NIP", experimental: true },
  { href: "/identity", icon: Shield, label: "Identity", experimental: true },
  { href: "/cache", icon: Database, label: "Cache" },
  { href: "/knowledge", icon: FileText, label: "Knowledge" },
  { href: "/swarm", icon: Bug, label: "Swarm", experimental: true },
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
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const { data: conversations = [], isError: convsError } = useQuery<Conversation[]>({ queryKey: ["/api/conversations"] });
  const { data: appConfig } = useQuery<{ experimental: boolean }>({
    queryKey: ["/api/app-config"],
    staleTime: Infinity,
  });
  const nav = NAV.filter((item) => !item.experimental || appConfig?.experimental);

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
      if (location.includes("/chat/")) setLocation("/");
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

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

    const handleClickOutside = (e: MouseEvent) => {
      if (!(e.target as Element).closest('[data-session-menu]')) {
        setOpenMenuId(null);
      }
    };
    window.addEventListener("ultra:new-session", handleNewSession);
    window.addEventListener("ultra:navigate", handleNavigate);
    window.addEventListener("ultra:toggle-sidebar", handleToggleSidebar);
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      window.removeEventListener("ultra:new-session", handleNewSession);
      window.removeEventListener("ultra:navigate", handleNavigate);
      window.removeEventListener("ultra:toggle-sidebar", handleToggleSidebar);
      document.removeEventListener("mousedown", handleClickOutside);
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
          {conversations.map(conv => {
            const isActive = location === `/chat/${conv.id}`;
            const isRenaming = renamingId === conv.id;
            const menuOpen = openMenuId === conv.id;
            const status = (conv as any).status || "idle";
            return (
              <div
                key={conv.id}
                className={`group relative flex items-center gap-1.5 rounded-md px-2 py-1.5 cursor-pointer hover:bg-muted/60 transition-colors ${isActive ? "bg-muted" : ""}`}
                onClick={() => { if (!isRenaming && !menuOpen) setLocation(`/chat/${conv.id}`); }}
              >
                {/* Title / rename input */}
                <div className="flex-1 min-w-0">
                  {isRenaming ? (
                    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                      <Input
                        ref={renameInputRef}
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter") commitRename();
                          if (e.key === "Escape") cancelRename();
                        }}
                        className="h-6 text-xs px-1 py-0"
                        autoFocus
                      />
                      <button onClick={commitRename} className="text-green-400 hover:text-green-300 shrink-0"><Check className="w-3 h-3" /></button>
                      <button onClick={cancelRename} className="text-muted-foreground hover:text-foreground shrink-0"><XIcon className="w-3 h-3" /></button>
                    </div>
                  ) : (
                    <p className="text-xs font-medium truncate">{conv.title}</p>
                  )}
                  <span className={`text-[10px] px-1 rounded ${statusColors[status] || "text-muted-foreground"}`}>{status}</span>
                </div>

                {/* 3-dot menu button — visible on hover or when menu open */}
                {!isRenaming && (
                  <div className="relative" data-session-menu onClick={e => e.stopPropagation()}>
                    <button
                      className={`p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-opacity ${menuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
                      onClick={() => setOpenMenuId(menuOpen ? null : conv.id)}
                      title="Session options"
                    >
                      <MoreHorizontal className="w-3.5 h-3.5" />
                    </button>

                    {/* Dropdown */}
                    {menuOpen && (
                      <div className="absolute right-0 top-6 z-50 w-40 bg-popover border border-border rounded-lg shadow-lg py-1 text-xs" data-session-menu>
                        <button
                          className="flex items-center gap-2 w-full px-3 py-1.5 hover:bg-muted transition-colors text-left"
                          onClick={() => { setOpenMenuId(null); startRename(conv); }}
                        >
                          <Pencil className="w-3 h-3 text-muted-foreground" /> Rename
                        </button>
                        <div className="border-t border-border my-1" />
                        <button
                          className="flex items-center gap-2 w-full px-3 py-1.5 hover:bg-destructive/10 text-destructive transition-colors text-left"
                          onClick={() => { setOpenMenuId(null); deleteConv.mutate(conv.id); }}
                        >
                          <Trash2 className="w-3 h-3" /> Delete
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
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
        {nav.map(({ href, icon: Icon, label }) => (
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
              {conversations.map(conv => {
                const isActive = location === `/chat/${conv.id}`;
                const isRenaming = renamingId === conv.id;
                const menuOpen = openMenuId === conv.id;
                return (
                  <div
                    key={conv.id}
                    className={`group relative flex items-center gap-1.5 rounded-md px-2 py-1.5 cursor-pointer hover:bg-muted/60 transition-colors ${isActive ? "bg-muted" : ""}`}
                    data-testid={`conv-item-${conv.id}`}
                    role="listitem"
                    onClick={() => { if (!isRenaming && !menuOpen) setLocation(`/chat/${conv.id}`); }}
                  >
                    {/* Title / rename */}
                    <div className="flex-1 min-w-0">
                      {isRenaming ? (
                        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                          <Input
                            ref={renameInputRef}
                            value={renameValue}
                            onChange={e => setRenameValue(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === "Enter") commitRename();
                              if (e.key === "Escape") cancelRename();
                            }}
                            className="h-6 text-xs px-1 py-0"
                            autoFocus
                            data-testid={`input-rename-${conv.id}`}
                          />
                          <button onClick={commitRename} className="text-green-400 hover:text-green-300 shrink-0"><Check className="w-3 h-3" /></button>
                          <button onClick={cancelRename} className="text-muted-foreground hover:text-foreground shrink-0"><XIcon className="w-3 h-3" /></button>
                        </div>
                      ) : (
                        <>
                          <p className="text-xs font-medium truncate">{conv.title}</p>
                          <span className={`text-[10px] px-1 rounded ${statusColors[conv.status] || "text-muted-foreground"}`}>{conv.status}</span>
                        </>
                      )}
                    </div>

                    {/* 3-dot menu */}
                    {!isRenaming && (
                      <div className="relative shrink-0" data-session-menu onClick={e => e.stopPropagation()}>
                        <button
                          className={`p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-opacity ${menuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
                          onClick={() => setOpenMenuId(menuOpen ? null : conv.id)}
                          title="Session options"
                          data-testid={`menu-btn-${conv.id}`}
                        >
                          <MoreHorizontal className="w-3.5 h-3.5" />
                        </button>

                        {menuOpen && (
                          <div className="absolute right-0 top-6 z-50 w-40 bg-popover border border-border rounded-lg shadow-lg py-1 text-xs" data-session-menu>
                            <button
                              className="flex items-center gap-2 w-full px-3 py-1.5 hover:bg-muted transition-colors text-left"
                              onClick={() => { setOpenMenuId(null); startRename(conv); }}
                            >
                              <Pencil className="w-3 h-3 text-muted-foreground" /> Rename
                            </button>
                            <div className="border-t border-border my-1" />
                            <button
                              className="flex items-center gap-2 w-full px-3 py-1.5 hover:bg-destructive/10 text-destructive transition-colors text-left"
                              onClick={() => { setOpenMenuId(null); deleteConv.mutate(conv.id); }}
                              data-testid={`delete-conv-${conv.id}`}
                            >
                              <Trash2 className="w-3 h-3" /> Delete
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {conversations.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">No sessions yet</p>
              )}
            </div>
          </ScrollArea>
        )}
        {collapsed && <div className="flex-1" />}

        {/* Bottom nav */}
        <div className="border-t border-border p-2 space-y-0.5">
          {nav.map(({ href, icon: Icon, label }) => (
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
