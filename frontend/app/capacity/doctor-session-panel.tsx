"use client";

import { useState, useTransition } from "react";
import { Loader2, Clock, CheckCircle2, Stethoscope } from "lucide-react";

import { updateDoctorDelayAction } from "@/app/capacity/actions";
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
    <div className="flex flex-col gap-3 rounded-[20px] bg-background/80 p-4 border border-border/40 shadow-xs hover:border-border/80 transition-all">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <Stethoscope className="size-5 text-primary" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-semibold text-foreground truncate">{session.doctor_name}</span>
            <span className="text-xs text-muted-foreground truncate">
              {session.specialty} · Room {session.room_number} · {session.scheduled_start_time}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          disabled={isPending}
          className="shrink-0 transition-transform active:scale-95 cursor-pointer"
        >
          {isPending ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground border border-border/50">
              <Loader2 className="size-3 animate-spin text-primary" />
              <span>Updating...</span>
            </span>
          ) : session.status === "delayed" ? (
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
              <Clock className="size-3.5" />
              +{session.delay_minutes}m late
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <CheckCircle2 className="size-3.5" />
              On time
            </span>
          )}
        </button>
      </div>

      {expanded && !isPending && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border/40 pt-3 animate-in fade-in duration-200">
          <span className="text-xs font-medium text-muted-foreground mr-1">Adjust Delay:</span>
          {DELAY_PRESETS.map((mins) => (
            <Button
              key={mins}
              variant="outline"
              size="xs"
              onClick={() => setDelay(mins)}
              className="rounded-full text-xs hover:border-primary/50"
            >
              +{mins} min
            </Button>
          ))}
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setDelay(0)}
            className="rounded-full text-xs text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
          >
            Clear / On time
          </Button>
        </div>
      )}
    </div>
  );
}

export function DoctorSessionPanel({ sessions }: { sessions: DoctorSession[] }) {
  if (sessions.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">No active consultant sessions recorded today.</p>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3">
      {sessions.map((s) => (
        <DoctorSessionRow key={s.id} session={s} />
      ))}
    </div>
  );
}
