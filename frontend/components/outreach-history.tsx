import Link from "next/link";
import { MessageSquare, Send } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Intervention, InterventionLanguage } from "@/lib/types";

const LANGUAGE_BADGES: Record<InterventionLanguage, { label: string; className: string }> = {
  en: { label: "EN", className: "bg-muted text-foreground border border-border/80" },
  si: {
    label: "SI",
    className: "bg-violet-500/10 text-violet-700 dark:text-violet-300 border border-violet-500/30",
  },
  ta: {
    label: "TA",
    className: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/30",
  },
};

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  confirmed: { label: "Confirmed", className: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" },
  rescheduled: { label: "Rescheduled", className: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" },
  telehealth_requested: { label: "Telehealth requested", className: "bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300" },
  cancelled: { label: "Cancelled", className: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300" },
};

function statusBadge(status: string) {
  return (
    STATUS_LABELS[status] ?? {
      label: status.replace(/_/g, " "),
      className: "bg-muted text-muted-foreground",
    }
  );
}

export function OutreachHistory({
  interventions,
  className,
}: {
  interventions: Intervention[];
  className?: string;
}) {
  return (
    <div className={cn("rounded-[24px] border border-border bg-card p-6 bento-card-shadow", className)}>
      <div className="flex items-center justify-between gap-3 pb-3 mb-4 border-b border-border/60">
        <div>
          <h2 className="font-heading text-base font-bold text-foreground">Outreach History</h2>
          <p className="text-[11px] text-muted-foreground">
            Reminder conversations logged for this appointment
          </p>
        </div>
        <Link
          href="/outreach"
          className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-[11px] font-semibold text-foreground transition-colors hover:bg-[#8B7CF6] hover:text-white"
        >
          <Send className="size-3.5" />
          Open Outreach Hub
        </Link>
      </div>

      {interventions.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 py-6 text-center">
          <MessageSquare className="size-5 text-muted-foreground" />
          <p className="text-xs font-semibold text-foreground">No outreach yet</p>
          <p className="text-[11px] text-muted-foreground">
            Drafted and simulated reminders for this patient will appear here.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-border/50">
          {interventions.map((c) => {
            const lang = LANGUAGE_BADGES[c.language] ?? LANGUAGE_BADGES.en;
            const status = statusBadge(c.status);
            return (
              <li key={c.id} className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold", lang.className)}>
                    {lang.label}
                  </span>
                  <span className="text-[11px] font-semibold text-foreground">{c.channel}</span>
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", status.className)}>
                    {status.label}
                  </span>
                  <time
                    dateTime={c.created_at}
                    className="ml-auto text-[11px] tabular-nums text-muted-foreground"
                  >
                    {new Date(c.created_at).toLocaleString("en-LK", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </div>
                {c.patient_reply && (
                  <p className="text-xs text-foreground">
                    <span className="text-muted-foreground">Patient: </span>
                    {c.patient_reply}
                  </p>
                )}
                {(c.intent_detected || c.offered_slot) && (
                  <p className="text-[11px] text-muted-foreground">
                    {c.intent_detected}
                    {c.intent_detected && c.offered_slot ? " · " : ""}
                    {c.offered_slot}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
