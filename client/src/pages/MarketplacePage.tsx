import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../lib/queryClient";
import { safeJsonParse } from "../lib/safeJson";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { Progress } from "../components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../components/ui/tooltip";
import { useToast } from "../hooks/use-toast";
import {
  Store, Search, Download, Star, GitFork, Plus, Shield, Sparkles,
  ArrowLeft, Tag, User, Calendar, FileText, Code, ExternalLink,
  TrendingUp, Package, ChevronRight, BarChart3, Trash2, Upload,
  Zap, Award, Activity, Gauge, Layers, FileCode, RefreshCcw,
} from "lucide-react";

interface MarketplaceSkill {
  id: string;
  slug: string;
  name: string;
  description: string;
  longDescription: string;
  authorName: string;
  authorEmail: string | null;
  category: string;
  tags: string;
  license: string;
  repoUrl: string | null;
  currentVersion: string;
  visibility: string;
  installCount: number;
  ratingSum: number;
  ratingCount: number;
  forkedFromId: string | null;
  forkCount: number;
  featured: boolean;
  verified: boolean;
  publishedAt: number;
  updatedAt: number;
  // Scoring fields
  qualityScore: number | null;
  scoreTier: string | null;
  installVelocity: number | null;
  ratingBayesian: number | null;
  ratingVariance: number | null;
  forkDepth: number | null;
  versionFrequency: number | null;
  contentRichness: number | null;
  lastScoredAt: number | null;
}

interface MarketplaceVersion {
  id: string;
  skillId: string;
  version: string;
  content: string;
  changelog: string;
  skillType: string;
  language: string | null;
  triggerKeywords: string;
  fileSize: number;
  createdAt: number;
}

interface MarketplaceRating {
  id: string;
  skillId: string;
  userId: string;
  rating: number;
  review: string | null;
  createdAt: number;
}

interface SkillDetail extends MarketplaceSkill {
  versions: MarketplaceVersion[];
  ratings: MarketplaceRating[];
  installed: { id: string; installedVersion: string } | null;
  avgRating: number;
}

interface ScoreBreakdown {
  skillId: string;
  qualityScore: number;
  scoreTier: string;
  featured: boolean;
  verified: boolean;
  signals: {
    installVelocity: { value: number; score: number; weight: number };
    ratingBayesian: { value: number; score: number; weight: number };
    ratingConsensus: { value: number; score: number; weight: number };
    forkLineage: { value: number; score: number; weight: number };
    versionFrequency: { value: number; score: number; weight: number };
    contentRichness: { value: number; score: number; weight: number };
  };
}

interface MarketplaceStats {
  totalSkills: number;
  totalInstalls: number;
  categories: Record<string, number>;
  featured: number;
  verified: number;
  tierDistribution: Record<string, number>;
}

const CATEGORIES = [
  { value: "all", label: "All Categories" },
  { value: "general", label: "General" },
  { value: "research", label: "Research" },
  { value: "code", label: "Code" },
  { value: "data", label: "Data" },
  { value: "writing", label: "Writing" },
  { value: "devops", label: "DevOps" },
  { value: "design", label: "Design" },
  { value: "other", label: "Other" },
];

const CATEGORY_COLORS: Record<string, string> = {
  general: "bg-slate-500/10 text-slate-400",
  research: "bg-blue-500/10 text-blue-400",
  code: "bg-green-500/10 text-green-400",
  data: "bg-purple-500/10 text-purple-400",
  writing: "bg-amber-500/10 text-amber-400",
  devops: "bg-red-500/10 text-red-400",
  design: "bg-pink-500/10 text-pink-400",
  other: "bg-gray-500/10 text-gray-400",
};

const TIER_CONFIG: Record<string, { label: string; color: string; icon: typeof Award; bg: string }> = {
  platinum: { label: "Platinum", color: "text-violet-300", icon: Award, bg: "bg-violet-500/15 border-violet-500/30 text-violet-300" },
  gold: { label: "Gold", color: "text-amber-300", icon: Sparkles, bg: "bg-amber-500/15 border-amber-500/30 text-amber-300" },
  silver: { label: "Silver", color: "text-slate-300", icon: Shield, bg: "bg-slate-500/15 border-slate-500/30 text-slate-300" },
  bronze: { label: "Bronze", color: "text-orange-400", icon: Zap, bg: "bg-orange-500/15 border-orange-500/30 text-orange-400" },
  unranked: { label: "Unranked", color: "text-muted-foreground", icon: Gauge, bg: "bg-muted/50 border-border text-muted-foreground" },
};

// Stable per-session anonymous user ID
const localUserId = `user-${window.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}`;

function TierBadge({ tier, score, size = "sm" }: { tier: string | null; score: number | null; size?: "sm" | "md" }) {
  const t = TIER_CONFIG[tier || "unranked"] || TIER_CONFIG.unranked;
  const TierIcon = t.icon;
  if (size === "sm") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[10px] font-medium ${t.bg}`}>
              <TierIcon className="w-3 h-3" />
              {score != null ? score.toFixed(0) : "—"}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            <p>{t.label} tier — Quality score: {score != null ? score.toFixed(1) : "unscored"}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  return (
    <Badge variant="outline" className={`text-[10px] gap-1 ${t.bg}`}>
      <TierIcon className="w-3 h-3" />
      {t.label} — {score != null ? score.toFixed(1) : "—"}
    </Badge>
  );
}

function StarRating({ rating, size = "sm" }: { rating: number; size?: "sm" | "md" }) {
  const stars = [];
  const iconSize = size === "sm" ? "w-3 h-3" : "w-4 h-4";
  for (let i = 1; i <= 5; i++) {
    stars.push(
      <Star
        key={i}
        className={`${iconSize} ${i <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`}
      />
    );
  }
  return <div className="flex gap-0.5">{stars}</div>;
}

function formatNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

// ─── Score Signal Bar ───────────────────────────────────────────────────────
function SignalBar({ label, icon: Icon, score, value, weight }: {
  label: string;
  icon: typeof Activity;
  score: number;
  value: number | string;
  weight: number;
}) {
  const weightPct = (weight * 100).toFixed(0);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Icon className="w-3 h-3" />
          {label}
          <span className="text-[10px] opacity-60">({weightPct}%)</span>
        </span>
        <span className="font-mono text-[11px]">{typeof value === "number" ? value.toFixed(2) : value} → {score.toFixed(0)}</span>
      </div>
      <Progress value={score} className="h-1.5" />
    </div>
  );
}

// ─── Skill Card ─────────────────────────────────────────────────────────────
function SkillCard({ skill, onClick }: { skill: MarketplaceSkill; onClick: () => void }) {
  const tags: string[] = safeJsonParse(skill.tags, []);
  const avgRating = skill.ratingCount > 0 ? (skill.ratingSum / skill.ratingCount).toFixed(1) : "—";

  return (
    <Card
      className="p-4 cursor-pointer hover:border-primary/40 transition-all hover:shadow-md group"
      onClick={onClick}
      data-testid={`marketplace-card-${skill.slug}`}
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
          <Package className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-sm truncate">{skill.name}</span>
            <TierBadge tier={skill.scoreTier} score={skill.qualityScore} />
          </div>
          <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{skill.description}</p>
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <User className="w-3 h-3" />{skill.authorName}
            </span>
            <span className="flex items-center gap-1">
              <Download className="w-3 h-3" />{formatNumber(skill.installCount)}
            </span>
            <span className="flex items-center gap-1">
              <Star className="w-3 h-3 fill-amber-400 text-amber-400" />{avgRating}
            </span>
            {skill.forkCount > 0 && (
              <span className="flex items-center gap-1">
                <GitFork className="w-3 h-3" />{skill.forkCount}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <Badge variant="outline" className={`text-[10px] ${CATEGORY_COLORS[skill.category] || ""}`}>
            {skill.category}
          </Badge>
          <span className="text-[10px] text-muted-foreground">v{skill.currentVersion}</span>
        </div>
      </div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2 pl-[52px]">
          {tags.slice(0, 5).map(t => (
            <span key={t} className="text-[10px] px-1.5 py-0.5 bg-muted rounded-full text-muted-foreground">{t}</span>
          ))}
        </div>
      )}
    </Card>
  );
}

// ─── Score Breakdown Panel ──────────────────────────────────────────────────
function ScoreBreakdownPanel({ skillId }: { skillId: string }) {
  const { data: breakdown, isLoading, isError: scoreError } = useQuery<ScoreBreakdown>({
    queryKey: ["/api/marketplace/skills", skillId, "score"],
    queryFn: () => apiRequest("GET", `/api/marketplace/skills/${skillId}/score`),
  });

  if (scoreError) {
    return (
      <Card className="p-4">
        <p className="text-xs text-muted-foreground text-center">Failed to load score data.</p>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Gauge className="w-4 h-4 text-muted-foreground animate-spin" />
          <span className="text-xs text-muted-foreground">Computing score...</span>
        </div>
      </Card>
    );
  }

  if (!breakdown) {
    return (
      <Card className="p-4">
        <p className="text-xs text-muted-foreground text-center">Score data unavailable</p>
      </Card>
    );
  }

  const t = TIER_CONFIG[breakdown.scoreTier] || TIER_CONFIG.unranked;

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Gauge className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs font-medium">Quality Score</span>
        </div>
        <div className="flex items-center gap-2">
          <TierBadge tier={breakdown.scoreTier} score={breakdown.qualityScore} size="md" />
        </div>
      </div>

      {/* Big score number */}
      <div className="text-center mb-4">
        <span className={`text-3xl font-bold ${t.color}`}>{breakdown.qualityScore.toFixed(1)}</span>
        <span className="text-sm text-muted-foreground"> / 100</span>
      </div>

      {/* Signal breakdown */}
      <div className="space-y-3">
        <SignalBar label="Install velocity" icon={TrendingUp} score={breakdown.signals.installVelocity.score} value={breakdown.signals.installVelocity.value} weight={breakdown.signals.installVelocity.weight} />
        <SignalBar label="Bayesian rating" icon={Star} score={breakdown.signals.ratingBayesian.score} value={breakdown.signals.ratingBayesian.value} weight={breakdown.signals.ratingBayesian.weight} />
        <SignalBar label="Rating consensus" icon={Activity} score={breakdown.signals.ratingConsensus.score} value={breakdown.signals.ratingConsensus.value} weight={breakdown.signals.ratingConsensus.weight} />
        <SignalBar label="Fork lineage" icon={GitFork} score={breakdown.signals.forkLineage.score} value={`depth ${breakdown.signals.forkLineage.value}`} weight={breakdown.signals.forkLineage.weight} />
        <SignalBar label="Version frequency" icon={Layers} score={breakdown.signals.versionFrequency.score} value={breakdown.signals.versionFrequency.value} weight={breakdown.signals.versionFrequency.weight} />
        <SignalBar label="Content richness" icon={FileCode} score={breakdown.signals.contentRichness.score} value={breakdown.signals.contentRichness.value} weight={breakdown.signals.contentRichness.weight} />
      </div>

      {/* Legend */}
      <div className="mt-4 pt-3 border-t border-border">
        <p className="text-[10px] text-muted-foreground mb-1.5">Tier thresholds</p>
        <div className="flex gap-2 flex-wrap">
          {(["platinum", "gold", "silver", "bronze"] as const).map(tier => {
            const tc = TIER_CONFIG[tier];
            const TierIcon = tc.icon;
            const min = tier === "platinum" ? 80 : tier === "gold" ? 60 : tier === "silver" ? 40 : 20;
            return (
              <span key={tier} className={`inline-flex items-center gap-1 text-[10px] ${tc.color}`}>
                <TierIcon className="w-2.5 h-2.5" />{tc.label} ≥{min}
              </span>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

// ─── Skill Detail View ──────────────────────────────────────────────────────
function SkillDetailView({ skillId, onBack }: { skillId: string; onBack: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("overview");
  const [ratingValue, setRatingValue] = useState(0);
  const [reviewText, setReviewText] = useState("");

  const { data: detail, isLoading, isError: detailError } = useQuery<SkillDetail>({
    queryKey: ["/api/marketplace/skills", skillId],
    queryFn: () => apiRequest("GET", `/api/marketplace/skills/${skillId}`),
  });

  const installMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/marketplace/skills/${skillId}/install`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/marketplace/skills", skillId] });
      qc.invalidateQueries({ queryKey: ["/api/marketplace/skills", skillId, "score"] });
      qc.invalidateQueries({ queryKey: ["/api/skills"] });
      qc.invalidateQueries({ queryKey: ["/api/marketplace/installs"] });
      toast({ title: "Skill installed successfully" });
    },
    onError: (e: any) => toast({ title: "Install failed", description: e.message, variant: "destructive" }),
  });

  const uninstallMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/marketplace/skills/${skillId}/uninstall`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/marketplace/skills", skillId] });
      qc.invalidateQueries({ queryKey: ["/api/skills"] });
      qc.invalidateQueries({ queryKey: ["/api/marketplace/installs"] });
      toast({ title: "Skill uninstalled" });
    },
    onError: (e: any) => toast({ title: "Uninstall failed", description: e.message, variant: "destructive" }),
  });

  const forkMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/marketplace/skills/${skillId}/fork`, {
      authorName: "Local User",
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/marketplace"] });
      toast({ title: "Skill forked successfully" });
    },
    onError: (e: any) => toast({ title: "Fork failed", description: e.message, variant: "destructive" }),
  });

  const rateMutation = useMutation({
    mutationFn: (data: { rating: number; review?: string }) =>
      apiRequest("POST", `/api/marketplace/skills/${skillId}/rate`, { ...data, userId: localUserId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/marketplace/skills", skillId] });
      qc.invalidateQueries({ queryKey: ["/api/marketplace/skills", skillId, "score"] });
      setRatingValue(0);
      setReviewText("");
      toast({ title: "Rating submitted" });
    },
    onError: (e: any) => toast({ title: "Rating failed", description: e.message, variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (detailError) return <p className="text-center text-muted-foreground py-8">Failed to load skill details. Please try again.</p>;

  if (!detail) return <p className="text-center text-muted-foreground py-8">Skill not found</p>;

  const tags: string[] = safeJsonParse(detail.tags, []);

  return (
    <div className="space-y-4">
      {/* Back button + header */}
      <div className="flex items-start gap-3">
        <button onClick={onBack} className="mt-1 p-1 rounded hover:bg-muted transition-colors" data-testid="button-back-marketplace">
          <ArrowLeft className="w-4 h-4 text-muted-foreground" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h2 className="font-semibold text-base">{detail.name}</h2>
            <TierBadge tier={detail.scoreTier} score={detail.qualityScore} size="md" />
          </div>
          <p className="text-xs text-muted-foreground">{detail.description}</p>
          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><User className="w-3 h-3" />{detail.authorName}</span>
            <span className="flex items-center gap-1"><Tag className="w-3 h-3" />v{detail.currentVersion}</span>
            <span className="flex items-center gap-1"><Download className="w-3 h-3" />{formatNumber(detail.installCount)} installs</span>
            <span className="flex items-center gap-1"><Star className="w-3 h-3 fill-amber-400 text-amber-400" />{detail.avgRating} ({detail.ratingCount})</span>
            <span className="flex items-center gap-1"><GitFork className="w-3 h-3" />{detail.forkCount} forks</span>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button size="sm" variant="outline" onClick={() => forkMutation.mutate()} disabled={forkMutation.isPending} data-testid="button-fork">
            <GitFork className="w-3.5 h-3.5 mr-1" />Fork
          </Button>
          {detail.installed ? (
            <Button size="sm" variant="destructive" onClick={() => uninstallMutation.mutate()} disabled={uninstallMutation.isPending} data-testid="button-uninstall">
              <Trash2 className="w-3.5 h-3.5 mr-1" />Uninstall
            </Button>
          ) : (
            <Button size="sm" onClick={() => installMutation.mutate()} disabled={installMutation.isPending} data-testid="button-install">
              <Download className="w-3.5 h-3.5 mr-1" />Install
            </Button>
          )}
        </div>
      </div>

      {/* Tags */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map(t => (
            <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
          ))}
          <Badge variant="outline" className={`text-[10px] ${CATEGORY_COLORS[detail.category] || ""}`}>
            {detail.category}
          </Badge>
          <Badge variant="outline" className="text-[10px]">{detail.license}</Badge>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-8">
          <TabsTrigger value="overview" className="text-xs h-7">Content</TabsTrigger>
          <TabsTrigger value="score" className="text-xs h-7">Quality Score</TabsTrigger>
          <TabsTrigger value="versions" className="text-xs h-7">Versions ({detail.versions.length})</TabsTrigger>
          <TabsTrigger value="ratings" className="text-xs h-7">Ratings ({detail.ratings.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-3">
          {detail.versions[0] && (
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs font-medium">Skill Content — v{detail.versions[0].version}</span>
                <Badge variant="secondary" className="text-[10px]">{detail.versions[0].skillType}</Badge>
                {detail.versions[0].language && (
                  <Badge variant="outline" className="text-[10px]">{detail.versions[0].language}</Badge>
                )}
                <span className="text-[10px] text-muted-foreground ml-auto">{(detail.versions[0].fileSize / 1024).toFixed(1)} KB</span>
              </div>
              <pre className="text-xs bg-muted/50 p-3 rounded-lg overflow-auto max-h-[400px] whitespace-pre-wrap font-mono">
                {detail.versions[0].content}
              </pre>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="score" className="mt-3">
          <ScoreBreakdownPanel skillId={skillId} />
        </TabsContent>

        <TabsContent value="versions" className="mt-3">
          <div className="space-y-2">
            {detail.versions.map(v => (
              <Card key={v.id} className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="secondary" className="text-[10px]">v{v.version}</Badge>
                  <Badge variant="outline" className="text-[10px]">{v.skillType}</Badge>
                  <span className="text-[10px] text-muted-foreground ml-auto">
                    <Calendar className="w-3 h-3 inline mr-1" />
                    {timeAgo(v.createdAt)}
                  </span>
                </div>
                {v.changelog && <p className="text-xs text-muted-foreground">{v.changelog}</p>}
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="ratings" className="mt-3">
          <div className="space-y-3">
            {/* Submit rating */}
            <Card className="p-3">
              <p className="text-xs font-medium mb-2">Rate this skill</p>
              <div className="flex items-center gap-3">
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map(n => (
                    <button key={n} onClick={() => setRatingValue(n)} data-testid={`rate-star-${n}`}>
                      <Star className={`w-5 h-5 transition-colors ${n <= ratingValue ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30 hover:text-amber-400/50"}`} />
                    </button>
                  ))}
                </div>
                <Input
                  value={reviewText}
                  onChange={e => setReviewText(e.target.value)}
                  placeholder="Optional review..."
                  className="h-7 text-xs flex-1"
                  data-testid="input-review"
                />
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  disabled={ratingValue === 0 || rateMutation.isPending}
                  onClick={() => rateMutation.mutate({ rating: ratingValue, review: reviewText || undefined })}
                  data-testid="button-submit-rating"
                >
                  Submit
                </Button>
              </div>
            </Card>

            {detail.ratings.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No ratings yet. Be the first to rate this skill.</p>
            ) : (
              detail.ratings.map(r => (
                <Card key={r.id} className="p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <StarRating rating={r.rating} />
                    <span className="text-[10px] text-muted-foreground">{r.userId}</span>
                    <span className="text-[10px] text-muted-foreground ml-auto">{timeAgo(r.createdAt)}</span>
                  </div>
                  {r.review && <p className="text-xs text-muted-foreground">{r.review}</p>}
                </Card>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Publish Dialog ─────────────────────────────────────────────────────────
function PublishDialog({ onPublished }: { onPublished: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    authorName: "",
    category: "general",
    tags: "",
    content: "",
    skillType: "instruction",
    language: "",
    triggerKeywords: "",
    license: "MIT",
  });

  const publish = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/marketplace/skills", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/marketplace"] });
      setOpen(false);
      setForm({ name: "", description: "", authorName: "", category: "general", tags: "", content: "", skillType: "instruction", language: "", triggerKeywords: "", license: "MIT" });
      toast({ title: "Skill published to marketplace" });
      onPublished();
    },
    onError: (e: any) => toast({ title: "Publish failed", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1" data-testid="button-publish">
          <Upload className="w-3 h-3" />Publish Skill
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm">Publish to Marketplace</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Skill Name *</label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. API Security Auditor" className="h-8 text-sm" data-testid="input-pub-name" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Author Name *</label>
              <Input value={form.authorName} onChange={e => setForm(f => ({ ...f, authorName: e.target.value }))}
                placeholder="Your name or handle" className="h-8 text-sm" data-testid="input-pub-author" />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Description *</label>
            <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Short description of what this skill does" className="h-8 text-sm" data-testid="input-pub-desc" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Category</label>
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                <SelectTrigger className="h-8 text-sm" data-testid="select-pub-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.filter(c => c.value !== "all").map(c => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Type</label>
              <Select value={form.skillType} onValueChange={v => setForm(f => ({ ...f, skillType: v }))}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="instruction">Instruction (.md)</SelectItem>
                  <SelectItem value="script">Script</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">License</label>
              <Select value={form.license} onValueChange={v => setForm(f => ({ ...f, license: v }))}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MIT">MIT</SelectItem>
                  <SelectItem value="Apache-2.0">Apache 2.0</SelectItem>
                  <SelectItem value="GPL-3.0">GPL 3.0</SelectItem>
                  <SelectItem value="BSD-3-Clause">BSD 3-Clause</SelectItem>
                  <SelectItem value="Unlicense">Unlicense</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Tags (comma-separated)</label>
              <Input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
                placeholder="api, security, audit" className="h-8 text-sm" data-testid="input-pub-tags" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Trigger Keywords (comma-separated)</label>
              <Input value={form.triggerKeywords} onChange={e => setForm(f => ({ ...f, triggerKeywords: e.target.value }))}
                placeholder="audit, security, owasp" className="h-8 text-sm" />
            </div>
          </div>
          {form.skillType === "script" && (
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Language</label>
              <Select value={form.language} onValueChange={v => setForm(f => ({ ...f, language: v }))}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Select language" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bash">Bash</SelectItem>
                  <SelectItem value="python">Python</SelectItem>
                  <SelectItem value="javascript">JavaScript</SelectItem>
                  <SelectItem value="typescript">TypeScript</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Skill Content *</label>
            <Textarea
              value={form.content}
              onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
              placeholder={"# Skill Name\n\n## When to activate\n...\n\n## Methodology\n..."}
              className="min-h-[200px] font-mono text-xs"
              data-testid="textarea-pub-content"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={() => publish.mutate({
              name: form.name,
              description: form.description,
              authorName: form.authorName,
              category: form.category,
              tags: form.tags.split(",").map(t => t.trim()).filter(Boolean),
              content: form.content,
              skillType: form.skillType,
              language: form.skillType === "script" ? form.language : undefined,
              triggerKeywords: form.triggerKeywords.split(",").map(k => k.trim()).filter(Boolean),
              license: form.license,
            })} disabled={!form.name || !form.description || !form.authorName || !form.content || publish.isPending}
              data-testid="button-confirm-publish"
            >
              {publish.isPending ? "Publishing..." : "Publish"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Tier Distribution Mini-Chart ───────────────────────────────────────────
function TierDistribution({ tierDist }: { tierDist: Record<string, number> }) {
  const total = Object.values(tierDist).reduce((s, n) => s + n, 0);
  if (total === 0) return null;

  return (
    <div className="flex items-center gap-1.5">
      {(["platinum", "gold", "silver", "bronze", "unranked"] as const).map(tier => {
        const count = tierDist[tier] || 0;
        if (count === 0) return null;
        const tc = TIER_CONFIG[tier];
        const TierIcon = tc.icon;
        return (
          <TooltipProvider key={tier}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className={`inline-flex items-center gap-0.5 text-[10px] font-medium ${tc.color}`}>
                  <TierIcon className="w-2.5 h-2.5" />{count}
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {count} {tc.label} tier skill{count !== 1 ? "s" : ""}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      })}
    </div>
  );
}

// ─── Main Marketplace Page ──────────────────────────────────────────────────
export function MarketplacePage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState("quality");
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);

  const { data: skillsData, isLoading } = useQuery<{ skills: MarketplaceSkill[]; total: number }>({
    queryKey: ["/api/marketplace/skills", { q: search, category, sort }],
    queryFn: () => apiRequest("GET", `/api/marketplace/skills?q=${encodeURIComponent(search)}&category=${category}&sort=${sort}&limit=50`),
  });

  const { data: stats } = useQuery<MarketplaceStats>({
    queryKey: ["/api/marketplace/stats"],
  });

  const seedMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/marketplace/seed"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/marketplace"] });
    },
  });

  const rescoreMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/marketplace/scoring/run"),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["/api/marketplace"] });
      toast({ title: "Scoring complete", description: `${data?.scored || 0} skills scored` });
    },
    onError: (e: any) => toast({ title: "Scoring failed", description: e.message, variant: "destructive" }),
  });

  // Auto-seed on first load if empty
  useEffect(() => {
    if (skillsData && skillsData.total === 0 && !seedMutation.isPending) {
      seedMutation.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skillsData?.total]);

  const skills = skillsData?.skills || [];

  if (selectedSkillId) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card/50">
          <Store className="w-4 h-4 text-primary" />
          <h1 className="font-semibold text-sm">Skill Marketplace</h1>
        </div>
        <div className="flex-1 overflow-auto p-4">
          <SkillDetailView skillId={selectedSkillId} onBack={() => setSelectedSkillId(null)} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card/50">
        <Store className="w-4 h-4 text-primary" />
        <h1 className="font-semibold text-sm">Skill Marketplace</h1>
        <div className="flex-1 flex items-center gap-3">
          <p className="text-xs text-muted-foreground">
            {stats ? `${stats.totalSkills} skills \u00b7 ${formatNumber(stats.totalInstalls)} total installs` : "Community skill registry"}
          </p>
          {stats?.tierDistribution && <TierDistribution tierDist={stats.tierDistribution} />}
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="gap-1 h-7 text-xs text-muted-foreground"
          onClick={() => rescoreMutation.mutate()}
          disabled={rescoreMutation.isPending}
          data-testid="button-rescore"
        >
          <RefreshCcw className={`w-3 h-3 ${rescoreMutation.isPending ? "animate-spin" : ""}`} />
          Rescore
        </Button>
        <PublishDialog onPublished={() => qc.invalidateQueries({ queryKey: ["/api/marketplace"] })} />
      </div>

      <div className="flex-1 overflow-auto p-4">
        {/* Stats bar */}
        {stats && stats.totalSkills > 0 && (
          <div className="flex gap-4 mb-4">
            {[
              { icon: Package, label: "Skills", value: stats.totalSkills },
              { icon: Download, label: "Installs", value: formatNumber(stats.totalInstalls) },
              { icon: Award, label: "Platinum", value: stats.tierDistribution?.platinum || 0 },
              { icon: Sparkles, label: "Gold", value: stats.tierDistribution?.gold || 0 },
              { icon: Shield, label: "Verified", value: stats.verified },
            ].map(s => (
              <Card key={s.label} className="flex-1 p-3 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <s.icon className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-lg font-bold leading-none">{s.value}</p>
                  <p className="text-[10px] text-muted-foreground">{s.label}</p>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Search + Filter bar */}
        <div className="flex gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search skills..."
              className="h-8 text-sm pl-8"
              data-testid="input-marketplace-search"
            />
          </div>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-[160px] h-8 text-sm" data-testid="select-category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map(c => (
                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="w-[150px] h-8 text-sm" data-testid="select-sort">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="quality">Quality Score</SelectItem>
              <SelectItem value="popular">Most Popular</SelectItem>
              <SelectItem value="newest">Newest</SelectItem>
              <SelectItem value="rating">Top Rated</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Skill grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent" />
          </div>
        ) : skills.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground border border-dashed border-border rounded-xl">
            <Store className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium mb-1">No skills found</p>
            <p className="text-xs">Try adjusting your search or publish a new skill.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {skills.map(skill => (
              <SkillCard
                key={skill.id}
                skill={skill}
                onClick={() => setSelectedSkillId(skill.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
