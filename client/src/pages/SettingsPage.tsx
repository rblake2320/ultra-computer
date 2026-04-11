import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useTheme } from "@/components/ThemeProvider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Sun, Moon, Settings, Sliders, Monitor } from "lucide-react";
import type { Model } from "../../../shared/schema";

export function SettingsPage() {
  const { theme, toggle } = useTheme();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: settings = {}, isLoading: settingsLoading, isError: settingsError } = useQuery<Record<string, string>>({
    queryKey: ["/api/settings"],
  });

  const { data: models = [], isLoading: modelsLoading, isError: modelsError } = useQuery<Model[]>({
    queryKey: ["/api/models"],
  });

  const [systemName, setSystemName] = useState("");
  const [defaultModelId, setDefaultModelId] = useState("");
  const [sandboxAutoEnable, setSandboxAutoEnable] = useState(false);
  const [maxToolIterations, setMaxToolIterations] = useState(10);

  // Sync local state from loaded settings
  useEffect(() => {
    if (settings.system_name !== undefined) setSystemName(settings.system_name);
    if (settings.default_model_id !== undefined) setDefaultModelId(settings.default_model_id);
    if (settings.sandbox_auto_enable !== undefined)
      setSandboxAutoEnable(settings.sandbox_auto_enable === "true");
    if (settings.max_tool_iterations !== undefined)
      setMaxToolIterations(Number(settings.max_tool_iterations) || 10);
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: (patch: Record<string, string>) =>
      apiRequest("POST", "/api/settings", patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ title: "Settings saved" });
    },
    onError: () => {
      toast({ title: "Failed to save settings", variant: "destructive" });
    },
  });

  const handleSaveGeneral = () => {
    if (!systemName.trim()) {
      toast({ title: "System name cannot be empty", variant: "destructive" });
      return;
    }
    saveMutation.mutate({
      system_name: systemName,
      ...(defaultModelId ? { default_model_id: defaultModelId } : {}),
    });
  };

  const handleSaveSystem = () => {
    saveMutation.mutate({
      sandbox_auto_enable: sandboxAutoEnable ? "true" : "false",
      max_tool_iterations: String(maxToolIterations),
    });
  };

  const handleThemeToggle = () => {
    toggle();
  };

  if (settingsLoading || modelsLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Loading settings...
      </div>
    );
  }

  if (settingsError) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Failed to load settings. Please try again.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-auto bg-background">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border shrink-0">
        <Settings className="w-5 h-5 text-muted-foreground" />
        <h1 className="text-lg font-semibold text-foreground">Settings</h1>
      </div>

      <div className="flex-1 px-6 py-6 space-y-6 max-w-2xl">
        {/* General */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Monitor className="w-4 h-4 text-muted-foreground" />
              <CardTitle className="text-base">General</CardTitle>
            </div>
            <CardDescription>Basic system configuration</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="system-name">System name</Label>
              <Input
                id="system-name"
                data-testid="input-system-name"
                value={systemName}
                onChange={(e) => setSystemName(e.target.value)}
                placeholder="Ultra Computer"
              />
              <p className="text-xs text-muted-foreground">
                Display name shown in the sidebar and page titles.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="default-model">Default model</Label>
              <Select
                value={defaultModelId}
                onValueChange={setDefaultModelId}
              >
                <SelectTrigger
                  id="default-model"
                  data-testid="select-default-model"
                >
                  <SelectValue placeholder="Select a model…" />
                </SelectTrigger>
                <SelectContent>
                  {models.map((model) => (
                    <SelectItem
                      key={model.id}
                      value={model.id}
                      data-testid={`model-option-${model.id}`}
                    >
                      {model.name}
                    </SelectItem>
                  ))}
                  {models.length === 0 && (
                    <SelectItem value="_none" disabled>
                      No models configured
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Used when no model is explicitly selected for a session.
              </p>
            </div>

            <Button
              size="sm"
              onClick={handleSaveGeneral}
              disabled={saveMutation.isPending}
              data-testid="button-save-general"
            >
              Save general settings
            </Button>
          </CardContent>
        </Card>

        {/* Appearance */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              {theme === "dark" ? (
                <Moon className="w-4 h-4 text-muted-foreground" />
              ) : (
                <Sun className="w-4 h-4 text-muted-foreground" />
              )}
              <CardTitle className="text-base">Appearance</CardTitle>
            </div>
            <CardDescription>Visual preferences saved to your profile</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Theme</Label>
                <p className="text-xs text-muted-foreground">
                  Currently: <span className="font-medium">{theme === "dark" ? "Dark" : "Light"}</span>
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Sun className="w-4 h-4 text-muted-foreground" />
                <Switch
                  checked={theme === "dark"}
                  onCheckedChange={handleThemeToggle}
                  data-testid="switch-theme"
                  aria-label="Toggle dark mode"
                />
                <Moon className="w-4 h-4 text-muted-foreground" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* System */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-muted-foreground" />
              <CardTitle className="text-base">System</CardTitle>
            </div>
            <CardDescription>Agent behaviour and execution limits</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Sandbox auto-enable</Label>
                <p className="text-xs text-muted-foreground">
                  Automatically enable the Docker sandbox for new sessions.
                </p>
              </div>
              <Switch
                checked={sandboxAutoEnable}
                onCheckedChange={setSandboxAutoEnable}
                data-testid="switch-sandbox-auto-enable"
                aria-label="Toggle sandbox auto-enable"
              />
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Max tool iterations</Label>
                <span
                  className="text-sm font-medium tabular-nums text-foreground"
                  data-testid="text-max-tool-iterations"
                >
                  {maxToolIterations}
                </span>
              </div>
              <Slider
                min={1}
                max={20}
                step={1}
                value={[maxToolIterations]}
                onValueChange={([v]) => setMaxToolIterations(v)}
                data-testid="slider-max-tool-iterations"
                aria-label="Max tool iterations"
              />
              <p className="text-xs text-muted-foreground">
                Maximum number of tool calls the agent can make per turn (1–20).
              </p>
            </div>

            <Button
              size="sm"
              onClick={handleSaveSystem}
              disabled={saveMutation.isPending}
              data-testid="button-save-system"
            >
              Save system settings
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
