import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Mic, Volume2, Settings, BarChart3, Play, Square,
  Upload, Globe, Zap, Clock, CheckCircle2,
  Languages, User, AudioLines, Podcast, Activity,
  Server, Wifi, WifiOff, RefreshCw, Shield, Cpu,
  ArrowRight, AlertTriangle,
} from "lucide-react";

export default function VoicePage() {
  const { toast } = useToast();
  const [ttsText, setTtsText] = useState("Hello from Ultra Computer. The voice engine is fully operational.");
  const [selectedVoice, setSelectedVoice] = useState("");
  const [selectedLanguage, setSelectedLanguage] = useState("en-US");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [nimEndpointInput, setNimEndpointInput] = useState("");
  const [asrFunctionIdInput, setAsrFunctionIdInput] = useState("");
  const [ttsFunctionIdInput, setTtsFunctionIdInput] = useState("");

  // ─── Queries ──────────────────────────────────────────────────────────────

  const { data: health } = useQuery<any>({
    queryKey: ["/api/voice/health"],
  });

  const { data: nimHealth, refetch: refetchNimHealth } = useQuery<any>({
    queryKey: ["/api/voice/nim/health"],
    refetchInterval: 30000,
  });

  const { data: capabilities } = useQuery<any>({
    queryKey: ["/api/voice/capabilities"],
  });

  const { data: voices } = useQuery<any[]>({
    queryKey: ["/api/voice/voices"],
  });

  const { data: languages } = useQuery<any[]>({
    queryKey: ["/api/voice/languages"],
  });

  const { data: config } = useQuery<any>({
    queryKey: ["/api/voice/config"],
  });

  const { data: stats } = useQuery<any>({
    queryKey: ["/api/voice/stats"],
    refetchInterval: 10000,
  });

  // ─── Mutations ──────────────────────────────────────────────────────────────

  const synthesize = useMutation({
    mutationFn: async (params: { text: string; voice?: string }) => {
      const res = await apiRequest("POST", "/api/voice/synthesize", {
        text: params.text,
        voice: params.voice || undefined,
        returnBase64: true,
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/voice/stats"] });
      if (data.audio) {
        playBase64Audio(data.audio, data.format || "wav");
        toast({
          title: "Speech synthesized",
          description: `${data.durationMs}ms audio via ${data.provider} (${data.processingTimeMs}ms)`,
        });
      }
    },
    onError: (err: any) => {
      toast({ title: "Synthesis failed", description: err.message, variant: "destructive" });
    },
  });

  const testVoice = useMutation({
    mutationFn: async (params: { text?: string; voice?: string }) => {
      const res = await apiRequest("POST", "/api/voice/test", params);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/voice/stats"] });
      if (data.audio) {
        playBase64Audio(data.audio, "wav");
        toast({ title: "Test complete", description: `Provider: ${data.provider}` });
      }
    },
    onError: (err: any) => {
      toast({ title: "Test failed", description: err.message, variant: "destructive" });
    },
  });

  const transcribe = useMutation({
    mutationFn: async (params: { audio: string; format: string }) => {
      const res = await apiRequest("POST", "/api/voice/transcribe", params);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/voice/stats"] });
      toast({
        title: "Transcription complete",
        description: data.transcript
          ? `"${data.transcript.slice(0, 80)}${data.transcript.length > 80 ? '...' : ''}" (${data.provider})`
          : `No transcript (${data.provider})`,
      });
    },
    onError: (err: any) => {
      toast({ title: "Transcription failed", description: err.message, variant: "destructive" });
    },
  });

  const updateConfig = useMutation({
    mutationFn: (updates: Record<string, any>) =>
      apiRequest("PATCH", "/api/voice/config", updates).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/voice/config"] });
      queryClient.invalidateQueries({ queryKey: ["/api/voice/health"] });
      queryClient.invalidateQueries({ queryKey: ["/api/voice/nim/health"] });
      toast({ title: "Voice config updated" });
    },
    onError: (err: any) => {
      toast({ title: "Config update failed", description: err.message, variant: "destructive" });
    },
  });

  // ─── Helpers ──────────────────────────────────────────────────────────────

  function playBase64Audio(base64: string, format: string) {
    try {
      const mime = format === "mp3" ? "audio/mpeg" : "audio/wav";
      const bytes = atob(base64);
      const arr = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
      const blob = new Blob([arr], { type: mime });
      const url = URL.createObjectURL(blob);

      if (audioRef.current) {
        audioRef.current.pause();
        URL.revokeObjectURL(audioRef.current.src);
      }

      const audio = new Audio(url);
      audioRef.current = audio;
      setIsPlaying(true);
      audio.onended = () => setIsPlaying(false);
      audio.onerror = () => setIsPlaying(false);
      audio.play().catch(() => setIsPlaying(false));
    } catch (e) {
      console.error("Audio playback error:", e);
      setIsPlaying(false);
    }
  }

  function stopAudio() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split(".").pop()?.toLowerCase() || "wav";
    const validFormats = ["wav", "opus", "flac", "mp3"];
    const format = validFormats.includes(ext) ? ext : "wav";

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      transcribe.mutate({ audio: base64, format });
    };
    reader.readAsDataURL(file);
  }

  const isConfigured = health?.configured;
  const isNimProvider = config?.provider === "nvidia_nim" || config?.provider === "nvidia_cloud";
  const nimReady = nimHealth?.ready === true;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6" data-testid="voice-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Podcast className="w-5 h-5 text-primary" />
            Voice Engine
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Speech-to-text (ASR) and text-to-speech (TTS) with NVIDIA NIM, OpenAI Whisper, or custom providers.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={isConfigured ? "default" : "secondary"} className="text-xs">
            {isConfigured ? "API KEY SET" : "NO API KEY"}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {config?.provider?.replace(/_/g, " ").toUpperCase() || "NVIDIA NIM"}
          </Badge>
        </div>
      </div>

      {/* NIM Status Banner */}
      {isNimProvider && (
        <Card className={`border ${nimReady ? "border-green-500/30 bg-green-500/5" : "border-yellow-500/30 bg-yellow-500/5"}`}>
          <CardContent className="py-3 px-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${nimReady ? "bg-green-500/20" : "bg-yellow-500/20"}`}>
                  <Cpu className={`w-4 h-4 ${nimReady ? "text-green-400" : "text-yellow-400"}`} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">NVIDIA NIM</span>
                    {nimReady ? (
                      <Badge variant="outline" className="text-[10px] text-green-400 border-green-500/30">
                        <Wifi className="w-2.5 h-2.5 mr-1" />READY
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] text-yellow-400 border-yellow-500/30">
                        <WifiOff className="w-2.5 h-2.5 mr-1" />UNREACHABLE
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {nimReady
                      ? `Self-hosted endpoint ready at ${nimHealth?.endpoint}`
                      : `Will fall back to cloud gRPC (grpc.nvcf.nvidia.com:443) or other providers`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => refetchNimHealth()}
                  className="h-7 px-2"
                  data-testid="nim-health-refresh"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
            {/* Provider Chain Indicator */}
            <div className="flex items-center gap-1.5 mt-2.5 text-[10px] text-muted-foreground">
              <span className="font-medium">Provider chain:</span>
              <Badge variant="secondary" className="text-[10px] h-4">NIM HTTP</Badge>
              <ArrowRight className="w-2.5 h-2.5" />
              <Badge variant="secondary" className="text-[10px] h-4">Cloud gRPC</Badge>
              <ArrowRight className="w-2.5 h-2.5" />
              <Badge variant="secondary" className="text-[10px] h-4">OpenAI</Badge>
              <ArrowRight className="w-2.5 h-2.5" />
              <Badge variant="secondary" className="text-[10px] h-4">Fallback</Badge>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="tts" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="tts" className="flex items-center gap-1.5" data-testid="tab-tts">
            <Volume2 className="w-3.5 h-3.5" /> TTS
          </TabsTrigger>
          <TabsTrigger value="asr" className="flex items-center gap-1.5" data-testid="tab-asr">
            <Mic className="w-3.5 h-3.5" /> ASR
          </TabsTrigger>
          <TabsTrigger value="nim" className="flex items-center gap-1.5" data-testid="tab-nim">
            <Cpu className="w-3.5 h-3.5" /> NIM
          </TabsTrigger>
          <TabsTrigger value="config" className="flex items-center gap-1.5" data-testid="tab-config">
            <Settings className="w-3.5 h-3.5" /> Config
          </TabsTrigger>
          <TabsTrigger value="stats" className="flex items-center gap-1.5" data-testid="tab-stats">
            <BarChart3 className="w-3.5 h-3.5" /> Stats
          </TabsTrigger>
        </TabsList>

        {/* ─── TTS Tab ────────────────────────────────────────────────────────── */}
        <TabsContent value="tts" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-blue-400" />
                Text-to-Speech
              </CardTitle>
              <CardDescription>Convert text to natural-sounding speech</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={ttsText}
                onChange={(e) => setTtsText(e.target.value)}
                placeholder="Enter text to synthesize..."
                className="min-h-[100px] resize-none"
                data-testid="tts-input"
              />

              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-[180px]">
                  <Select value={selectedVoice} onValueChange={setSelectedVoice}>
                    <SelectTrigger data-testid="voice-select">
                      <SelectValue placeholder="Select voice..." />
                    </SelectTrigger>
                    <SelectContent>
                      {(voices || []).map((v: any) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.name} ({v.language}) {v.gender ? `· ${v.gender}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={() => synthesize.mutate({ text: ttsText, voice: selectedVoice || undefined })}
                    disabled={!ttsText.trim() || synthesize.isPending}
                    data-testid="synthesize-btn"
                  >
                    {synthesize.isPending ? (
                      <Zap className="w-4 h-4 animate-pulse mr-1.5" />
                    ) : (
                      <Play className="w-4 h-4 mr-1.5" />
                    )}
                    {synthesize.isPending ? "Synthesizing..." : "Synthesize"}
                  </Button>

                  {isPlaying && (
                    <Button variant="outline" onClick={stopAudio} data-testid="stop-btn">
                      <Square className="w-4 h-4 mr-1.5" />
                      Stop
                    </Button>
                  )}
                </div>
              </div>

              <Separator />

              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => testVoice.mutate({})}
                  disabled={testVoice.isPending}
                  data-testid="test-voice-btn"
                >
                  <Zap className="w-3.5 h-3.5 mr-1" />
                  Quick Test
                </Button>
                <span className="text-xs text-muted-foreground">
                  Plays a default test phrase using the active provider chain
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Voice Catalog */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <User className="w-4 h-4 text-purple-400" />
                Voice Catalog
              </CardTitle>
              <CardDescription>{(voices || []).length} voices available</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {(voices || []).map((v: any) => (
                  <div
                    key={v.id}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors
                      ${selectedVoice === v.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                      }`}
                    onClick={() => setSelectedVoice(v.id)}
                    data-testid={`voice-card-${v.id}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{v.name}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {v.language}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {v.description}
                    </p>
                    {v.gender && (
                      <Badge variant="secondary" className="text-[10px] mt-1.5">
                        {v.gender}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── ASR Tab ────────────────────────────────────────────────────────── */}
        <TabsContent value="asr" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Mic className="w-4 h-4 text-green-400" />
                Speech-to-Text
              </CardTitle>
              <CardDescription>Upload audio files for transcription (WAV, OPUS, FLAC, MP3)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
                <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground mb-3">
                  Upload an audio file to transcribe
                </p>
                <Input
                  type="file"
                  accept=".wav,.opus,.flac,.mp3,.ogg"
                  onChange={handleFileUpload}
                  className="max-w-xs mx-auto"
                  data-testid="asr-file-input"
                />
              </div>

              {transcribe.isPending && (
                <div className="flex items-center gap-2 p-3 bg-muted rounded-lg" data-testid="asr-loading">
                  <AudioLines className="w-4 h-4 animate-pulse text-primary" />
                  <span className="text-sm">Transcribing audio...</span>
                </div>
              )}

              {transcribe.data && (
                <div className="p-4 bg-muted/50 rounded-lg space-y-2" data-testid="asr-result">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-400" />
                    <span className="text-sm font-medium">Transcription Result</span>
                    <Badge variant="outline" className="text-[10px] ml-auto">
                      {transcribe.data.provider}
                    </Badge>
                  </div>
                  <p className="text-sm bg-background p-3 rounded border">
                    {transcribe.data.transcript || "(empty — no speech detected)"}
                  </p>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>Confidence: {((transcribe.data.confidence || 0) * 100).toFixed(0)}%</span>
                    <span>Language: {transcribe.data.languageDetected}</span>
                    <span>Time: {transcribe.data.processingTimeMs}ms</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Capabilities */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="w-4 h-4 text-yellow-400" />
                ASR Capabilities
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                {(capabilities?.asr?.features || []).map((f: string) => (
                  <div key={f} className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                    {f.replace(/_/g, " ")}
                  </div>
                ))}
              </div>
              <Separator className="my-3" />
              <div className="text-xs text-muted-foreground">
                Supported formats: {capabilities?.asr?.formats?.join(", ") || "wav, opus, flac, mp3, pcm"}
                {" · "}Max file size: {capabilities?.asr?.maxFileSizeMb || 25}MB
              </div>
            </CardContent>
          </Card>

          {/* Languages */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Languages className="w-4 h-4 text-indigo-400" />
                Supported Languages
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {(languages || []).map((l: any) => (
                  <div key={l.code} className="flex items-center gap-2 text-sm p-2 rounded border">
                    <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                    <span>{l.name}</span>
                    <span className="text-xs text-muted-foreground ml-auto">{l.code}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── NIM Tab ─────────────────────────────────────────────────────── */}
        <TabsContent value="nim" className="space-y-4 mt-4">
          {/* NIM Overview */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Cpu className="w-4 h-4 text-green-400" />
                NVIDIA NIM Integration
              </CardTitle>
              <CardDescription>
                Self-hosted Docker and cloud gRPC connectivity for Riva ASR/TTS
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Connection Status Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Self-Hosted NIM */}
                <div className={`p-4 rounded-lg border ${nimReady ? "border-green-500/30 bg-green-500/5" : "border-border"}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <Server className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Self-Hosted NIM (HTTP)</span>
                  </div>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Status</span>
                      {nimReady ? (
                        <Badge variant="outline" className="text-[10px] text-green-400 border-green-500/30">
                          <Wifi className="w-2.5 h-2.5 mr-1" />Connected
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">
                          <WifiOff className="w-2.5 h-2.5 mr-1" />Not Available
                        </Badge>
                      )}
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Endpoint</span>
                      <span className="font-mono">{config?.nimEndpoint || "http://localhost:9000"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">ASR Path</span>
                      <span className="font-mono">/v1/audio/transcriptions</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">TTS Path</span>
                      <span className="font-mono">/v1/audio/synthesize</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Health</span>
                      <span className="font-mono">/v1/health/ready</span>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full mt-3 h-7 text-xs"
                    onClick={() => refetchNimHealth()}
                    data-testid="nim-http-check"
                  >
                    <RefreshCw className="w-3 h-3 mr-1" /> Check Connection
                  </Button>
                </div>

                {/* Cloud gRPC */}
                <div className="p-4 rounded-lg border">
                  <div className="flex items-center gap-2 mb-2">
                    <Globe className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Cloud gRPC (NVIDIA NVCF)</span>
                  </div>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Status</span>
                      <Badge variant="outline" className="text-[10px]">
                        {isConfigured ? (
                          <><Shield className="w-2.5 h-2.5 mr-1 text-blue-400" />Authenticated</>
                        ) : (
                          <><AlertTriangle className="w-2.5 h-2.5 mr-1 text-yellow-400" />No API Key</>
                        )}
                      </Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Endpoint</span>
                      <span className="font-mono">grpc.nvcf.nvidia.com:443</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">ASR Function</span>
                      <span className="font-mono text-[10px]">{config?.asrFunctionId?.slice(0, 18) || "1598d209..."}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">TTS Function</span>
                      <span className="font-mono text-[10px]">{config?.ttsFunctionId?.slice(0, 18) || "0149dedb..."}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Protocol</span>
                      <span className="font-mono">Riva gRPC + SSL</span>
                    </div>
                  </div>
                </div>
              </div>

              <Separator />

              {/* NIM Configuration */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium">NIM Endpoints & Function IDs</h3>

                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">Self-Hosted NIM Endpoint</label>
                  <div className="flex gap-2">
                    <Input
                      value={nimEndpointInput}
                      onChange={(e) => setNimEndpointInput(e.target.value)}
                      placeholder={config?.nimEndpoint || "http://localhost:9000"}
                      className="font-mono text-xs"
                      data-testid="nim-endpoint-input"
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={!nimEndpointInput.trim()}
                      onClick={() => {
                        updateConfig.mutate({ nimEndpoint: nimEndpointInput.trim() });
                        setNimEndpointInput("");
                      }}
                      data-testid="nim-endpoint-save"
                    >
                      Save
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">ASR Function ID (Parakeet Streaming)</label>
                    <div className="flex gap-2">
                      <Input
                        value={asrFunctionIdInput}
                        onChange={(e) => setAsrFunctionIdInput(e.target.value)}
                        placeholder={config?.asrFunctionId || "1598d209-5e27-4d3c-8079-4751568b1081"}
                        className="font-mono text-xs"
                        data-testid="asr-function-id-input"
                      />
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={!asrFunctionIdInput.trim()}
                        onClick={() => {
                          updateConfig.mutate({ asrFunctionId: asrFunctionIdInput.trim() });
                          setAsrFunctionIdInput("");
                        }}
                      >
                        Save
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">TTS Function ID (FastPitch HiFiGAN)</label>
                    <div className="flex gap-2">
                      <Input
                        value={ttsFunctionIdInput}
                        onChange={(e) => setTtsFunctionIdInput(e.target.value)}
                        placeholder={config?.ttsFunctionId || "0149dedb-2be8-4195-b9a0-e57e0e14f972"}
                        className="font-mono text-xs"
                        data-testid="tts-function-id-input"
                      />
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={!ttsFunctionIdInput.trim()}
                        onClick={() => {
                          updateConfig.mutate({ ttsFunctionId: ttsFunctionIdInput.trim() });
                          setTtsFunctionIdInput("");
                        }}
                      >
                        Save
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              <Separator />

              {/* NIM Docker Instructions */}
              <div className="space-y-2">
                <h3 className="text-sm font-medium flex items-center gap-2">
                  <Server className="w-3.5 h-3.5" />
                  Self-Hosted Docker Setup
                </h3>
                <div className="bg-muted rounded-lg p-3 font-mono text-xs space-y-1.5 overflow-x-auto">
                  <p className="text-muted-foreground"># Pull and run NVIDIA NIM ASR container</p>
                  <p>docker run -d --gpus all \</p>
                  <p className="pl-4">-p 9000:9000 \</p>
                  <p className="pl-4">-e NGC_API_KEY=$NGC_API_KEY \</p>
                  <p className="pl-4">nvcr.io/nim/nvidia/riva-asr:latest</p>
                  <p className="text-muted-foreground mt-2"># Pull and run NVIDIA NIM TTS container</p>
                  <p>docker run -d --gpus all \</p>
                  <p className="pl-4">-p 9001:9000 \</p>
                  <p className="pl-4">-e NGC_API_KEY=$NGC_API_KEY \</p>
                  <p className="pl-4">nvcr.io/nim/nvidia/riva-tts:latest</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  After starting the container, set the NIM Endpoint above and click "Check Connection" to verify.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Model Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Mic className="w-3.5 h-3.5 text-green-400" />
                  ASR Model: Parakeet CTC 1.1B
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 text-xs">
                <div className="flex justify-between"><span className="text-muted-foreground">Architecture</span><span>CTC Streaming</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Parameters</span><span>1.1B</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Languages</span><span>13+ (multilingual)</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Streaming</span><span>Yes (real-time)</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Punctuation</span><span>Automatic</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Word Timestamps</span><span>Supported</span></div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Volume2 className="w-3.5 h-3.5 text-blue-400" />
                  TTS Model: Magpie Multilingual
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 text-xs">
                <div className="flex justify-between"><span className="text-muted-foreground">Architecture</span><span>FastPitch + HiFi-GAN</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Voices</span><span>10+ multilingual</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Languages</span><span>9 (en, es, fr, de, zh, ja, ko, hi, vi)</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Voice Cloning</span><span>Zero-shot (audio prompt)</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Sample Rate</span><span>22050 Hz</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Output</span><span>WAV / PCM</span></div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ─── Config Tab ─────────────────────────────────────────────────────── */}
        <TabsContent value="config" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Settings className="w-4 h-4 text-orange-400" />
                Provider Configuration
              </CardTitle>
              <CardDescription>Configure your voice API provider and credentials</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Provider</label>
                <Select
                  value={config?.provider || "nvidia_nim"}
                  onValueChange={(v) => updateConfig.mutate({ provider: v })}
                >
                  <SelectTrigger data-testid="provider-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nvidia_nim">NVIDIA NIM (Self-Hosted HTTP + Cloud gRPC)</SelectItem>
                    <SelectItem value="nvidia_cloud">NVIDIA Cloud gRPC Only</SelectItem>
                    <SelectItem value="openai_whisper">OpenAI (Whisper / TTS)</SelectItem>
                    <SelectItem value="custom">Custom Endpoint</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">API Key</label>
                <div className="flex gap-2">
                  <Input
                    type="password"
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder={config?.apiKey || "Enter API key..."}
                    data-testid="api-key-input"
                  />
                  <Button
                    variant="secondary"
                    onClick={() => {
                      if (apiKeyInput.trim()) {
                        updateConfig.mutate({ apiKey: apiKeyInput.trim() });
                        setApiKeyInput("");
                      }
                    }}
                    disabled={!apiKeyInput.trim()}
                    data-testid="save-key-btn"
                  >
                    Save
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {config?.provider === "nvidia_nim" || config?.provider === "nvidia_cloud"
                    ? "NGC API key from build.nvidia.com — used for both self-hosted and cloud gRPC"
                    : config?.provider === "openai_whisper"
                    ? "Get your API key from platform.openai.com"
                    : "Enter your custom provider API key"}
                </p>
              </div>

              <Separator />

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Default Language</label>
                  <Select
                    value={config?.defaultLanguage || "en-US"}
                    onValueChange={(v) => updateConfig.mutate({ defaultLanguage: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(languages || []).map((l: any) => (
                        <SelectItem key={l.code} value={l.code}>{l.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Default Voice</label>
                  <Select
                    value={config?.defaultVoice || ""}
                    onValueChange={(v) => updateConfig.mutate({ defaultVoice: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(voices || []).map((v: any) => (
                        <SelectItem key={v.id} value={v.id}>{v.name} ({v.language})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div>
                  <p className="text-sm font-medium">Enable Streaming</p>
                  <p className="text-xs text-muted-foreground">Real-time ASR via WebSocket</p>
                </div>
                <Switch
                  checked={config?.enableStreaming !== false}
                  onCheckedChange={(v) => updateConfig.mutate({ enableStreaming: v })}
                  data-testid="streaming-toggle"
                />
              </div>
            </CardContent>
          </Card>

          {/* Current Config Summary */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Current Configuration</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="text-xs bg-muted p-3 rounded-lg overflow-auto" data-testid="config-display">
                {JSON.stringify(config || {}, null, 2)}
              </pre>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Stats Tab ─────────────────────────────────────────────────────── */}
        <TabsContent value="stats" className="space-y-4 mt-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card>
              <CardContent className="pt-4 pb-3 text-center">
                <Mic className="w-5 h-5 mx-auto text-green-400 mb-1" />
                <p className="text-2xl font-bold">{stats?.totalTranscriptions || 0}</p>
                <p className="text-xs text-muted-foreground">Transcriptions</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3 text-center">
                <Volume2 className="w-5 h-5 mx-auto text-blue-400 mb-1" />
                <p className="text-2xl font-bold">{stats?.totalSyntheses || 0}</p>
                <p className="text-xs text-muted-foreground">Syntheses</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3 text-center">
                <Clock className="w-5 h-5 mx-auto text-yellow-400 mb-1" />
                <p className="text-2xl font-bold">{stats?.avgAsrLatencyMs || 0}ms</p>
                <p className="text-xs text-muted-foreground">Avg ASR Latency</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3 text-center">
                <Clock className="w-5 h-5 mx-auto text-orange-400 mb-1" />
                <p className="text-2xl font-bold">{stats?.avgTtsLatencyMs || 0}ms</p>
                <p className="text-xs text-muted-foreground">Avg TTS Latency</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <Activity className="w-5 h-5 mx-auto text-purple-400 mb-1" />
              <p className="text-2xl font-bold">{(stats?.totalCharactersSynthesized || 0).toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Characters Synthesized</p>
            </CardContent>
          </Card>

          {/* Provider Breakdown */}
          {stats?.providerBreakdown && Object.keys(stats.providerBreakdown).length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Provider Usage</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {Object.entries(stats.providerBreakdown).map(([provider, counts]: [string, any]) => (
                    <div key={provider} className="flex items-center justify-between p-2 rounded border">
                      <span className="text-sm font-medium">{provider}</span>
                      <div className="flex gap-3 text-xs">
                        <Badge variant="outline">ASR: {counts.asr}</Badge>
                        <Badge variant="outline">TTS: {counts.tts}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recent Activity */}
          {(stats?.recentTranscriptions?.length > 0 || stats?.recentSyntheses?.length > 0) && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Recent Activity</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                  {[...(stats?.recentTranscriptions || []), ...(stats?.recentSyntheses || [])]
                    .sort((a: any, b: any) => b.timestamp - a.timestamp)
                    .slice(0, 20)
                    .map((entry: any, i: number) => (
                      <div key={entry.id || i} className="flex items-center gap-2 text-xs p-2 rounded hover:bg-muted">
                        {entry.result?.transcript !== undefined ? (
                          <Mic className="w-3 h-3 text-green-400 shrink-0" />
                        ) : (
                          <Volume2 className="w-3 h-3 text-blue-400 shrink-0" />
                        )}
                        <span className="text-muted-foreground truncate flex-1">
                          {entry.result?.transcript !== undefined
                            ? `ASR: "${entry.result.transcript?.slice(0, 60) || "(empty)"}"`
                            : `TTS: "${entry.request?.text?.slice(0, 60) || "(empty)"}"`}
                        </span>
                        <Badge variant="secondary" className="text-[10px] shrink-0">
                          {entry.result?.provider}
                        </Badge>
                        <span className="text-muted-foreground shrink-0">
                          {entry.result?.processingTimeMs}ms
                        </span>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
