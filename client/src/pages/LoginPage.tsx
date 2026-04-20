import { useState, useEffect, FormEvent } from "react";
import { useLocation } from "wouter";
import { useAuth } from "../lib/auth";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Label } from "../components/ui/label";

interface SetupStatus {
  hasUsers: boolean;
  authEnabled: boolean;
}

export function LoginPage() {
  const { login, isAuthenticated, isLoading } = useAuth();
  const [, navigate] = useLocation();

  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);

  // Redirect if already authenticated
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate("/");
    }
  }, [isAuthenticated, isLoading, navigate]);

  // Fetch setup status to determine if registration is allowed
  useEffect(() => {
    fetch("/api/auth/setup-status")
      .then(r => r.json())
      .then((data: SetupStatus) => {
        setSetupStatus(data);
        // If no users exist yet, default to register mode
        if (!data.hasUsers) setMode("register");
      })
      .catch(() => {});
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (mode === "register") {
      if (password !== confirmPassword) {
        setError("Passwords do not match");
        return;
      }
      if (password.length < 8) {
        setError("Password must be at least 8 characters");
        return;
      }
    }

    setSubmitting(true);
    try {
      if (mode === "login") {
        await login(username, password);
        navigate("/");
      } else {
        // Register
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Registration failed");
          return;
        }
        // Auto-login after registration
        await login(username, password);
        navigate("/");
      }
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const isFirstRun = setupStatus && !setupStatus.hasUsers;

  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-4">
      <div className="w-full max-w-sm">
        {/* Logo / branding */}
        <div className="flex flex-col items-center mb-8 gap-2">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-7 h-7 text-primary-foreground"
              aria-hidden="true"
            >
              <rect x="3" y="3" width="18" height="18" rx="3" />
              <path d="M7 12h10M12 7v10" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Ultra Computer</h1>
          {isFirstRun && (
            <p className="text-sm text-muted-foreground text-center">
              Create your admin account to get started
            </p>
          )}
        </div>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">
              {mode === "login" ? "Sign in" : isFirstRun ? "Create account" : "Create account"}
            </CardTitle>
            <CardDescription>
              {mode === "login"
                ? "Enter your credentials to access Ultra Computer"
                : "Choose a username and password for your account"}
            </CardDescription>
          </CardHeader>

          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              {/* Username */}
              <div className="space-y-1.5">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  type="text"
                  autoComplete={mode === "login" ? "username" : "username"}
                  placeholder="Enter username"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  disabled={submitting}
                  required
                  autoFocus
                />
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  placeholder="Enter password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  disabled={submitting}
                  required
                />
              </div>

              {/* Confirm password (register only) */}
              {mode === "register" && (
                <div className="space-y-1.5">
                  <Label htmlFor="confirm-password">Confirm password</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    autoComplete="new-password"
                    placeholder="Repeat password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    disabled={submitting}
                    required
                  />
                </div>
              )}

              {/* Error */}
              {error && (
                <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
                  {error}
                </p>
              )}
            </CardContent>

            <CardFooter className="flex flex-col gap-3 pt-2">
              <Button
                type="submit"
                className="w-full"
                disabled={submitting || !username || !password}
              >
                {submitting
                  ? "Please wait..."
                  : mode === "login"
                  ? "Sign in"
                  : "Create account"}
              </Button>

              {/* Toggle between login / register */}
              {!isFirstRun && setupStatus?.hasUsers && (
                <button
                  type="button"
                  onClick={() => {
                    setMode(m => (m === "login" ? "register" : "login"));
                    setError("");
                    setPassword("");
                    setConfirmPassword("");
                  }}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline"
                  disabled={submitting}
                >
                  {mode === "login"
                    ? "Need to create an account?"
                    : "Already have an account? Sign in"}
                </button>
              )}
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
