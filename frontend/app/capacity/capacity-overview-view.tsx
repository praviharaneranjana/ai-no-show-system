"use client";

import React from "react";
import {
  Layers,
  CalendarDays,
  AlertTriangle,
  TrendingUp,
  Wallet,
  Clock,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Users,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  CartesianGrid,
} from "recharts";

import { SharedKpiCard } from "@/components/shared-kpi-card";
import { DoctorSessionPanel } from "@/app/capacity/doctor-session-panel";
import { RingProgress } from "@/components/ring-progress";
import { formatLkr } from "@/lib/utils";
import type { CapacityOptimizeResult, DoctorSession } from "@/lib/types";

const RISK_BADGES: Record<string, string> = {
  Safe: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20",
  Moderate: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20",
  Caution: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20",
};

interface CapacityOverviewViewProps {
  optimization: CapacityOptimizeResult;
  sessions: DoctorSession[];
}

export function CapacityOverviewView({ optimization, sessions }: CapacityOverviewViewProps) {
  const range = [optimization.expected_no_shows_interval_low, optimization.expected_no_shows_interval_high];

  // Prepare chart data for department breakdown
  const deptChartData = optimization.departments.map((d) => ({
    name: d.department,
    Booked: d.total_booked,
    Overbook: d.recommended_overbook,
    "Exp. No-Shows": d.expected_no_shows,
  }));

  // Prepare doctor session breakdown
  const doctorChartData = optimization.sessions.map((s) => ({
    name: `${s.doctor_name.replace("Dr. ", "")}${s.session_label ? ` · ${s.session_label}` : ""}`,
    Capacity: s.max_capacity ?? 0,
    Booked: s.total_booked,
    "Expected Attendance": Math.max(0, s.total_booked - s.predicted_no_shows),
    Overbook: s.recommended_overbook_count,
  }));

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-300">
      {/* 5 KPI SharedKpiCards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3.5">
        <SharedKpiCard
          title="Total Capacity"
          value={optimization.total_capacity}
          icon={Layers}
          subvalue={`${optimization.sessions_running} sessions running${optimization.idle_sessions ? ` · ${optimization.idle_sessions} on the timetable with no bookings` : ""}`}
        />
        <SharedKpiCard
          title="Total Booked"
          value={optimization.total_booked}
          icon={CalendarDays}
          subvalue={`${optimization.booked_utilisation_pct}% of running capacity`}
        />
        <SharedKpiCard
          title="Expected No-Shows"
          value={optimization.total_predicted_no_shows}
          icon={AlertTriangle}
          delta={{
            value: `80% likely range: ${range[0]} – ${range[1]}`,
            isPositive: false,
          }}
          subvalue="AI probability estimate"
        />
        <SharedKpiCard
          title="Overbook now"
          value={`+${optimization.total_recommended_overbooks}`}
          icon={TrendingUp}
          delta={{
            value: `${optimization.expected_attendance_pct}% expected to attend`,
            isPositive: true,
          }}
          subvalue="Only sessions that are already full"
        />
        <SharedKpiCard
          title="Revenue from filling free seats"
          value={formatLkr(optimization.estimated_revenue_recovery_lkr)}
          icon={Wallet}
          delta={{ value: "Fee × extra patients expected to be seen, from free seats and overbooking", isPositive: true }}
          subvalue="For this date, if the advice is followed"
        />
      </div>

      {/* Consultant Session Punctuality */}
      <div className="rounded-[24px] bg-card p-5 sm:p-6 shadow-xs border border-border/60 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <Clock className="size-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">Consultant Session Status</h2>
              <p className="text-xs text-muted-foreground">
                Live punctuality tracking — doctor delays reduce usable patient waiting time.
              </p>
            </div>
          </div>
        </div>
        <DoctorSessionPanel sessions={sessions} />
      </div>

      {/* Recharts Comparison Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Chart 1: Doctor Session Attendance vs Capacity */}
        <div className="rounded-[24px] bg-card p-5 shadow-xs border border-border/60 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-foreground">Consultant Session Load & Buffer</h3>
              <p className="text-xs text-muted-foreground">Booked vs Expected Attendance vs Capacity per Doctor</p>
            </div>
          </div>
          {doctorChartData.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-xs text-muted-foreground">
              No active doctor sessions today
            </div>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={doctorChartData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-15} textAnchor="end" />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--card)",
                      borderColor: "var(--border)",
                      borderRadius: "12px",
                      fontSize: "12px",
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "6px" }} />
                  <Bar dataKey="Capacity" fill="#8C8CA1" opacity={0.3} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Booked" fill="#5B7CFA" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Expected Attendance" fill="#10B981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Overbook" fill="#8B7CF6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Chart 2: Department Overbooking Breakdown */}
        <div className="rounded-[24px] bg-card p-5 shadow-xs border border-border/60 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-foreground">Department Allocation & Safe Overbook</h3>
              <p className="text-xs text-muted-foreground">Recommended overbooking capacity by clinical specialty</p>
            </div>
          </div>
          {deptChartData.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-xs text-muted-foreground">
              No department data available
            </div>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={deptChartData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-15} textAnchor="end" />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--card)",
                      borderColor: "var(--border)",
                      borderRadius: "12px",
                      fontSize: "12px",
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "6px" }} />
                  <Bar dataKey="Booked" fill="#5B7CFA" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Exp. No-Shows" fill="#EF4444" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Overbook" fill="#8B7CF6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Session Optimization Bento Cards */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-foreground">Session Recommendations</h2>
            <p className="text-xs text-muted-foreground">
              Calibrated slot buffering adjusted for specialist consultation pace & current punctuality
            </p>
          </div>
        </div>

        {optimization.sessions.length === 0 ? (
          <div className="rounded-[24px] bg-card p-12 text-center border border-border/60 flex flex-col items-center justify-center gap-3">
            <Users className="size-10 text-muted-foreground/40" />
            <div className="flex flex-col gap-1">
              <h3 className="text-base font-semibold text-foreground">No Consultant Sessions Scheduled</h3>
              <p className="text-xs text-muted-foreground max-w-sm">
                There are no active clinic sessions or bookings found for this date. Honest empty state displayed without fabricated baselines.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4">
            {optimization.sessions.map((s, idx) => {
              const cap = s.max_capacity;
              const bookedPct = cap ? Math.round((s.total_booked / cap) * 100) : 0;
              const attendPct = s.expected_attendance_pct;
              const roomClean = s.room_number.replace(/^Room\s+/i, "");

              return (
                <div
                  key={s.clinic_session_id || idx}
                  className="rounded-[24px] bg-card p-5 shadow-xs border border-border/60 hover:shadow-md hover:border-border transition-all flex flex-col justify-between gap-4"
                >
                  <div className="flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-col">
                        <span className="font-bold text-foreground text-base">{s.doctor_name}</span>
                        <span className="text-xs text-muted-foreground">
                          {s.specialty}{s.session_label ? ` · ${s.session_label} ${s.session_start ?? ""}` : ""}{roomClean ? ` · Room ${roomClean}` : ""}
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
                          value={Math.min(100, bookedPct)}
                          max={100}
                          size={64}
                          strokeWidth={6}
                          label="Booked"
                          sublabel={`${bookedPct}%`}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2 flex-1 text-center">
                        <div className="flex flex-col rounded-xl bg-muted/30 p-2">
                          <span className="text-[11px] text-muted-foreground font-medium">Booked</span>
                          <span className="text-sm font-bold tabular-nums text-foreground">
                            {s.total_booked} / {cap ?? "—"}
                          </span>
                        </div>
                        <div className="flex flex-col rounded-xl bg-muted/30 p-2">
                          <span className="text-[11px] text-muted-foreground font-medium">Exp. No-Shows</span>
                          <span className="text-sm font-bold tabular-nums text-rose-600 dark:text-rose-400">
                            {s.expected_no_shows_float.toFixed(1)}
                            <span className="text-[10px] text-muted-foreground font-normal ml-1">
                              [{s.interval_low}-{s.interval_high}]
                            </span>
                          </span>
                        </div>
                        <div className="flex flex-col rounded-xl bg-primary/10 p-2 border border-primary/20">
                          <span className="text-[11px] text-primary font-medium">
                            {s.free_seats > 0 ? "Overbook if full" : "Overbook"}
                          </span>
                          <span className="text-sm font-bold tabular-nums text-primary">
                            +{s.free_seats > 0 ? s.overbook_if_full : s.recommended_overbook_count}
                          </span>
                        </div>
                        <div className="flex flex-col rounded-xl bg-muted/30 p-2">
                          <span className="text-[11px] text-muted-foreground font-medium">P(overflow)</span>
                          <span className="text-sm font-bold tabular-nums text-foreground">
                            {Math.round(s.p_overcrowding * 100)}%
                            <span className="text-[10px] text-muted-foreground font-normal ml-1">
                              ~{s.expected_wait_time_mins}m overrun
                            </span>
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Expected Attendance Rate:</span>
                      <span className="font-semibold text-foreground">{attendPct}%</span>
                    </div>

                    <p className="text-xs text-muted-foreground leading-relaxed">{s.status_advice}</p>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-border/40">
                    <span className="text-xs text-muted-foreground font-medium">Est. Extra Revenue from This Session</span>
                    <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                      +{formatLkr(s.expected_revenue_gain_lkr)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
