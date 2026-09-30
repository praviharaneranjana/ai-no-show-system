"use server";

import { cookies } from "next/headers";

import { ApiError, login, type AuthRole, type LoginRequest } from "@/lib/api";

export type LoginActionResult =
  | { ok: true; role: AuthRole; name?: string; mustChangePassword?: boolean }
  | { ok: false; status: number; message: string };

export async function loginAction(data: LoginRequest): Promise<LoginActionResult> {
  try {
    const res = await login(data);
    const role = res.role ?? "front_desk";

    (await cookies()).set("shai_session", role, {
      path: "/",
      maxAge: 28800,
      sameSite: "lax",
    });

    return { ok: true, role, name: res.name, mustChangePassword: res.mustChangePassword };
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
