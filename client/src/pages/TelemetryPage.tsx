import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Shield, Eye, EyeOff, Database, Download, Trash2, Clock,
  BarChart3, Lock, Unlock, AlertTriangle, CheckCircle2,
  Activity, TrendingUp, Users, Zap,
} from "lucide-react";

export default function TelemetryPage() {
  const { toast } = useToast();

  const { data: settings, isLoading: settingsLoading } = useQuery<any>({
    queryKey: ["/api/telemetry/settings"],
  });

  const { data: platformSummary } = useQuery<any>({
    queryKey: ["/api/telemetry/platform-summary"],
  });

  const { data: aggregates } = useQuery<any[]>({
    queryKey: ["/api/telemetry/aggregates"],
    queryFn: () => apiRequest("GET", "/api/telemetry/aggregates?period=hourly&limit=24").then(r => r.json()),
  });

  const updateSettings = useMutation({
    mutationFn: (updates: Record<string, any>) =>
      apiRequest("PATCH", "/api/telemetry/settings", updates).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/telemetry/settings"] });
      toast({ title: "Privacy settings updated" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to update settings", description: err.message, variant: "destructive" });
    },
  });

  const purgeData = useMutation({
    mutationFn: () => apiRequest("POST", "/api/telemetry/purge").then(r => r.json()),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/telemetry"] });
      toast({ title: "Data purged", description: `${data.entriesPurged} entries removed. Aggregates retained.` });
    },
  });

  const enforceRetention = useMutation({
    mutationFn: () => apiRequest("POST", "/api/telemetry/enforce-retention").then(r => r.json()),
    onSuccess: (data) => {
      toast({ title: "Retention enforced", description: `${data.purgedCount} old entries purged.` });
    },
  });

  const [showPurgeConfirm, setShowPurgeConfirm] = useState(false);

  if (settingsLoading) return <div className="p-6 text-muted-foreground">Loading privacy settings...</div>;

  const consentLevel = settings?.consentLevel || "full";
  const tier = settings?.tier || "free";
  const isPaid = tier === "pro" || tier === "enterprise";

  const consentDescriptions: Record<string, { label: string; description: string; icon: any; color: string }> = {
    full: { label: "Full Telemetry", description: "All execution data logged with full detail. Best for platform learning.", icon: Eye, color: "text-green-400" },
    anonymized: { label: "Anonymized", description: "Data logged but PII stripped. Task descriptions hashed, no conversation content.", icon: Shield, color: "text-blue-400" },
    aggregate: { label: "Aggregate Only", description: "Only numeric stats collected (counts, durations, rates). No text logged at all.", icon: BarChart3, color: "text-yellow-400" },
    none: { label: "Fully Opted Out", description: "Zero data collection. No execution logging. Disables self-learning features.", icon: EyeOff, color: "text-red-400" },
  };

  const currentConsent = consentDescriptions[consentLevel] || consentDescriptions.full;
  const ConsentIcon = currentConsent.icon;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6" data-testid="telemetry-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            Privacy & Telemetry
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Control what data is collected, how it's used, and your rights over it.
          </p>
        </div>
        <Badge variant={isPaid ? "default" : "secondary"} className="text-xs">
          {tier.toUpperCase()} TIER
        </Badge>
      </div>

      {/* Current Consent Level */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ConsentIcon className={`w-4 h-4 ${currentConsent.color}`} />
            Data Collection Level
          </CardTitle>
          <CardDescription>{currentConsent.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Select
              value={consentLevel}
              onValueChange={(val) => updateSettings.mutate({ consentLevel: val })}
            >
              <SelectTrigger className="w-full" data-testid="consent-level-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="full">
                  <div className="flex items-center gap-2">
                    <Eye className="w-3.5 h-3.5 text-green-400" />
                    Full Telemetry
                  </div>
                </SelectItem>
                <SelectItem value="anonymized">
                  <div className="flex items-center gap-2">
                    <Shield className="w-3.5 h-3.5 text-blue-400" />
                    Anonymized
                  </div>
                </SelectItem>
                {isPaid ? (
                  <>
                    <SelectItem value="aggregate">
                      <div className="flex items-center gap-2">
                        <BarChart3 className="w-3.5 h-3.5 text-yellow-400" />
                        Aggregate Only
                      </div>
                    </SelectItem>
                    <SelectItem value="none">
                      <div className="flex items-center gap-2">
                        <EyeOff className="w-3.5 h-3.5 text-red-400" />
                        Fully Opted Out
                      </div>
                    </SelectItem>
                  </>
                ) : (
                  <SelectItem value="upgrade-hint" disabled>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Lock className="w-3.5 h-3.5" />
                      Upgrade to Pro for full opt-out
                    </div>
                  </SelectItem>
                )}
              </SelectContent>
            </Select>

            {!isPaid && consentLevel !== "none" && (
              <div className="flex items-start gap-2 p-3 rounded-md bg-muted/50 text-xs text-muted-foreground">
                <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>
                  Free tier users share anonymized data to help improve the platform.
                  Upgrade to <strong>Pro</strong> for full opt-out, aggregate-only mode, and custom retention.
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Granular Controls */}
      {consentLevel !== "none" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Granular Controls</CardTitle>
            <CardDescription>Fine-tune exactly what data is collected</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { key: "logTaskDescriptions", label: "Task Descriptions", desc: "Log what tasks are being run (text content)", icon: Database },
              { key: "logModelUsage", label: "Model Usage", desc: "Track which AI models are used and their performance", icon: Activity },
              { key: "logToolCalls", label: "Tool Calls", desc: "Log tool/skill invocations and their results", icon: Zap },
              { key: "logTokenCounts", label: "Token Counts", desc: "Track input/output token usage for cost analysis", icon: TrendingUp },
              { key: "logErrorDetails", label: "Error Details", desc: "Log error types and messages for debugging", icon: AlertTriangle },
              { key: "logUserFeedback", label: "User Feedback", desc: "Store your ratings and corrections for learning", icon: Users },
            ].map(({ key, label, desc, icon: Icon }) => (
              <div key={key} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Icon className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                </div>
                <Switch
                  checked={settings?.[key] ?? true}
                  onCheckedChange={(checked) => updateSettings.mutate({ [key]: checked })}
                  data-testid={`toggle-${key}`}
                />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Data Retention & Sharing */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Data Retention
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Select
              value={String(settings?.retentionDays || 90)}
              onValueChange={(val) => updateSettings.mutate({ retentionDays: parseInt(val) })}
            >
              <SelectTrigger data-testid="retention-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 days</SelectItem>
                <SelectItem value="30">30 days</SelectItem>
                <SelectItem value="90">90 days (default)</SelectItem>
                <SelectItem value="180">180 days</SelectItem>
                <SelectItem value="365">1 year</SelectItem>
                <SelectItem value="0">Forever</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Execution logs older than this are automatically purged.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => enforceRetention.mutate()}
              disabled={enforceRetention.isPending}
              data-testid="btn-enforce-retention"
            >
              <Clock className="w-3.5 h-3.5 mr-1.5" />
              Enforce Now
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4" />
              Platform Learning
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Share anonymized data</p>
                <p className="text-xs text-muted-foreground">
                  Help improve the platform for everyone
                </p>
              </div>
              <Switch
                checked={settings?.shareAnonymizedForPlatformLearning ?? true}
                onCheckedChange={(checked) =>
                  updateSettings.mutate({ shareAnonymizedForPlatformLearning: checked })
                }
                data-testid="toggle-share-anonymized"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Shared data is aggregated and contains no personally identifiable information.
              Only counts, rates, and distributions are shared — never conversation content.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Your Data Rights */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Lock className="w-4 h-4" />
            Your Data Rights
          </CardTitle>
          <CardDescription>Export or delete your data at any time</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              onClick={() => {
                window.open("/api/telemetry/export", "_blank");
              }}
              data-testid="btn-export"
            >
              <Download className="w-4 h-4 mr-2" />
              Export All My Data
            </Button>

            {!showPurgeConfirm ? (
              <Button
                variant="outline"
                className="text-red-500 hover:text-red-400 border-red-500/30 hover:border-red-500/50"
                onClick={() => setShowPurgeConfirm(true)}
                data-testid="btn-purge-start"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete All My Data
              </Button>
            ) : (
              <div className="flex items-center gap-2 p-3 rounded-md border border-red-500/30 bg-red-500/10">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                <span className="text-xs text-red-300">This will permanently delete all your execution logs.</span>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    purgeData.mutate();
                    setShowPurgeConfirm(false);
                  }}
                  disabled={purgeData.isPending}
                  data-testid="btn-purge-confirm"
                >
                  Confirm Delete
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowPurgeConfirm(false)}
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Exporting downloads a JSON file with all your execution history, settings, and aggregated analytics.
            Deleting removes all individual execution logs but retains anonymized aggregate data used for platform improvement.
          </p>
        </CardContent>
      </Card>

      {/* Platform Learning Summary */}
      {platformSummary && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Platform Learning Summary
            </CardTitle>
            <CardDescription>
              Anonymized insights from aggregate data — no individual user data is exposed
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Data Points", value: platformSummary.totalDataPoints, icon: Database },
                { label: "Success Rate", value: `${(platformSummary.overallSuccessRate * 100).toFixed(1)}%`, icon: CheckCircle2 },
                { label: "Retry Rate", value: `${(platformSummary.retryRate * 100).toFixed(1)}%`, icon: Activity },
                { label: "Satisfaction", value: platformSummary.userSatisfaction?.score ? `${(platformSummary.userSatisfaction.score * 100).toFixed(0)}%` : "N/A", icon: Users },
              ].map(({ label, value, icon: Icon }) => (
                <div key={label} className="text-center p-3 rounded-lg bg-muted/30">
                  <Icon className="w-4 h-4 mx-auto mb-1 text-muted-foreground" />
                  <p className="text-lg font-semibold">{value}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>

            {platformSummary.topTaskTypes?.length > 0 && (
              <div className="mt-4">
                <p className="text-xs text-muted-foreground mb-2">Task Distribution</p>
                <div className="flex flex-wrap gap-1.5">
                  {platformSummary.topTaskTypes.map((t: any) => (
                    <Badge key={t.type} variant="secondary" className="text-xs">
                      {t.type}: {t.count}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {platformSummary.tokenEconomy && (
              <div className="mt-3 text-xs text-muted-foreground">
                Token Economy: {platformSummary.tokenEconomy.totalInput.toLocaleString()} input / {platformSummary.tokenEconomy.totalOutput.toLocaleString()} output
                (ratio: {platformSummary.tokenEconomy.ratio.toFixed(2)})
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
