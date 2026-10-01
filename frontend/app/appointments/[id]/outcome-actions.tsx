"use client";

import { useTransition } from "react";
import { CheckCircle2, XCircle, RotateCcw, Loader2 } from "lucide-react";

import { recordOutcomeAction } from "@/app/appointments/[id]/actions";
import { Button } from "@/components/ui/button";

export function OutcomeActions({
  appointmentId,
  currentStatus,
}: {
  appointmentId: string;
  currentStatus?: string;
}) {
  const [isPending, startTransition] = useTransition();

  function record(noShow: boolean | null) {
    startTransition(async () => {
      await recordOutcomeAction(appointmentId, noShow);
    });
  }

  const isRecorded = currentStatus === "completed" || currentStatus === "no_show";

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <Button
        variant="outline"
        size="sm"
        disabled={isPending || currentStatus === "completed"}
        onClick={() => record(false)}
        className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 hover:text-emerald-800 dark:border-emerald-500/50 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-950/60 font-medium text-xs h-8"
      >
        {isPending ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" />
        )}
        <span>Mark Attended</span>
      </Button>

      <Button
        variant="outline"
        size="sm"
        disabled={isPending || currentStatus === "no_show"}
        onClick={() => record(true)}
        className="border-red-500/40 bg-red-500/10 text-red-700 hover:bg-red-500/20 hover:text-red-800 dark:border-red-500/50 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/60 font-medium text-xs h-8"
      >
        {isPending ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <XCircle className="size-3.5 text-red-600 dark:text-red-400" />
        )}
        <span>Mark No-Show</span>
      </Button>

      {isRecorded && (
        <Button
          variant="ghost"
          size="sm"
          disabled={isPending}
          onClick={() => record(null)}
          className="text-xs h-8 text-muted-foreground hover:text-foreground"
        >
          <RotateCcw className="size-3 mr-1" />
          <span>Undo</span>
        </Button>
      )}
    </div>
  );
}
