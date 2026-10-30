"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { updateDoctorDelayAction } from "@/app/capacity/actions";

export function DelayControl({ sessionId, initial }: { sessionId: string; initial: number }) {
  const router = useRouter();
  const [minutes, setMinutes] = useState(initial);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="text-xs font-semibold text-muted-foreground" htmlFor="delay">Delay (minutes)</label>
      <input
        id="delay"
        type="number"
        min={0}
        max={240}
        value={minutes}
        onChange={(e) => setMinutes(Math.max(0, Math.min(240, Number(e.target.value) || 0)))}
        className="h-9 w-20 rounded-lg border border-input bg-card px-2 text-xs"
      />
      <button
        type="button"
        disabled={pending || minutes === initial}
        onClick={() =>
          start(async () => {
            try {
              setError(null);
              await updateDoctorDelayAction(sessionId, minutes);
              router.refresh();
            } catch {
              setError("Couldn’t update the delay.");
            }
          })
        }
        className="rounded-lg bg-[#8B7CF6] px-3 py-2 text-xs font-bold text-white disabled:opacity-40"
      >
        {pending ? "Saving…" : "Update"}
      </button>
      {error && <span className="text-[11px] text-rose-600">{error}</span>}
    </div>
  );
}
