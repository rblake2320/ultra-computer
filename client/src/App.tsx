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
import { AuthGate } from "./components/AuthGate";

const ChatPage = lazy(() => import("./pages/ChatPage").then(m => ({ default: m.ChatPage })));
const ModelsPage = lazy(() => import("./pages/ModelsPage").then(m => ({ default: m.ModelsPage })));
const SkillsPage = lazy(() => import("./pages/SkillsPage").then(m => ({ default: m.SkillsPage })));
const ConnectorsPage = lazy(() => import("./pages/ConnectorsPage").then(m => ({ default: m.ConnectorsPage })));
const MemoryPage = lazy(() => import("./pages/MemoryPage").then(m => ({ default: m.MemoryPage })));
const WelcomePage = lazy(() => import("./pages/WelcomePage").then(m => ({ default: m.WelcomePage })));
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

function RouteFallback() {
  return <div className="p-8 text-sm text-muted-foreground">Loading...</div>;
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <Layout>
      <ErrorBoundary>
        <Suspense fallback={<RouteFallback />}>{children}</Suspense>
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
        <AuthGate><Router hook={useHashLocation}>
          <Switch>
            <Route path="/">
              <Suspense fallback={<RouteFallback />}><WelcomePage /></Suspense>
            </Route>
            <Route path="/chat/:id">
              {(params) => (
                <PageShell><ChatPage conversationId={params.id} /></PageShell>
              )}
            </Route>
            <Route path="/models">
              <PageShell><ModelsPage /></PageShell>
            </Route>
            <Route path="/skills">
              <PageShell><SkillsPage /></PageShell>
            </Route>
            <Route path="/connectors">
              <PageShell><ConnectorsPage /></PageShell>
            </Route>
            <Route path="/memory">
              <PageShell><MemoryPage /></PageShell>
            </Route>
            <Route path="/sandbox">
              <PageShell><SandboxPage /></PageShell>
            </Route>
            <Route path="/library">
              <PageShell><SkillLibraryPage /></PageShell>
            </Route>
            <Route path="/settings">
              <PageShell><SettingsPage /></PageShell>
            </Route>
            <Route path="/files">
              <PageShell><FileBrowserPage /></PageShell>
            </Route>
            <Route path="/browser">
              <PageShell><BrowserPage /></PageShell>
            </Route>
            <Route path="/tokens">
              <PageShell><TokenDashboardPage /></PageShell>
            </Route>
            <Route path="/marketplace">
              <PageShell><MarketplacePage /></PageShell>
            </Route>
            <Route path="/autonomy">
              <PageShell><AutonomyPage /></PageShell>
            </Route>
            <Route path="/protocols">
              <PageShell><ProtocolsPage /></PageShell>
            </Route>
            <Route path="/messaging">
              <PageShell><MessagingPage /></PageShell>
            </Route>
            <Route path="/nip">
              <PageShell><NIPPage /></PageShell>
            </Route>
            <Route path="/identity">
              <PageShell><IdentityPage /></PageShell>
            </Route>
            <Route path="/cache">
              <PageShell><CachePage /></PageShell>
            </Route>
            <Route path="/knowledge">
              <PageShell><KnowledgePage /></PageShell>
            </Route>
            <Route path="/swarm">
              <PageShell><SwarmPage /></PageShell>
            </Route>
            <Route component={NotFound} />
          </Switch>
        </Router></AuthGate>
        <Toaster />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
