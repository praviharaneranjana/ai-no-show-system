import Link from "next/link";
import {
  CalendarDays,
  AlertTriangle,
  CalendarCheck,
  Percent,
  PlusCircle,
  TrendingUp,
  Clock,
} from "lucide-react";

import { getAppointmentsWithPredictions } from "@/lib/appointments-with-predictions";
import { listDoctorSessions } from "@/lib/api";
import { BackendUnreachable } from "@/components/backend-unreachable";
import { AppointmentsTable } from "@/components/appointments-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { RiskCategory } from "@/lib/types";

export default async function DashboardPage() {
  let records, doctorSessions;
  try {
    [records, doctorSessions] = await Promise.all([
      getAppointmentsWithPredictions(),
      listDoctorSessions(),
    ]);
  } catch (err) {
    return <BackendUnreachable error={err} />;
  }

  const todayStr = new Date().toISOString().slice(0, 10);

  // Derive KPIs
  const totalUpcoming = records.filter(
    (r) => r.appointment.appointment_day >= todayStr && r.appointment.no_show === null
  );

  const highRiskUpcoming = totalUpcoming.filter(
    (r) => r.prediction?.risk_category === "High"
  );

  const todayAppointments = records.filter(
    (r) => r.appointment.appointment_day === todayStr
  );

  const recordedOutcomes = records.filter((r) => r.appointment.no_show !== null);
  const noShows = recordedOutcomes.filter((r) => r.appointment.no_show === true).length;
  const noShowRate =
    recordedOutcomes.length > 0 ? (noShows / recordedOutcomes.length) * 100 : null;

  // Risk distribution breakdown
  const predicted = records.filter((r) => r.prediction);
  const categoryCounts: Record<RiskCategory, number> = { Low: 0, Medium: 0, High: 0 };
  for (const r of predicted) {
    categoryCounts[r.prediction!.risk_category] += 1;
  }

  const highPct = predicted.length > 0 ? Math.round((categoryCounts.High / predicted.length) * 100) : 0;
  const medPct = predicted.length > 0 ? Math.round((categoryCounts.Medium / predicted.length) * 100) : 0;
  const lowPct = predicted.length > 0 ? Math.round((categoryCounts.Low / predicted.length) * 100) : 0;

  return (
    <div className="flex w-full flex-col gap-6 p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/80 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Clinical Triage & Appointments
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Monitor patient attendance risk, prioritize outreach calls, and record visit outcomes.
          </p>
        </div>

        <Button
          variant="default"
          size="sm"
          className="gap-2 shadow-xs shrink-0"
          nativeButton={false}
          render={
            <Link href="/new">
              <PlusCircle className="size-4" />
              <span>New Appointment</span>
            </Link>
          }
        />
      </div>

      {/* Consultant Punctuality Status Bar */}
      {doctorSessions.length > 0 && (
        <div className="flex flex-wrap gap-2.5">
          {doctorSessions.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-2 rounded-lg border border-border/70 bg-card px-3 py-2"
            >
              <Clock className="size-3.5 text-muted-foreground shrink-0" />
              <div className="flex flex-col">
                <span className="text-xs font-medium text-foreground leading-tight">
                  {s.doctor_name}
                </span>
                <span className="text-[10px] text-muted-foreground leading-tight">
                  {s.specialty} · {s.scheduled_start_time}
                </span>
              </div>
              {s.status === "delayed" ? (
                <Badge
                  variant="outline"
                  className="ml-1 shrink-0 border-red-500/40 bg-red-500/10 text-red-700 dark:border-red-500/50 dark:bg-red-950/40 dark:text-red-300"
                >
                  +{s.delay_minutes}m late
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="ml-1 shrink-0 border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:border-emerald-500/50 dark:bg-emerald-950/40 dark:text-emerald-300"
                >
                  On time
                </Badge>
              )}
            </div>
          ))}
        </div>
      )}

      {/* KPI Stat Cards Grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* KPI 1: Total Upcoming */}
        <Card className="border-border/80 shadow-xs">
          <CardContent className="flex items-center justify-between p-4">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">
                Upcoming Appointments
              </span>
              <span className="text-2xl font-bold tracking-tight tabular-nums text-foreground">
                {totalUpcoming.length}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {records.length} total scheduled
              </span>
            </div>
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <CalendarDays className="size-5" />
            </div>
          </CardContent>
        </Card>

        {/* KPI 2: High Risk Triage (URGENT) */}
        <Card className="border-red-500/30 bg-red-500/[0.04] dark:bg-red-950/20 shadow-xs">
          <CardContent className="flex items-center justify-between p-4">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-red-700 dark:text-red-300 flex items-center gap-1">
                <AlertTriangle className="size-3.5" />
                High-Risk Triage
              </span>
              <span className="text-2xl font-bold tracking-tight tabular-nums text-red-700 dark:text-red-300">
                {highRiskUpcoming.length}
              </span>
              <span className="text-[11px] text-red-600/80 dark:text-red-400/80">
                {totalUpcoming.length > 0
                  ? `${Math.round((highRiskUpcoming.length / totalUpcoming.length) * 100)}% of upcoming schedule`
                  : "Requires outreach"}
              </span>
            </div>
            <div className="flex size-10 items-center justify-center rounded-xl bg-red-500/20 text-red-600 dark:text-red-300">
              <AlertTriangle className="size-5" />
            </div>
          </CardContent>
        </Card>

        {/* KPI 3: Today's Clinic */}
        <Card className="border-border/80 shadow-xs">
          <CardContent className="flex items-center justify-between p-4">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">
                Today&apos;s Schedule
              </span>
              <span className="text-2xl font-bold tracking-tight tabular-nums text-foreground">
                {todayAppointments.length}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {todayAppointments.filter((r) => r.appointment.no_show !== null).length} of {todayAppointments.length} outcomes recorded
              </span>
            </div>
            <div className="flex size-10 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
              <CalendarCheck className="size-5" />
            </div>
          </CardContent>
        </Card>

        {/* KPI 4: Historical No-Show Rate */}
        <Card className="border-border/80 shadow-xs">
          <CardContent className="flex items-center justify-between p-4">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">
                Historical No-Show Rate
              </span>
              <span className="text-2xl font-bold tracking-tight tabular-nums text-foreground">
                {noShowRate !== null ? `${noShowRate.toFixed(1)}%` : "—"}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {recordedOutcomes.length > 0
                  ? `${noShows} of ${recordedOutcomes.length} visits missed`
                  : "No outcomes recorded"}
              </span>
            </div>
            <div className="flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <Percent className="size-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Risk Distribution Bar Banner */}
      {predicted.length > 0 && (
        <Card className="border-border/80 bg-card p-4 shadow-xs">
          <div className="flex flex-col gap-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-1.5 font-medium text-foreground">
                <TrendingUp className="size-3.5 text-primary" />
                <span>Overall Predicted Risk Distribution</span>
                <span className="text-muted-foreground font-normal">
                  ({predicted.length} patients assessed by AI)
                </span>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <span className="flex items-center gap-1.5 font-medium text-red-600 dark:text-red-400">
                  <span className="size-2.5 rounded-full bg-red-500" />
                  High: {categoryCounts.High} ({highPct}%)
                </span>
                <span className="flex items-center gap-1.5 font-medium text-amber-600 dark:text-amber-400">
                  <span className="size-2.5 rounded-full bg-amber-500" />
                  Medium: {categoryCounts.Medium} ({medPct}%)
                </span>
                <span className="flex items-center gap-1.5 font-medium text-emerald-600 dark:text-emerald-400">
                  <span className="size-2.5 rounded-full bg-emerald-500" />
                  Low: {categoryCounts.Low} ({lowPct}%)
                </span>
              </div>
            </div>

            {/* Segmented Bar */}
            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-red-500 transition-all"
                style={{ width: `${highPct}%` }}
                title={`High risk: ${highPct}%`}
              />
              <div
                className="h-full bg-amber-500 transition-all"
                style={{ width: `${medPct}%` }}
                title={`Medium risk: ${medPct}%`}
              />
              <div
                className="h-full bg-emerald-500 transition-all"
                style={{ width: `${lowPct}%` }}
                title={`Low risk: ${lowPct}%`}
              />
            </div>
          </div>
        </Card>
      )}

      {/* Main Appointments Table */}
      <AppointmentsTable records={records} />
    </div>
  );
}
