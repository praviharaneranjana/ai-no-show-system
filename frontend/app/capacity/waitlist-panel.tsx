"use client";

import { useTransition, useState } from "react";
import { Loader2, PhoneCall, Check, UserCheck } from "lucide-react";

import { assignWaitlistSlotAction } from "@/app/capacity/actions";
import { Button } from "@/components/ui/button";
import type { WaitlistEntry } from "@/lib/types";

const URGENCY_STYLES: Record<string, string> = {
  High: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20",
  Normal: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20",
  Routine: "bg-muted text-muted-foreground border border-border/50",
};

export function WaitlistPanel({ entries }: { entries: WaitlistEntry[] }) {
  const [isPending, startTransition] = useTransition();
  const [offeredId, setOfferedId] = useState<string | null>(null);

  function offer(id: string) {
    startTransition(async () => {
      await assignWaitlistSlotAction(id);
      setOfferedId(id);
    });
  }

  if (entries.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground flex flex-col items-center justify-center gap-2">
        <UserCheck className="size-8 text-muted-foreground/50" />
        <span>No patients currently on the waitlist. All available slots are filled.</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col divide-y divide-border/40">
      {entries.map((entry) => {
        const isOffered = entry.status !== "waiting" || offeredId === entry.id;
        const initials = entry.patient_name
          .split(" ")
          .map((n) => n[0])
          .slice(0, 2)
          .join("")
          .toUpperCase();

        return (
          <div
            key={entry.id}
            className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 py-3.5 hover:bg-muted/20 px-2 rounded-xl transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="size-9 rounded-full bg-primary/10 text-primary font-semibold text-xs flex items-center justify-center shrink-0">
                {initials}
              </div>
              <div className="flex flex-col gap-0.5 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground text-sm truncate">
                    {entry.patient_name}
                  </span>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                      URGENCY_STYLES[entry.urgency_level] ?? URGENCY_STYLES.Routine
                    }`}
                  >
                    {entry.urgency_level}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground truncate">
                  {entry.specialty} · Consultant: {entry.doctor_name} · Available: {entry.preferred_days}
                </span>
              </div>
            </div>

            <Button
              variant={isOffered ? "secondary" : "default"}
              size="sm"
              disabled={isPending || isOffered}
              onClick={() => offer(entry.id)}
              className={`shrink-0 rounded-full h-8 px-3.5 text-xs font-semibold gap-1.5 transition-all ${
                isOffered
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                  : "bg-gradient-to-r from-[#8B7CF6] to-[#5B7CFA] text-white hover:opacity-90 shadow-xs"
              }`}
            >
              {isPending && offeredId === entry.id ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : isOffered ? (
                <Check className="size-3.5" />
              ) : (
                <PhoneCall className="size-3.5" />
              )}
              <span>{isOffered ? "Slot Offered & Contacted" : "Offer This Slot"}</span>
            </Button>
          </div>
        );
      })}
    </div>
  );
}
