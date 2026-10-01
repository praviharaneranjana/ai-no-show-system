"use client";

import { useCallback, useSyncExternalStore } from "react";

const KEY = "shai_read_notifications";
const EVENT = "shai-read-notifications";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(EVENT, callback);
  };
}

// Snapshot is the raw JSON string (a primitive), so React can compare it by value.
function getSnapshot(): string {
  try {
    return localStorage.getItem(KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

export function useReadNotifications() {
  const raw = useSyncExternalStore(subscribe, getSnapshot, () => "[]");

  let readIds: string[] = [];
  try {
    readIds = JSON.parse(raw) as string[];
  } catch {
    readIds = [];
  }

  const markRead = useCallback((ids: string[]) => {
    try {
      const current = new Set(JSON.parse(localStorage.getItem(KEY) ?? "[]") as string[]);
      for (const id of ids) current.add(id);
      // keep the list bounded
      localStorage.setItem(KEY, JSON.stringify([...current].slice(-500)));
      window.dispatchEvent(new Event(EVENT));
    } catch {
      // storage unavailable — read state simply isn't persisted
    }
  }, []);

  return { readIds: new Set(readIds), markRead };
}
