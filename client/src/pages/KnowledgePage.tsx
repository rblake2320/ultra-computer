import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import {
  BookOpen,
  Plus,
  Trash2,
  RefreshCw,
  Search,
  Eye,
  Settings2,
  FileText,
  Database,
  Zap,
  Gauge,
  Layers,
  BarChart3,
  ChevronDown,
  ChevronUp,
  Pencil,
  Copy,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface KnowledgeEntry {
  id: string;
  name: string;
  description: string | null;
  content: string;
  summary: string | null;
  contentType: string;
  category: string | null;
  tags: string | null;
  sizeBytes: number;
  tokenEstimate: number;
  enabled: boolean;
  priority: number;
  tierPolicy: string;
  createdAt: number;
  updatedAt: number;
}

interface KBStats {
  totalEntries: number;
  enabledEntries: number;
  totalTokens: number;
  categories: Record<string, number>;
  tierBreakdown: { fast: number; medium: number; powerful: number };
}

interface PreviewResult {
  contextBlock: string;
  includedEntries: Array<{ id: string; name: string; mode: string }>;
  tokenEstimate: number;
  isStablePrefix: boolean;
}

// ─── Utilities ──────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

function formatTokens(tokens: number): string {
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}K`;
  return `${tokens}`;
}

function parseTags(tags: string | null): string[] {
  if (!tags) return [];
  try {
    const parsed = JSON.parse(tags);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return tags.split(",").map(t => t.trim()).filter(Boolean);
  }
}

const CATEGORY_COLORS: Record<string, string> = {
  models: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  architecture: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  tools: "bg-green-500/20 text-green-400 border-green-500/30",
  prompts: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  custom: "bg-muted text-muted-foreground border-border",
};

const TIER_POLICY_LABELS: Record<string, { label: string; color: string }> = {
  auto: { label: "Auto", color: "bg-muted text-muted-foreground" },
  always: { label: "Always", color: "bg-green-500/20 text-green-400" },
  "powerful-only": { label: "Powerful Only", color: "bg-purple-500/20 text-purple-400" },
  never: { label: "Never", color: "bg-red-500/20 text-red-400" },
};

const CONTENT_TYPE_OPTIONS = [
  { value: "text", label: "Plain Text" },
  { value: "markdown", label: "Markdown" },
  { value: "json", label: "JSON" },
  { value: "code", label: "Code" },
  { value: "system-reference", label: "System Reference" },
];

const CATEGORY_OPTIONS = [
  { value: "models", label: "Models" },
  { value: "architecture", label: "Architecture" },
  { value: "tools", label: "Tools" },
  { value: "prompts", label: "Prompts" },
  { value: "custom", label: "Custom" },
];

const TIER_POLICY_OPTIONS = [
  { value: "auto", label: "Auto (tier decides)" },
  { value: "always", label: "Always inject" },
  { value: "powerful-only", label: "Powerful models only" },
  { value: "never", label: "Never inject" },
];

// ─── Component ──────────────────────────────────────────────────────────────

export function KnowledgePage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingEntry, setEditingEntry] = useState<KnowledgeEntry | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [previewTier, setPreviewTier] = useState<"fast" | "medium" | "powerful">("powerful");

  // ─── Queries ────────────────────────────────────────────────────────────
  const { data: entries = [], isLoading } = useQuery<KnowledgeEntry[]>({
    queryKey: ["/api/knowledge"],
  });

  const { data: stats } = useQuery<KBStats>({
    queryKey: ["/api/knowledge/stats"],
  });

  const { data: preview, refetch: refetchPreview } = useQuery<PreviewResult>({
    queryKey: ["/api/knowledge/preview", previewTier],
    queryFn: () => apiRequest("GET", `/api/knowledge/preview/${previewTier}?contextWindow=128000`),
    enabled: false,
  });

  // ─── Mutations ──────────────────────────────────────────────────────────
  const createEntry = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiRequest("POST", "/api/knowledge", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/knowledge"] });
      qc.invalidateQueries({ queryKey: ["/api/knowledge/stats"] });
      setShowCreateDialog(false);
      toast({ title: "Entry created" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateEntry = useMutation({
    mutationFn: ({ id, ...data }: Record<string, any>) => apiRequest("PATCH", `/api/knowledge/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/knowledge"] });
      qc.invalidateQueries({ queryKey: ["/api/knowledge/stats"] });
      setEditingEntry(null);
      toast({ title: "Entry updated" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteEntry = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/knowledge/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/knowledge"] });
      qc.invalidateQueries({ queryKey: ["/api/knowledge/stats"] });
      toast({ title: "Entry deleted" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const toggleEntry = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      apiRequest("PATCH", `/api/knowledge/${id}`, { enabled }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/knowledge"] });
      qc.invalidateQueries({ queryKey: ["/api/knowledge/stats"] });
    },
  });

  const reseed = useMutation({
    mutationFn: () => apiRequest("POST", "/api/knowledge/reseed"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/knowledge"] });
      qc.invalidateQueries({ queryKey: ["/api/knowledge/stats"] });
      toast({ title: "System references reseeded" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // ─── Filtering ──────────────────────────────────────────────────────────
  const filtered = searchQuery
    ? entries.filter(e =>
        e.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (e.description || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (e.tags || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (e.category || "").toLowerCase().includes(searchQuery.toLowerCase())
      )
    : entries;

  const totalTokenBudget = 50000; // MAX_TOKENS_ABSOLUTE
  const usedTokens = stats?.totalTokens || 0;
  const budgetPct = Math.min((usedTokens / totalTokenBudget) * 100, 100);

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold">Knowledge Base</h1>
              <p className="text-xs text-muted-foreground">
                Persistent context for LLM calls — tier-aware, cache-friendly
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <RefreshCw className="w-3.5 h-3.5" />
                  Reseed
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reseed System References</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will delete system-generated entries (models, architecture, tools) and recreate them from the
                    current provider registry. Custom entries are preserved.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => reseed.mutate()}>
                    {reseed.isPending ? "Reseeding..." : "Reseed"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button size="sm" className="gap-1.5" onClick={() => setShowCreateDialog(true)}>
              <Plus className="w-3.5 h-3.5" />
              Add Entry
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        {stats ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="p-3 space-y-1">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Database className="w-3.5 h-3.5" />
                <span className="text-xs">Entries</span>
              </div>
              <p className="text-xl font-bold" data-testid="text-total-entries">
                {stats.enabledEntries}
                <span className="text-xs text-muted-foreground font-normal ml-1">/ {stats.totalEntries}</span>
              </p>
            </Card>
            <Card className="p-3 space-y-1">
              <div className="flex items-center gap-2 text-muted-foreground">
                <BarChart3 className="w-3.5 h-3.5" />
                <span className="text-xs">Token Budget</span>
              </div>
              <p className="text-xl font-bold">{formatTokens(usedTokens)}</p>
              <Progress value={budgetPct} className="h-1" />
              <p className="text-[10px] text-muted-foreground">{budgetPct.toFixed(0)}% of {formatTokens(totalTokenBudget)} max</p>
            </Card>
            <Card className="p-3 space-y-1">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Layers className="w-3.5 h-3.5" />
                <span className="text-xs">Tier Visibility</span>
              </div>
              <div className="flex gap-2 text-xs pt-1">
                <span className="flex items-center gap-1">
                  <Zap className="w-3 h-3 text-yellow-400" /> {stats.tierBreakdown.fast}
                </span>
                <span className="flex items-center gap-1">
                  <Gauge className="w-3 h-3 text-blue-400" /> {stats.tierBreakdown.medium}
                </span>
                <span className="flex items-center gap-1">
                  <Settings2 className="w-3 h-3 text-purple-400" /> {stats.tierBreakdown.powerful}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground">fast / medium / powerful</p>
            </Card>
            <Card className="p-3 space-y-1">
              <div className="flex items-center gap-2 text-muted-foreground">
                <FileText className="w-3.5 h-3.5" />
                <span className="text-xs">Categories</span>
              </div>
              <div className="flex flex-wrap gap-1 pt-1">
                {Object.entries(stats.categories).map(([cat, count]) => (
                  <Badge key={cat} variant="outline" className={`text-[10px] ${CATEGORY_COLORS[cat] || CATEGORY_COLORS.custom}`}>
                    {cat}: {count}
                  </Badge>
                ))}
              </div>
            </Card>
          </div>
        ) : isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-lg" />
            ))}
          </div>
        ) : null}

        {/* Tabs: Entries + Preview */}
        <Tabs defaultValue="entries">
          <TabsList>
            <TabsTrigger value="entries" className="gap-1.5">
              <Database className="w-3.5 h-3.5" /> Entries
            </TabsTrigger>
            <TabsTrigger value="preview" className="gap-1.5" onClick={() => refetchPreview()}>
              <Eye className="w-3.5 h-3.5" /> Tier Preview
            </TabsTrigger>
          </TabsList>

          {/* Entries Tab */}
          <TabsContent value="entries" className="space-y-3 mt-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search entries by name, category, or tags..."
                className="pl-9"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                data-testid="input-search-knowledge"
              />
            </div>

            {/* Entry List */}
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 rounded-lg" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <Card className="p-8 text-center text-muted-foreground">
                <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">{searchQuery ? "No matching entries" : "Knowledge base is empty"}</p>
                <p className="text-xs mt-1">
                  {searchQuery ? "Try a different search term" : "Click \"Add Entry\" or \"Reseed\" to populate"}
                </p>
              </Card>
            ) : (
              <div className="space-y-2">
                {filtered.map(entry => (
                  <EntryCard
                    key={entry.id}
                    entry={entry}
                    expanded={expandedId === entry.id}
                    onToggleExpand={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                    onToggleEnabled={(enabled) => toggleEntry.mutate({ id: entry.id, enabled })}
                    onEdit={() => setEditingEntry(entry)}
                    onDelete={() => deleteEntry.mutate(entry.id)}
                    isDeleting={deleteEntry.isPending}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* Preview Tab */}
          <TabsContent value="preview" className="space-y-3 mt-3">
            <div className="flex items-center gap-3">
              <Select value={previewTier} onValueChange={(v) => { setPreviewTier(v as any); }}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fast">Fast Tier</SelectItem>
                  <SelectItem value="medium">Medium Tier</SelectItem>
                  <SelectItem value="powerful">Powerful Tier</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" variant="outline" onClick={() => refetchPreview()} className="gap-1.5">
                <Eye className="w-3.5 h-3.5" /> Preview
              </Button>
              {preview && (
                <span className="text-xs text-muted-foreground">
                  ~{formatTokens(preview.tokenEstimate)} tokens, {preview.includedEntries.length} entries
                  {preview.isStablePrefix && (
                    <Badge variant="outline" className="ml-2 text-[10px] bg-green-500/10 text-green-400 border-green-500/30">
                      Cache-friendly prefix
                    </Badge>
                  )}
                </span>
              )}
            </div>
            {preview ? (
              <Card className="p-0 overflow-hidden">
                <div className="p-3 border-b border-border bg-muted/30">
                  <p className="text-xs font-medium">Included Entries</p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {preview.includedEntries.map(e => (
                      <Badge
                        key={e.id}
                        variant="outline"
                        className={`text-[10px] ${e.mode === "full" ? "bg-green-500/10 text-green-400 border-green-500/30" : e.mode === "summary" ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/30" : "bg-red-500/10 text-red-400 border-red-500/30"}`}
                      >
                        {e.name} ({e.mode})
                      </Badge>
                    ))}
                  </div>
                </div>
                <ScrollArea className="max-h-[500px]">
                  <pre className="p-3 text-xs text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed">
                    {preview.contextBlock || "(empty — no entries matched this tier)"}
                  </pre>
                </ScrollArea>
              </Card>
            ) : (
              <Card className="p-8 text-center text-muted-foreground">
                <Eye className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">Click Preview to see what models receive</p>
                <p className="text-xs mt-1">Shows the assembled knowledge context block for the selected tier</p>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Create Dialog */}
      <EntryDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onSubmit={(data) => createEntry.mutate(data)}
        isPending={createEntry.isPending}
        title="Add Knowledge Entry"
        description="Add a new entry to the knowledge base. It will be available to models based on its tier policy."
      />

      {/* Edit Dialog */}
      {editingEntry && (
        <EntryDialog
          open={!!editingEntry}
          onOpenChange={(open) => { if (!open) setEditingEntry(null); }}
          onSubmit={(data) => updateEntry.mutate({ id: editingEntry.id, ...data })}
          isPending={updateEntry.isPending}
          title="Edit Knowledge Entry"
          description="Update this knowledge base entry."
          defaults={editingEntry}
        />
      )}
    </div>
  );
}

// ─── Entry Card ────────────────────────────────────────────────────────────

function EntryCard({
  entry,
  expanded,
  onToggleExpand,
  onToggleEnabled,
  onEdit,
  onDelete,
  isDeleting,
}: {
  entry: KnowledgeEntry;
  expanded: boolean;
  onToggleExpand: () => void;
  onToggleEnabled: (enabled: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const tags = parseTags(entry.tags);
  const tierInfo = TIER_POLICY_LABELS[entry.tierPolicy] || TIER_POLICY_LABELS.auto;
  const catColor = CATEGORY_COLORS[entry.category || "custom"] || CATEGORY_COLORS.custom;

  return (
    <Card className={`transition-colors ${!entry.enabled ? "opacity-50" : ""}`}>
      <div className="p-3">
        {/* Top row */}
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold truncate" data-testid={`text-kb-name-${entry.id}`}>
                {entry.name}
              </p>
              {entry.category && (
                <Badge variant="outline" className={`text-[10px] ${catColor}`}>
                  {entry.category}
                </Badge>
              )}
              <Badge variant="outline" className={`text-[10px] ${tierInfo.color}`}>
                {tierInfo.label}
              </Badge>
              <span className="text-[10px] text-muted-foreground">
                P{entry.priority}
              </span>
            </div>
            {entry.description && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{entry.description}</p>
            )}
            <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground">
              <span>{formatTokens(entry.tokenEstimate)} tokens</span>
              <span>{formatBytes(entry.sizeBytes)}</span>
              <span>{entry.contentType}</span>
              {entry.summary && <span className="text-green-400">has summary</span>}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <Switch
              checked={entry.enabled}
              onCheckedChange={onToggleEnabled}
              aria-label={`Toggle ${entry.name}`}
              data-testid={`switch-kb-${entry.id}`}
            />
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit} data-testid={`button-edit-kb-${entry.id}`}>
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" data-testid={`button-delete-kb-${entry.id}`}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete "{entry.name}"?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This entry will be permanently removed from the knowledge base.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={onDelete} disabled={isDeleting}>Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onToggleExpand}>
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </Button>
          </div>
        </div>

        {/* Tags row */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {tags.slice(0, expanded ? tags.length : 6).map(tag => (
              <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                {tag}
              </span>
            ))}
            {!expanded && tags.length > 6 && (
              <span className="text-[10px] text-muted-foreground">+{tags.length - 6} more</span>
            )}
          </div>
        )}

        {/* Expanded content */}
        {expanded && (
          <div className="mt-3 space-y-2 border-t border-border pt-3">
            {entry.summary && (
              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Summary (medium tier)</p>
                <p className="text-xs text-muted-foreground bg-muted/50 rounded p-2">{entry.summary}</p>
              </div>
            )}
            <div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Content (powerful tier)</p>
              <ScrollArea className="max-h-[300px]">
                <pre className="text-xs text-muted-foreground bg-muted/50 rounded p-2 whitespace-pre-wrap font-mono leading-relaxed">
                  {entry.content}
                </pre>
              </ScrollArea>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

// ─── Entry Dialog (Create / Edit) ──────────────────────────────────────────

function EntryDialog({
  open,
  onOpenChange,
  onSubmit,
  isPending,
  title,
  description,
  defaults,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: Record<string, unknown>) => void;
  isPending: boolean;
  title: string;
  description: string;
  defaults?: KnowledgeEntry;
}) {
  const [name, setName] = useState(defaults?.name || "");
  const [desc, setDesc] = useState(defaults?.description || "");
  const [content, setContent] = useState(defaults?.content || "");
  const [contentType, setContentType] = useState(defaults?.contentType || "markdown");
  const [category, setCategory] = useState(defaults?.category || "custom");
  const [tagsStr, setTagsStr] = useState(() => {
    if (!defaults?.tags) return "";
    const tags = parseTags(defaults.tags);
    return tags.join(", ");
  });
  const [priority, setPriority] = useState(defaults?.priority ?? 50);
  const [tierPolicy, setTierPolicy] = useState(defaults?.tierPolicy || "auto");

  const handleSubmit = () => {
    if (!name.trim() || !content.trim()) return;
    const tags = tagsStr.split(",").map(t => t.trim()).filter(Boolean);
    onSubmit({
      name: name.trim(),
      description: desc.trim() || null,
      content: content.trim(),
      contentType,
      category,
      tags,
      priority,
      tierPolicy,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Name</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. API Reference Guide" data-testid="input-kb-name" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Description</label>
            <Input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Brief description of this entry" data-testid="input-kb-desc" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Content Type</label>
              <Select value={contentType} onValueChange={setContentType}>
                <SelectTrigger data-testid="select-kb-content-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONTENT_TYPE_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Category</label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger data-testid="select-kb-category"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Tier Policy</label>
              <Select value={tierPolicy} onValueChange={setTierPolicy}>
                <SelectTrigger data-testid="select-kb-tier-policy"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIER_POLICY_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Priority (0-100)</label>
              <Input
                type="number"
                min={0}
                max={100}
                value={priority}
                onChange={e => setPriority(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                data-testid="input-kb-priority"
              />
              <p className="text-[10px] text-muted-foreground">Higher = more likely to be included when budget is tight</p>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Tags (comma separated)</label>
            <Input value={tagsStr} onChange={e => setTagsStr(e.target.value)} placeholder="e.g. api, models, openai" data-testid="input-kb-tags" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Content</label>
            <Textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="The knowledge content to inject into model context..."
              rows={12}
              className="font-mono text-xs"
              data-testid="input-kb-content"
            />
            <p className="text-[10px] text-muted-foreground">
              ~{formatTokens(Math.ceil((content.length || 0) / 4))} tokens estimated, {formatBytes(content.length || 0)}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isPending || !name.trim() || !content.trim()}>
            {isPending ? "Saving..." : defaults ? "Update" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
