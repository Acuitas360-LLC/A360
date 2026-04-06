export const IFRAME_ID_TOKEN_STORAGE_KEY = "onehum.idToken";
export const AUTH_TOKEN_UPDATED_EVENT = "chatbot-auth-token-updated";

type TokenClaims = {
  preferred_username?: unknown;
  upn?: unknown;
  email?: unknown;
  name?: unknown;
  given_name?: unknown;
  family_name?: unknown;
};

export type TokenProfile = {
  email?: string;
  name?: string;
  initials: string;
  avatarUrl?: string;
};

function normalizeToken(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function splitAllowedOrigins(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }

  return raw
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function getConfiguredAllowedOrigins(): string[] {
  if (typeof window === "undefined") {
    return [];
  }

  const configured = splitAllowedOrigins(
    process.env.NEXT_PUBLIC_PARENT_APP_ORIGIN
  );

  return configured;
}

export function isTrustedParentOrigin(origin: string): boolean {
  const allowedOrigins = getConfiguredAllowedOrigins();

  // When no explicit allowlist is configured, keep compatibility and accept.
  if (allowedOrigins.length === 0) {
    return true;
  }

  return allowedOrigins.includes(origin);
}

export function getStoredIdToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const sessionToken = normalizeToken(
    window.sessionStorage.getItem(IFRAME_ID_TOKEN_STORAGE_KEY)
  );
  if (sessionToken) {
    return sessionToken;
  }

  return normalizeToken(window.localStorage.getItem(IFRAME_ID_TOKEN_STORAGE_KEY));
}

export function setStoredIdToken(token: string): void {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(IFRAME_ID_TOKEN_STORAGE_KEY, token);
  window.localStorage.setItem(IFRAME_ID_TOKEN_STORAGE_KEY, token);
  window.dispatchEvent(new Event(AUTH_TOKEN_UPDATED_EVENT));
}

export function clearStoredIdToken(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(IFRAME_ID_TOKEN_STORAGE_KEY);
  window.localStorage.removeItem(IFRAME_ID_TOKEN_STORAGE_KEY);
  window.dispatchEvent(new Event(AUTH_TOKEN_UPDATED_EVENT));
}

export function extractIdTokenFromPostMessage(data: unknown): string | null {
  if (typeof data === "string") {
    return normalizeToken(data);
  }

  if (!data || typeof data !== "object") {
    return null;
  }

  const payload = data as Record<string, unknown>;

  return (
    normalizeToken(payload.idToken) ??
    normalizeToken(payload.id_token) ??
    normalizeToken(payload.token)
  );
}

export function withBrowserAuthHeaders(headers?: HeadersInit): Headers {
  const merged = new Headers(headers ?? undefined);

  const token = getStoredIdToken();
  if (token) {
    merged.set("Authorization", `Bearer ${token}`);
    merged.set("x-id-token", token);
  }

  return merged;
}

function decodeBase64Url(input: string): string | null {
  try {
    const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    return atob(padded);
  } catch {
    return null;
  }
}

function getTokenClaims(token: string): TokenClaims | null {
  const parts = token.split(".");
  if (parts.length < 2) {
    return null;
  }

  const payload = decodeBase64Url(parts[1]);
  if (!payload) {
    return null;
  }

  try {
    const parsed = JSON.parse(payload) as TokenClaims;
    if (parsed && typeof parsed === "object") {
      return parsed;
    }
  } catch {
    return null;
  }

  return null;
}

function toNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function buildInitials(name?: string, email?: string): string {
  const source = name || email || "User";
  const words = source
    .replace(/@.*/, "")
    .split(/[\s._-]+/)
    .filter(Boolean);

  const first = words[0]?.charAt(0) ?? "U";
  const second = words[1]?.charAt(0) ?? "";
  return `${first}${second}`.toUpperCase();
}

export function getTokenProfileFromStorage(): TokenProfile | null {
  const token = getStoredIdToken();
  if (!token) {
    return null;
  }

  const claims = getTokenClaims(token);
  const email =
    toNonEmptyString(claims?.preferred_username) ??
    toNonEmptyString(claims?.upn) ??
    toNonEmptyString(claims?.email);
  const name = toNonEmptyString(claims?.name);
  const initials = buildInitials(name, email);

  return {
    email,
    name,
    initials,
    avatarUrl: email ? `https://avatar.vercel.sh/${encodeURIComponent(email)}` : undefined,
  };
}
