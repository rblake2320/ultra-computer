import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { apiRequest, getSSEUrl } from "../lib/queryClient";
import { useLocation } from "wouter";
import { ScrollArea } from "../components/ui/scroll-area";
import { Button } from "../components/ui/button";
import { Textarea } from "../components/ui/textarea";
import { Badge } from "../components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "../components/ui/collapsible";
import { useToast } from "../hooks/use-toast";
import {
  Send, Loader2, CheckCircle2, Circle, XCircle,
  ChevronDown, ChevronRight, Zap, Network, Cpu,
  Terminal, FileText, Globe, Calculator, Search, FolderOpen, Container, Shield,
  Library, BookmarkPlus, Bot, Clock, Hash, Wrench, Download
} from "lucide-react";
import type { Message, Task, Conversation } from "../../../shared/schema";

// Sanitize a string for safe use as HTML text node
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Only allow safe URL schemes — block javascript: etc.
function safeUrl(url: string): string {
  return /^(https?:|mailto:|#|\/)/i.test(url.trim()) ? url.trim() : '#';
}

// Render markdown + LLM HTML mix to safe HTML
function renderMarkdown(raw: string): string {
  // Phase 1: Normalize LLM HTML tags to markdown equivalents so we can process uniformly
  let text = raw
    .replace(/<strong>(.*?)<\/strong>/gi, '**$1**')
    .replace(/<b>(.*?)<\/b>/gi, '**$1**')
    .replace(/<em>(.*?)<\/em>/gi, '*$1*')
    .replace(/<i>(.*?)<\/i>/gi, '*$1*')
    .replace(/<code>(.*?)<\/code>/gi, '`$1`')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?p>/gi, '\n\n')
    .replace(/<h([1-3])>(.*?)<\/h\1>/gi, (_, lvl, t) => '#'.repeat(Number(lvl)) + ' ' + t)
    // Strip any remaining HTML tags for XSS safety
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '');

  // Phase 2: Extract fenced code blocks to protect them from further processing
  const codeBlocks: string[] = [];
  text = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    codeBlocks.push(`<pre><code class="language-${escapeHtml(lang || 'text')}">${escapeHtml(code.trimEnd())}</code></pre>`);
    return `%%CODEBLOCK_${codeBlocks.length - 1}%%`;
  });

  // Phase 3: Process inline markdown
  text = text
    // Inline code
    .replace(/`([^`]+)`/g, (_, t) => `<code>${escapeHtml(t)}</code>`)
    // Links — process before bold/italic to avoid conflicts
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) =>
      `<a href="${safeUrl(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`)
    // Bold
    .replace(/\*\*(.+?)\*\*/g, (_, t) => `<strong>${t}</strong>`)
    // Italic
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, (_, t) => `<em>${t}</em>`);

  // Phase 4: Block-level processing, line by line
  const lines = text.split('\n');
  const html: string[] = [];
  let inList = false;
  let listType = '';

  for (const line of lines) {
    const trimmed = line.trim();

    // Restore code blocks
    if (trimmed.startsWith('%%CODEBLOCK_') && trimmed.endsWith('%%')) {
      if (inList) { html.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false; }
      const idx = parseInt(trimmed.replace('%%CODEBLOCK_', '').replace('%%', ''));
      html.push(codeBlocks[idx] || '');
      continue;
    }

    // Headers
    const headerMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (headerMatch) {
      if (inList) { html.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false; }
      const level = headerMatch[1].length;
      html.push(`<h${level}>${headerMatch[2]}</h${level}>`);
      continue;
    }

    // Unordered list
    const ulMatch = trimmed.match(/^[-*]\s+(.+)$/);
    if (ulMatch) {
      if (!inList || listType !== 'ul') {
        if (inList) html.push(listType === 'ul' ? '</ul>' : '</ol>');
        html.push('<ul>'); inList = true; listType = 'ul';
      }
      html.push(`<li>${ulMatch[1]}</li>`);
      continue;
    }

    // Ordered list
    const olMatch = trimmed.match(/^\d+\.\s+(.+)$/);
    if (olMatch) {
      if (!inList || listType !== 'ol') {
        if (inList) html.push(listType === 'ul' ? '</ul>' : '</ol>');
        html.push('<ol>'); inList = true; listType = 'ol';
      }
      html.push(`<li>${olMatch[1]}</li>`);
      continue;
    }

    // Close list on non-list line
    if (inList && trimmed === '') {
      html.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false;
      continue;
    }

    // Empty line
    if (trimmed === '') continue;

    // Close list if hit a paragraph
    if (inList) { html.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false; }

    // Regular paragraph
    html.push(`<p>${trimmed}</p>`);
  }

  if (inList) html.push(listType === 'ul' ? '</ul>' : '</ol>');

  return html.join('\n');
}

// ── Tool activity types ──
interface ToolCallEntry {
  callId: string;
  taskId: string;
  toolName: string;
  args: Record<string, string>;
  result?: { success: boolean; output: string; error?: string; durationMs: number; artifacts?: { path: string; type: string }[] };
  status: "running" | "done";
}

// ── Per-agent stream entry ──
interface AgentStreamEntry {
  taskId: string;
  content: string;
  status: "running" | "complete";
  modelId?: string;
  firstTokenAt?: number;
  completedAt?: number;
  tokenCount?: number;
  toolCallCount: number;
}

const TOOL_ICONS: Record<string, typeof Terminal> = {
  bash: Terminal,
  write_file: FileText,
  read_file: FileText,
  list_files: FolderOpen,
  fetch_url: Globe,
  calculator: Calculator,
  search_files: Search,
};

// Left-border accent color per task type
const TASK_TYPE_BORDER: Record<string, string> = {
  research: "border-l-blue-400",
  code: "border-l-purple-400",
  write: "border-l-green-400",
  analyze: "border-l-yellow-400",
  browse: "border-l-cyan-400",
  general: "border-l-primary/50",
};

const TASK_TYPE_BADGE: Record<string, string> = {
  research: "bg-blue-400/10 text-blue-400 border-blue-400/30",
  code: "bg-purple-400/10 text-purple-400 border-purple-400/30",
  write: "bg-green-400/10 text-green-400 border-green-400/30",
  analyze: "bg-yellow-400/10 text-yellow-400 border-yellow-400/30",
  browse: "bg-cyan-400/10 text-cyan-400 border-cyan-400/30",
  general: "bg-primary/10 text-primary border-primary/30",
};

export function ChatPage({ conversationId }: { conversationId: string }) {
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [sseError, setSseError] = useState(false);
  // Legacy single streaming content — kept for backward compatibility with "message" event clearing
  const [streamingContent, setStreamingContent] = useState("");
  // Per-agent streaming state: keyed by agentRunId
  const [agentStreams, setAgentStreams] = useState<Map<string, AgentStreamEntry>>(new Map());
  // Which agent panels are expanded (by agentRunId)
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set());
  const [tasks, setTasks] = useState<Task[]>([]);
  const [showTaskGraph, setShowTaskGraph] = useState(true);
  const [toolCalls, setToolCalls] = useState<ToolCallEntry[]>([]);
  const [showToolPanel, setShowToolPanel] = useState(true);
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const agentPanelRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sseRef = useRef<EventSource | null>(null);
  // Ref always points to the latest handleEvent — avoids stale closure in the SSE effect
  const handleEventRef = useRef<(event: any) => void>(() => {});

  // Guard: redirect home if no conversationId
  useEffect(() => {
    if (!conversationId) setLocation("/");
  }, [conversationId, setLocation]);

  const { data: conversation, isError: convError } = useQuery<Conversation>({
    queryKey: [`/api/conversations/${conversationId}`],
    enabled: !!conversationId,
  });

  const { data: messages = [], isError: msgsError, refetch: refetchMessages } = useQuery<Message[]>({
    queryKey: [`/api/conversations/${conversationId}/messages`],
    enabled: !!conversationId,
  });

  const handleEvent = useCallback((event: any) => {
    switch (event.type) {
      case "status":
        setStatusMsg(event.message || event.status);
        if (event.status === "idle") setIsStreaming(false);
        break;

      case "plan":
        setShowTaskGraph(true);
        break;

      case "task_update":
        setTasks(prev => {
          const existing = prev.findIndex(t => t.id === event.task.id);
          if (existing >= 0) {
            const updated = [...prev];
            updated[existing] = event.task;
            return updated;
          }
          return [...prev, event.task];
        });
        break;

      case "agent_token": {
        const agentRunId: string = event.agentRunId || "default";
        const taskId: string = event.taskId || "";
        const modelId: string | undefined = event.modelId;

        setAgentStreams(prev => {
          const next = new Map(prev);
          const existing = next.get(agentRunId);
          if (existing) {
            next.set(agentRunId, {
              ...existing,
              content: existing.content + event.token,
            });
          } else {
            next.set(agentRunId, {
              taskId,
              content: event.token,
              status: "running",
              modelId,
              firstTokenAt: Date.now(),
              toolCallCount: 0,
            });
            // Auto-expand newly started agent
            setExpandedAgents(prev2 => {
              const s = new Set(prev2);
              s.add(agentRunId);
              return s;
            });
          }
          return next;
        });

        // Also update legacy streamingContent for backward compat
        setStreamingContent(prev => prev + event.token);
        break;
      }

      case "agent_complete": {
        const agentRunId: string = event.agentRunId || "default";
        setAgentStreams(prev => {
          const next = new Map(prev);
          const existing = next.get(agentRunId);
          if (existing) {
            next.set(agentRunId, {
              ...existing,
              status: "complete",
              completedAt: Date.now(),
              tokenCount: event.tokenCount ?? existing.tokenCount,
            });
          }
          return next;
        });
        // Auto-collapse completed agent (collapse only if another is still running)
        setExpandedAgents(prev => {
          const s = new Set(prev);
          s.delete(agentRunId);
          return s;
        });
        break;
      }

      case "tool_call":
        setShowToolPanel(true);
        setToolCalls(prev => [
          ...prev,
          {
            callId: event.callId,
            taskId: event.taskId,
            toolName: event.toolName,
            args: event.args,
            status: "running",
          },
        ]);
        // Track tool call count per agent
        if (event.agentRunId) {
          setAgentStreams(prev => {
            const next = new Map(prev);
            const existing = next.get(event.agentRunId);
            if (existing) {
              next.set(event.agentRunId, {
                ...existing,
                toolCallCount: existing.toolCallCount + 1,
              });
            }
            return next;
          });
        }
        break;

      case "tool_result":
        setToolCalls(prev =>
          prev.map(tc =>
            tc.callId === event.callId
              ? { ...tc, result: event.result, status: "done" as const }
              : tc
          )
        );
        break;

      case "message":
        refetchMessages();
        setStreamingContent("");
        // Don't clear agentStreams here — keep them visible until next send
        break;

      case "done":
        setIsStreaming(false);
        setStatusMsg("");
        // Mark all agent streams as complete (safety net)
        setAgentStreams(prev => {
          const next = new Map(prev);
          for (const [key, stream] of next) {
            if (stream.status === "running") {
              next.set(key, { ...stream, status: "complete", completedAt: Date.now() });
            }
          }
          return next;
        });
        // Mark all tasks as complete
        setTasks(prev => prev.map(t => t.status === "running" ? { ...t, status: "complete" } : t));
        // Mark all tool calls as done
        setToolCalls(prev => prev.map(tc => tc.status === "running" ? { ...tc, status: "done" as const } : tc));
        qc.invalidateQueries({ queryKey: ["/api/conversations"] });
        refetchMessages();
        break;

      case "error":
        setIsStreaming(false);
        setStatusMsg(`Error: ${event.error}`);
        break;
    }
  }, [conversationId, refetchMessages, qc]);

  // Keep the ref in sync with the latest handleEvent on every render
  handleEventRef.current = handleEvent;

  // Connect SSE — uses ref so it never captures a stale handleEvent
  useEffect(() => {
    if (sseRef.current) sseRef.current.close();
    const url = getSSEUrl(`/api/conversations/${conversationId}/stream`);
    const es = new EventSource(url);
    sseRef.current = es;

    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data);
        handleEventRef.current(event);
      } catch {}
    };

    es.onerror = () => { setSseError(true); };
    es.onopen = () => { setSseError(false); };

    return () => { es.close(); sseRef.current = null; };
  }, [conversationId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent, toolCalls]);

  const sendMessage = useMutation({
    mutationFn: () => apiRequest("POST", `/api/conversations/${conversationId}/messages`, { content: input }),
    onMutate: () => {
      setIsStreaming(true);
      setStreamingContent("");
      setAgentStreams(new Map());
      setExpandedAgents(new Set());
      setToolCalls([]);
      setTasks([]);
    },
    onSuccess: () => {
      setInput("");
      refetchMessages();
    },
    onError: (err: any) => {
      setIsStreaming(false);
      setStatusMsg(`Error: ${err.message}`);
    },
  });

  const handleSend = () => {
    if (!input.trim() || isStreaming) return;
    sendMessage.mutate();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const toggleToolExpand = (callId: string) => {
    setExpandedTools(prev => {
      const next = new Set(prev);
      if (next.has(callId)) next.delete(callId); else next.add(callId);
      return next;
    });
  };

  const toggleAgentPanel = (agentRunId: string) => {
    setExpandedAgents(prev => {
      const next = new Set(prev);
      if (next.has(agentRunId)) next.delete(agentRunId); else next.add(agentRunId);
      return next;
    });
  };

  // Scroll to and expand agent panel for a given taskId
  const scrollToAgentPanel = (taskId: string) => {
    // Find the first agentRunId matching this taskId
    for (const [agentRunId, stream] of agentStreams.entries()) {
      if (stream.taskId === taskId) {
        // Expand that panel
        setExpandedAgents(prev => {
          const s = new Set(prev);
          s.add(agentRunId);
          return s;
        });
        // Scroll to it
        const el = agentPanelRefs.current.get(agentRunId);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        break;
      }
    }
  };

  const taskStatusIcon = (status: string) => {
    switch (status) {
      case "complete": return <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />;
      case "running": return <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />;
      case "failed": return <XCircle className="w-3.5 h-3.5 text-destructive" />;
      default: return <Circle className="w-3.5 h-3.5 text-muted-foreground" />;
    }
  };

  const taskTypeColor: Record<string, string> = {
    research: "text-blue-400",
    code: "text-purple-400",
    write: "text-green-400",
    analyze: "text-yellow-400",
    browse: "text-cyan-400",
    general: "text-muted-foreground",
  };

  const hasNoModels = !isStreaming && messages.length === 0;

  // Compute tool call counts per task for the task graph progress
  const toolCallsPerTask = toolCalls.reduce<Record<string, number>>((acc, tc) => {
    if (tc.taskId) {
      acc[tc.taskId] = (acc[tc.taskId] || 0) + 1;
    }
    return acc;
  }, {});

  // Determine which tasks have a corresponding agent stream
  const taskHasAgentStream = (taskId: string): boolean => {
    for (const stream of agentStreams.values()) {
      if (stream.taskId === taskId) return true;
    }
    return false;
  };

  // Format duration in ms to a human-readable string
  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  };

  // Sorted agent stream entries (running first, then completed)
  const agentStreamEntries = Array.from(agentStreams.entries()).sort(([, a], [, b]) => {
    if (a.status === "running" && b.status !== "running") return -1;
    if (b.status === "running" && a.status !== "running") return 1;
    return 0;
  });

  if ((convError || msgsError) && !conversation) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Failed to load conversation. Please try again.
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Main chat area */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* SSE connection error banner */}
        {sseError && (
          <div className="px-4 py-2 bg-destructive/10 border-b border-destructive/20 text-xs text-destructive">
            Connection to server lost. Messages may not update in real time.
          </div>
        )}
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-card/50 shrink-0">
          <Network className="w-4 h-4 text-primary" />
          <h1 className="font-semibold text-sm truncate flex-1">
            {conversation?.title || "Session"}
          </h1>
          {isStreaming && (
            <Badge variant="secondary" className="text-xs gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              {statusMsg || "Working..."}
            </Badge>
          )}
          {tasks.length > 0 && (
            <button
              onClick={() => setShowTaskGraph(g => !g)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              aria-label={showTaskGraph ? "Hide task graph" : "Show task graph"}
              aria-expanded={showTaskGraph}
            >
              {showTaskGraph ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              {tasks.length} task{tasks.length !== 1 ? "s" : ""}
            </button>
          )}
          {toolCalls.length > 0 && (
            <button
              onClick={() => setShowToolPanel(p => !p)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              aria-label={showToolPanel ? "Hide tool activity panel" : "Show tool activity panel"}
              aria-expanded={showToolPanel}
            >
              <Terminal className="w-3 h-3" />
              {toolCalls.length} tool call{toolCalls.length !== 1 ? "s" : ""}
            </button>
          )}
          {/* Export session button */}
          <button
            onClick={async () => {
              try {
                const { getSSEUrl } = await import('../lib/queryClient');
                const res = await fetch(getSSEUrl(`/api/conversations/${conversationId}/export`));
                if (!res.ok) throw new Error('Export failed');
                const text = await res.text();
                const blob = new Blob([text], { type: 'text/markdown' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `conversation-${conversationId}.md`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
              } catch {
                toast({ title: 'Export failed', variant: 'destructive' });
              }
            }}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            title="Export session as Markdown"
            data-testid="button-export-session"
          >
            <Download className="w-3 h-3" />
            <span className="hidden sm:inline">Export</span>
          </button>
        </div>

        {/* Task Graph */}
        {tasks.length > 0 && showTaskGraph && (
          <div className="border-b border-border bg-muted/30 px-4 py-2 shrink-0">
            <div className="flex items-center gap-1 mb-2">
              <Cpu className="w-3 h-3 text-primary" />
              <span className="text-xs font-semibold text-primary">Task Graph</span>
              <span className="text-xs text-muted-foreground ml-1">
                ({tasks.filter(t => t.status === "complete").length}/{tasks.length} complete)
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {tasks.map(task => {
                const toolCount = toolCallsPerTask[task.id] || 0;
                const hasStream = taskHasAgentStream(task.id);
                return (
                  <button
                    key={task.id}
                    onClick={() => {
                      if (hasStream) scrollToAgentPanel(task.id);
                    }}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs bg-card transition-all text-left ${
                      task.status === "running" ? "border-primary/50 task-running" :
                      task.status === "complete" ? "border-green-500/30" :
                      task.status === "failed" ? "border-destructive/30" :
                      "border-border"
                    } ${hasStream ? "cursor-pointer hover:bg-muted/50" : "cursor-default"}`}
                    data-testid={`task-node-${task.id}`}
                  >
                    {taskStatusIcon(task.status)}
                    <span className={taskTypeColor[task.taskType] || "text-muted-foreground"}>
                      [{task.taskType}]
                    </span>
                    <span className="text-foreground">{task.title}</span>
                    {toolCount > 0 && (
                      <span className="ml-1 text-[10px] text-muted-foreground border border-border rounded px-1 py-0.5 bg-muted/50">
                        {toolCount} tool{toolCount !== 1 ? "s" : ""}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Messages + Agent Panels */}
        <ScrollArea className="flex-1">
          <div className="px-4 py-4 space-y-4 max-w-4xl mx-auto">
            {messages.length === 0 && !isStreaming && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center mb-4">
                  <svg viewBox="0 0 24 24" fill="none" className="w-10 h-10">
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
                <h2 className="text-lg font-bold gradient-text mb-1">Ultra Computer</h2>
                <p className="text-sm text-muted-foreground max-w-sm">
                  Agents can now act, not just reason — bash, file I/O, URL fetching, and math are all live tools.
                </p>
                {hasNoModels && (
                  <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-xs text-yellow-400 max-w-sm">
                    No models configured yet. Head to <strong>Models</strong> to add your first LLM.
                  </div>
                )}
                <div className="mt-6 grid grid-cols-2 gap-2 max-w-md">
                  {[
                    "Write a Python script that calculates Fibonacci numbers and run it",
                    "Fetch the HN front page and summarize the top 5 stories",
                    "Create a bash script that counts lines of code in a directory",
                    "Calculate the compound interest on $10,000 at 7% for 10 years",
                  ].map(prompt => (
                    <button
                      key={prompt}
                      onClick={() => setInput(prompt)}
                      className="text-left text-xs p-2.5 rounded-lg bg-card border border-border hover:border-primary/50 hover:bg-muted transition-colors"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map(msg => (
              <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                {msg.role !== "user" && (
                  <div className="w-7 h-7 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center shrink-0 mt-0.5">
                    <Cpu className="w-3.5 h-3.5 text-primary" />
                  </div>
                )}
                <div
                  className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-card border border-border"
                  }`}
                  data-testid={`message-${msg.id}`}
                >
                  {msg.role === "user" ? (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  ) : (
                    <div className="prose-ultra" dangerouslySetInnerHTML={{ __html: renderMarkdown(stripToolCallBlocks(msg.content)) }} />
                  )}
                </div>
                {msg.role === "user" && (
                  <div className="w-7 h-7 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-xs font-bold text-accent">U</span>
                  </div>
                )}
              </div>
            ))}

            {/* Per-Agent Streaming Panels */}
            {agentStreamEntries.length > 0 && (
              <div className="space-y-2">
                {agentStreamEntries.map(([agentRunId, stream]) => {
                  const isExpanded = expandedAgents.has(agentRunId);
                  const isRunning = stream.status === "running";
                  // Find the task for this stream
                  const task = tasks.find(t => t.id === stream.taskId);
                  const taskType = task?.taskType || "general";
                  const taskTitle = task?.title || (stream.taskId ? `Task ${stream.taskId}` : "Agent");
                  const borderClass = TASK_TYPE_BORDER[taskType] || "border-l-primary/50";
                  const badgeClass = TASK_TYPE_BADGE[taskType] || TASK_TYPE_BADGE.general;
                  const duration = stream.firstTokenAt && stream.completedAt
                    ? formatDuration(stream.completedAt - stream.firstTokenAt)
                    : stream.firstTokenAt && isRunning
                    ? formatDuration(Date.now() - stream.firstTokenAt)
                    : null;

                  return (
                    <div
                      key={agentRunId}
                      ref={el => {
                        if (el) agentPanelRefs.current.set(agentRunId, el);
                        else agentPanelRefs.current.delete(agentRunId);
                      }}
                      data-testid={`agent-panel-${agentRunId}`}
                    >
                      <Collapsible open={isExpanded} onOpenChange={() => toggleAgentPanel(agentRunId)}>
                        <div className={`rounded-lg border border-border bg-card/80 overflow-hidden border-l-4 ${borderClass}`}>
                          {/* Panel header */}
                          <CollapsibleTrigger asChild>
                            <button
                              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/40 transition-colors text-left"
                              data-testid={`agent-panel-trigger-${agentRunId}`}
                            >
                              {/* Status indicator */}
                              {isRunning ? (
                                <Loader2 className="w-3.5 h-3.5 text-primary animate-spin shrink-0" />
                              ) : (
                                <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />
                              )}

                              {/* Agent icon */}
                              <Bot className="w-3.5 h-3.5 text-muted-foreground shrink-0" />

                              {/* Task title */}
                              <span className="text-xs font-semibold text-foreground truncate flex-1">
                                {taskTitle}
                              </span>

                              {/* Task type badge */}
                              <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium shrink-0 ${badgeClass}`}>
                                {taskType}
                              </span>

                              {/* Model badge */}
                              {stream.modelId && (
                                <span className="text-[10px] text-muted-foreground bg-muted/60 border border-border rounded px-1.5 py-0.5 shrink-0 font-mono">
                                  {stream.modelId.split("/").pop() || stream.modelId}
                                </span>
                              )}

                              {/* Running status badge */}
                              {isRunning && (
                                <Badge variant="secondary" className="text-[10px] gap-1 shrink-0">
                                  <Zap className="w-2.5 h-2.5 text-primary" />
                                  Running
                                </Badge>
                              )}

                              {/* Duration when complete */}
                              {!isRunning && duration && (
                                <span className="text-[10px] text-muted-foreground shrink-0">{duration}</span>
                              )}

                              {/* Expand/collapse chevron */}
                              {isExpanded ? (
                                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                              ) : (
                                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                              )}
                            </button>
                          </CollapsibleTrigger>

                          {/* Panel body */}
                          <CollapsibleContent>
                            <div className="border-t border-border">
                              {/* Streaming content */}
                              <div className="px-3 py-2.5 max-h-[400px] overflow-auto">
                                {stream.content ? (
                                  <div
                                    className={`prose-ultra text-sm ${isRunning ? "cursor-blink" : ""}`}
                                    dangerouslySetInnerHTML={{ __html: renderMarkdown(stripToolCallBlocks(stream.content)) }}
                                  />
                                ) : (
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    Waiting for output...
                                  </div>
                                )}
                              </div>

                              {/* Metrics footer — shown when complete */}
                              {!isRunning && (
                                <div className="flex items-center gap-4 px-3 py-2 border-t border-border bg-muted/20">
                                  {stream.tokenCount !== undefined && stream.tokenCount > 0 && (
                                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                      <Hash className="w-3 h-3" />
                                      <span>{stream.tokenCount.toLocaleString()} tokens</span>
                                    </div>
                                  )}
                                  {duration && (
                                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                      <Clock className="w-3 h-3" />
                                      <span>{duration}</span>
                                    </div>
                                  )}
                                  {stream.toolCallCount > 0 && (
                                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                      <Wrench className="w-3 h-3" />
                                      <span>{stream.toolCallCount} tool call{stream.toolCallCount !== 1 ? "s" : ""}</span>
                                    </div>
                                  )}
                                  {stream.tokenCount === undefined && duration === null && stream.toolCallCount === 0 && (
                                    <span className="text-[10px] text-muted-foreground">Complete</span>
                                  )}
                                </div>
                              )}
                            </div>
                          </CollapsibleContent>
                        </div>
                      </Collapsible>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Fallback: legacy single streaming response (shown only when agentStreams is empty but streamingContent exists) */}
            {isStreaming && streamingContent && agentStreams.size === 0 && (
              <div className="flex gap-3 justify-start">
                <div className="w-7 h-7 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center shrink-0 mt-0.5">
                  <Cpu className="w-3.5 h-3.5 text-primary animate-pulse" />
                </div>
                <div className="max-w-[80%] rounded-xl px-4 py-2.5 text-sm bg-card border border-primary/30">
                  <div className="prose-ultra cursor-blink"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(stripToolCallBlocks(streamingContent)) }}
                  />
                </div>
              </div>
            )}

            {isStreaming && !streamingContent && agentStreams.size === 0 && statusMsg && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground pl-10">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>{statusMsg}</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Input */}
        <div className="shrink-0 border-t border-border bg-card/50 p-3">
          <div className="flex gap-2 max-w-4xl mx-auto">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Give Ultra Computer a task... (Shift+Enter for new line)"
              className="min-h-[44px] max-h-[200px] resize-none text-sm"
              rows={1}
              disabled={isStreaming}
              data-testid="input-message"
            />
            <Button
              onClick={handleSend}
              disabled={!input.trim() || isStreaming}
              size="icon"
              className="shrink-0 h-11 w-11"
              data-testid="button-send"
              aria-label={isStreaming ? "Sending message" : "Send message"}
            >
              {isStreaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
          <div className="flex items-center gap-3 mt-1.5 px-1 max-w-4xl mx-auto">
            <SandboxIndicator />
            <span className="text-muted-foreground/40">|</span>
            <p className="text-xs text-muted-foreground">
              7 tools: bash · write_file · read_file · list_files · fetch_url · calculator · search_files
            </p>
            {tasks.filter(t => t.status === "running").length > 0 && (
              <Badge variant="secondary" className="text-[10px] gap-1 ml-auto">
                <Zap className="w-2.5 h-2.5 text-primary" />
                {tasks.filter(t => t.status === "running").length} running in parallel
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Tool Activity Panel (right sidebar) */}
      {toolCalls.length > 0 && showToolPanel && (
        <aside className="w-[320px] border-l border-border bg-card/50 flex flex-col shrink-0 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
            <Terminal className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-semibold">Tool Activity</span>
            <span className="text-[10px] text-muted-foreground ml-auto">
              {toolCalls.filter(tc => tc.status === "done").length}/{toolCalls.length} complete
            </span>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1.5">
              {toolCalls.map(tc => {
                const Icon = TOOL_ICONS[tc.toolName] || Terminal;
                const isExpanded = expandedTools.has(tc.callId);
                return (
                  <div key={tc.callId} className="rounded-lg border border-border bg-background overflow-hidden" data-testid={`tool-call-${tc.callId}`}>
                    {/* Header */}
                    <button
                      onClick={() => toggleToolExpand(tc.callId)}
                      className="flex items-center gap-2 px-2.5 py-1.5 w-full text-left hover:bg-muted/50 transition-colors"
                    >
                      {tc.status === "running" ? (
                        <Loader2 className="w-3 h-3 text-primary animate-spin shrink-0" />
                      ) : tc.result?.success ? (
                        <CheckCircle2 className="w-3 h-3 text-green-400 shrink-0" />
                      ) : (
                        <XCircle className="w-3 h-3 text-destructive shrink-0" />
                      )}
                      <Icon className="w-3 h-3 text-muted-foreground shrink-0" />
                      <span className="text-xs font-mono font-medium text-foreground truncate flex-1">{tc.toolName}</span>
                      {tc.result && (
                        <span className="text-[10px] text-muted-foreground shrink-0">{tc.result.durationMs}ms</span>
                      )}
                      {isExpanded ? <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" /> : <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />}
                    </button>

                    {/* Expanded content */}
                    {isExpanded && (
                      <div className="border-t border-border">
                        {/* Args */}
                        <div className="px-2.5 py-1.5 bg-muted/30">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1 font-semibold">Input</p>
                          <pre className="text-[11px] text-foreground whitespace-pre-wrap break-all font-mono leading-relaxed max-h-[100px] overflow-auto">
                            {formatToolArgs(tc.toolName, tc.args)}
                          </pre>
                        </div>
                        {/* Result */}
                        {tc.result && (
                          <div className="px-2.5 py-1.5">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1 font-semibold">
                              Output {!tc.result.success && <span className="text-destructive">(Error)</span>}
                            </p>
                            {tc.result.error && (
                              <p className="text-[11px] text-destructive mb-1 font-mono">{tc.result.error}</p>
                            )}
                            <pre className="text-[11px] text-foreground whitespace-pre-wrap break-all font-mono leading-relaxed max-h-[200px] overflow-auto">
                              {tc.result.output.slice(0, 3000)}{tc.result.output.length > 3000 ? "\n... (truncated)" : ""}
                            </pre>
                            {tc.result.artifacts && tc.result.artifacts.length > 0 && (
                              <div className="mt-1.5 flex flex-wrap gap-1">
                                {tc.result.artifacts.map(a => (
                                  <Badge key={a.path} variant="secondary" className="text-[10px] gap-1">
                                    <FileText className="w-2.5 h-2.5" />
                                    {a.path.split("/").pop()} ({a.type})
                                  </Badge>
                                ))}
                              </div>
                            )}
                            {/* Save to Library button — shown on successful bash/write_file tool calls */}
                            {tc.result.success && (tc.toolName === "bash" || tc.toolName === "write_file") && (
                              <SaveToLibraryButton
                                toolCall={tc}
                                conversationId={conversationId}
                              />
                            )}
                          </div>
                        )}
                        {tc.status === "running" && (
                          <div className="px-2.5 py-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Executing...
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </aside>
      )}
    </div>
  );
}

// Strip <tool_call> blocks from displayed text so the user only sees clean prose
function stripToolCallBlocks(text: string): string {
  return text
    .replace(/<tool_call>[\s\S]*?<\/tool_call>/g, "")
    .replace(/```tool_call[\s\S]*?```/g, "")
    .replace(/TOOL_CALL:\s*\{[\s\S]*?\}(?:\n|$)/g, "")
    .trim();
}

// Format tool args nicely for display
function formatToolArgs(toolName: string, args: Record<string, string>): string {
  if (toolName === "bash" && args.command) {
    return `$ ${args.command}`;
  }
  if (toolName === "write_file" && args.filename && args.content) {
    const preview = args.content.length > 200 ? args.content.slice(0, 200) + "..." : args.content;
    return `→ ${args.filename}\n${preview}`;
  }
  if (toolName === "read_file" && args.filename) return `← ${args.filename}`;
  if (toolName === "fetch_url" && args.url) return `GET ${args.url}`;
  if (toolName === "calculator" && args.expression) return `= ${args.expression}`;
  if (toolName === "search_files" && args.pattern) return `grep "${args.pattern}"${args.file_glob ? ` ${args.file_glob}` : ""}`;
  if (toolName === "list_files") return `ls ${args.directory || "."}`;
  return JSON.stringify(args, null, 2);
}

// Save to Library button on tool results
function SaveToLibraryButton({ toolCall, conversationId }: { toolCall: ToolCallEntry; conversationId: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const getScriptContent = () => {
    if (toolCall.toolName === "bash" && toolCall.args.command) {
      return toolCall.args.command;
    }
    if (toolCall.toolName === "write_file" && toolCall.args.content) {
      return toolCall.args.content;
    }
    return "";
  };

  const detectLanguage = () => {
    const content = getScriptContent();
    if (toolCall.toolName === "write_file") {
      const fn = toolCall.args.filename || "";
      if (fn.endsWith(".py")) return "python";
      if (fn.endsWith(".js")) return "javascript";
      if (fn.endsWith(".ts")) return "typescript";
      if (fn.endsWith(".sh")) return "bash";
    }
    if (content.startsWith("#!/usr/bin/env python") || content.startsWith("#!/usr/bin/python") || content.includes("import ")) return "python";
    if (content.includes("const ") || content.includes("function ") || content.includes("=>")) return "javascript";
    return "bash";
  };

  const handleSave = async () => {
    const content = getScriptContent();
    if (!name.trim() || !content) return;
    setSaving(true);
    try {
      await apiRequest("POST", "/api/skill-scripts", {
        name: name.trim(),
        description: `Saved from ${toolCall.toolName} tool call`,
        language: detectLanguage(),
        content,
        tags: [toolCall.toolName],
        sourceConversationId: conversationId,
        sourceToolCallId: toolCall.callId,
      });
      toast({ title: "Saved to script library" });
      setOpen(false);
      setName("");
    } catch (err: any) {
      toast({ title: "Failed to save", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const content = getScriptContent();
  if (!content || content.length < 10) return null;

  return (
    <>
      <button
        onClick={() => {
          setOpen(true);
          // Auto-generate name from command
          if (toolCall.toolName === "bash" && toolCall.args.command) {
            const cmd = toolCall.args.command.split("\n")[0].slice(0, 60);
            setName(cmd);
          } else if (toolCall.toolName === "write_file" && toolCall.args.filename) {
            setName(toolCall.args.filename.split("/").pop() || "Script");
          }
        }}
        className="mt-1.5 flex items-center gap-1 text-[10px] text-primary/70 hover:text-primary transition-colors"
        data-testid="button-save-to-library"
      >
        <BookmarkPlus className="w-3 h-3" />
        Save to Library
      </button>

      {open && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-sm">
                <Library className="w-4 h-4 text-primary" />
                Save to Script Library
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 mt-2">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Script Name</label>
                <Input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Name this script..."
                  className="h-8 text-sm"
                  autoFocus
                  data-testid="input-save-script-name"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Preview</label>
                <pre className="bg-muted/40 border border-border rounded-lg p-3 text-[11px] font-mono leading-relaxed max-h-[200px] overflow-auto">
                  {content.slice(0, 1000)}{content.length > 1000 ? "\n... (truncated)" : ""}
                </pre>
              </div>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button size="sm" onClick={handleSave} disabled={!name.trim() || saving}>
                  {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Library className="w-3 h-3 mr-1" />}
                  Save
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

// Sandbox status indicator — shows Docker vs Host execution mode
function SandboxIndicator() {
  const { data } = useQuery<{ dockerAvailable: boolean; enabled: boolean; activeContainers: number }>({
    queryKey: ["/api/sandbox/status"],
    refetchInterval: 15000,
  });

  const isActive = data?.dockerAvailable && data?.enabled;

  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground" data-testid="sandbox-indicator">
      {isActive ? (
        <>
          <Container className="w-3 h-3 text-green-500" />
          <span className="text-green-600 dark:text-green-400 font-medium">Docker</span>
          {(data?.activeContainers ?? 0) > 0 && (
            <span className="text-muted-foreground/60">({data?.activeContainers})</span>
          )}
        </>
      ) : (
        <>
          <Shield className="w-3 h-3" />
          <span>Host</span>
        </>
      )}
    </div>
  );
}
