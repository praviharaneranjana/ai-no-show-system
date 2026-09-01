"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

import { updateDoctorDelayAction } from "@/app/capacity/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { DoctorSession } from "@/lib/types";

const DELAY_PRESETS = [15, 30, 45];

function DoctorSessionRow({ session }: { session: DoctorSession }) {
  const [isPending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);

  function setDelay(minutes: number) {
    startTransition(async () => {
      await updateDoctorDelayAction(session.id, minutes);
      setExpanded(false);
    });
  }

  return (
    <div className="flex min-w-64 flex-1 flex-col gap-2 rounded-lg border border-border/70 bg-muted/30 px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-sm font-medium text-foreground truncate">{session.doctor_name}</span>
          <span className="text-[11px] text-muted-foreground truncate">
            {session.specialty} · {session.room_number} · {session.scheduled_start_time}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          disabled={isPending}
          className="shrink-0"
        >
          {isPending ? (
            <Badge variant="outline" className="gap-1">
              <Loader2 className="size-3 animate-spin" />
              <span>Updating</span>
            </Badge>
          ) : session.status === "delayed" ? (
            <Badge
              variant="outline"
              className="border-red-500/40 bg-red-500/10 text-red-700 dark:border-red-500/50 dark:bg-red-950/40 dark:text-red-300"
            >
              +{session.delay_minutes}m late
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:border-emerald-500/50 dark:bg-emerald-950/40 dark:text-emerald-300"
            >
              On time
            </Badge>
          )}
        </button>
      </div>

      {expanded && !isPending && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-2">
          <span className="text-[10px] text-muted-foreground mr-0.5">Mark delayed:</span>
          {DELAY_PRESETS.map((mins) => (
            <Button key={mins} variant="outline" size="xs" onClick={() => setDelay(mins)}>
              +{mins}m
            </Button>
          ))}
          <Button variant="ghost" size="xs" onClick={() => setDelay(0)}>
            On time
          </Button>
        </div>
      )}
    </div>
  );
}

export function DoctorSessionPanel({ sessions }: { sessions: DoctorSession[] }) {
  if (sessions.length === 0) {
    return <p className="py-4 text-center text-sm text-muted-foreground">No consultant sessions today.</p>;
  }

  return (
    <div className="flex flex-wrap gap-3">
      {sessions.map((s) => (
        <DoctorSessionRow key={s.id} session={s} />
      ))}
    </div>
  );
}
