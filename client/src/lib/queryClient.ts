import { QueryClient } from "@tanstack/react-query";

const RAW_BASE = "__PORT_5000__";
const API_BASE = (import.meta as any).env?.VITE_API_BASE || (RAW_BASE.startsWith("__") ? "" : RAW_BASE);

function browserApiKey(): string {
  return (window as any).__ULTRA_API_KEY__ ?? "";
}

export async function apiRequest(method: string, path: string, body?: any) {
  const url = `${API_BASE}${path}`;
  const key = browserApiKey();
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
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

  const connect = async () => {
    try {
      const url = await getSSEUrl(path);
      if (closed) return;
      source = new EventSource(url);
      source.onmessage = handlers.onMessage;
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
