export function getForwardedAuthorizationHeader(request: Request): string | null {
  const authorization = request.headers.get("authorization")?.trim();
  if (authorization) {
    return authorization;
  }

  const token = request.headers.get("x-id-token")?.trim();
  if (!token) {
    return null;
  }

  if (/^bearer\s+/i.test(token)) {
    return token;
  }

  return `Bearer ${token}`;
}

export function withForwardedAuthHeaders(
  request: Request,
  headers?: HeadersInit
): Headers {
  const merged = new Headers(headers ?? undefined);
  const authorization = getForwardedAuthorizationHeader(request);

  if (authorization) {
    merged.set("Authorization", authorization);
  }

  return merged;
}
