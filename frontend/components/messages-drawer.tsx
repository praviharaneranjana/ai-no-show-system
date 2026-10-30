"use client";

import { useState } from "react";
import Link from "next/link";
import { MessageSquare, X } from "lucide-react";

import { activityAction } from "@/app/shell-actions";
import { INTERVENTION_STATUS_LABEL, LANGUAGE_LABEL, timeAgo } from "@/lib/format";
import type { ActivityResponse } from "@/lib/types";

export function MessagesDrawer() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ActivityResponse | null>(null);
  const [failed, setFailed] = useState(false);

  async function show() {
    setOpen(true);
    const res = await activityAction(12);
    setFailed(res === null);
    if (res) setData(res);
  }

  return (
    <>
      <button
        type="button"
        aria-label="Messages"
        onClick={show}
        className="flex size-10 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-xs transition-colors hover:bg-muted"
      >
        <MessageSquare className="size-4" />
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex justify-end bg-black/40 backdrop-blur-xs" onMouseDown={() => setOpen(false)}>
          <aside
            onMouseDown={(e) => e.stopPropagation()}
            className="flex h-full w-full max-w-md flex-col border-l border-border bg-card shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <h2 className="font-heading text-base font-bold text-foreground">Patient messages</h2>
                <p className="text-[11px] text-muted-foreground">Latest outreach conversations</p>
              </div>
              <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="rounded-full p-1.5 text-muted-foreground hover:bg-muted">
                <X className="size-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2">
              {failed && <p className="px-3 py-10 text-center text-xs text-muted-foreground">Couldn’t load messages.</p>}
              {!failed && data === null && <p className="px-3 py-10 text-center text-xs text-muted-foreground">Loading…</p>}
              {data?.items.length === 0 && <p className="px-3 py-10 text-center text-xs text-muted-foreground">No conversations yet.</p>}
              {data?.items.map((m) => (
                <Link
                  key={m.id}
                  href={`/appointments/${m.appointment_id}`}
                  onClick={() => setOpen(false)}
                  className="block rounded-xl px-3 py-3 transition-colors hover:bg-muted/60"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-bold text-foreground">{m.patient_name}</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">{timeAgo(m.created_at)}</span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                    {m.patient_reply ?? "Reminder sent — awaiting reply"}
                  </p>
                  <p className="mt-1 text-[10px] font-semibold text-[#8B7CF6]">
                    {m.channel} · {LANGUAGE_LABEL[m.language] ?? m.language} · {INTERVENTION_STATUS_LABEL[m.status] ?? m.status}
                  </p>
                </Link>
              ))}
            </div>

            <Link
              href="/outreach"
              onClick={() => setOpen(false)}
              className="border-t border-border px-5 py-3 text-center text-xs font-semibold text-[#8B7CF6] hover:bg-muted/50"
            >
              Open Outreach Hub
            </Link>
          </aside>
        </div>
      )}
    </>
  );
}
