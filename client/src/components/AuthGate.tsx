import { FormEvent, ReactNode, useEffect, useState } from "react";
import { KeyRound, LoaderCircle, ShieldCheck } from "lucide-react";
import { browserApiKey, setBrowserApiKey } from "@/lib/queryClient";
import { validateOwnerApiKey } from "@/lib/ownerAuth";

type AccessState = "checking" | "granted" | "required";

export function AuthGate({ children }: { children: ReactNode }) {
  const [access, setAccess] = useState<AccessState>("checking");
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    validateOwnerApiKey(browserApiKey())
      .then((valid) => active && setAccess(valid ? "granted" : "required"))
      .catch(() => {
        if (!active) return;
        setError("The server could not be reached. Check that Ultra Computer is running.");
        setAccess("required");
      });
    return () => { active = false; };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const candidate = key.trim();
    if (!candidate) {
      setError("Enter the owner API key configured for this server.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      if (!await validateOwnerApiKey(candidate)) {
        setError("That API key was rejected by the server.");
        return;
      }
      setBrowserApiKey(candidate);
      setKey("");
      setAccess("granted");
    } catch {
      setError("The server could not be reached. Check that Ultra Computer is running.");
    } finally {
      setSubmitting(false);
    }
  }

  if (access === "granted") return <>{children}</>;

  return (
    <main className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
      <section className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
        <div className="mb-5 flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2 text-primary">
            {access === "checking" ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <ShieldCheck className="h-5 w-5" />}
          </div>
          <div>
            <h1 className="text-lg font-semibold">Ultra Computer owner access</h1>
            <p className="text-sm text-muted-foreground">This private server requires its API key.</p>
          </div>
        </div>

        {access === "checking" ? (
          <p className="text-sm text-muted-foreground">Checking the local server…</p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <label className="block space-y-2 text-sm font-medium" htmlFor="owner-api-key">
              Owner API key
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="owner-api-key"
                  type="password"
                  value={key}
                  onChange={(event) => setKey(event.target.value)}
                  autoComplete="off"
                  data-1p-ignore
                  data-lpignore="true"
                  className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                  autoFocus
                />
              </div>
            </label>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="h-10 w-full rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              {submitting ? "Verifying…" : "Unlock this session"}
            </button>
            <p className="text-xs text-muted-foreground">The key is kept only in this browser tab session and is not written to disk.</p>
          </form>
        )}
      </section>
    </main>
  );
}
