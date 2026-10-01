"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  CalendarDays,
  AlertTriangle,
  Clock,
  CheckCircle2,
} from "lucide-react";

import type { AppointmentRecord } from "@/lib/appointments-with-predictions";
import type { ActivityResponse, DoctorSession, RegisterResponse, TrendResponse } from "@/lib/types";
import { StatCard } from "@/components/stat-card";
import { AvatarRow } from "@/components/avatar-row";
import { DotRingGauge } from "@/components/dot-ring-gauge";
import { RingProgress } from "@/components/ring-progress";
import { ShapDriverBars } from "@/components/shap-driver-bars";
import { JourneyMap } from "@/components/journey-map";
import { useStaffName } from "@/components/use-staff-name";
import { ROI_SIMULATOR_DEFAULTS } from "@/lib/roi";
import { NoShowTrendChart } from "@/components/charts/no-show-trend-chart";
import { AppointmentRows } from "@/components/appointment-rows";
import { INTERVENTION_STATUS_LABEL, LANGUAGE_LABEL, timeAgo } from "@/lib/format";

interface DashboardBentoProps {
  records: AppointmentRecord[];
  doctorSessions: DoctorSession[];
  trend: TrendResponse | null;
  activity: ActivityResponse | null;
  /** Top of the appointment register (10 rows, highest risk first) + tab counts. */
  register: RegisterResponse | null;
}

// Small "open this screen" affordance used in every card header.
function CardLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-xs font-semibold text-[#8B7CF6] hover:underline"
    >
      {label}
      <ArrowUpRight className="size-3" />
    </Link>
  );
}

// Revenue per predicted no-show: standard consultation fee + ancillary revenue (same
// assumptions as the ROI simulator, see lib/roi.ts).
const ANCILLARY_MULTIPLIER = 1.6;
const DAY_MS = 86_400_000;

// Local calendar date as YYYY-MM-DD (en-CA formats that way), offset by whole days.
function localDay(offsetDays = 0): string {
  return new Date(Date.now() + offsetDays * DAY_MS).toLocaleDateString("en-CA");
}

export function DashboardBento({ records, doctorSessions, trend, activity, register }: DashboardBentoProps) {
  const staffName = useStaffName();
  const todayStr = localDay(0);

  // Derive metrics
  const totalUpcoming = records.filter(
    (r) => r.appointment.appointment_day >= todayStr && r.appointment.no_show === null
  );

  const highRiskUpcoming = totalUpcoming.filter(
    (r) => r.prediction?.risk_category === "High"
  );

  const todayAppointments = records.filter(
    (r) => r.appointment.appointment_day === todayStr
  );

  // Worklist (High then Medium risk upcoming)
  const worklist = totalUpcoming
    .filter((r) => r.prediction && (r.prediction.risk_category === "High" || r.prediction.risk_category === "Medium"))
    .sort((a, b) => {
      if (a.prediction?.risk_category !== b.prediction?.risk_category) {
        return a.prediction?.risk_category === "High" ? -1 : 1;
      }
      return (b.prediction?.risk_score || 0) - (a.prediction?.risk_score || 0);
    });

  // Selected patient state (defaults to top worklist item or first record)
  const [selectedId, setSelectedId] = useState<string>(
    worklist[0]?.appointment.id || records[0]?.appointment.id || ""
  );

  const selectedRecord =
    records.find((r) => r.appointment.id === selectedId) ||
    worklist[0] ||
    records[0];

  // Real per-day series for the stat cards (no placeholder data).
  const countOn = (day: string) => records.filter((r) => r.appointment.appointment_day === day).length;
  const pastSix = [-5, -4, -3, -2, -1, 0].map((o) => countOn(localDay(o)));
  const maxPast = Math.max(...pastSix, 1);
  const yesterdayCount = pastSix[4];
  const todayCount = pastSix[5];

  // Expected no-shows = sum of calibrated risk over the next 7 days (still awaiting an outcome).
  const nextSevenDays = Array.from({ length: 7 }, (_, i) => localDay(i));
  const expectedOn = (day: string) =>
    records
      .filter((r) => r.appointment.appointment_day === day && r.appointment.no_show === null)
      .reduce((sum, r) => sum + (r.prediction?.risk_score ?? 0), 0);
  const expectedPerDay = nextSevenDays.map(expectedOn);
  const expectedNoShows = expectedPerDay.reduce((a, b) => a + b, 0);
  const bookedNextSeven = records.filter(
    (r) => nextSevenDays.includes(r.appointment.appointment_day) && r.appointment.no_show === null
  ).length;

  const feeLkr = ROI_SIMULATOR_DEFAULTS.avg_consultation_fee_lkr;
  const revenueAtRiskLkr = expectedNoShows * feeLkr * ANCILLARY_MULTIPLIER;
  const revenuePerDay = expectedPerDay.map((e) => e * feeLkr * ANCILLARY_MULTIPLIER);
  const maxRevenueDay = Math.max(...revenuePerDay, 1);

  // Capacity load: today's booked appointments vs the combined capacity of today's doctor sessions.
  const todaysSessions = doctorSessions.filter((x) => x.session_date === todayStr);
  const todayCapacity = todaysSessions.reduce((sum, x) => sum + x.max_capacity, 0);
  const capacityPct = todayCapacity > 0 ? Math.min(Math.round((todayAppointments.length / todayCapacity) * 100), 100) : null;

  const highRiskToday = todayAppointments.filter((r) => r.prediction?.risk_category === "High").length;
  const highRiskNextSeven = highRiskUpcoming.filter((r) =>
    nextSevenDays.includes(r.appointment.appointment_day)
  ).length;

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 lg:p-8">
      {/* Header Row (Dropify & Peymen Reference) */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-extrabold text-foreground tracking-tight sm:text-3xl">
            Welcome back{staffName ? `, ${staffName}` : ""}!
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 flex flex-wrap items-center gap-2">
            <span>
              <strong className="text-[#E11D48] font-bold">
                {highRiskToday} high-risk {highRiskToday === 1 ? "appointment" : "appointments"}
              </strong>{" "}
              today
            </span>
            <span className="size-1 rounded-full bg-muted-foreground/60" />
            <span>{highRiskNextSeven} high-risk in the next 7 days</span>
          </p>
        </div>

      </header>

      {/* Consultant Punctuality Status Strip */}
      {doctorSessions.length > 0 && (
        <div className="flex items-center gap-2.5 overflow-x-auto rounded-[20px] border border-border bg-card p-3 shadow-xs">
          <div className="flex items-center gap-1.5 pl-1 pr-2 text-xs font-bold text-muted-foreground shrink-0">
            <Clock className="size-4 text-[#8B7CF6]" />
            <span>Clinic Sessions:</span>
          </div>

          <div className="flex items-center gap-2">
            {doctorSessions.map((s) => (
              <Link
                key={s.id}
                href={`/sessions/${s.id}`}
                title="Open session detail"
                className="flex items-center gap-2 rounded-xl bg-muted/60 px-3 py-1.5 text-xs shrink-0 transition-colors hover:bg-[#8B7CF6]/10"
              >
                <div className="flex flex-col">
                  <span className="font-bold text-foreground leading-tight">
                    {s.doctor_name}
                  </span>
                  <span className="text-[10px] text-muted-foreground leading-tight">
                    {s.specialty} · {s.scheduled_start_time}
                  </span>
                </div>
                {s.status === "delayed" ? (
                  <span className="rounded-md bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-600 dark:bg-rose-950/40 dark:text-rose-400">
                    +{s.delay_minutes}m late
                  </span>
                ) : (
                  <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
                    On time
                  </span>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ROW 1: 3 STAT CARDS — every number and chart below is computed from real records */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-5">
        <StatCard
          label="Today's Appointments"
          value={todayCount}
          subvalue={`${totalUpcoming.length} upcoming`}
          delta={
            yesterdayCount > 0
              ? `${todayCount >= yesterdayCount ? "↑" : "↓"} ${Math.abs(
                  Math.round(((todayCount - yesterdayCount) / yesterdayCount) * 100)
                )}% vs yesterday`
              : undefined
          }
          deltaDirection={todayCount >= yesterdayCount ? "up" : "down"}
          icon={<CalendarDays className="size-5" />}
          href="/appointments?view=today"
          chartType="bars"
          barValues={pastSix.map((c) => (c / maxPast) * 100)}
        />

        <StatCard
          label="Expected No-Shows · 7 days"
          value={Math.round(expectedNoShows)}
          subvalue={`(${bookedNextSeven > 0 ? Math.round((expectedNoShows / bookedNextSeven) * 100) : 0}% of ${bookedNextSeven})`}
          icon={<AlertTriangle className="size-5 text-rose-400" />}
          href="/appointments?view=upcoming&window_days=7&risk=High"
          chartType="sparkline"
          sparklineData={expectedPerDay}
        />

        <StatCard
          label="Revenue at Risk · 7 days"
          value={`Rs. ${(revenueAtRiskLkr / 1000).toFixed(0)}k`}
          icon={<span className="font-bold text-xs tracking-tight text-[#8B7CF6]">LKR</span>}
          href="/revenue-at-risk"
          chartType="bars"
          barValues={revenuePerDay.slice(0, 6).map((v) => (v / maxRevenueDay) * 100)}
        />
      </section>

      {/* ROW 2: BENTO CORE GRID (12 Columns) */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* CARD 1: PRIORITY WORKLIST (4 cols) */}
        <div className="lg:col-span-4 rounded-[24px] border border-border bg-card p-5 bento-card-shadow flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3.5 border-b border-border/60">
              <div>
                <h2 className="font-heading text-base font-bold text-foreground">
                  Priority Worklist
                </h2>
                <p className="text-[11px] text-muted-foreground">
                  Urgent high-risk front-desk outreach
                </p>
              </div>
              <CardLink href="/worklist" label="View all" />
            </div>

            <div className="flex flex-col gap-2 mt-3.5 max-h-[340px] overflow-y-auto pr-0.5">
              {worklist.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  <CheckCircle2 className="size-7 mx-auto text-emerald-500 mb-1" />
                  All caught up! No urgent high-risk patients.
                </div>
              ) : (
                worklist.slice(0, 5).map(({ appointment, patient, prediction }) => {
                  const isSelected = appointment.id === selectedId;
                  return (
                    <AvatarRow
                      key={appointment.id}
                      name={patient?.full_name || "Unknown Patient"}
                      meta={`${appointment.department || "General"} · ${appointment.scheduled_time || appointment.appointment_day}`}
                      riskCategory={prediction?.risk_category || "Low"}
                      riskScore={prediction?.risk_score || 0}
                      phone={patient?.phone}
                      href={`/appointments/${appointment.id}`}
                      isSelected={isSelected}
                      onSelect={() => setSelectedId(appointment.id)}
                    />
                  );
                })
              )}
            </div>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-border/60 text-[11px] text-muted-foreground">
            <span>Showing top {Math.min(worklist.length, 5)} of {worklist.length}</span>
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
              {records.filter((r) => r.appointment.sms_received).length} reminder SMS active
            </span>
          </div>
        </div>

        {/* CARD 2: SELECTED PATIENT TRIAGE & DOT-RING GAUGE (4 cols) */}
        <div className="lg:col-span-4 rounded-[24px] border border-border bg-card p-5 bento-card-shadow flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-border/60">
              <div>
                <h2 className="font-heading text-base font-bold text-foreground">
                  Patient Triage Assessment
                </h2>
                <p className="text-[11px] text-muted-foreground">
                  {selectedRecord?.patient?.full_name || "Selected Patient"}
                </p>
              </div>
              {selectedRecord ? (
                <CardLink href={`/appointments/${selectedRecord.appointment.id}`} label="Open record" />
              ) : null}
            </div>

            {/* Quick Chips (Age, Prior No-Shows, Lead Time) */}
            <div className="grid grid-cols-3 gap-2 mt-3.5 text-center">
              <div className="rounded-2xl border border-border/60 bg-[#F9F9FC] p-2 dark:bg-[#252538]">
                <span className="text-[10px] font-medium text-muted-foreground block">Age</span>
                <span className="font-bold text-sm text-foreground">
                  {selectedRecord?.patient?.date_of_birth
                    ? `${new Date().getFullYear() - new Date(selectedRecord.patient.date_of_birth).getFullYear()}y`
                    : "—"}
                </span>
              </div>

              <div className="rounded-2xl border border-border/60 bg-[#F9F9FC] p-2 dark:bg-[#252538]">
                <span className="text-[10px] font-medium text-muted-foreground block">Distance</span>
                <span className="font-bold text-sm text-foreground">
                  {selectedRecord?.patient?.distance_km ? `${selectedRecord.patient.distance_km} km` : "—"}
                </span>
              </div>

              <div className="rounded-2xl border border-border/60 bg-[#F9F9FC] p-2 dark:bg-[#252538]">
                <span className="text-[10px] font-medium text-muted-foreground block">Channel</span>
                <span className="font-bold text-xs text-foreground truncate block">
                  {selectedRecord?.appointment.booking_channel || "Counter"}
                </span>
              </div>
            </div>

            {/* Dropify-style Segmented Dot-Ring Risk Gauge */}
            <div className="my-2 flex justify-center">
              <DotRingGauge
                score={selectedRecord?.prediction?.risk_score || 0.15}
                category={selectedRecord?.prediction?.risk_category || "Low"}
                size={140}
              />
            </div>

            {/* Top 3 SHAP Drivers */}
            <div className="mt-1">
              <ShapDriverBars
                contributions={selectedRecord?.prediction?.explanation || []}
                limit={3}
              />
            </div>
          </div>

          <div className="pt-3 border-t border-border/60 flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">Action recommendation:</span>
            <span className="font-bold text-[#8B7CF6] truncate max-w-[200px]" title={selectedRecord?.prediction?.recommendation || "Standard reminder"}>
              {selectedRecord?.prediction?.recommendation || "Standard reminder"}
            </span>
          </div>
        </div>

        {/* CARD 3: PATIENT JOURNEY MAP (4 cols) (§5) */}
        <div className="lg:col-span-4 rounded-[24px] border border-border bg-card p-5 bento-card-shadow flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-border/60">
              <div>
                <h2 className="font-heading text-base font-bold text-foreground">
                  Patient Journey Map
                </h2>
                <p className="text-[11px] text-muted-foreground">
                  Distance → risk impact telemetry
                </p>
              </div>
              <CardLink href="/map" label="Patient map" />
            </div>

            {/* Journey Map Component */}
            <div className="mt-3.5">
              <JourneyMap
                patientName={selectedRecord?.patient?.full_name || "Patient"}
                city={selectedRecord?.patient?.city}
                distanceKm={selectedRecord?.patient?.distance_km}
                latitude={selectedRecord?.patient?.latitude}
                longitude={selectedRecord?.patient?.longitude}
                contributions={selectedRecord?.prediction?.explanation || []}
              />
            </div>
          </div>

          <div className="pt-3 border-t border-border/60 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Base: Colombo General Hospital</span>
            <span className="font-semibold text-[#8B7CF6]">Town-level location</span>
          </div>
        </div>

      </section>

      {/* ROW 3: BENTO LOWER ROW */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* Trend Area Chart (6 cols) */}
        <div className="lg:col-span-6 rounded-[24px] border border-border bg-card p-5 bento-card-shadow flex flex-col justify-between">
          <NoShowTrendChart initial={trend} compact />
        </div>

        {/* Capacity Utilization Ring (3 cols) */}
        <div className="lg:col-span-3 rounded-[24px] border border-border bg-card p-5 bento-card-shadow flex flex-col items-center justify-between text-center">
          <div className="w-full flex items-center justify-between pb-3 border-b border-border/60">
            <div>
              <h3 className="font-heading text-base font-bold text-foreground text-left">
                Capacity Load
              </h3>
              <p className="text-[11px] text-muted-foreground text-left">
                Today vs doctor-session capacity
              </p>
            </div>
            <CardLink href="/capacity" label="Details" />
          </div>

          <Link href="/capacity" className="my-4 block" aria-label="Open capacity planning">
            {capacityPct === null ? (
              <p className="max-w-[160px] py-8 text-xs text-muted-foreground">No doctor sessions scheduled today.</p>
            ) : (
              <RingProgress value={capacityPct} label="Booked" size={120} strokeWidth={9} color="#8B7CF6" />
            )}
          </Link>

          <div className="w-full pt-3 border-t border-border/60 flex items-center justify-between text-xs font-medium">
            <span className="text-muted-foreground">Booked today / capacity</span>
            <span className="font-bold text-foreground">
              {todayAppointments.length} / {todayCapacity}
            </span>
          </div>
        </div>

        {/* Autonomous Outreach Feed (3 cols) */}
        <div className="lg:col-span-3 rounded-[24px] border border-border bg-card p-5 bento-card-shadow flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-border/60">
              <div>
                <h3 className="font-heading text-base font-bold text-foreground">
                  Outreach Activity
                </h3>
                <p className="text-[11px] text-muted-foreground">
                  Latest patient conversations
                </p>
              </div>
              <CardLink href="/outreach" label="Open hub" />
            </div>

            <div className="mt-3.5 space-y-3">
              {!activity || activity.items.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">
                  {activity ? "No outreach conversations yet." : "Couldn’t load outreach activity."}
                </p>
              ) : (
                activity.items.slice(0, 4).map((a) => {
                  const resolved = a.status !== "sent";
                  return (
                    <Link
                      key={a.id}
                      href={`/appointments/${a.appointment_id}`}
                      className="flex items-start gap-2.5 rounded-lg text-xs transition-colors hover:bg-muted/50"
                    >
                      <div
                        className={
                          resolved
                            ? "flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400"
                            : "flex size-7 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400"
                        }
                      >
                        {resolved ? <CheckCircle2 className="size-3.5" /> : <Clock className="size-3.5" />}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate font-bold text-foreground">
                          {INTERVENTION_STATUS_LABEL[a.status] ?? a.status}
                        </div>
                        <div className="truncate text-[10px] text-muted-foreground">
                          {a.patient_name} ({LANGUAGE_LABEL[a.language] ?? a.language}) · {timeAgo(a.created_at)}
                        </div>
                      </div>
                    </Link>
                  );
                })
              )}
            </div>
          </div>

          <div className="pt-3 border-t border-border/60 flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">Agent Resolution Rate:</span>
            <span className="font-bold text-[#8B7CF6]">
              {activity?.resolution_rate != null ? `${activity.resolution_rate.toFixed(1)}%` : "—"}
            </span>
          </div>
        </div>

      </section>

      {/* APPOINTMENT REGISTER PREVIEW — top 10 by risk; the full register lives on /appointments */}
      <section className="rounded-[24px] border border-border bg-card p-5 bento-card-shadow">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-heading text-lg font-bold text-foreground">
              Master Appointment Register
            </h2>
            <p className="text-xs text-muted-foreground">
              Highest-risk upcoming appointments first
            </p>
          </div>
          {register && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs font-medium">
              {[
                { label: "All", n: register.counts.all, href: "/appointments" },
                { label: "High risk", n: register.counts.high_risk, href: "/appointments?view=high_risk" },
                { label: "Today", n: register.counts.today, href: "/appointments?view=today" },
                { label: "Pending outcome", n: register.counts.pending_outcome, href: "/appointments?view=pending_outcome" },
              ].map((t) => (
                <Link
                  key={t.label}
                  href={t.href}
                  className="flex items-center gap-1.5 rounded-full bg-muted/60 px-3 py-1.5 text-muted-foreground transition-colors hover:bg-[#8B7CF6]/10 hover:text-foreground"
                >
                  {t.label}
                  <span className="rounded-full bg-background px-1.5 text-[10px] font-bold tabular-nums">{t.n}</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {!register || register.items.length === 0 ? (
          <p className="py-10 text-center text-xs text-muted-foreground">
            {register ? "No upcoming appointments." : "Couldn’t load the appointment register."}
          </p>
        ) : (
          <>
            <div className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-xs">
              <AppointmentRows
                records={register.items.map((r) => ({
                  appointment: r.appointment,
                  patient: r.patient ?? undefined,
                  prediction: r.prediction ?? undefined,
                }))}
              />
            </div>
            <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Showing {register.items.length} of {register.total.toLocaleString()} matching appointments
              </span>
              <Link
                href="/appointments"
                className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-[#8B7CF6] to-[#5B7CFA] px-4 py-2 text-xs font-bold text-white shadow-md shadow-[#8B7CF6]/25 hover:opacity-95"
              >
                View all {register.counts.all.toLocaleString()} appointments
                <ArrowUpRight className="size-3.5" />
              </Link>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
