import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { createElement } from "react";
import {
  getStoredAccessToken,
  getStoredRefreshToken,
  setStoredTokensExternal,
} from "./authTokenStore";

// Re-export for backward compatibility (queryClient.ts imports this)
export { getStoredAccessToken };

// ─── Types ────────────────────────────────────────────────────────────────────
export interface AuthUser {
  id: number;
  username: string;
  role: string;
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  authEnabled: boolean;
}

interface AuthContextValue extends AuthState {
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshAccessToken: () => Promise<string | null>;
  getAccessToken: () => string | null;
}

// ─── Context ──────────────────────────────────────────────────────────────────
export const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Internal token store (module-level, NOT localStorage) ───────────────────
// Stored in module scope so it persists across re-renders but not across page
// refreshes. This is intentional for sandboxed-iframe security.
// Token helpers delegate to the shared authTokenStore module so
// queryClient.ts can also access tokens without circular imports.
function setStoredTokens(access: string | null, refresh: string | null) {
  setStoredTokensExternal(access, refresh);
}

// ─── API base ─────────────────────────────────────────────────────────────────
const RAW_BASE = "__PORT_5000__";
const API_BASE = (import.meta as any).env?.VITE_API_BASE || (RAW_BASE.startsWith("__") ? "" : RAW_BASE);

async function authFetch(path: string, options: RequestInit = {}): Promise<Response> {
  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
}

// ─── AuthProvider ─────────────────────────────────────────────────────────────
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    accessToken: null,
    refreshToken: null,
    isAuthenticated: false,
    isLoading: true,
    authEnabled: false,
  });

  // Bootstrap: check server for auth status and attempt token refresh
  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        // Check if auth is enabled + if we have users
        const setupRes = await authFetch("/api/auth/setup-status");
        if (!setupRes.ok) {
          setState(s => ({ ...s, isLoading: false }));
          return;
        }
        const setup = await setupRes.json();

        if (!setup.authEnabled) {
          // Auth is disabled — mark authenticated as anonymous
          setState({
            user: { id: 0, username: "anonymous", role: "admin" },
            accessToken: null,
            refreshToken: null,
            isAuthenticated: true,
            isLoading: false,
            authEnabled: false,
          });
          return;
        }

        // Auth is enabled — check for existing tokens in memory
        if (getStoredAccessToken() && getStoredRefreshToken()) {
          // Try to load current user
          const meRes = await authFetch("/api/auth/me", {
            headers: { Authorization: `Bearer ${getStoredAccessToken()}` },
          });
          if (meRes.ok) {
            const userData = await meRes.json();
            if (!cancelled) {
              setState({
                user: { id: userData.id, username: userData.username, role: userData.role },
                accessToken: getStoredAccessToken(),
                refreshToken: getStoredRefreshToken(),
                isAuthenticated: true,
                isLoading: false,
                authEnabled: true,
              });
            }
            return;
          }
        }

        // Not authenticated
        if (!cancelled) {
          setState(s => ({
            ...s,
            isLoading: false,
            authEnabled: true,
          }));
        }
      } catch {
        if (!cancelled) {
          setState(s => ({ ...s, isLoading: false }));
        }
      }
    }

    bootstrap();
    return () => { cancelled = true; };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const res = await authFetch("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Login failed" }));
      throw new Error(err.error || "Login failed");
    }

    const data = await res.json();
    setStoredTokens(data.accessToken, data.refreshToken);

    setState({
      user: data.user,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      isAuthenticated: true,
      isLoading: false,
      authEnabled: true,
    });
  }, []);

  const logout = useCallback(async () => {
    if (getStoredRefreshToken()) {
      await authFetch("/api/auth/logout", {
        method: "POST",
        body: JSON.stringify({ refreshToken: getStoredRefreshToken() }),
      }).catch(() => {});
    }

    setStoredTokens(null, null);
    setState(s => ({
      ...s,
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
    }));
  }, []);

  const refreshAccessToken = useCallback(async (): Promise<string | null> => {
    if (!getStoredRefreshToken()) return null;

    try {
      const res = await authFetch("/api/auth/refresh", {
        method: "POST",
        body: JSON.stringify({ refreshToken: getStoredRefreshToken() }),
      });

      if (!res.ok) {
        // Refresh failed — log out
        setStoredTokens(null, null);
        setState(s => ({
          ...s,
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
        }));
        return null;
      }

      const data = await res.json();
      setStoredTokens(data.accessToken, data.refreshToken);
      setState(s => ({
        ...s,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
      }));
      return data.accessToken;
    } catch {
      return null;
    }
  }, []);

  const getAccessToken = useCallback((): string | null => {
    return getStoredAccessToken();
  }, []);

  const value: AuthContextValue = {
    ...state,
    login,
    logout,
    refreshAccessToken,
    getAccessToken,
  };

  return createElement(AuthContext.Provider, { value }, children);
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
