import { QueryClient } from "@tanstack/react-query";
import { getStoredAccessToken, getStoredRefreshToken, setStoredTokensExternal } from "./authTokenStore";

const RAW_BASE = "__PORT_5000__";
const API_BASE = (import.meta as any).env?.VITE_API_BASE || (RAW_BASE.startsWith("__") ? "" : RAW_BASE);

// ─── Token refresh helper ─────────────────────────────────────────────────────
let _refreshPromise: Promise<string | null> | null = null;

async function attemptTokenRefresh(): Promise<string | null> {
  // Deduplicate concurrent refresh attempts
  if (_refreshPromise) return _refreshPromise;

  _refreshPromise = (async () => {
    try {
      const refreshToken = getStoredRefreshToken();
      if (!refreshToken) return null;

      const res = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });

      if (!res.ok) {
        setStoredTokensExternal(null, null);
        // Redirect to login
        window.location.hash = "/login";
        return null;
      }

      const data = await res.json();
      setStoredTokensExternal(data.accessToken, data.refreshToken);
      return data.accessToken as string;
    } catch {
      return null;
    } finally {
      _refreshPromise = null;
    }
  })();

  return _refreshPromise;
}

// ─── API request ──────────────────────────────────────────────────────────────
export async function apiRequest(method: string, path: string, body?: any): Promise<any> {
  const url = `${API_BASE}${path}`;

  const makeRequest = (token: string | null) =>
    fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

  let res = await makeRequest(getStoredAccessToken());

  // On 401, attempt token refresh and retry once
  if (res.status === 401) {
    const newToken = await attemptTokenRefresh();
    if (newToken) {
      res = await makeRequest(newToken);
    } else {
      // Refresh failed — redirect to login
      window.location.hash = "/login";
      throw new Error("Session expired. Please log in again.");
    }
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export function getSSEUrl(path: string) {
  const token = getStoredAccessToken();
  const base = `${API_BASE}${path}`;
  if (token) {
    const sep = base.includes("?") ? "&" : "?";
    return `${base}${sep}token=${encodeURIComponent(token)}`;
  }
  return base;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: async ({ queryKey }) => {
        const path = Array.isArray(queryKey) ? queryKey[0] : queryKey;
        return apiRequest("GET", path as string);
      },
      staleTime: 10_000,
      retry: (failureCount, error: any) => {
        // Don't retry on auth errors
        if (error?.message?.includes("Session expired")) {
          return false;
        }
        return failureCount < 1;
      },
    },
  },
});
