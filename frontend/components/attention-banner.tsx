"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BellRing, ChevronDown, PhoneCall, ShieldCheck, Bot } from "lucide-react";

import { cn } from "@/lib/utils";
import { Collapse } from "@/components/ui/collapse";
import { attentionAction } from "@/app/outreach/thread-actions";
import type { AttentionSummary } from "@/lib/types";

/** Strip under the header: automated reschedules in progress and what needs the desk (approvals, calls, 24 h silences). */
export function AttentionBanner() {
  const pathname = usePathname();
  const [data, setData] = useState<AttentionSummary | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const d = await attentionAction();
      if (!cancelled) setData(d);
    }
    void load();
    const t = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [pathname]);

  const needs = data ? data.pending_approval + data.needs_staff + data.no_reply : 0;
  const show = !!data && needs + data.in_progress > 0;

  const chip = (n: number, label: string, cls: string, Icon: typeof Bot) =>
    n > 0 && (
      <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold", cls)}>
        <Icon className="size-3" />
        {n} {label}
      </span>
    );

  return (
    <Collapse open={show} className="shrink-0">
      {data && (
        <div
          role="status"
          className={cn(
            "border-b px-4 py-2 text-xs lg:px-8",
            needs > 0 ? "border-rose-500/30 bg-rose-500/10" : "border-violet-500/30 bg-violet-500/10"
          )}
        >
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full cursor-pointer flex-wrap items-center gap-2 text-left">
            <span className={cn("flex items-center gap-1.5 font-bold uppercase tracking-wider", needs > 0 ? "text-rose-700 dark:text-rose-300" : "text-violet-700 dark:text-violet-300")}>
              <Bot className="size-3.5" /> Automated rescheduling
            </span>
            {chip(data.pending_approval, "awaiting your approval", "bg-amber-500/20 text-amber-800 dark:text-amber-200", ShieldCheck)}
            {chip(data.needs_staff, "need a call", "bg-rose-500/20 text-rose-800 dark:text-rose-200", PhoneCall)}
            {chip(data.no_reply, "no reply in 24 h", "bg-rose-500/20 text-rose-800 dark:text-rose-200", BellRing)}
            {chip(data.in_progress, "in progress", "bg-violet-500/20 text-violet-800 dark:text-violet-200", Bot)}
            <ChevronDown className={cn("ml-auto size-4 text-muted-foreground transition-transform duration-300", open && "rotate-180")} />
          </button>
          <Collapse open={open}>
            <ul className="mt-2 grid gap-1.5 pb-1 sm:grid-cols-2 xl:grid-cols-3">
              {data.items.map((i) => (
                <li key={i.conversation_id}>
                  <Link
                    href={i.href}
                    className="flex flex-col rounded-xl border border-border/60 bg-card px-3 py-2 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm"
                  >
                    <span className="truncate font-bold text-foreground">{i.patient_name}</span>
                    <span className="truncate text-[11px] text-muted-foreground">{i.detail}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Collapse>
        </div>
      )}
    </Collapse>
  );
}
