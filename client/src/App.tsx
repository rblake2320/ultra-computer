import { lazy, Suspense } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { Router, Switch, Route } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "./components/ui/toaster";
import { ThemeProvider } from "./components/ThemeProvider";
import { Layout } from "./components/Layout";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { ErrorBoundary } from "./components/ErrorBoundary";

// ─── Lazy-loaded pages (code splitting) ─────────────────────────────────────
// Only WelcomePage is eagerly loaded (landing page). All others split into
// separate chunks that load on-demand when the route is first visited.
import { WelcomePage } from "./pages/WelcomePage";

const ChatPage = lazy(() => import("./pages/ChatPage").then(m => ({ default: m.ChatPage })));
const ModelsPage = lazy(() => import("./pages/ModelsPage").then(m => ({ default: m.ModelsPage })));
const SkillsPage = lazy(() => import("./pages/SkillsPage").then(m => ({ default: m.SkillsPage })));
const ConnectorsPage = lazy(() => import("./pages/ConnectorsPage").then(m => ({ default: m.ConnectorsPage })));
const MemoryPage = lazy(() => import("./pages/MemoryPage").then(m => ({ default: m.MemoryPage })));
const SandboxPage = lazy(() => import("./pages/SandboxPage").then(m => ({ default: m.SandboxPage })));
const SkillLibraryPage = lazy(() => import("./pages/SkillLibraryPage").then(m => ({ default: m.SkillLibraryPage })));
const SettingsPage = lazy(() => import("./pages/SettingsPage").then(m => ({ default: m.SettingsPage })));
const FileBrowserPage = lazy(() => import("./pages/FileBrowserPage").then(m => ({ default: m.FileBrowserPage })));
const BrowserPage = lazy(() => import("./pages/BrowserPage").then(m => ({ default: m.BrowserPage })));
const TokenDashboardPage = lazy(() => import("./pages/TokenDashboardPage").then(m => ({ default: m.TokenDashboardPage })));
const MarketplacePage = lazy(() => import("./pages/MarketplacePage").then(m => ({ default: m.MarketplacePage })));
const AutonomyPage = lazy(() => import("./pages/AutonomyPage").then(m => ({ default: m.AutonomyPage })));
const ProtocolsPage = lazy(() => import("./pages/ProtocolsPage"));
const MessagingPage = lazy(() => import("./pages/MessagingPage").then(m => ({ default: m.MessagingPage })));
const NIPPage = lazy(() => import("./pages/NIPPage").then(m => ({ default: m.NIPPage })));
const IdentityPage = lazy(() => import("./pages/IdentityPage").then(m => ({ default: m.IdentityPage })));
const CachePage = lazy(() => import("./pages/CachePage").then(m => ({ default: m.CachePage })));
const KnowledgePage = lazy(() => import("./pages/KnowledgePage").then(m => ({ default: m.KnowledgePage })));
const SwarmPage = lazy(() => import("./pages/SwarmPage").then(m => ({ default: m.SwarmPage })));
const TelemetryPage = lazy(() => import("./pages/TelemetryPage"));
const VoicePage = lazy(() => import("./pages/VoicePage"));

// ─── Loading fallback ────────────────────────────────────────────────────────
function PageLoader() {
  return (
    <div className="flex items-center justify-center h-full min-h-[200px]">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <span className="text-sm">Loading...</span>
      </div>
    </div>
  );
}

// ─── Lazy route wrapper ──────────────────────────────────────────────────────
function LazyPage({ children }: { children: React.ReactNode }) {
  return (
    <Layout>
      <ErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          {children}
        </Suspense>
      </ErrorBoundary>
    </Layout>
  );
}

function NotFound() {
  return (
    <Layout>
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3 p-8">
        <p className="text-lg font-semibold">404 — Page Not Found</p>
        <p className="text-sm">The page you are looking for does not exist.</p>
      </div>
    </Layout>
  );
}

export default function App() {
  useKeyboardShortcuts();
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <Router hook={useHashLocation}>
          <Switch>
            <Route path="/" component={WelcomePage} />
            <Route path="/chat/:id">
              {(params) => (
                <LazyPage><ChatPage conversationId={params.id} /></LazyPage>
              )}
            </Route>
            <Route path="/models"><LazyPage><ModelsPage /></LazyPage></Route>
            <Route path="/skills"><LazyPage><SkillsPage /></LazyPage></Route>
            <Route path="/connectors"><LazyPage><ConnectorsPage /></LazyPage></Route>
            <Route path="/memory"><LazyPage><MemoryPage /></LazyPage></Route>
            <Route path="/sandbox"><LazyPage><SandboxPage /></LazyPage></Route>
            <Route path="/library"><LazyPage><SkillLibraryPage /></LazyPage></Route>
            <Route path="/settings"><LazyPage><SettingsPage /></LazyPage></Route>
            <Route path="/files"><LazyPage><FileBrowserPage /></LazyPage></Route>
            <Route path="/browser"><LazyPage><BrowserPage /></LazyPage></Route>
            <Route path="/tokens"><LazyPage><TokenDashboardPage /></LazyPage></Route>
            <Route path="/marketplace"><LazyPage><MarketplacePage /></LazyPage></Route>
            <Route path="/autonomy"><LazyPage><AutonomyPage /></LazyPage></Route>
            <Route path="/protocols"><LazyPage><ProtocolsPage /></LazyPage></Route>
            <Route path="/messaging"><LazyPage><MessagingPage /></LazyPage></Route>
            <Route path="/nip"><LazyPage><NIPPage /></LazyPage></Route>
            <Route path="/identity"><LazyPage><IdentityPage /></LazyPage></Route>
            <Route path="/cache"><LazyPage><CachePage /></LazyPage></Route>
            <Route path="/knowledge"><LazyPage><KnowledgePage /></LazyPage></Route>
            <Route path="/swarm"><LazyPage><SwarmPage /></LazyPage></Route>
            <Route path="/privacy"><LazyPage><TelemetryPage /></LazyPage></Route>
            <Route path="/voice"><LazyPage><VoicePage /></LazyPage></Route>
            <Route component={NotFound} />
          </Switch>
        </Router>
        <Toaster />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
