import { QueryClient } from "@tanstack/react-query";

const RAW_BASE = "__PORT_5000__";
const API_BASE = (import.meta as any).env?.VITE_API_BASE || (RAW_BASE.startsWith("__") ? "" : RAW_BASE);

export async function apiRequest(method: string, path: string, body?: any) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export function getSSEUrl(path: string) {
  return `${API_BASE}${path}`;
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
