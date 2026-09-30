import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { isBackendConfigured } from "@/lib/backend-config";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // No backend server configured yet (only possible in the packaged desktop
  // app — web/dev deployments always have BACKEND_API_URL set, so this is a
  // no-op there). Route everything to /setup until one is saved.
  if (pathname !== "/setup" && !(await isBackendConfigured())) {
    return NextResponse.redirect(new URL("/setup", request.nextUrl.origin));
  }

  // Read session cookie
  const session = request.cookies.get("shai_session")?.value;

  // Unauthenticated user attempting to access protected route
  if (!session && pathname !== "/login" && pathname !== "/setup") {
    const loginUrl = new URL("/login", request.nextUrl.origin);
    if (pathname !== "/") {
      loginUrl.searchParams.set("redirect", pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  // Already authenticated user visiting /login
  if (session && pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.nextUrl.origin));
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
