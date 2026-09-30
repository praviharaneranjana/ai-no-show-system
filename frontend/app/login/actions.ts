"use server";

import { cookies } from "next/headers";

import { ApiError, login, type AuthRole, type LoginRequest } from "@/lib/api";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";
import { decodeToken } from "@/lib/session-token";

export type LoginActionResult =
  | { ok: true; role: AuthRole; name?: string; mustChangePassword?: boolean }
  | { ok: false; status: number; message: string };

export async function loginAction(data: LoginRequest): Promise<LoginActionResult> {
  try {
    const res = await login(data);
    const payload = decodeToken(res.access_token);
    if (!res.access_token || !payload) {
      return { ok: false, status: 502, message: "The server returned an invalid session." };
    }

    // The signed token itself is the session. It is httpOnly, so page scripts cannot read it.
    (await cookies()).set(SESSION_COOKIE, res.access_token, sessionCookieOptions(payload.exp));

    return { ok: true, role: res.role, name: res.name, mustChangePassword: res.mustChangePassword };
  } catch (err) {
    if (err instanceof ApiError) {
      return { ok: false, status: err.status, message: err.message };
    }
    return {
      ok: false,
      status: 0,
      message: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

// httpOnly cookies can only be removed on the server, so sign-out is a server action.
export async function logoutAction(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}
