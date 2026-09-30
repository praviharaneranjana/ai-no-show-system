"use client";

import { useSyncExternalStore } from "react";

// The login page stores the signed-in staff member's name in localStorage.
// The snapshot is a primitive string (an object would re-render forever).
export function useStaffName(): string {
  return useSyncExternalStore(
    (callback) => {
      window.addEventListener("storage", callback);
      return () => window.removeEventListener("storage", callback);
    },
    () => {
      try {
        return localStorage.getItem("shai_user_name") ?? "";
      } catch {
        return "";
      }
    },
    () => ""
  );
}
