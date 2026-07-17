export async function validateOwnerApiKey(key: string): Promise<boolean> {
  const response = await fetch("/api/app-config", {
    headers: key ? { Authorization: `Bearer ${key}` } : {},
  });
  if (response.status === 401 || response.status === 403) return false;
  if (!response.ok) {
    throw new Error(`Owner access validation failed with HTTP ${response.status}`);
  }
  const body = await response.json() as { experimental?: unknown };
  if (typeof body.experimental !== "boolean") {
    throw new Error("Owner access validation returned an invalid response");
  }
  return true;
}
