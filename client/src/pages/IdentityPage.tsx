import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../lib/queryClient";
import {
  blockIdentityRequest,
  unblockIdentityPath,
  verificationApprovalBody,
  verificationRejectionBody,
  type IdentityBlockRecord,
} from "../lib/identityApiContract";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { ScrollArea } from "../components/ui/scroll-area";
import { Separator } from "../components/ui/separator";
import { Skeleton } from "../components/ui/skeleton";
import { Slider } from "../components/ui/slider";
import { useToast } from "../hooks/use-toast";
import {
  Shield, ShieldCheck, ShieldAlert, ShieldX, User, Users, Search,
  Copy, Check, Edit3, Save, X, Lock, Unlock, FileText, BarChart3,
  Clock, RefreshCw, Loader2, Building2, Star, AlertTriangle,
  CheckCircle2, XCircle, Ban, Eye, Fingerprint, Activity,
  ChevronLeft, ChevronRight, Info,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────────

type IdentityTier = "unverified" | "verified" | "premium" | "enterprise" | "admin";
type IdentityStatus = "active" | "suspended" | "banned";
type VerificationMethod = "email" | "domain" | "government_id" | "corporate" | "manual_review";
type VerificationStatus = "pending" | "approved" | "rejected";
type AuditAction =
  | "registered" | "verified" | "blocked" | "unblocked"
  | "suspended" | "banned" | "profile_updated" | "tier_changed"
  | "verification_requested" | "verification_approved" | "verification_rejected";

interface TrustFactor {
  name: string;
  score: number;
  weight: number;
  description: string;
}

interface Identity {
  id: string;
  cryptoId: string;
  fingerprint: string;
  displayName: string;
  tier: IdentityTier;
  status: IdentityStatus;
  trustScore: number;
  trustFactors: TrustFactor[];
  bio?: string;
  organizationName?: string;
  website?: string;
  avatarUrl?: string;
  verifiedAt?: number;
  lastActive?: number;
  createdAt: number;
  communityProfile?: {
    title?: string;
    company?: string;
    skills?: string[];
  };
}

interface VerificationRequest {
  id: string;
  cryptoId: string;
  displayName?: string;
  method: VerificationMethod;
  evidence: string;
  requestedTier: IdentityTier;
  status: VerificationStatus;
  submittedAt: number;
  reviewedAt?: number;
  rejectionReason?: string;
}

interface AuditEntry {
  id: string;
  timestamp: number;
  action: AuditAction;
  details: string;
  performedBy?: string;
  cryptoId?: string;
}

interface IdentityStats {
  total: number;
  verified: number;
  active: number;
  suspended: number;
  banned: number;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function getTierConfig(tier: IdentityTier) {
  switch (tier) {
    case "unverified":  return { label: "Unverified",  className: "bg-slate-700 text-slate-300 border-slate-600",       icon: Shield };
    case "verified":    return { label: "Verified",    className: "bg-blue-900 text-blue-300 border-blue-700",          icon: ShieldCheck };
    case "premium":     return { label: "Premium",     className: "bg-violet-900 text-violet-300 border-violet-700",    icon: Star };
    case "enterprise":  return { label: "Enterprise",  className: "bg-amber-900 text-amber-300 border-amber-700",       icon: Building2 };
    case "admin":       return { label: "Admin",       className: "bg-red-900 text-red-300 border-red-700",             icon: ShieldAlert };
  }
}

function getStatusConfig(status: IdentityStatus) {
  switch (status) {
    case "active":     return { label: "Active",    className: "bg-emerald-900 text-emerald-300 border-emerald-700" };
    case "suspended":  return { label: "Suspended", className: "bg-yellow-900 text-yellow-300 border-yellow-700" };
    case "banned":     return { label: "Banned",    className: "bg-red-900 text-red-300 border-red-700" };
  }
}

function getTrustColor(score: number): string {
  if (score <= 25) return "bg-red-500";
  if (score <= 50) return "bg-orange-500";
  if (score <= 75) return "bg-yellow-500";
  return "bg-emerald-500";
}

function getAuditActionConfig(action: AuditAction) {
  switch (action) {
    case "registered":               return { label: "Registered",            className: "bg-emerald-900 text-emerald-300" };
    case "verified":                 return { label: "Verified",              className: "bg-blue-900 text-blue-300" };
    case "blocked":                  return { label: "Blocked",               className: "bg-red-900 text-red-300" };
    case "unblocked":                return { label: "Unblocked",             className: "bg-slate-700 text-slate-300" };
    case "suspended":                return { label: "Suspended",             className: "bg-orange-900 text-orange-300" };
    case "banned":                   return { label: "Banned",                className: "bg-red-900 text-red-300" };
    case "profile_updated":          return { label: "Profile Updated",       className: "bg-slate-700 text-slate-300" };
    case "tier_changed":             return { label: "Tier Changed",          className: "bg-violet-900 text-violet-300" };
    case "verification_requested":   return { label: "Verification Requested",className: "bg-yellow-900 text-yellow-300" };
    case "verification_approved":    return { label: "Verification Approved", className: "bg-blue-900 text-blue-300" };
    case "verification_rejected":    return { label: "Verification Rejected", className: "bg-red-900 text-red-300" };
    default:                         return { label: action,                  className: "bg-slate-700 text-slate-300" };
  }
}

function truncate(str: string, len: number) {
  if (!str) return "";
  return str.length > len ? str.slice(0, len) + "…" : str;
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleString();
}

function formatRelative(ts: number) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function TierBadge({ tier }: { tier: IdentityTier }) {
  const cfg = getTierConfig(tier);
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-semibold ${cfg.className}`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

function StatusBadge({ status }: { status: IdentityStatus }) {
  const cfg = getStatusConfig(status);
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-semibold ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}

function TrustBar({ score }: { score: number }) {
  const color = getTrustColor(score);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${Math.max(0, Math.min(100, score))}%` }}
        />
      </div>
      <span className="text-xs font-mono text-muted-foreground w-8 text-right">{score}</span>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button
      onClick={handleCopy}
      className="ml-1 p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
      title="Copy"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

// ─── Tab 1: My Identity ────────────────────────────────────────────────────────

function MyIdentityTab({ cryptoId, onRegistered }: { cryptoId: string | null; onRegistered: (id: string) => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Registration form state
  const [regName, setRegName]   = useState("");
  const [regBio, setRegBio]     = useState("");
  const [regOrg, setRegOrg]     = useState("");

  // Profile edit state
  const [editing, setEditing]           = useState(false);
  const [editName, setEditName]         = useState("");
  const [editBio, setEditBio]           = useState("");
  const [editOrg, setEditOrg]           = useState("");
  const [editWebsite, setEditWebsite]   = useState("");
  const [editAvatar, setEditAvatar]     = useState("");

  // Verification form state
  const [verifyOpen, setVerifyOpen]     = useState(false);
  const [verifyMethod, setVerifyMethod] = useState<VerificationMethod>("email");
  const [verifyEvidence, setVerifyEvidence] = useState("");
  const [verifyTier, setVerifyTier]     = useState<IdentityTier>("verified");

  const identityQuery = useQuery<Identity>({
    queryKey: [`/api/identity/${cryptoId}`],
    enabled: !!cryptoId,
  });

  const registerMutation = useMutation({
    mutationFn: (body: { displayName: string; bio?: string; organizationName?: string }) =>
      apiRequest("POST", "/api/identity/register", body),
    onSuccess: (data: Identity) => {
      onRegistered(data.cryptoId);
      toast({ title: "Identity registered", description: `Your cryptographic ID has been created.` });
      queryClient.invalidateQueries({ queryKey: [`/api/identity/${data.cryptoId}`] });
    },
    onError: (e: Error) => toast({ title: "Registration failed", description: e.message, variant: "destructive" }),
  });

  const updateProfileMutation = useMutation({
    mutationFn: (body: { displayName?: string; bio?: string; organizationName?: string; website?: string; avatarUrl?: string }) =>
      apiRequest("PATCH", `/api/identity/${cryptoId}/profile`, body),
    onSuccess: () => {
      toast({ title: "Profile updated" });
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: [`/api/identity/${cryptoId}`] });
    },
    onError: (e: Error) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  const verifyMutation = useMutation({
    mutationFn: (body: { method: VerificationMethod; evidence: string; requestedTier: IdentityTier }) =>
      apiRequest("POST", `/api/identity/${cryptoId}/verify`, body),
    onSuccess: () => {
      toast({ title: "Verification requested", description: "Your request is pending review." });
      setVerifyOpen(false);
      setVerifyEvidence("");
    },
    onError: (e: Error) => toast({ title: "Request failed", description: e.message, variant: "destructive" }),
  });

  const identity = identityQuery.data;

  const startEdit = () => {
    if (!identity) return;
    setEditName(identity.displayName || "");
    setEditBio(identity.bio || "");
    setEditOrg(identity.organizationName || "");
    setEditWebsite(identity.website || "");
    setEditAvatar(identity.avatarUrl || "");
    setEditing(true);
  };

  if (!cryptoId) {
    // Registration form
    return (
      <div className="max-w-lg mx-auto mt-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-900/30 border border-blue-800">
            <Fingerprint className="w-6 h-6 text-blue-400" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">Create Your Identity</h2>
            <p className="text-sm text-muted-foreground">Establish a cryptographically permanent identity on the network</p>
          </div>
        </div>

        <Card className="border-border bg-card">
          <CardContent className="pt-6 space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Display Name <span className="text-red-400">*</span></label>
              <Input
                placeholder="e.g. Alice from Acme"
                value={regName}
                onChange={e => setRegName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Bio</label>
              <Textarea
                placeholder="Tell the network who you are…"
                value={regBio}
                onChange={e => setRegBio(e.target.value)}
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Organization</label>
              <Input
                placeholder="Company or project name"
                value={regOrg}
                onChange={e => setRegOrg(e.target.value)}
              />
            </div>
            <Button
              className="w-full"
              onClick={() => registerMutation.mutate({ displayName: regName, bio: regBio || undefined, organizationName: regOrg || undefined })}
              disabled={!regName.trim() || registerMutation.isPending}
            >
              {registerMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Fingerprint className="w-4 h-4 mr-2" />}
              Register Identity
            </Button>
          </CardContent>
        </Card>

        <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-950/40 border border-blue-900/50 text-sm text-blue-300">
          <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>Your cryptographic ID is generated once and cannot be changed. Your display name is public and always links back to your permanent ID.</span>
        </div>
      </div>
    );
  }

  if (identityQuery.isLoading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (identityQuery.isError) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
        <ShieldX className="w-10 h-10" />
        <p>Failed to load identity. Please try again.</p>
        <Button variant="outline" size="sm" onClick={() => identityQuery.refetch()}>
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Retry
        </Button>
      </div>
    );
  }

  if (!identity) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
        <ShieldX className="w-10 h-10" />
        <p>Could not load identity.</p>
        <Button variant="outline" size="sm" onClick={() => identityQuery.refetch()}>
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Identity Card */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-600 to-violet-700 flex items-center justify-center text-white font-bold text-lg">
                {identity.displayName?.[0]?.toUpperCase() ?? "?"}
              </div>
              <div>
                {editing ? (
                  <Input
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    className="font-semibold text-lg h-8 px-2"
                  />
                ) : (
                  <h2 className="text-xl font-semibold">{identity.displayName}</h2>
                )}
                <div className="flex items-center gap-2 mt-1">
                  <TierBadge tier={identity.tier} />
                  <StatusBadge status={identity.status} />
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              {editing ? (
                <>
                  <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
                    <X className="w-3.5 h-3.5 mr-1" /> Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => updateProfileMutation.mutate({ displayName: editName, bio: editBio, organizationName: editOrg, website: editWebsite, avatarUrl: editAvatar })}
                    disabled={updateProfileMutation.isPending}
                  >
                    {updateProfileMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1" />}
                    Save
                  </Button>
                </>
              ) : (
                <Button size="sm" variant="outline" onClick={startEdit}>
                  <Edit3 className="w-3.5 h-3.5 mr-1" /> Edit Profile
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Crypto ID */}
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Your Permanent ID</p>
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/40 border border-border">
              <Fingerprint className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <code className="font-mono text-sm text-foreground break-all flex-1">{identity.cryptoId}</code>
              <CopyButton text={identity.cryptoId} />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Fingerprint:</span>
              <code className="font-mono text-xs px-2 py-0.5 rounded bg-muted/50 border border-border text-blue-300">
                {identity.fingerprint}
              </code>
              <CopyButton text={identity.fingerprint} />
            </div>
          </div>

          {/* Trust Score */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Trust Score</p>
              <span className={`text-sm font-semibold font-mono ${
                identity.trustScore > 75 ? "text-emerald-400" :
                identity.trustScore > 50 ? "text-yellow-400" :
                identity.trustScore > 25 ? "text-orange-400" : "text-red-400"
              }`}>{identity.trustScore}/100</span>
            </div>
            <TrustBar score={identity.trustScore} />
            {(identity.trustFactors ?? []).length > 0 && (
              <div className="mt-2 rounded-lg border border-border overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/40 border-b border-border">
                      <th className="text-left px-3 py-2 text-muted-foreground font-medium">Factor</th>
                      <th className="text-right px-3 py-2 text-muted-foreground font-medium">Score</th>
                      <th className="text-right px-3 py-2 text-muted-foreground font-medium">Weight</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(identity.trustFactors ?? []).map((f, i) => (
                      <tr key={i} className="border-b border-border/60 last:border-0">
                        <td className="px-3 py-2">
                          <div className="font-medium text-foreground">{f.name}</div>
                          {f.description && <div className="text-muted-foreground">{f.description}</div>}
                        </td>
                        <td className="px-3 py-2 text-right font-mono">{f.score}</td>
                        <td className="px-3 py-2 text-right font-mono text-muted-foreground">{f.weight}x</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <Separator />

          {/* Profile fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Organization</p>
              {editing ? (
                <Input value={editOrg} onChange={e => setEditOrg(e.target.value)} placeholder="Organization name" className="h-8 text-sm" />
              ) : (
                <p className="text-sm">{identity.organizationName || <span className="text-muted-foreground italic">Not set</span>}</p>
              )}
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Website</p>
              {editing ? (
                <Input value={editWebsite} onChange={e => setEditWebsite(e.target.value)} placeholder="https://…" className="h-8 text-sm" />
              ) : (
                identity.website
                  ? <a href={identity.website} target="_blank" rel="noreferrer" className="text-sm text-blue-400 hover:underline">{identity.website}</a>
                  : <span className="text-sm text-muted-foreground italic">Not set</span>
              )}
            </div>
            <div className="space-y-1 col-span-full">
              <p className="text-xs text-muted-foreground">Bio</p>
              {editing ? (
                <Textarea value={editBio} onChange={e => setEditBio(e.target.value)} placeholder="Bio…" rows={3} className="text-sm" />
              ) : (
                <p className="text-sm">{identity.bio || <span className="text-muted-foreground italic">No bio</span>}</p>
              )}
            </div>
            {editing && (
              <div className="space-y-1 col-span-full">
                <p className="text-xs text-muted-foreground">Avatar URL</p>
                <Input value={editAvatar} onChange={e => setEditAvatar(e.target.value)} placeholder="https://…" className="h-8 text-sm" />
              </div>
            )}
          </div>

          {identity.verifiedAt && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />
              Verified {formatDate(identity.verifiedAt)}
            </div>
          )}

          <Separator />

          {/* Request Verification */}
          {!verifyOpen ? (
            <Button variant="outline" size="sm" onClick={() => setVerifyOpen(true)}>
              <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />
              Request Verification
            </Button>
          ) : (
            <div className="space-y-3 p-4 rounded-lg border border-border bg-muted/20">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Request Verification</h3>
                <button onClick={() => setVerifyOpen(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Verification Method</label>
                  <Select value={verifyMethod} onValueChange={v => setVerifyMethod(v as VerificationMethod)}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="email">Email Verification</SelectItem>
                      <SelectItem value="domain">Domain Verification</SelectItem>
                      <SelectItem value="government_id">Government ID</SelectItem>
                      <SelectItem value="corporate">Corporate Verification</SelectItem>
                      <SelectItem value="manual_review">Manual Review</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Evidence</label>
                  <Input
                    placeholder={verifyMethod === "email" ? "your@email.com" : verifyMethod === "domain" ? "yourdomain.com" : "Reference or document ID"}
                    value={verifyEvidence}
                    onChange={e => setVerifyEvidence(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Requested Tier</label>
                  <Select value={verifyTier} onValueChange={v => setVerifyTier(v as IdentityTier)}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="verified">Verified</SelectItem>
                      <SelectItem value="premium">Premium</SelectItem>
                      <SelectItem value="enterprise">Enterprise</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  size="sm"
                  onClick={() => verifyMutation.mutate({ method: verifyMethod, evidence: verifyEvidence, requestedTier: verifyTier })}
                  disabled={!verifyEvidence.trim() || verifyMutation.isPending}
                >
                  {verifyMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />}
                  Submit Request
                </Button>
              </div>
            </div>
          )}

          <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-950/40 border border-blue-900/50 text-xs text-blue-300">
            <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span>Your cryptographic ID is permanent and cannot be changed. Your display name is visible to others but always links back to your permanent ID.</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Tab 2: Directory ──────────────────────────────────────────────────────────

function DirectoryTab({ myCryptoId }: { myCryptoId: string | null }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch]         = useState("");
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [minTrust, setMinTrust]     = useState<number>(0);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage]             = useState(0);
  const limit = 12;

  const params = new URLSearchParams();
  if (search)                      params.set("q", search);
  if (tierFilter !== "all")        params.set("tier", tierFilter);
  if (minTrust > 0)                params.set("minTrust", String(minTrust));
  if (statusFilter !== "all")      params.set("status", statusFilter);
  params.set("limit", String(limit));
  params.set("offset", String(page * limit));

  const directoryQuery = useQuery<{ identities: Identity[]; total: number }>({
    queryKey: [`/api/identity/search?${params.toString()}`],
  });
  const directoryError = directoryQuery.isError;

  const blockMutation = useMutation({
    mutationFn: ({ targetId, reason }: { targetId: string; reason?: string }) => {
      if (!myCryptoId) throw new Error("Register an identity before blocking another identity.");
      const request = blockIdentityRequest(myCryptoId, targetId, reason);
      return apiRequest("POST", request.path, request.body);
    },
    onSuccess: () => {
      toast({ title: "Identity blocked" });
      queryClient.invalidateQueries({ queryKey: [`/api/identity/${myCryptoId}/blocks`] });
      directoryQuery.refetch();
    },
    onError: (e: Error) => toast({ title: "Block failed", description: e.message, variant: "destructive" }),
  });

  const identities = directoryQuery.data?.identities ?? [];
  const total      = directoryQuery.data?.total ?? 0;
  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-4">
      {/* Search + Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, organization, or skills…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            className="pl-8"
          />
        </div>
        <Select value={tierFilter} onValueChange={v => { setTierFilter(v); setPage(0); }}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Tier" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Tiers</SelectItem>
            <SelectItem value="unverified">Unverified</SelectItem>
            <SelectItem value="verified">Verified</SelectItem>
            <SelectItem value="premium">Premium</SelectItem>
            <SelectItem value="enterprise">Enterprise</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(0); }}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Trust Score filter */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground whitespace-nowrap">Min Trust: {minTrust}</span>
        <div className="w-48">
          <Slider
            value={[minTrust]}
            onValueChange={([v]) => { setMinTrust(v); setPage(0); }}
            min={0} max={100} step={5}
          />
        </div>
        {minTrust > 0 && (
          <button onClick={() => setMinTrust(0)} className="text-xs text-muted-foreground hover:text-foreground">
            Reset
          </button>
        )}
      </div>

      {/* Results count */}
      {!directoryQuery.isLoading && (
        <p className="text-xs text-muted-foreground">
          {total} {total === 1 ? "identity" : "identities"} found
        </p>
      )}

      {/* Grid */}
      {directoryError ? (
        <div className="p-8 text-center text-muted-foreground">Failed to load directory. Please try again.</div>
      ) : directoryQuery.isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-44 w-full rounded-lg" />
          ))}
        </div>
      ) : identities.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
          <Users className="w-10 h-10" />
          <p>No verified identities found.</p>
          <p className="text-xs">Directory only shows verified, premium, enterprise, and admin tier identities.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {identities.map(id => (
            <DirectoryCard
              key={id.cryptoId}
              identity={id}
              canBlock={!!myCryptoId && id.cryptoId !== myCryptoId}
              onBlock={(reason) => blockMutation.mutate({ targetId: id.cryptoId, reason })}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page + 1} of {totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

function DirectoryCard({ identity, canBlock, onBlock }: { identity: Identity; canBlock: boolean; onBlock: (reason?: string) => void }) {
  const [blockReason, setBlockReason] = useState("");
  const [showBlock, setShowBlock]     = useState(false);

  const isVerifiedPlus = identity.tier !== "unverified";

  return (
    <Card className="border-border bg-card hover:border-border/80 transition-colors">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center text-sm font-bold">
              {identity.displayName?.[0]?.toUpperCase() ?? "?"}
            </div>
            <div>
              <p className="font-medium text-sm leading-tight">{identity.displayName}</p>
              <TierBadge tier={identity.tier} />
            </div>
          </div>
          <StatusBadge status={identity.status} />
        </div>

        {/* Fingerprint */}
        <div className="flex items-center gap-1">
          <Fingerprint className="w-3 h-3 text-muted-foreground flex-shrink-0" />
          <code className="font-mono text-xs text-muted-foreground truncate">{identity.fingerprint}</code>
        </div>

        {/* Trust Score */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Trust Score</span>
            <span className="font-mono">{identity.trustScore}</span>
          </div>
          <TrustBar score={identity.trustScore} />
        </div>

        {/* Details — verified+ only */}
        {isVerifiedPlus && (
          <div className="space-y-1 text-xs text-muted-foreground">
            {identity.organizationName && (
              <div className="flex items-center gap-1">
                <Building2 className="w-3 h-3" /> {identity.organizationName}
              </div>
            )}
            {identity.communityProfile?.title && (
              <div className="flex items-center gap-1">
                <User className="w-3 h-3" /> {identity.communityProfile.title}
                {identity.communityProfile.company && ` @ ${identity.communityProfile.company}`}
              </div>
            )}
            {(identity.communityProfile?.skills ?? []).length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {(identity.communityProfile?.skills ?? []).slice(0, 4).map(s => (
                  <span key={s} className="px-1.5 py-0.5 rounded bg-muted/60 border border-border text-xs">{s}</span>
                ))}
              </div>
            )}
          </div>
        )}

        {identity.lastActive && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="w-3 h-3" /> {formatRelative(identity.lastActive)}
          </p>
        )}

        {/* Block controls */}
        {canBlock && (
          <div>
            {!showBlock ? (
              <button
                onClick={() => setShowBlock(true)}
                className="text-xs text-muted-foreground hover:text-red-400 flex items-center gap-1 mt-1"
              >
                <Ban className="w-3 h-3" /> Block
              </button>
            ) : (
              <div className="space-y-2 pt-1">
                <Input
                  placeholder="Reason (optional)"
                  value={blockReason}
                  onChange={e => setBlockReason(e.target.value)}
                  className="h-7 text-xs"
                />
                <div className="flex gap-2">
                  <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => { onBlock(blockReason || undefined); setShowBlock(false); }}>
                    Confirm Block
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowBlock(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Tab 3: Verification ───────────────────────────────────────────────────────

function VerificationTab({ cryptoId }: { cryptoId: string | null }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [rejectId, setRejectId]         = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const verificationQuery = useQuery<{ requests: VerificationRequest[] }>({
    queryKey: ["/api/identity/verifications"],
  });

  const identityQuery = useQuery<Identity>({
    queryKey: [`/api/identity/${cryptoId}`],
    enabled: !!cryptoId,
  });

  const approveMutation = useMutation({
    mutationFn: (requestId: string) => {
      if (!cryptoId) throw new Error("Register an identity before reviewing verification requests.");
      return apiRequest(
        "POST",
        `/api/identity/verifications/${requestId}/approve`,
        verificationApprovalBody(cryptoId),
      );
    },
    onSuccess: () => {
      toast({ title: "Verification approved" });
      queryClient.invalidateQueries({ queryKey: ["/api/identity/verifications"] });
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ requestId, reason }: { requestId: string; reason: string }) =>
      cryptoId
        ? apiRequest(
            "POST",
            `/api/identity/verifications/${requestId}/reject`,
            verificationRejectionBody(cryptoId, reason),
          )
        : Promise.reject(new Error("Register an identity before reviewing verification requests.")),
    onSuccess: () => {
      toast({ title: "Verification rejected" });
      setRejectId(null);
      setRejectReason("");
      queryClient.invalidateQueries({ queryKey: ["/api/identity/verifications"] });
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const identity = identityQuery.data;
  const requests = verificationQuery.data?.requests ?? [];
  const pending  = requests.filter(r => r.status === "pending");

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* My Verification Status */}
      {cryptoId && (
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" /> My Verification Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            {identityQuery.isLoading ? (
              <Skeleton className="h-12 w-full" />
            ) : identity ? (
              <div className="flex items-center gap-4">
                <TierBadge tier={identity.tier} />
                <StatusBadge status={identity.status} />
                {identity.verifiedAt && (
                  <span className="text-sm text-muted-foreground flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />
                    Verified {formatDate(identity.verifiedAt)}
                  </span>
                )}
                {identity.tier === "unverified" && (
                  <span className="text-sm text-muted-foreground">Not yet verified</span>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Register an identity to see verification status.</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Pending Requests for Admin Review */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="w-4 h-4" /> Pending Requests
              {pending.length > 0 && (
                <Badge variant="secondary" className="ml-1">{pending.length}</Badge>
              )}
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => verificationQuery.refetch()}>
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {verificationQuery.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : pending.length === 0 ? (
            <div className="flex flex-col items-center py-10 text-muted-foreground gap-2">
              <CheckCircle2 className="w-8 h-8" />
              <p className="text-sm">No pending verification requests.</p>
            </div>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/40 border-b border-border text-xs text-muted-foreground">
                    <th className="text-left px-4 py-2 font-medium">Requester</th>
                    <th className="text-left px-4 py-2 font-medium">Method</th>
                    <th className="text-left px-4 py-2 font-medium">Requested Tier</th>
                    <th className="text-left px-4 py-2 font-medium">Submitted</th>
                    <th className="text-right px-4 py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pending.map((req) => (
                    <>
                      <tr key={req.id} className="border-b border-border/60 last:border-0">
                        <td className="px-4 py-3">
                          <div className="font-medium">{req.displayName || "Unknown"}</div>
                          <code className="text-xs text-muted-foreground font-mono">{truncate(req.cryptoId, 20)}</code>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs capitalize">{req.method.replace("_", " ")}</span>
                          {req.evidence && <div className="text-xs text-muted-foreground truncate max-w-32">{req.evidence}</div>}
                        </td>
                        <td className="px-4 py-3">
                          <TierBadge tier={req.requestedTier} />
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(req.submittedAt)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              className="h-7 text-xs bg-blue-700 hover:bg-blue-600"
                              onClick={() => approveMutation.mutate(req.id)}
                              disabled={!cryptoId || approveMutation.isPending}
                            >
                              <CheckCircle2 className="w-3 h-3 mr-1" /> Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              className="h-7 text-xs"
                              onClick={() => setRejectId(rejectId === req.id ? null : req.id)}
                            >
                              <XCircle className="w-3 h-3 mr-1" /> Reject
                            </Button>
                          </div>
                        </td>
                      </tr>
                      {rejectId === req.id && (
                        <tr key={`reject-${req.id}`} className="border-b border-border/60 bg-red-950/20">
                          <td colSpan={5} className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <Input
                                placeholder="Rejection reason (required)"
                                value={rejectReason}
                                onChange={e => setRejectReason(e.target.value)}
                                className="h-8 text-sm flex-1"
                              />
                              <Button
                                size="sm"
                                variant="destructive"
                                className="h-8 text-xs"
                                disabled={!cryptoId || !rejectReason.trim() || rejectMutation.isPending}
                                onClick={() => rejectMutation.mutate({ requestId: req.id, reason: rejectReason })}
                              >
                                {rejectMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Confirm Reject"}
                              </Button>
                              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => { setRejectId(null); setRejectReason(""); }}>
                                Cancel
                              </Button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* All Requests History */}
      {requests.filter(r => r.status !== "pending").length > 0 && (
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="w-4 h-4" /> Request History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-64">
              <div className="space-y-2">
                {requests.filter(r => r.status !== "pending").map(req => (
                  <div key={req.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/20 text-sm">
                    <div>
                      <div className="font-medium">{req.displayName || truncate(req.cryptoId, 24)}</div>
                      <div className="text-xs text-muted-foreground capitalize">{req.method.replace("_", " ")} → <TierBadge tier={req.requestedTier} /></div>
                    </div>
                    <div className="text-right">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                        req.status === "approved" ? "bg-blue-900 text-blue-300" : "bg-red-900 text-red-300"
                      }`}>
                        {req.status}
                      </span>
                      {req.reviewedAt && <div className="text-xs text-muted-foreground mt-0.5">{formatDate(req.reviewedAt)}</div>}
                      {req.rejectionReason && <div className="text-xs text-muted-foreground mt-0.5 max-w-48 truncate">{req.rejectionReason}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Tab 4: Block List ─────────────────────────────────────────────────────────

function BlockListTab({ cryptoId }: { cryptoId: string | null }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [blockTarget, setBlockTarget]   = useState("");
  const [blockReason, setBlockReason]   = useState("");

  const blocksQuery = useQuery<IdentityBlockRecord[]>({
    queryKey: [`/api/identity/${cryptoId}/blocks`],
    enabled: !!cryptoId,
  });

  const identityDetailsQuery = useQuery<{ blockedByCount: number }>({
    queryKey: [`/api/identity/${cryptoId}/full`],
    enabled: !!cryptoId,
  });

  if (blocksQuery.isError) {
    return <div className="p-4 text-center text-muted-foreground text-sm">Failed to load block list. Please try again.</div>;
  }

  const blockMutation = useMutation({
    mutationFn: (body: { targetCryptoId: string; reason?: string }) =>
      cryptoId
        ? (() => {
            const request = blockIdentityRequest(cryptoId, body.targetCryptoId, body.reason);
            return apiRequest("POST", request.path, request.body);
          })()
        : Promise.reject(new Error("Register an identity before blocking another identity.")),
    onSuccess: () => {
      toast({ title: "Identity blocked" });
      setBlockTarget("");
      setBlockReason("");
      queryClient.invalidateQueries({ queryKey: [`/api/identity/${cryptoId}/blocks`] });
    },
    onError: (e: Error) => toast({ title: "Block failed", description: e.message, variant: "destructive" }),
  });

  const unblockMutation = useMutation({
    mutationFn: (blockedId: string) =>
      cryptoId
        ? apiRequest("DELETE", unblockIdentityPath(cryptoId, blockedId), undefined)
        : Promise.reject(new Error("Register an identity before unblocking another identity.")),
    onSuccess: () => {
      toast({ title: "Identity unblocked" });
      queryClient.invalidateQueries({ queryKey: [`/api/identity/${cryptoId}/blocks`] });
    },
    onError: (e: Error) => toast({ title: "Unblock failed", description: e.message, variant: "destructive" }),
  });

  if (!cryptoId) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
        <Lock className="w-10 h-10" />
        <p>Register an identity to manage your block list.</p>
      </div>
    );
  }

  const blocks = blocksQuery.data ?? [];
  const blockedByCount = identityDetailsQuery.data?.blockedByCount ?? 0;

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="border-border bg-card">
          <CardContent className="p-4 flex items-center gap-3">
            <Ban className="w-5 h-5 text-red-400" />
            <div>
              <p className="text-2xl font-bold">{blocks.length}</p>
              <p className="text-xs text-muted-foreground">Identities you've blocked</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="p-4 flex items-center gap-3">
            <Eye className="w-5 h-5 text-muted-foreground" />
            <div>
              <p className="text-2xl font-bold">{blockedByCount}</p>
              <p className="text-xs text-muted-foreground">Others who've blocked you</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Block Someone form */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Ban className="w-4 h-4" /> Block an Identity
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Crypto ID or Fingerprint</label>
            <Input
              placeholder="e.g. UC-abc123… or 16-char fingerprint"
              value={blockTarget}
              onChange={e => setBlockTarget(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Reason (optional)</label>
            <Textarea
              placeholder="Why are you blocking this identity?"
              value={blockReason}
              onChange={e => setBlockReason(e.target.value)}
              rows={2}
            />
          </div>
          <Button
            variant="destructive"
            onClick={() => blockMutation.mutate({ targetCryptoId: blockTarget, reason: blockReason || undefined })}
            disabled={!blockTarget.trim() || blockMutation.isPending}
          >
            {blockMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Ban className="w-4 h-4 mr-2" />}
            Block Identity
          </Button>
        </CardContent>
      </Card>

      {/* Blocked list */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Lock className="w-4 h-4" /> Blocked Identities
              {blocks.length > 0 && <Badge variant="secondary">{blocks.length}</Badge>}
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => blocksQuery.refetch()}>
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {blocksQuery.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : blocks.length === 0 ? (
            <div className="flex flex-col items-center py-10 text-muted-foreground gap-2">
              <Unlock className="w-8 h-8" />
              <p className="text-sm">No blocked identities.</p>
            </div>
          ) : (
            <ScrollArea className="h-96">
              <div className="space-y-2">
                {blocks.map(block => (
                  <div key={block.id} className="flex items-start justify-between p-3 rounded-lg border border-border bg-muted/20">
                    <div className="space-y-1 flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">Blocked identity</span>
                      </div>
                      <code className="text-xs text-muted-foreground font-mono">{truncate(block.blockedId, 32)}</code>
                      {block.reason && (
                        <p className="text-xs text-muted-foreground">{block.reason}</p>
                      )}
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" /> Blocked {formatDate(block.createdAt)}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="ml-3 h-7 text-xs shrink-0"
                      onClick={() => unblockMutation.mutate(block.blockedId)}
                      disabled={unblockMutation.isPending}
                    >
                      <Unlock className="w-3 h-3 mr-1" /> Unblock
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Tab 5: Audit Log ──────────────────────────────────────────────────────────

function AuditLogTab({ cryptoId }: { cryptoId: string | null }) {
  const [actionFilter, setActionFilter] = useState<string>("all");

  const statsQuery = useQuery<IdentityStats>({
    queryKey: ["/api/identity/stats"],
  });

  const auditParams = new URLSearchParams();
  if (cryptoId)               auditParams.set("cryptoId", cryptoId);
  if (actionFilter !== "all") auditParams.set("action", actionFilter);

  const auditQuery = useQuery<{ entries: AuditEntry[]; total: number }>({
    queryKey: [`/api/identity/audit?${auditParams.toString()}`],
  });

  if (statsQuery.isError) {
    return <div className="p-4 text-center text-muted-foreground text-sm">Failed to load stats. Please try again.</div>;
  }

  if (auditQuery.isError) {
    return <div className="p-4 text-center text-muted-foreground text-sm">Failed to load audit log. Please try again.</div>;
  }

  const stats   = statsQuery.data;
  const entries = auditQuery.data?.entries ?? [];

  return (
    <div className="space-y-6">
      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "Total",     value: stats?.total,     icon: Users,         color: "text-foreground" },
          { label: "Verified",  value: stats?.verified,  icon: ShieldCheck,   color: "text-blue-400" },
          { label: "Active",    value: stats?.active,    icon: Activity,      color: "text-emerald-400" },
          { label: "Suspended", value: stats?.suspended, icon: AlertTriangle, color: "text-yellow-400" },
          { label: "Banned",    value: stats?.banned,    icon: Ban,           color: "text-red-400" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="border-border bg-card">
            <CardContent className="p-3 flex items-center gap-2">
              <Icon className={`w-4 h-4 flex-shrink-0 ${color}`} />
              <div>
                {statsQuery.isLoading ? (
                  <Skeleton className="h-5 w-10" />
                ) : (
                  <p className={`text-lg font-bold ${color}`}>{value ?? "—"}</p>
                )}
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">Filter by action:</span>
        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Actions</SelectItem>
            <SelectItem value="registered">Registered</SelectItem>
            <SelectItem value="verified">Verified</SelectItem>
            <SelectItem value="blocked">Blocked</SelectItem>
            <SelectItem value="unblocked">Unblocked</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
            <SelectItem value="banned">Banned</SelectItem>
            <SelectItem value="profile_updated">Profile Updated</SelectItem>
            <SelectItem value="tier_changed">Tier Changed</SelectItem>
            <SelectItem value="verification_requested">Verification Requested</SelectItem>
            <SelectItem value="verification_approved">Verification Approved</SelectItem>
            <SelectItem value="verification_rejected">Verification Rejected</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="ghost" size="sm" onClick={() => auditQuery.refetch()}>
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Log Table */}
      <Card className="border-border bg-card">
        <CardContent className="p-0">
          {auditQuery.isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-muted-foreground gap-2">
              <FileText className="w-10 h-10" />
              <p className="text-sm">No audit entries found.</p>
            </div>
          ) : (
            <ScrollArea className="h-[500px]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card border-b border-border z-10">
                  <tr className="text-xs text-muted-foreground">
                    <th className="text-left px-4 py-3 font-medium">Timestamp</th>
                    <th className="text-left px-4 py-3 font-medium">Action</th>
                    <th className="text-left px-4 py-3 font-medium">Details</th>
                    <th className="text-left px-4 py-3 font-medium">Performed By</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map(entry => {
                    const cfg = getAuditActionConfig(entry.action);
                    return (
                      <tr key={entry.id} className="border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          <div>{new Date(entry.timestamp).toLocaleDateString()}</div>
                          <div>{new Date(entry.timestamp).toLocaleTimeString()}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${cfg.className}`}>
                            {cfg.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm max-w-xs truncate text-muted-foreground">{entry.details}</td>
                        <td className="px-4 py-3">
                          {entry.performedBy ? (
                            <code className="font-mono text-xs text-muted-foreground">{truncate(entry.performedBy, 20)}</code>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">System</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export function IdentityPage() {
  const [cryptoId, setCryptoId] = useState<string | null>(() => {
    const stored = localStorage.getItem("uc_identity_cryptoId");
    // Guard against a stale "undefined" string written by older buggy versions
    return stored && stored !== "undefined" ? stored : null;
  });
  const [activeTab, setActiveTab] = useState("identity");

  const handleRegistered = (id: string) => {
    setCryptoId(id);
    localStorage.setItem("uc_identity_cryptoId", id);
    setActiveTab("identity");
  };

  return (
    <div className="flex flex-col h-full bg-background text-foreground">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-900/30 border border-blue-800">
            <Fingerprint className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Identity System</h1>
            <p className="text-sm text-muted-foreground">Tamper-proof cryptographic identity for the Ultra Computer network</p>
          </div>
          {cryptoId && (
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-muted-foreground hidden sm:block">Your ID:</span>
              <code className="font-mono text-xs px-2 py-1 rounded bg-muted/50 border border-border max-w-48 truncate hidden sm:block">
                {cryptoId}
              </code>
              <CopyButton text={cryptoId} />
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex-1 overflow-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
          <div className="flex-shrink-0 border-b border-border px-6">
            <TabsList className="h-10 bg-transparent gap-1 p-0">
              {[
                { value: "identity",     label: "My Identity",   icon: User },
                { value: "directory",    label: "Directory",     icon: Users },
                { value: "verification", label: "Verification",  icon: ShieldCheck },
                { value: "blocks",       label: "Block List",    icon: Ban },
                { value: "audit",        label: "Audit Log",     icon: BarChart3 },
              ].map(({ value, label, icon: Icon }) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  className="h-10 px-3 text-sm gap-1.5 data-[state=active]:border-b-2 data-[state=active]:border-blue-500 data-[state=active]:bg-transparent rounded-none"
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{label}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <div className="flex-1 overflow-auto">
            <TabsContent value="identity" className="mt-0 p-6 h-full">
              <MyIdentityTab
                cryptoId={cryptoId}
                onRegistered={handleRegistered}
              />
            </TabsContent>

            <TabsContent value="directory" className="mt-0 p-6 h-full">
              <DirectoryTab myCryptoId={cryptoId} />
            </TabsContent>

            <TabsContent value="verification" className="mt-0 p-6 h-full">
              <VerificationTab cryptoId={cryptoId} />
            </TabsContent>

            <TabsContent value="blocks" className="mt-0 p-6 h-full">
              <BlockListTab cryptoId={cryptoId} />
            </TabsContent>

            <TabsContent value="audit" className="mt-0 p-6 h-full">
              <AuditLogTab cryptoId={cryptoId} />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}
