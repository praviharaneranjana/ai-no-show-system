// Pure helpers for the signed session token issued by the backend
// (<base64url JSON payload>.<base64url HMAC signature>).
//
// The frontend deliberately does NOT verify the signature: it has no access to the signing
// key. Decoding is only used for UX (skip the login screen, hide menu items, detect expiry).
// The backend verifies every token on every request and is the only authority.

export type SessionRole = "front_desk" | "analyst" | "manager" | "admin" | "platform_owner";

export const SESSION_COOKIE = "shai_session";

const ROLE_RANK: Record<SessionRole, number> = {
  front_desk: 1,
  analyst: 2,
  manager: 3,
  admin: 4,
  platform_owner: 5,
};

export type TokenPayload = {
  sub: string;
  email: string;
  name: string;
  role: SessionRole;
  hospital_id?: string | null;
  iat: number;
  exp: number; // seconds since epoch
};

export function decodeToken(token: string | undefined | null): TokenPayload | null {
  if (!token) return null;
  const [payloadB64] = token.split(".");
  if (!payloadB64 || token.split(".").length !== 2) return null;
  try {
    const base64 = payloadB64.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const payload = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))));
    if (typeof payload.exp !== "number" || !(payload.role in ROLE_RANK)) return null;
    return payload as TokenPayload;
  } catch {
    return null;
  }
}

export function isExpired(payload: TokenPayload, nowMs: number = Date.now()): boolean {
  return payload.exp * 1000 <= nowMs;
}

export function hasRole(role: SessionRole | undefined | null, minimum: SessionRole): boolean {
  return !!role && ROLE_RANK[role] >= ROLE_RANK[minimum];
}
