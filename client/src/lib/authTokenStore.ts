// ─── Shared token store ───────────────────────────────────────────────────────
// This module holds the current access/refresh tokens in module-level variables.
// Both auth.ts and queryClient.ts import from here to avoid circular deps.
// Tokens are stored in memory only — NOT in localStorage/sessionStorage.

let _accessToken: string | null = null;
let _refreshToken: string | null = null;

export function getStoredAccessToken(): string | null {
  return _accessToken;
}

export function getStoredRefreshToken(): string | null {
  return _refreshToken;
}

export function setStoredTokensExternal(access: string | null, refresh: string | null): void {
  _accessToken = access;
  _refreshToken = refresh;
}
