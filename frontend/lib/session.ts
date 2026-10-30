import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  SESSION_COOKIE,
  decodeToken,
  hasRole,
  isExpired,
  type SessionRole,
  type TokenPayload,
} from "@/lib/session-token";

export { SESSION_COOKIE };

export type Session = TokenPayload & { token: string };

export async function getSessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

// Decoded (not verified) session for UX decisions. The backend enforces the real rules.
export async function getSession(): Promise<Session | null> {
  const token = await getSessionToken();
  const payload = decodeToken(token);
  if (!token || !payload || isExpired(payload)) return null;
  return { ...payload, token };
}

// For server pages that only some roles may open. Redirects everyone else to the dashboard.
export async function requireRole(minimum: SessionRole): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login?reason=session_expired");
  if (!hasRole(session.role, minimum)) redirect("/?denied=1");
  return session;
}

export function sessionCookieOptions(expSeconds: number) {
  return {
    httpOnly: true, // not readable by page scripts, so an XSS bug can't steal the session
    sameSite: "lax" as const,
    path: "/",
    // Set SESSION_COOKIE_SECURE=true when serving over HTTPS.
    secure: process.env.SESSION_COOKIE_SECURE === "true",
    maxAge: Math.max(1, Math.floor(expSeconds - Date.now() / 1000)),
  };
}
