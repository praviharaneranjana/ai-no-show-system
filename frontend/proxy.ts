import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { isBackendConfigured } from "@/lib/backend-config";
import { SESSION_COOKIE, decodeToken, isExpired } from "@/lib/session-token";

export async function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  // No backend server configured yet (only possible in the packaged desktop
  // app — web/dev deployments always have BACKEND_API_URL set, so this is a
  // no-op there). Route everything to /setup until one is saved.
  if (pathname !== "/setup" && !(await isBackendConfigured())) {
    return NextResponse.redirect(new URL("/setup", request.nextUrl.origin));
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const payload = decodeToken(token);
  const hasValidSession = !!payload && !isExpired(payload);

  // Unauthenticated (or expired) user attempting to access a protected route.
  // The token's signature is checked by the backend on every API call, so a forged
  // cookie can reach this shell but never any data.
  if (!hasValidSession && pathname !== "/login" && pathname !== "/setup") {
    const loginUrl = new URL("/login", request.nextUrl.origin);
    if (pathname !== "/") loginUrl.searchParams.set("redirect", pathname);
    if (token) loginUrl.searchParams.set("reason", "session_expired");
    const res = NextResponse.redirect(loginUrl);
    if (token) res.cookies.delete(SESSION_COOKIE);
    return res;
  }

  if (pathname === "/login") {
    // Arriving with ?reason= means the server rejected the session (e.g. account disabled):
    // drop the stale cookie instead of bouncing back to "/" in a loop.
    if (searchParams.has("reason") && token) {
      const res = NextResponse.next();
      res.cookies.delete(SESSION_COOKIE);
      return res;
    }
    if (hasValidSession) return NextResponse.redirect(new URL("/", request.nextUrl.origin));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - api routes (/api/...)
     * - static files (_next/static, _next/image)
     * - public assets (favicon.ico, svg, png, jpg, etc.)
     */
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
