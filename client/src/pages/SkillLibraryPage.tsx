import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../lib/queryClient";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { ScrollArea } from "../components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { useToast } from "../hooks/use-toast";
import {
  Library, Plus, Trash2, Search, Star, StarOff, Play, Copy, Download,
  Upload, Clock, Hash, Tag, Code2, FileCode, Edit3, X, ChevronDown,
  ChevronRight, History, Terminal
} from "lucide-react";
import type { SkillScript, SkillScriptVersion } from "../../../shared/schema";

const LANG_ICONS: Record<string, typeof Terminal> = {
  bash: Terminal,
  python: FileCode,
  javascript: Code2,
  typescript: Code2,
};

const LANG_COLORS: Record<string, string> = {
  bash: "text-green-400",
  python: "text-blue-400",
  javascript: "text-yellow-400",
  typescript: "text-blue-300",
};

export function SkillLibraryPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showVersions, setShowVersions] = useState<string | null>(null);
  const [filterLang, setFilterLang] = useState<string>("all");
  const [filterFavorite, setFilterFavorite] = useState(false);

  const [form, setForm] = useState({
    name: "", description: "", language: "bash", content: "", tags: "",
  });

  const { data: scripts = [] } = useQuery<SkillScript[]>({
    queryKey: ["/api/skill-scripts", searchQuery],
    queryFn: () =>
      searchQuery
        ? apiRequest("GET", `/api/skill-scripts?q=${encodeURIComponent(searchQuery)}`)
        : apiRequest("GET", "/api/skill-scripts"),
  });

  const { data: versions = [] } = useQuery<SkillScriptVersion[]>({
    queryKey: ["/api/skill-scripts", showVersions, "versions"],
    queryFn: () => apiRequest("GET", `/api/skill-scripts/${showVersions}/versions`),
    enabled: !!showVersions,
  });

  const createScript = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/skill-scripts", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/skill-scripts"] });
      setShowCreateForm(false);
      setForm({ name: "", description: "", language: "bash", content: "", tags: "" });
      toast({ title: "Script saved to library" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateScript = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => apiRequest("PATCH", `/api/skill-scripts/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/skill-scripts"] });
      setEditingId(null);
      toast({ title: "Script updated" });
    },
  });

  const deleteScript = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/skill-scripts/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/skill-scripts"] });
      if (selectedId) setSelectedId(null);
      toast({ title: "Script deleted" });
    },
  });

  const toggleFavorite = useMutation({
    mutationFn: ({ id, isFavorite }: { id: string; isFavorite: boolean }) =>
      apiRequest("PATCH", `/api/skill-scripts/${id}`, { isFavorite }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/skill-scripts"] }),
  });

  const runScript = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/skill-scripts/${id}/run`),
    onSuccess: (data: { content: string; language: string; name: string }) => {
      qc.invalidateQueries({ queryKey: ["/api/skill-scripts"] });
      // Copy script content to clipboard for easy pasting into chat
      navigator.clipboard.writeText(data.content).catch(() => {});
      toast({
        title: `Running: ${data.name}`,
        description: "Script content copied to clipboard. Paste it into a chat session to execute.",
      });
    },
    onError: (e: any) => toast({ title: "Run failed", description: e.message, variant: "destructive" }),
  });

  // Filter scripts
  const filtered = scripts.filter(s => {
    if (filterLang !== "all" && s.language !== filterLang) return false;
    if (filterFavorite && !s.isFavorite) return false;
    return true;
  });

  const selected = selectedId ? scripts.find(s => s.id === selectedId) : null;

  const handleCreate = () => {
    createScript.mutate({
      name: form.name,
      description: form.description,
      language: form.language,
      content: form.content,
      tags: form.tags.split(",").map(t => t.trim()).filter(Boolean),
    });
  };

  const handleExport = (script: SkillScript) => {
    const data = {
      name: script.name,
      description: script.description,
      language: script.language,
      content: script.content,
      tags: JSON.parse(script.tags || "[]"),
      version: script.version,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${script.name.replace(/\s+/g, "-").toLowerCase()}.skill.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Script exported" });
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = JSON.parse(evt.target?.result as string);
        createScript.mutate({
          name: data.name || file.name.replace(".skill.json", ""),
          description: data.description || "",
          language: data.language || "bash",
          content: data.content || "",
          tags: data.tags || [],
        });
      } catch {
        toast({ title: "Invalid file format", variant: "destructive" });
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(
      () => toast({ title: "Copied to clipboard" }),
      () => toast({ title: "Failed to copy", variant: "destructive" })
    );
  };

  return (
    <div className="flex h-full">
      {/* Script List Panel */}
      <div className="flex flex-col w-[380px] border-r border-border shrink-0">
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border bg-card/50">
          <Library className="w-4 h-4 text-primary" />
          <h1 className="font-semibold text-sm flex-1">Script Library</h1>
          <Badge variant="secondary" className="text-[10px]">{scripts.length}</Badge>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => fileInputRef.current?.click()} title="Import">
            <Upload className="w-3.5 h-3.5" />
          </Button>
          <input ref={fileInputRef} type="file" accept=".json,.skill.json" className="hidden" onChange={handleImport} />
          <Button size="sm" className="h-7 gap-1 text-xs" onClick={() => setShowCreateForm(f => !f)}>
            <Plus className="w-3 h-3" />New
          </Button>
        </div>

        {/* Search + Filters */}
        <div className="px-3 py-2 border-b border-border space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search scripts..."
              className="h-8 text-xs pl-8"
              data-testid="input-search-scripts"
            />
          </div>
          <div className="flex gap-2">
            <Select value={filterLang} onValueChange={setFilterLang}>
              <SelectTrigger className="h-7 text-xs flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Languages</SelectItem>
                <SelectItem value="bash">Bash</SelectItem>
                <SelectItem value="python">Python</SelectItem>
                <SelectItem value="javascript">JavaScript</SelectItem>
                <SelectItem value="typescript">TypeScript</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant={filterFavorite ? "default" : "outline"}
              className="h-7 w-7 p-0 shrink-0"
              onClick={() => setFilterFavorite(f => !f)}
              title="Show favorites only"
            >
              <Star className={`w-3 h-3 ${filterFavorite ? "fill-current" : ""}`} />
            </Button>
          </div>
        </div>

        {/* Create Form */}
        {showCreateForm && (
          <div className="border-b border-border bg-muted/30 p-3 space-y-2.5">
            <div className="flex items-center gap-2">
              <Plus className="w-3 h-3 text-primary" />
              <span className="text-xs font-semibold">New Script</span>
            </div>
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Script name" className="h-7 text-xs" data-testid="input-new-script-name" />
            <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Description (optional)" className="h-7 text-xs" />
            <div className="flex gap-2">
              <Select value={form.language} onValueChange={v => setForm(f => ({ ...f, language: v }))}>
                <SelectTrigger className="h-7 text-xs w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bash">Bash</SelectItem>
                  <SelectItem value="python">Python</SelectItem>
                  <SelectItem value="javascript">JavaScript</SelectItem>
                  <SelectItem value="typescript">TypeScript</SelectItem>
                </SelectContent>
              </Select>
              <Input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
                placeholder="Tags (comma-sep)" className="h-7 text-xs flex-1" />
            </div>
            <Textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
              placeholder="#!/bin/bash&#10;echo 'Hello world'"
              className="min-h-[120px] font-mono text-[11px] leading-relaxed"
              data-testid="textarea-new-script-content" />
            <div className="flex gap-2">
              <Button size="sm" className="h-7 text-xs" onClick={handleCreate}
                disabled={!form.name.trim() || !form.content.trim() || createScript.isPending}>
                Save to Library
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs"
                onClick={() => { setShowCreateForm(false); setForm({ name: "", description: "", language: "bash", content: "", tags: "" }); }}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Script list */}
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {filtered.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Library className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="text-xs">
                  {scripts.length === 0
                    ? "No scripts yet. Save one from a chat session or create one here."
                    : "No scripts match your filters."}
                </p>
              </div>
            ) : (
              filtered.map(script => {
                const LangIcon = LANG_ICONS[script.language] || Terminal;
                const isSelected = selectedId === script.id;
                return (
                  <div
                    key={script.id}
                    onClick={() => setSelectedId(script.id)}
                    className={`group rounded-lg border px-3 py-2 cursor-pointer transition-all ${
                      isSelected
                        ? "border-primary/50 bg-primary/5"
                        : "border-border bg-card hover:border-muted-foreground/30 hover:bg-muted/30"
                    }`}
                    data-testid={`script-item-${script.id}`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <LangIcon className={`w-3.5 h-3.5 shrink-0 ${LANG_COLORS[script.language] || "text-muted-foreground"}`} />
                      <span className="text-xs font-semibold truncate flex-1">{script.name}</span>
                      <button
                        onClick={e => { e.stopPropagation(); toggleFavorite.mutate({ id: script.id, isFavorite: !script.isFavorite }); }}
                        className="text-muted-foreground hover:text-yellow-400 transition-colors shrink-0"
                      >
                        {script.isFavorite
                          ? <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                          : <StarOff className="w-3 h-3 opacity-0 group-hover:opacity-100" />}
                      </button>
                    </div>
                    {script.description && (
                      <p className="text-[10px] text-muted-foreground truncate mb-1">{script.description}</p>
                    )}
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span className={LANG_COLORS[script.language]}>{script.language}</span>
                      <span>v{script.version}</span>
                      {script.usageCount > 0 && <span>{script.usageCount}x used</span>}
                      {(JSON.parse(script.tags || "[]") as string[]).slice(0, 2).map(t => (
                        <Badge key={t} variant="secondary" className="text-[9px] px-1 py-0 h-3.5">{t}</Badge>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Detail Panel */}
      <div className="flex-1 flex flex-col min-w-0">
        {selected ? (
          <ScriptDetail
            script={selected}
            onEdit={() => {
              setEditingId(selected.id);
              setForm({
                name: selected.name,
                description: selected.description,
                language: selected.language,
                content: selected.content,
                tags: (JSON.parse(selected.tags || "[]") as string[]).join(", "),
              });
            }}
            onDelete={() => deleteScript.mutate(selected.id)}
            onCopy={() => copyToClipboard(selected.content)}
            onExport={() => handleExport(selected)}
            onRun={() => runScript.mutate(selected.id)}
            onShowVersions={() => setShowVersions(showVersions === selected.id ? null : selected.id)}
            showVersions={showVersions === selected.id}
            versions={showVersions === selected.id ? versions : []}
            editing={editingId === selected.id}
            editForm={form}
            setEditForm={setForm}
            onSaveEdit={() => {
              updateScript.mutate({
                id: selected.id,
                data: {
                  name: form.name,
                  description: form.description,
                  language: form.language,
                  content: form.content,
                  tags: form.tags.split(",").map(t => t.trim()).filter(Boolean),
                },
              });
            }}
            onCancelEdit={() => setEditingId(null)}
            onRestoreVersion={(content: string) => {
              updateScript.mutate({
                id: selected.id,
                data: { content, changeNote: "Restored from previous version" },
              });
            }}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <Library className="w-12 h-12 mb-3 opacity-20" />
            <p className="text-sm font-medium mb-1">Script Library</p>
            <p className="text-xs max-w-[280px] text-center">
              Save bash, Python, and JavaScript scripts here.
              Reuse them across sessions or inject them into agent workflows.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Detail View Component ──────────────────────────────────────────────

interface ScriptDetailProps {
  script: SkillScript;
  onEdit: () => void;
  onDelete: () => void;
  onCopy: () => void;
  onExport: () => void;
  onRun: () => void;
  onShowVersions: () => void;
  showVersions: boolean;
  versions: SkillScriptVersion[];
  editing: boolean;
  editForm: { name: string; description: string; language: string; content: string; tags: string };
  setEditForm: (fn: (f: any) => any) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onRestoreVersion: (content: string) => void;
}

function ScriptDetail({
  script, onEdit, onDelete, onCopy, onExport, onRun, onShowVersions,
  showVersions, versions, editing, editForm, setEditForm, onSaveEdit, onCancelEdit, onRestoreVersion,
}: ScriptDetailProps) {
  const LangIcon = LANG_ICONS[script.language] || Terminal;
  const tags = JSON.parse(script.tags || "[]") as string[];

  return (
    <>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-card/50 shrink-0">
        <LangIcon className={`w-4 h-4 ${LANG_COLORS[script.language]}`} />
        {editing ? (
          <Input value={editForm.name} onChange={e => setEditForm((f: any) => ({ ...f, name: e.target.value }))}
            className="h-7 text-sm font-semibold flex-1" />
        ) : (
          <h2 className="font-semibold text-sm flex-1 truncate">{script.name}</h2>
        )}
        <Badge variant="outline" className="text-[10px]">v{script.version}</Badge>
        <Badge variant="secondary" className="text-[10px] gap-1">
          <Hash className="w-2.5 h-2.5" />{script.usageCount}x
        </Badge>
        <div className="flex gap-1">
          {!editing && (
            <>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 hover:text-green-500" onClick={onRun} title="Run (copy to clipboard)"><Play className="w-3.5 h-3.5" /></Button>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onCopy} title="Copy"><Copy className="w-3.5 h-3.5" /></Button>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onExport} title="Export"><Download className="w-3.5 h-3.5" /></Button>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onShowVersions} title="Version history"><History className="w-3.5 h-3.5" /></Button>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onEdit} title="Edit"><Edit3 className="w-3.5 h-3.5" /></Button>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 hover:text-destructive" onClick={onDelete} title="Delete"><Trash2 className="w-3.5 h-3.5" /></Button>
            </>
          )}
          {editing && (
            <>
              <Button size="sm" className="h-7 text-xs" onClick={onSaveEdit}>Save</Button>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onCancelEdit}>Cancel</Button>
            </>
          )}
        </div>
      </div>

      {/* Metadata bar */}
      <div className="flex items-center gap-3 px-4 py-1.5 border-b border-border bg-muted/20 text-[10px] text-muted-foreground">
        <span className={LANG_COLORS[script.language]}>{script.language}</span>
        <span>{script.content.split("\n").length} lines</span>
        <span>{new Date(script.createdAt).toLocaleDateString()}</span>
        {script.sourceConversationId && (
          <span className="flex items-center gap-1">
            <Clock className="w-2.5 h-2.5" />from session
          </span>
        )}
        {tags.length > 0 && (
          <div className="flex gap-1 ml-auto">
            {tags.map(t => (
              <Badge key={t} variant="secondary" className="text-[9px] px-1.5 py-0 h-4">{t}</Badge>
            ))}
          </div>
        )}
      </div>

      {/* Version history panel */}
      {showVersions && (
        <div className="border-b border-border bg-muted/30 px-4 py-2 max-h-[200px] overflow-auto">
          <div className="flex items-center gap-2 mb-2">
            <History className="w-3 h-3 text-primary" />
            <span className="text-xs font-semibold">Version History</span>
            <span className="text-[10px] text-muted-foreground">{versions.length} version{versions.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="space-y-1">
            {versions.map(v => (
              <div key={v.id} className="flex items-center gap-2 text-[11px] px-2 py-1 rounded hover:bg-muted/50">
                <Badge variant={v.version === script.version ? "default" : "outline"} className="text-[9px] shrink-0">
                  v{v.version}
                </Badge>
                <span className="text-muted-foreground flex-1 truncate">{v.changeNote || "No note"}</span>
                <span className="text-muted-foreground shrink-0">{new Date(v.createdAt).toLocaleString()}</span>
                {v.version !== script.version && (
                  <Button size="sm" variant="ghost" className="h-5 text-[10px] px-1.5"
                    onClick={() => onRestoreVersion(v.content)}>
                    Restore
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Code editor / viewer */}
      <ScrollArea className="flex-1">
        {editing ? (
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1">Description</label>
                <Input value={editForm.description} onChange={e => setEditForm((f: any) => ({ ...f, description: e.target.value }))}
                  className="h-7 text-xs" placeholder="Optional description" />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1">Tags</label>
                <Input value={editForm.tags} onChange={e => setEditForm((f: any) => ({ ...f, tags: e.target.value }))}
                  className="h-7 text-xs" placeholder="Comma separated" />
              </div>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1">Content</label>
              <Textarea
                value={editForm.content}
                onChange={e => setEditForm((f: any) => ({ ...f, content: e.target.value }))}
                className="min-h-[400px] font-mono text-[11px] leading-relaxed"
                data-testid="textarea-edit-script-content"
              />
            </div>
          </div>
        ) : (
          <div className="p-4">
            {script.description && (
              <p className="text-xs text-muted-foreground mb-3">{script.description}</p>
            )}
            <pre className="bg-muted/40 border border-border rounded-lg p-4 text-[11px] font-mono leading-relaxed overflow-x-auto whitespace-pre-wrap break-words">
              {script.content}
            </pre>
          </div>
        )}
      </ScrollArea>
    </>
  );
}
