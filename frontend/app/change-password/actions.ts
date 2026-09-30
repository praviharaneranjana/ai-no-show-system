"use server";

import { ApiError, changePassword } from "@/lib/api";

export type ChangePasswordResult = { ok: true } | { ok: false; message: string };

export async function changePasswordAction(
  currentPassword: string,
  newPassword: string
): Promise<ChangePasswordResult> {
  try {
    await changePassword(currentPassword, newPassword);
    return { ok: true };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, message: err.message };
    return { ok: false, message: "Could not reach the server. Try again." };
  }
}
