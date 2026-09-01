"use client";

import { useTransition, useState } from "react";
import { Loader2, PhoneCall, Check } from "lucide-react";

import { assignWaitlistSlotAction } from "@/app/capacity/actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { WaitlistEntry } from "@/lib/types";

const URGENCY_STYLES: Record<string, string> = {
  High: "border-red-500/40 bg-red-500/10 text-red-700 dark:border-red-500/50 dark:bg-red-950/40 dark:text-red-300",
  Normal:
    "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:border-amber-500/50 dark:bg-amber-950/40 dark:text-amber-300",
  Routine:
    "border-border bg-muted text-muted-foreground",
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
      <p className="py-6 text-center text-sm text-muted-foreground">
        No patients currently waitlisted.
      </p>
    );
  }

  return (
    <div className="flex flex-col divide-y divide-border/70">
      {entries.map((entry) => {
        const isOffered = entry.status !== "waiting" || offeredId === entry.id;
        return (
          <div key={entry.id} className="flex items-center justify-between gap-3 py-3">
            <div className="flex flex-col gap-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-foreground text-sm truncate">
                  {entry.patient_name}
                </span>
                <Badge
                  variant="outline"
                  className={URGENCY_STYLES[entry.urgency_level] ?? URGENCY_STYLES.Routine}
                >
                  {entry.urgency_level}
                </Badge>
              </div>
              <span className="text-xs text-muted-foreground truncate">
                {entry.specialty} · {entry.doctor_name} · Prefers {entry.preferred_days}
              </span>
            </div>

            <Button
              variant={isOffered ? "secondary" : "outline"}
              size="sm"
              disabled={isPending || isOffered}
              onClick={() => offer(entry.id)}
              className="shrink-0 gap-1.5"
            >
              {isPending && offeredId === entry.id ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : isOffered ? (
                <Check className="size-3.5" />
              ) : (
                <PhoneCall className="size-3.5" />
              )}
              <span>{isOffered ? "Slot Offered" : "Offer This Slot"}</span>
            </Button>
          </div>
        );
      })}
    </div>
  );
}
