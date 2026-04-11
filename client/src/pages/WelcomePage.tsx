import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "../lib/queryClient";
import { Button } from "../components/ui/button";
import { Layout } from "../components/Layout";
import { Plus, Cpu, Brain, Zap, Network, Plug, BookOpen } from "lucide-react";

const FEATURES = [
  { icon: Network, title: "DAG Orchestration", desc: "Decomposes goals into parallel task graphs. Independent tasks run simultaneously." },
  { icon: Zap, title: "Multi-Model Router", desc: "Routes each task to the optimal LLM — Ollama, OpenAI, Anthropic, Gemini, or any OpenAI-compat endpoint." },
  { icon: Cpu, title: "Two-Level Sub-Agents", desc: "Stateless worker agents spawned per task. Context injected at spawn time. Filesystem-based IPC." },
  { icon: Brain, title: "Persistent Memory", desc: "Orchestrator-owned cross-session memory. Facts, preferences, and project context survive sessions." },
  { icon: BookOpen, title: "Skill System", desc: "Markdown skill files auto-activate by semantic match. Stack and chain for complex workflows." },
  { icon: Plug, title: "14+ Connectors", desc: "Gmail, GitHub, Notion, Slack, PostgreSQL, Jira, Snowflake, and more. MCP support for any tool." },
];

export function WelcomePage() {
  const qc = useQueryClient();
  const [, setLocation] = useLocation();

  const create = useMutation({
    mutationFn: () => apiRequest("POST", "/api/conversations", { title: "New Session" }),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["/api/conversations"] });
      setLocation(`/chat/${data.id}`);
    },
  });

  return (
    <Layout>
      <div className="flex flex-col items-center justify-center min-h-full p-8 text-center">
        <div className="w-20 h-20 rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center mb-6">
          <svg viewBox="0 0 24 24" fill="none" className="w-12 h-12">
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
        <h1 className="text-2xl font-bold gradient-text mb-2">Ultra Computer</h1>
        <p className="text-muted-foreground text-sm max-w-md mb-6">
          A complete agent harness — not a chatbot. Decomposes goals, spawns parallel sub-agents, routes tasks to the best model, and remembers everything.
        </p>
        <Button onClick={() => create.mutate()} disabled={create.isPending} size="lg" className="gap-2 mb-10">
          <Plus className="w-4 h-4" />
          Start New Session
        </Button>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-3xl w-full">
          {FEATURES.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="bg-card border border-border rounded-xl p-4 text-left hover:border-primary/40 transition-colors">
              <div className="flex items-center gap-2 mb-2">
                <Icon className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold">{title}</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
}
