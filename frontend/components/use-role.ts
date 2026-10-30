"use client";

import { useSyncExternalStore } from "react";

import { hasRole, type SessionRole } from "@/lib/session-token";

/** The signed-in role as stored by the login screen (the server still enforces every action). */
export function useRole(): SessionRole {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener("storage", cb);
      return () => window.removeEventListener("storage", cb);
    },
    () => {
      try {
        return (localStorage.getItem("shai_user_role") ?? "front_desk") as SessionRole;
      } catch {
        return "front_desk" as SessionRole;
      }
    },
    () => "front_desk" as SessionRole
  );
}

/** Front desk, managers and admins can approve reschedules; analysts are read-only. */
export function useCanApprove(): boolean {
  const role = useRole();
  return role !== ("analyst" as SessionRole) && hasRole(role, "front_desk" as SessionRole);
}
