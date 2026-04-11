import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../lib/queryClient";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { useToast } from "../hooks/use-toast";
import { Brain, Trash2, Plus, Search, Star } from "lucide-react";
import type { Memory } from "../../../shared/schema";

const CATEGORY_COLORS: Record<string, string> = {
  preference: "bg-blue-500/20 text-blue-400",
  project: "bg-purple-500/20 text-purple-400",
  fact: "bg-green-500/20 text-green-400",
  identity: "bg-yellow-500/20 text-yellow-400",
  decision: "bg-orange-500/20 text-orange-400",
  general: "bg-muted text-muted-foreground",
};

export function MemoryPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ content: "", summary: "", category: "general", importance: 0.7 });

  const { data: memories = [] } = useQuery<Memory[]>({ queryKey: ["/api/memory"] });

  const createMemory = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/memory", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/memory"] });
      setShowForm(false);
      setForm({ content: "", summary: "", category: "general", importance: 0.7 });
      toast({ title: "Memory stored" });
    },
    onError: () => toast({ title: "Error", description: "Operation failed", variant: "destructive" }),
  });

  const deleteMemory = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/memory/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/memory"] }),
    onError: () => toast({ title: "Error", description: "Operation failed", variant: "destructive" }),
  });

  const { data: searchResults, mutate: searchMemory, isPending: searching } = useMutation({
    mutationFn: (query: string) => apiRequest("POST", "/api/memory/search", { query }),
  });

  const displayed = searchResults || memories;
  const filtered = searchQuery && !searchResults
    ? memories.filter(m =>
        m.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (m.summary || "").toLowerCase().includes(searchQuery.toLowerCase())
      )
    : displayed;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card/50">
        <Brain className="w-4 h-4 text-primary" />
        <h1 className="font-semibold text-sm">Memory</h1>
        <p className="text-xs text-muted-foreground flex-1">Orchestrator-owned persistent cross-session memory</p>
        <Button size="sm" onClick={() => setShowForm(f => !f)} className="gap-1">
          <Plus className="w-3 h-3" />Add Memory
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {/* Search */}
        <div className="flex gap-2 mb-4">
          <div className="flex-1 relative">
            <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search memories..."
              className="h-8 text-sm pl-8"
              data-testid="input-memory-search"
            />
          </div>
          <Button size="sm" variant="outline" onClick={() => searchMemory(searchQuery)}
            disabled={!searchQuery || searching}>
            <Search className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* Add form */}
        {showForm && (
          <Card className="p-4 mb-4 border-primary/30">
            <h2 className="font-semibold text-sm mb-3">Add Memory</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Content *</label>
                <Textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                  placeholder="The fact to remember..." className="text-sm min-h-[80px]" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Summary (one-liner)</label>
                  <Input value={form.summary} onChange={e => setForm(f => ({ ...f, summary: e.target.value }))}
                    placeholder="Brief summary" className="h-8 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Category</label>
                  <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                    className="w-full h-8 text-sm bg-background border border-input rounded-md px-2">
                    {["general", "preference", "project", "fact", "identity", "decision"].map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Importance: {form.importance}</label>
                <input type="range" min="0" max="1" step="0.1" value={form.importance}
                  onChange={e => setForm(f => ({ ...f, importance: Number(e.target.value) }))}
                  className="w-full" />
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <Button size="sm" onClick={() => createMemory.mutate(form)} disabled={!form.content}>Save</Button>
              <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </Card>
        )}

        {/* Info banner */}
        <div className="flex items-start gap-2 p-3 bg-primary/5 border border-primary/20 rounded-lg mb-4 text-xs text-muted-foreground">
          <Brain className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
          <div>
            <span className="text-foreground font-medium">Orchestrator-only access.</span>{" "}
            Worker sub-agents never read from memory directly. Context is injected by the orchestrator at spawn time.
            Memory is auto-populated during sessions via fact extraction.
          </div>
        </div>

        {/* Memory list */}
        {filtered.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <Brain className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No memories stored yet.</p>
            <p className="text-xs mt-1">Memory auto-populates from conversations.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((mem: Memory) => (
              <Card key={mem.id} className="p-3 group" data-testid={`memory-item-${mem.id}`}>
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className={`text-[10px] ${CATEGORY_COLORS[mem.category] || CATEGORY_COLORS.general}`}>
                        {mem.category}
                      </Badge>
                      <div className="flex">
                        {Array.from({ length: 5 }, (_, i) => (
                          <Star key={i} className={`w-2.5 h-2.5 ${i < Math.round(mem.importance * 5) ? "text-yellow-400 fill-yellow-400" : "text-muted-foreground"}`} />
                        ))}
                      </div>
                    </div>
                    {mem.summary && (
                      <p className="text-xs font-medium text-foreground mb-0.5">{mem.summary}</p>
                    )}
                    <p className="text-xs text-muted-foreground leading-relaxed">{mem.content}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {new Date(mem.createdAt).toLocaleDateString()}
                      {mem.sessionId && ` · session ${mem.sessionId.slice(0, 8)}`}
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 hover:text-destructive transition-all"
                    onClick={() => deleteMemory.mutate(mem.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
