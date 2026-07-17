import { QueryClient } from "@tanstack/react-query";

const RAW_BASE = "__PORT_5000__";
const API_BASE = (import.meta as any).env?.VITE_API_BASE || (RAW_BASE.startsWith("__") ? "" : RAW_BASE);

const SESSION_API_KEY = "ultra_api_key";

export function browserApiKey(): string {
  return (window as any).__ULTRA_API_KEY__ ?? window.sessionStorage.getItem(SESSION_API_KEY) ?? "";
}

export function setBrowserApiKey(value: string): void {
  const key = value.trim();
  if (key) {
    window.sessionStorage.setItem(SESSION_API_KEY, key);
    (window as any).__ULTRA_API_KEY__ = key;
  } else {
    window.sessionStorage.removeItem(SESSION_API_KEY);
    delete (window as any).__ULTRA_API_KEY__;
  }
}

export async function authenticatedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const key = browserApiKey();
  const headers = new Headers(init.headers);
  if (key && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${key}`);
  }

  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
  });
}

export async function apiRequest<T = any>(method: string, path: string, body?: any): Promise<T> {
  const res = await authenticatedFetch(path, {
    method,
    headers: {
      "Content-Type": "application/json",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function getSSEUrl(path: string): Promise<string> {
  const key = browserApiKey();
  if (!key) return `${API_BASE}${path}`;
  const { token } = await apiRequest("POST", "/api/auth/stream-token", { path });
  const separator = path.includes("?") ? "&" : "?";
  return `${API_BASE}${path}${separator}stream_token=${encodeURIComponent(token)}`;
}

export function connectEventSource(
  path: string,
  handlers: {
    onMessage: (event: MessageEvent<string>) => void;
    onOpen?: () => void;
    onError?: () => void;
  },
): () => void {
  let closed = false;
  let source: EventSource | null = null;
  let reconnectTimer: number | undefined;
  let lastEventId = "";

  const connect = async () => {
    try {
      const authenticatedUrl = await getSSEUrl(path);
      if (closed) return;
      const separator = authenticatedUrl.includes("?") ? "&" : "?";
      const url = lastEventId
        ? `${authenticatedUrl}${separator}lastEventId=${encodeURIComponent(lastEventId)}`
        : authenticatedUrl;
      source = new EventSource(url);
      source.onmessage = (event) => {
        if (event.lastEventId) lastEventId = event.lastEventId;
        handlers.onMessage(event);
      };
      source.onopen = () => handlers.onOpen?.();
      source.onerror = () => {
        source?.close();
        source = null;
        handlers.onError?.();
        if (!closed) reconnectTimer = window.setTimeout(connect, 1_000);
      };
    } catch {
      handlers.onError?.();
      if (!closed) reconnectTimer = window.setTimeout(connect, 1_000);
    }
  };

  void connect();
  return () => {
    closed = true;
    if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer);
    source?.close();
  };
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: async ({ queryKey }) => {
        const path = Array.isArray(queryKey) ? queryKey[0] : queryKey;
        return apiRequest("GET", path as string);
      },
      staleTime: 10_000,
      retry: 1,
    },
  },
});
