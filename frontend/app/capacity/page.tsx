import {
  Gauge,
  Layers,
  AlertTriangle,
  TrendingUp,
  Wallet,
  Clock,
  Stethoscope,
  ListPlus,
} from "lucide-react";

import { getWaitlist, listDoctorSessions, optimizeCapacity } from "@/lib/api";
import { BackendUnreachable } from "@/components/backend-unreachable";
import { WaitlistPanel } from "@/app/capacity/waitlist-panel";
import { DoctorSessionPanel } from "@/app/capacity/doctor-session-panel";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatLkr } from "@/lib/utils";

const RISK_STYLES: Record<string, string> = {
  Safe: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:border-emerald-500/50 dark:bg-emerald-950/40 dark:text-emerald-300",
  Moderate:
    "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:border-amber-500/50 dark:bg-amber-950/40 dark:text-amber-300",
  Caution: "border-red-500/40 bg-red-500/10 text-red-700 dark:border-red-500/50 dark:bg-red-950/40 dark:text-red-300",
};

export default async function CapacityPage() {
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
    <div className="flex w-full flex-col gap-6 p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col gap-1 border-b border-border/80 pb-5">
        <div className="flex items-center gap-2">
          <Gauge className="size-5 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Capacity & Smart Overbooking
          </h1>
        </div>
        <p className="text-xs sm:text-sm text-muted-foreground">
          Prescriptive engine: safe overbooking recommendations per consultant session, with
          real-time waitlist backfilling.{" "}
          <span className="text-muted-foreground/70">
            Heuristic optimizer — constrained by a max wait-time tolerance, not a full MIP/RL solve.
          </span>
        </p>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Card className="border-border/80 shadow-xs">
          <CardContent className="flex items-center justify-between p-4">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Total Capacity</span>
              <span className="text-xl font-bold tracking-tight tabular-nums text-foreground">
                {optimization.total_capacity}
              </span>
            </div>
            <Layers className="size-5 text-muted-foreground" />
          </CardContent>
        </Card>

        <Card className="border-border/80 shadow-xs">
          <CardContent className="flex items-center justify-between p-4">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Total Booked</span>
              <span className="text-xl font-bold tracking-tight tabular-nums text-foreground">
                {optimization.total_booked}
              </span>
            </div>
            <Stethoscope className="size-5 text-muted-foreground" />
          </CardContent>
        </Card>

        <Card className="border-red-500/30 bg-red-500/[0.04] dark:bg-red-950/20 shadow-xs">
          <CardContent className="flex items-center justify-between p-4">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-red-700 dark:text-red-300">
                Predicted No-Shows
              </span>
              <span className="text-xl font-bold tracking-tight tabular-nums text-red-700 dark:text-red-300">
                {optimization.total_predicted_no_shows}
              </span>
            </div>
            <AlertTriangle className="size-5 text-red-600 dark:text-red-300" />
          </CardContent>
        </Card>

        <Card className="border-border/80 shadow-xs">
          <CardContent className="flex items-center justify-between p-4">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">
                Recommended Overbooks
              </span>
              <span className="text-xl font-bold tracking-tight tabular-nums text-foreground">
                +{optimization.total_recommended_overbooks}
              </span>
            </div>
            <TrendingUp className="size-5 text-primary" />
          </CardContent>
        </Card>

        <Card className="border-emerald-500/30 bg-emerald-500/[0.04] dark:bg-emerald-950/20 shadow-xs">
          <CardContent className="flex items-center justify-between p-4">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                Revenue Recovery
              </span>
              <span className="text-xl font-bold tracking-tight tabular-nums text-emerald-700 dark:text-emerald-300">
                {formatLkr(optimization.estimated_revenue_recovery_lkr)}
              </span>
            </div>
            <Wallet className="size-5 text-emerald-600 dark:text-emerald-300" />
          </CardContent>
        </Card>
      </div>

      {/* Doctor Punctuality Bar */}
      <Card className="border-border/80 shadow-xs">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Clock className="size-4 text-primary" />
            <CardTitle className="text-base">Consultant Session Status</CardTitle>
          </div>
          <CardDescription className="text-xs">
            Live punctuality feed — used to derive queue delay tolerance for overbooking.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-2">
          <DoctorSessionPanel sessions={sessions} />
        </CardContent>
      </Card>

      {/* Session Optimization Cards */}
      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-foreground">Session Optimization Recommendations</h2>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {optimization.sessions.map((s, idx) => (
            <Card key={idx} className="border-border/80 shadow-xs">
              <CardContent className="flex flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-col">
                    <span className="font-medium text-foreground text-sm">{s.doctor_name}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {s.specialty} · {s.room_number}
                    </span>
                  </div>
                  <Badge variant="outline" className={RISK_STYLES[s.risk_level] ?? ""}>
                    {s.risk_level}
                  </Badge>
                </div>

                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="flex flex-col rounded-md bg-muted/40 py-1.5">
                    <span className="text-sm font-bold tabular-nums text-foreground">{s.total_booked}</span>
                    <span className="text-[10px] text-muted-foreground">Booked</span>
                  </div>
                  <div className="flex flex-col rounded-md bg-muted/40 py-1.5">
                    <span className="text-sm font-bold tabular-nums text-foreground">{s.predicted_no_shows}</span>
                    <span className="text-[10px] text-muted-foreground">No-Shows</span>
                  </div>
                  <div className="flex flex-col rounded-md bg-muted/40 py-1.5">
                    <span className="text-sm font-bold tabular-nums text-primary">+{s.recommended_overbook_count}</span>
                    <span className="text-[10px] text-muted-foreground">Overbook</span>
                  </div>
                  <div className="flex flex-col rounded-md bg-muted/40 py-1.5">
                    <span className="text-sm font-bold tabular-nums text-foreground">{s.expected_wait_time_mins}m</span>
                    <span className="text-[10px] text-muted-foreground">Added Wait</span>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">{s.status_advice}</p>

                <div className="flex items-center justify-between border-t border-border/60 pt-2.5">
                  <span className="text-[11px] text-muted-foreground">Est. revenue gain</span>
                  <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                    {formatLkr(s.expected_revenue_gain_lkr)}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Waitlist Backfill Panel */}
      <Card className="border-border/80 shadow-xs">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <ListPlus className="size-4 text-primary" />
            <CardTitle className="text-base">Live Waitlist Backfill</CardTitle>
          </div>
          <CardDescription className="text-xs">
            Offer a vacated or overbooked slot to the next priority-ranked waitlisted patient.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <WaitlistPanel entries={waitlist} />
        </CardContent>
      </Card>
    </div>
  );
}
