import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../lib/queryClient";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { useToast } from "../hooks/use-toast";
import { Plus, Trash2, BookOpen, Lock, ToggleLeft, ToggleRight, Zap } from "lucide-react";
import type { Skill } from "../../../shared/schema";
import { safeJsonParse } from "../lib/safeJson";

export function SkillsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", content: "", triggerKeywords: "" });

  const { data: skills = [] } = useQuery<Skill[]>({ queryKey: ["/api/skills"] });

  const createSkill = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/skills", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/skills"] });
      setShowForm(false);
      setForm({ name: "", description: "", content: "", triggerKeywords: "" });
      toast({ title: "Skill created" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const toggleSkill = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      apiRequest("PATCH", `/api/skills/${id}`, { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/skills"] }),
  });

  const deleteSkill = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/skills/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/skills"] }); toast({ title: "Skill deleted" }); },
    onError: (e: any) => toast({ title: "Cannot delete", description: e.message, variant: "destructive" }),
  });

  const builtIn = skills.filter(s => s.isBuiltIn);
  const custom = skills.filter(s => !s.isBuiltIn);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card/50">
        <BookOpen className="w-4 h-4 text-primary" />
        <h1 className="font-semibold text-sm">Skills</h1>
        <p className="text-xs text-muted-foreground flex-1">Markdown instruction files that auto-activate by semantic match</p>
        <Button size="sm" onClick={() => setShowForm(f => !f)} className="gap-1">
          <Plus className="w-3 h-3" />New Skill
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {showForm && (
          <Card className="p-4 mb-6 border-primary/30">
            <h2 className="font-semibold text-sm mb-3">Create Skill</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Skill Name *</label>
                  <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Financial Analysis" className="h-8 text-sm" data-testid="input-skill-name" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Trigger Keywords (comma-separated)</label>
                  <Input value={form.triggerKeywords} onChange={e => setForm(f => ({ ...f, triggerKeywords: e.target.value }))}
                    placeholder="finance, revenue, P&L, budget" className="h-8 text-sm" data-testid="input-skill-keywords" />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Description</label>
                <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="What this skill does" className="h-8 text-sm" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Skill Content (.md) *</label>
                <Textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                  placeholder="# Skill Name&#10;&#10;## When to activate&#10;...&#10;&#10;## Methodology&#10;..."
                  className="min-h-[180px] font-mono text-xs" data-testid="textarea-skill-content" />
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <Button size="sm" onClick={() => createSkill.mutate({
                name: form.name,
                description: form.description,
                content: form.content,
                triggerKeywords: form.triggerKeywords.split(",").map(k => k.trim()).filter(Boolean),
              })} disabled={!form.name || !form.content}>
                Create Skill
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </Card>
        )}

        {/* Built-in skills */}
        {builtIn.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Lock className="w-3.5 h-3.5 text-muted-foreground" />
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Built-in Skills</h2>
            </div>
            <div className="space-y-2">
              {builtIn.map(skill => (
                <Card key={skill.id} className={`p-3 ${!skill.enabled ? "opacity-50" : ""}`} data-testid={`skill-card-${skill.id}`}>
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-sm">{skill.name}</span>
                        <Badge variant="secondary" className="text-[10px]">built-in</Badge>
                        {skill.usageCount > 0 && (
                          <Badge variant="outline" className="text-[10px] gap-1">
                            <Zap className="w-2.5 h-2.5" />{skill.usageCount}x used
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{skill.description}</p>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {safeJsonParse(skill.triggerKeywords, [] as string[]).slice(0, 8).map(kw => (
                          <span key={kw} className="text-[10px] px-1.5 py-0.5 bg-muted rounded-full text-muted-foreground">{kw}</span>
                        ))}
                      </div>
                    </div>
                    <button onClick={() => toggleSkill.mutate({ id: skill.id, enabled: !skill.enabled })}
                      className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                      title={skill.enabled ? "Disable" : "Enable"}>
                      {skill.enabled ? <ToggleRight className="w-5 h-5 text-primary" /> : <ToggleLeft className="w-5 h-5" />}
                    </button>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Custom skills */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <BookOpen className="w-3.5 h-3.5 text-muted-foreground" />
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Custom Skills</h2>
          </div>
          {custom.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground border border-dashed border-border rounded-xl">
              <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-xs">No custom skills yet. Create one to extend the orchestrator's behavior.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {custom.map(skill => (
                <Card key={skill.id} className={`p-3 ${!skill.enabled ? "opacity-50" : ""}`}>
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-sm">{skill.name}</span>
                        {skill.usageCount > 0 && (
                          <Badge variant="outline" className="text-[10px]">{skill.usageCount}x used</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{skill.description}</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => toggleSkill.mutate({ id: skill.id, enabled: !skill.enabled })}
                        className="text-muted-foreground hover:text-foreground transition-colors">
                        {skill.enabled ? <ToggleRight className="w-5 h-5 text-primary" /> : <ToggleLeft className="w-5 h-5" />}
                      </button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 hover:text-destructive"
                        onClick={() => deleteSkill.mutate(skill.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
