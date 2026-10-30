"use client";

import { useState } from "react";

import { NotificationRow } from "@/components/notification-row";
import { useReadNotifications } from "@/components/use-read-notifications";
import { cn } from "@/lib/utils";
import type { NotificationItem } from "@/lib/types";

const FILTERS: { id: "all" | NotificationItem["type"]; label: string }[] = [
  { id: "all", label: "All" },
  { id: "high_risk", label: "High risk" },
  { id: "delay", label: "Doctor delays" },
  { id: "reply", label: "Patient replies" },
  { id: "waitlist", label: "Waitlist" },
];

export function NotificationsList({ items }: { items: NotificationItem[] }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const { readIds, markRead } = useReadNotifications();
  const shown = items.filter((n) => filter === "all" || n.type === filter);
  const unread = items.filter((n) => !readIds.has(n.id)).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5 rounded-lg bg-muted/60 p-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                filter === f.id ? "bg-background font-semibold text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {f.label}
              <span className="ml-1.5 rounded-full bg-muted px-1.5 text-[10px] tabular-nums">
                {f.id === "all" ? items.length : items.filter((n) => n.type === f.id).length}
              </span>
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={unread === 0}
          onClick={() => markRead(items.map((n) => n.id))}
          className="text-xs font-semibold text-[#8B7CF6] hover:underline disabled:opacity-40 disabled:no-underline"
        >
          Mark all read ({unread})
        </button>
      </div>

      {shown.length === 0 ? (
        <p className="py-14 text-center text-sm text-muted-foreground">Nothing here — you’re all caught up.</p>
      ) : (
        <div className="flex flex-col divide-y divide-border/60">
          {shown.map((n) => (
            <NotificationRow key={n.id} item={n} unread={!readIds.has(n.id)} onClick={() => markRead([n.id])} />
          ))}
        </div>
      )}
    </div>
  );
}
