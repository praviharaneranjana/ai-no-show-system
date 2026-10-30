"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";

import { notificationsAction } from "@/app/shell-actions";
import { NotificationRow } from "@/components/notification-row";
import { useReadNotifications } from "@/components/use-read-notifications";
import type { NotificationItem } from "@/lib/types";

export function NotificationsMenu() {
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { readIds, markRead } = useReadNotifications();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await notificationsAction();
      if (cancelled) return;
      setFailed(res === null);
      if (res) setItems(res);
    }
    void load();
    const timer = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const unread = (items ?? []).filter((n) => !readIds.has(n.id));
  const latest = (items ?? []).slice(0, 8);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Notifications"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="relative flex size-10 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-xs transition-colors hover:bg-muted"
      >
        <Bell className="size-4" />
        {unread.length > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex min-w-[18px] items-center justify-center rounded-full bg-[#E11D48] px-1 text-[10px] font-bold leading-[18px] text-white ring-2 ring-background">
            {unread.length > 99 ? "99+" : unread.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-50 w-[380px] max-w-[92vw] overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="font-heading text-sm font-bold text-foreground">Notifications</span>
            {unread.length > 0 && (
              <button
                type="button"
                onClick={() => markRead((items ?? []).map((n) => n.id))}
                className="text-[11px] font-semibold text-[#8B7CF6] hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-[420px] overflow-y-auto p-1.5">
            {failed && <p className="px-3 py-6 text-center text-xs text-muted-foreground">Couldn’t load notifications.</p>}
            {!failed && items === null && <p className="px-3 py-6 text-center text-xs text-muted-foreground">Loading…</p>}
            {items?.length === 0 && <p className="px-3 py-6 text-center text-xs text-muted-foreground">You’re all caught up.</p>}
            {latest.map((n) => (
              <NotificationRow
                key={n.id}
                item={n}
                unread={!readIds.has(n.id)}
                onClick={() => {
                  markRead([n.id]);
                  setOpen(false);
                }}
              />
            ))}
          </div>
          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="block border-t border-border px-4 py-2.5 text-center text-xs font-semibold text-[#8B7CF6] hover:bg-muted/50"
          >
            View all notifications
          </Link>
        </div>
      )}
    </div>
  );
}
