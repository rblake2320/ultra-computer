import { QueryClientProvider } from "@tanstack/react-query";
import { Router, Switch, Route } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "./components/ui/toaster";
import { ThemeProvider } from "./components/ThemeProvider";
import { Layout } from "./components/Layout";
import { ChatPage } from "./pages/ChatPage";
import { ModelsPage } from "./pages/ModelsPage";
import { SkillsPage } from "./pages/SkillsPage";
import { ConnectorsPage } from "./pages/ConnectorsPage";
import { MemoryPage } from "./pages/MemoryPage";
import { WelcomePage } from "./pages/WelcomePage";
import { SandboxPage } from "./pages/SandboxPage";
import { SkillLibraryPage } from "./pages/SkillLibraryPage";
import { SettingsPage } from "./pages/SettingsPage";
import { FileBrowserPage } from "./pages/FileBrowserPage";
import { BrowserPage } from "./pages/BrowserPage";
import { TokenDashboardPage } from "./pages/TokenDashboardPage";
import { MarketplacePage } from "./pages/MarketplacePage";
import { AutonomyPage } from "./pages/AutonomyPage";
import ProtocolsPage from "./pages/ProtocolsPage";
import { MessagingPage } from "./pages/MessagingPage";
import { NIPPage } from "./pages/NIPPage";
import { IdentityPage } from "./pages/IdentityPage";
import { CachePage } from "./pages/CachePage";
import { KnowledgePage } from "./pages/KnowledgePage";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { ErrorBoundary } from "./components/ErrorBoundary";

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
                <Layout>
                  <ErrorBoundary><ChatPage conversationId={params.id} /></ErrorBoundary>
                </Layout>
              )}
            </Route>
            <Route path="/models">
              <Layout><ErrorBoundary><ModelsPage /></ErrorBoundary></Layout>
            </Route>
            <Route path="/skills">
              <Layout><ErrorBoundary><SkillsPage /></ErrorBoundary></Layout>
            </Route>
            <Route path="/connectors">
              <Layout><ErrorBoundary><ConnectorsPage /></ErrorBoundary></Layout>
            </Route>
            <Route path="/memory">
              <Layout><ErrorBoundary><MemoryPage /></ErrorBoundary></Layout>
            </Route>
            <Route path="/sandbox">
              <Layout><ErrorBoundary><SandboxPage /></ErrorBoundary></Layout>
            </Route>
            <Route path="/library">
              <Layout><ErrorBoundary><SkillLibraryPage /></ErrorBoundary></Layout>
            </Route>
            <Route path="/settings">
              <Layout><ErrorBoundary><SettingsPage /></ErrorBoundary></Layout>
            </Route>
            <Route path="/files">
              <Layout><ErrorBoundary><FileBrowserPage /></ErrorBoundary></Layout>
            </Route>
            <Route path="/browser">
              <Layout><ErrorBoundary><BrowserPage /></ErrorBoundary></Layout>
            </Route>
            <Route path="/tokens">
              <Layout><ErrorBoundary><TokenDashboardPage /></ErrorBoundary></Layout>
            </Route>
            <Route path="/marketplace">
              <Layout><ErrorBoundary><MarketplacePage /></ErrorBoundary></Layout>
            </Route>
            <Route path="/autonomy">
              <Layout><ErrorBoundary><AutonomyPage /></ErrorBoundary></Layout>
            </Route>
            <Route path="/protocols">
              <Layout><ErrorBoundary><ProtocolsPage /></ErrorBoundary></Layout>
            </Route>
            <Route path="/messaging">
              <Layout><ErrorBoundary><MessagingPage /></ErrorBoundary></Layout>
            </Route>
            <Route path="/nip">
              <Layout><ErrorBoundary><NIPPage /></ErrorBoundary></Layout>
            </Route>
            <Route path="/identity">
              <Layout><ErrorBoundary><IdentityPage /></ErrorBoundary></Layout>
            </Route>
            <Route path="/cache">
              <Layout><ErrorBoundary><CachePage /></ErrorBoundary></Layout>
            </Route>
            <Route path="/knowledge">
              <Layout><ErrorBoundary><KnowledgePage /></ErrorBoundary></Layout>
            </Route>
            <Route component={NotFound} />
          </Switch>
        </Router>
        <Toaster />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
