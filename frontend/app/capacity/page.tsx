import {
  Gauge,
  Layers,
  AlertTriangle,
  TrendingUp,
  Wallet,
  Clock,
  CalendarDays,
  ListPlus,
  Sparkles,
} from "lucide-react";

import { getWaitlist, listDoctorSessions, optimizeCapacity } from "@/lib/api";
import { BackendUnreachable } from "@/components/backend-unreachable";
import { WaitlistPanel } from "@/app/capacity/waitlist-panel";
import { DoctorSessionPanel } from "@/app/capacity/doctor-session-panel";
import { StatCard } from "@/components/stat-card";
import { RingProgress } from "@/components/ring-progress";
import { formatLkr } from "@/lib/utils";
import { requireRole } from "@/lib/session";

const RISK_BADGES: Record<string, string> = {
  Safe: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20",
  Moderate: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20",
  Caution: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20",
};

export default async function CapacityPage() {
  await requireRole("manager");
  let sessions, waitlist, optimization;
  try {
    [sessions, waitlist, optimization] = await Promise.all([
      listDoctorSessions(),
      getWaitlist(),
      optimizeCapacity(),
    ]);
  } catch (err) {
    return <BackendUnreachable error={err} />;
  }

  return (
    <div className="flex w-full flex-col gap-6 p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-border/40">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2.5">
            <div className="size-9 rounded-xl bg-gradient-to-tr from-[#8B7CF6] to-[#5B7CFA] flex items-center justify-center text-white shadow-xs">
              <Gauge className="size-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                Capacity & Smart Overbooking
              </h1>
            </div>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Prescriptive engine: safe overbooking recommendations per consultant session, with real-time waitlist backfilling.
          </p>
        </div>

        <div className="inline-flex items-center gap-2 self-start md:self-auto px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium">
          <Sparkles className="size-3.5" />
          <span>Heuristic Optimizer · Constrained Delay &lt;20m</span>
        </div>
      </div>

      {/* KPI Row (5 StatCards) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 2xl:grid-cols-5 gap-3.5">
        <StatCard
          title="Total Capacity"
          value={optimization.total_capacity}
          icon={Layers}
        />
        <StatCard
          title="Total Booked"
          value={optimization.total_booked}
          icon={CalendarDays}
        />
        <StatCard
          title="Predicted No-Shows"
          value={optimization.total_predicted_no_shows}
          icon={AlertTriangle}
          delta={{ value: "High risk slots", isPositive: false }}
        />
        <StatCard
          title="Safe Overbooks"
          value={`+${optimization.total_recommended_overbooks}`}
          icon={TrendingUp}
          delta={{ value: "Buffered capacity", isPositive: true }}
        />
        <StatCard
          title="Revenue Recovery"
          value={formatLkr(optimization.estimated_revenue_recovery_lkr)}
          icon={Wallet}
          delta={{ value: "Estimated upside", isPositive: true }}
        />
      </div>

      {/* Doctor Punctuality Bar */}
      <div className="rounded-[24px] bg-card p-5 sm:p-6 shadow-xs border border-border/60 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <Clock className="size-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">Consultant Session Status</h2>
              <p className="text-xs text-muted-foreground">
                Live punctuality telemetry — automatically scales queue delay tolerance for slot recommendations.
              </p>
            </div>
          </div>
        </div>
        <DoctorSessionPanel sessions={sessions} />
      </div>

      {/* Session Optimization Bento Cards */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-foreground">Session Recommendations</h2>
            <p className="text-xs text-muted-foreground">Calibrated slot buffering adjusted for specialist consultation pace</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4">
          {optimization.sessions.map((s, idx) => {
            const utilizationPct = Math.min(
              100,
              Math.round((s.total_booked / Math.max(s.total_booked + s.recommended_overbook_count, 1)) * 100)
            );

            return (
              <div
                key={idx}
                className="rounded-[24px] bg-card p-5 shadow-xs border border-border/60 hover:shadow-md hover:border-border transition-all flex flex-col justify-between gap-4"
              >
                <div className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-col">
                      <span className="font-bold text-foreground text-base">{s.doctor_name}</span>
                      <span className="text-xs text-muted-foreground">
                        {s.specialty} · Room {s.room_number}
                      </span>
                    </div>
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        RISK_BADGES[s.risk_level] ?? RISK_BADGES.Safe
                      }`}
                    >
                      {s.risk_level}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 py-2 border-y border-border/40">
                    <div className="shrink-0 flex items-center justify-center">
                      <RingProgress
                        value={utilizationPct}
                        max={100}
                        size={64}
                        strokeWidth={6}
                        label="Util"
                        sublabel=""
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2 flex-1 text-center">
                      <div className="flex flex-col rounded-xl bg-muted/30 p-2">
                        <span className="text-xs text-muted-foreground font-medium">Booked</span>
                        <span className="text-sm font-bold tabular-nums text-foreground">{s.total_booked}</span>
                      </div>
                      <div className="flex flex-col rounded-xl bg-muted/30 p-2">
                        <span className="text-xs text-muted-foreground font-medium">No-Shows</span>
                        <span className="text-sm font-bold tabular-nums text-rose-600 dark:text-rose-400">
                          {s.predicted_no_shows}
                        </span>
                      </div>
                      <div className="flex flex-col rounded-xl bg-primary/10 p-2 border border-primary/20">
                        <span className="text-xs text-primary font-medium">Overbook</span>
                        <span className="text-sm font-bold tabular-nums text-primary">
                          +{s.recommended_overbook_count}
                        </span>
                      </div>
                      <div className="flex flex-col rounded-xl bg-muted/30 p-2">
                        <span className="text-xs text-muted-foreground font-medium">Wait Est.</span>
                        <span className="text-sm font-bold tabular-nums text-foreground">
                          {s.expected_wait_time_mins}m
                        </span>
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground leading-relaxed">{s.status_advice}</p>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-border/40">
                  <span className="text-xs text-muted-foreground font-medium">Est. Revenue Upside</span>
                  <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                    +{formatLkr(s.expected_revenue_gain_lkr)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Waitlist Backfill Bento Card */}
      <div className="rounded-[24px] bg-card p-5 sm:p-6 shadow-xs border border-border/60 flex flex-col gap-4">
        <div className="flex items-center justify-between pb-2 border-b border-border/40">
          <div className="flex items-center gap-2.5">
            <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <ListPlus className="size-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">Live Waitlist Backfill</h2>
              <p className="text-xs text-muted-foreground">
                Priority-ranked standby queue. Dispatch open slots dynamically when no-shows are flagged.
              </p>
            </div>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-muted text-muted-foreground">
            {waitlist.length} Waiting
          </span>
        </div>

        <WaitlistPanel entries={waitlist} />
      </div>
    </div>
  );
}
