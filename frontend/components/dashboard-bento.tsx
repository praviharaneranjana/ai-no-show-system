"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  AlertTriangle,
  Clock,
  Search,
  Bell,
  MessageSquare,
  Plus,
  CheckCircle2,
} from "lucide-react";

import type { AppointmentRecord } from "@/lib/appointments-with-predictions";
import type { DoctorSession } from "@/lib/types";
import { StatCard } from "@/components/stat-card";
import { AvatarRow } from "@/components/avatar-row";
import { DotRingGauge } from "@/components/dot-ring-gauge";
import { RingProgress } from "@/components/ring-progress";
import { ShapDriverBars } from "@/components/shap-driver-bars";
import { JourneyMap } from "@/components/journey-map";
import { NoShowTrendChart } from "@/components/charts/no-show-trend-chart";
import { AppointmentsTable } from "@/components/appointments-table";

interface DashboardBentoProps {
  records: AppointmentRecord[];
  doctorSessions: DoctorSession[];
}

export function DashboardBento({ records, doctorSessions }: DashboardBentoProps) {
  const todayStr = new Date().toISOString().slice(0, 10);

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

  const recordedOutcomes = records.filter((r) => r.appointment.no_show !== null);
  const noShows = recordedOutcomes.filter((r) => r.appointment.no_show === true).length;
  const noShowRate =
    recordedOutcomes.length > 0 ? (noShows / recordedOutcomes.length) * 100 : null;

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

  // Revenue at risk (using standard LKR consultation fee Rs. 4,500 + ancillary)
  const predictedCount = highRiskUpcoming.length;
  const revenueAtRiskLkr = predictedCount * 4500 * 1.6;

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 lg:p-8">
      {/* Header Row (Dropify & Peymen Reference) */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-extrabold text-foreground tracking-tight sm:text-3xl">
            Welcome back, Clinical Operations!
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 flex flex-wrap items-center gap-2">
            <span>
              You have{" "}
              <strong className="text-[#E11D48] font-bold">
                {highRiskUpcoming.length} high-risk appointments
              </strong>{" "}
              scheduled today.
            </span>
            <span className="size-1 rounded-full bg-muted-foreground/60" />
            <span>4 urgent front-desk interventions required</span>
          </p>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            aria-label="Search records"
            className="flex size-10 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-xs transition-colors hover:bg-muted"
          >
            <Search className="size-4" />
          </button>

          <button
            type="button"
            aria-label="Notifications"
            className="relative flex size-10 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-xs transition-colors hover:bg-muted"
          >
            <Bell className="size-4" />
            {highRiskUpcoming.length > 0 && (
              <span className="absolute top-2 right-2 size-2 rounded-full bg-[#E11D48] ring-2 ring-white dark:ring-[#1E1E2D]" />
            )}
          </button>

          <Link
            href="/outreach"
            aria-label="Outreach Messages"
            className="flex size-10 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-xs transition-colors hover:bg-muted"
          >
            <MessageSquare className="size-4" />
          </Link>

          {/* Primary Pill Gradient CTA */}
          <Link
            href="/new"
            className="ml-1 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#8B7CF6] to-[#5B7CFA] px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-[#8B7CF6]/25 transition-all hover:opacity-95 active:scale-98"
          >
            <Plus className="size-4 stroke-[2.5]" />
            <span>New appointment</span>
          </Link>
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
              <div
                key={s.id}
                className="flex items-center gap-2 rounded-xl bg-muted/60 px-3 py-1.5 text-xs shrink-0"
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
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ROW 1: 3 STAT CARDS (LKR & Sri Lankan Clinical Operations) */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-5">
        <StatCard
          label="Today's Appointments"
          value={todayAppointments.length}
          subvalue={`${records.length} total scheduled`}
          delta="↑ 25%"
          deltaDirection="up"
          icon={<CalendarDays className="size-5" />}
          chartType="bars"
          barValues={[35, 45, 55, 60, 50, 75]}
        />

        <StatCard
          label="Predicted No-Shows"
          value={highRiskUpcoming.length}
          subvalue={`(${totalUpcoming.length > 0 ? Math.round((highRiskUpcoming.length / totalUpcoming.length) * 100) : 0}%)`}
          delta="↓ 12%"
          deltaDirection="down"
          icon={<AlertTriangle className="size-5 text-rose-400" />}
          chartType="sparkline"
          sparklineData={[18, 16, 17, 15, 14, 13, 11]}
        />

        <StatCard
          label="Revenue at Risk (LKR)"
          value={`Rs. ${(revenueAtRiskLkr / 1000).toFixed(0)}k`}
          delta="+Rs. 24k"
          deltaDirection="down"
          icon={<span className="font-bold text-xs tracking-tight text-[#8B7CF6]">LKR</span>}
          chartType="bars"
          barValues={[50, 65, 55, 70, 60, 85]}
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
              <Link
                href="/appointments"
                className="text-xs font-semibold text-[#8B7CF6] hover:underline"
              >
                View all ›
              </Link>
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
              <span className="font-mono text-[10px] font-bold rounded-md bg-[#EDE9FE] px-2 py-0.5 text-[#8B7CF6] dark:bg-[#8B7CF6]/20 dark:text-[#C4B5FD]">
                #{selectedRecord?.appointment.id.slice(0, 8).toUpperCase() || "APPT"}
              </span>
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
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
                Carto Positron
              </span>
            </div>

            {/* Journey Map Component */}
            <div className="mt-3.5">
              <JourneyMap
                patientId={selectedRecord?.patient?.id || "sample-patient"}
                patientName={selectedRecord?.patient?.full_name || "Patient"}
                city={selectedRecord?.patient?.city || "Western Province"}
                distanceKm={selectedRecord?.patient?.distance_km}
                contributions={selectedRecord?.prediction?.explanation || []}
              />
            </div>
          </div>

          <div className="pt-3 border-t border-border/60 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Base: Colombo General Hospital</span>
            <span className="font-semibold text-[#8B7CF6]">Auto-Geocoded</span>
          </div>
        </div>

      </section>

      {/* ROW 3: BENTO LOWER ROW */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* Trend Area Chart (6 cols) */}
        <div className="lg:col-span-6 rounded-[24px] border border-border bg-card p-5 bento-card-shadow flex flex-col justify-between">
          <NoShowTrendChart observedRate={noShowRate} />
        </div>

        {/* Capacity Utilization Ring (3 cols) */}
        <div className="lg:col-span-3 rounded-[24px] border border-border bg-card p-5 bento-card-shadow flex flex-col items-center justify-between text-center">
          <div className="w-full flex items-center justify-between pb-3 border-b border-border/60">
            <div>
              <h3 className="font-heading text-base font-bold text-foreground text-left">
                Capacity Load
              </h3>
              <p className="text-[11px] text-muted-foreground text-left">
                Outpatient clinic slots
              </p>
            </div>
            <span className="text-xs font-semibold text-muted-foreground">Today</span>
          </div>

          <div className="my-4">
            <RingProgress
              value={84}
              label="Booked"
              size={120}
              strokeWidth={9}
              color="#8B7CF6"
            />
          </div>

          <div className="w-full pt-3 border-t border-border/60 flex items-center justify-between text-xs font-medium">
            <span className="text-muted-foreground">Allocated Slots</span>
            <span className="font-bold text-foreground">42 / 50</span>
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
                  Trilingual engagement hub
                </p>
              </div>
              <span className="relative flex size-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
              </span>
            </div>

            <div className="mt-3.5 space-y-3">
              <div className="flex items-start gap-2.5 text-xs">
                <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
                  <CheckCircle2 className="size-3.5" />
                </div>
                <div>
                  <div className="font-bold text-foreground">WhatsApp Confirmed</div>
                  <div className="text-[10px] text-muted-foreground">R. Jayasinghe (Sinhala) · 4m ago</div>
                </div>
              </div>

              <div className="flex items-start gap-2.5 text-xs">
                <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#EDE9FE] text-[#8B7CF6] dark:bg-[#8B7CF6]/20 dark:text-[#C4B5FD]">
                  <MessageSquare className="size-3.5" />
                </div>
                <div>
                  <div className="font-bold text-foreground">SMS Reminder Dispatched</div>
                  <div className="text-[10px] text-muted-foreground">M. Farook (Tamil) · 12m ago</div>
                </div>
              </div>

              <div className="flex items-start gap-2.5 text-xs">
                <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
                  <Clock className="size-3.5" />
                </div>
                <div>
                  <div className="font-bold text-foreground">Requires Voice Triage</div>
                  <div className="text-[10px] text-muted-foreground">K. Fernando (No answer)</div>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-border/60 flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">Agent Resolution Rate:</span>
            <span className="font-bold text-[#8B7CF6]">91.2%</span>
          </div>
        </div>

      </section>

      {/* FULL APPOINTMENTS TABLE CARD BELOW BENTO */}
      <section className="rounded-[24px] border border-border bg-card p-5 bento-card-shadow">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-heading text-lg font-bold text-foreground">
              Master Appointment Register
            </h2>
            <p className="text-xs text-muted-foreground">
              Clinical intake, risk triage, and outcome confirmation
            </p>
          </div>
        </div>

        <AppointmentsTable records={records} />
      </section>
    </div>
  );
}
