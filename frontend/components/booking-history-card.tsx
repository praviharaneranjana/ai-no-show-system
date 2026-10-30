import Link from "next/link";
import { ArrowDown, CalendarClock } from "lucide-react";

import { cn } from "@/lib/utils";
import type { HistoryStep } from "@/lib/types";

const STATUS_STYLE: Record<string, string> = {
  scheduled: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  cancelled: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  completed: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  no_show: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
};

/** The reschedule chain of this booking: where it started and where it is now. */
export function BookingHistoryCard({ steps }: { steps: HistoryStep[] }) {
  const latest = steps[steps.length - 1];
  const viewingOld = !steps.find((s) => s.current)?.appointment.status.startsWith("sched") && !latest.current;

  return (
    <div className="lg:col-span-4 rounded-[24px] border border-border bg-card p-6 bento-card-shadow flex flex-col justify-between animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div>
        <div className="pb-3 border-b border-border/60">
          <h2 className="font-heading text-base font-bold text-foreground flex items-center gap-2">
            <CalendarClock className="size-4 text-[#8B7CF6]" /> Booking history
          </h2>
          <p className="text-[11px] text-muted-foreground">Past and updated appointment for this patient</p>
        </div>

        <ol className="mt-4 flex flex-col">
          {steps.map((s, i) => {
            const a = s.appointment;
            return (
              <li key={a.id} className="flex flex-col items-stretch">
                <div className={cn("rounded-2xl border p-3 text-xs transition-colors", s.current ? "border-primary/50 bg-primary/5" : "border-border/60 bg-muted/30")}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      {i === 0 ? "Original" : i === steps.length - 1 ? "Latest" : `Move ${i}`}
                      {s.current && " · viewing"}
                    </span>
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold capitalize", STATUS_STYLE[a.status] ?? "bg-muted text-muted-foreground")}>
                      {a.status === "cancelled" ? "moved" : a.status.replace("_", " ")}
                    </span>
                  </div>
                  <div className="mt-1 font-bold text-foreground">
                    {a.day} {a.time ?? ""}
                  </div>
                  <div className="text-muted-foreground">
                    {a.doctor_name ?? "Doctor"} · {a.department ?? "Clinic"} · token #{a.token ?? "?"}
                  </div>
                  {!s.current && (
                    <Link href={`/appointments/${a.id}`} className="mt-1.5 inline-block font-semibold text-[#8B7CF6] hover:underline">
                      Open this appointment
                    </Link>
                  )}
                </div>
                {i < steps.length - 1 && <ArrowDown className="mx-auto my-1 size-4 text-muted-foreground" />}
              </li>
            );
          })}
        </ol>
      </div>

      <div className="pt-3 mt-4 border-t border-border/60 text-[10px] text-muted-foreground">
        {viewingOld ? "You are viewing a booking that was moved; the latest booking is at the bottom." : "Each move cancels the earlier booking and issues a new token."}
      </div>
    </div>
  );
}
