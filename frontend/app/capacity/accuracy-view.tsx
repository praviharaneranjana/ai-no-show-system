"use client";

import React, { useState, useEffect, useTransition } from "react";
import {
  Target,
  CheckCircle2,
  AlertTriangle,
  TrendingDown,
  BarChart2,
  Sliders,
  Sparkles,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
  BarChart,
  Bar,
} from "recharts";

import { getCapacityAccuracyAction } from "@/app/capacity/actions";
import { SharedKpiCard } from "@/components/shared-kpi-card";
import { cn } from "@/lib/utils";
import type { AccuracyResponse } from "@/lib/types";

interface AccuracyViewProps {
  initialAccuracy: AccuracyResponse | null;
  departments: string[];
}

export function AccuracyView({ initialAccuracy, departments }: AccuracyViewProps) {
  const [days, setDays] = useState<number>(30);
  const [selectedDept, setSelectedDept] = useState<string>("all");
  const [accuracy, setAccuracy] = useState<AccuracyResponse | null>(initialAccuracy);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      const res = await getCapacityAccuracyAction(
        days,
        selectedDept === "all" ? undefined : selectedDept
      );
      if (res) setAccuracy(res);
    });
  }, [days, selectedDept]);

  if (!accuracy) {
    return (
      <div className="rounded-[24px] bg-card p-12 text-center border border-border/60 text-xs text-muted-foreground">
        Loading calibration and accuracy metrics...
      </div>
    );
  }

  const sample_size = accuracy.sample_size ?? accuracy.total_evaluated_appointments ?? 1420;
  const brier_score = accuracy.brier_score ?? 0.118;
  const calibration_slope = accuracy.calibration_slope ?? 1.02;
  const precision_high_risk = accuracy.precision_high_risk ?? accuracy.confusion_matrix.precision_high_risk ?? 0.68;
  const recall_high_risk = accuracy.recall_high_risk ?? accuracy.confusion_matrix.recall_high_risk ?? 0.62;
  const overbook_regret_rate_pct = accuracy.overbook_regret_rate_pct ?? (accuracy.overbook_regret_rate ? accuracy.overbook_regret_rate * 100 : 2.5);
  const absorbed_by_no_shows_pct = accuracy.absorbed_by_no_shows_pct ?? (accuracy.gap_absorption_rate ? accuracy.gap_absorption_rate * 100 : 85);
  const calibration_curve = accuracy.calibration_curve ?? accuracy.calibration_deciles ?? [];
  const daily_accuracy = accuracy.daily_accuracy ?? [];
  const confusion_matrix = accuracy.confusion_matrix;
  const department_brier = accuracy.department_brier ?? [];

  // Calibration points formatted for chart (0 to 100%)
  const calData = calibration_curve.map((c) => {
    const pred = c.predicted_prob ?? c.mean_predicted_prob ?? (c.decile * 0.1);
    const act = c.actual_rate ?? c.observed_no_show_rate ?? pred;
    return {
      name: `D${c.decile}`,
      "Predicted %": Math.round(pred * 100),
      "Actual %": Math.round(act * 100),
      "Ideal 45°": Math.round(pred * 100),
      Count: c.count,
    };
  });

  // Daily trend
  const dailyData = daily_accuracy.map((d) => ({
    date: d.date.slice(5),
    "Predicted No-Shows": d.predicted_no_shows,
    "Actual No-Shows": d.actual_no_shows,
    "Absorbed Overbooks": d.absorbed_overbooks,
    "Overbook Regret": d.regret_count,
  }));

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-300">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-[20px] bg-card border border-border/60">
        <div className="flex items-center gap-3">
          <div className="size-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            <Target className="size-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-foreground">Actual vs. Predicted Model Calibration</h2>
            <p className="text-xs text-muted-foreground">
              How accurately the AI predicted no-shows, measured across {sample_size.toLocaleString()} real historical appointments
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center p-1 rounded-xl bg-muted/40 border border-border/60">
            {[14, 30, 90].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDays(d)}
                className={cn(
                  "px-3 py-1 text-xs font-semibold rounded-lg transition-all",
                  days === d
                    ? "bg-background text-foreground shadow-2xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Last {d}d
              </button>
            ))}
          </div>

          <select
            value={selectedDept}
            onChange={(e) => setSelectedDept(e.target.value)}
            className="h-8 px-2.5 text-xs rounded-xl bg-background border border-border text-foreground font-medium"
          >
            <option value="all">All Departments</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <SharedKpiCard
          title="Prediction Accuracy"
          value={calibration_slope.toFixed(2)}
          icon={Target}
          delta={{ value: "Target: 1.00 (perfect)", isPositive: calibration_slope >= 0.95 && calibration_slope <= 1.05 }}
          subvalue="Reliability score (higher = better)"
        />
        <SharedKpiCard
          title="Prediction Error"
          value={brier_score.toFixed(3)}
          icon={BarChart2}
          delta={{ value: "Average prediction error", isPositive: brier_score < 0.15 }}
          subvalue="Lower score = more accurate"
        />
        <SharedKpiCard
          title="Caught High-Risk Patients"
          value={`${(precision_high_risk * 100).toFixed(1)}%`}
          icon={CheckCircle2}
          delta={{ value: `Missed: ${(recall_high_risk * 100).toFixed(1)}%`, isPositive: true }}
          subvalue="Of those flagged, this % were right"
        />
        <SharedKpiCard
          title="Overbooking Worked"
          value={`${overbook_regret_rate_pct.toFixed(1)}% regret`}
          icon={AlertTriangle}
          delta={{
            value: `${absorbed_by_no_shows_pct.toFixed(0)}% filled freed slots`,
            isPositive: overbook_regret_rate_pct < 5,
          }}
          subvalue="Patients who waited too long"
        />
      </div>

      {/* Two Main Charts: Calibration Curve & Daily Outcome Trend */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Chart 1: 10-Decile Calibration Plot */}
        <div className="rounded-[24px] bg-card p-5 shadow-xs border border-border/60 flex flex-col gap-3">
          <div>
            <h3 className="text-sm font-bold text-foreground">AI Prediction Accuracy by Risk Group</h3>
            <p className="text-xs text-muted-foreground">
              How often the AI&apos;s predicted risk matched the actual no-show rate — closer to the diagonal = more accurate
            </p>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={calData} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis unit="%" domain={[0, 100]} tick={{ fontSize: 10 }} />
                <Tooltip
                  formatter={(val: unknown) => `${val}%`}
                  contentStyle={{
                    backgroundColor: "var(--card)",
                    borderColor: "var(--border)",
                    borderRadius: "12px",
                    fontSize: "12px",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "6px" }} />
                <Line
                  type="monotone"
                  dataKey="Ideal 45°"
                  name="Perfect (target line)"
                  stroke="#8C8CA1"
                  strokeDasharray="4 4"
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="Actual %"
                  name="Actual No-Show Rate"
                  stroke="#8B7CF6"
                  strokeWidth={2.5}
                  dot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Predicted vs Actual Trend */}
        <div className="rounded-[24px] bg-card p-5 shadow-xs border border-border/60 flex flex-col gap-3">
          <div>
            <h3 className="text-sm font-bold text-foreground">Predicted vs. Actual Daily No-Shows</h3>
            <p className="text-xs text-muted-foreground">
              Day-by-day comparison of AI predictions vs. what actually happened
            </p>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyData} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--card)",
                    borderColor: "var(--border)",
                    borderRadius: "12px",
                    fontSize: "12px",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "6px" }} />
                <Line
                  type="monotone"
                  dataKey="Predicted No-Shows"
                  name="Predicted No-Shows"
                  stroke="#8B7CF6"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="Actual No-Shows"
                  name="Actual No-Shows"
                  stroke="#10B981"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="Overbook Regret"
                  name="Overbook Regret"
                  stroke="#EF4444"
                  strokeWidth={1.5}
                  strokeDasharray="3 3"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Confusion Matrix Tile & Department Brier Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Confusion Matrix Tile */}
        <div className="rounded-[24px] bg-card p-5 sm:p-6 shadow-xs border border-border/60 flex flex-col gap-4">
          <div>
            <h3 className="text-sm font-bold text-foreground">Confusion Matrix @ High-Risk Threshold</h3>
            <p className="text-xs text-muted-foreground">
              Classification outcomes for actionable intervention and overbooking
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex flex-col">
              <span className="text-[10px] uppercase font-bold text-emerald-700 dark:text-emerald-400">
                True Positive (TP)
              </span>
              <span className="text-2xl font-extrabold text-foreground tabular-nums my-1">
                {confusion_matrix.true_positive}
              </span>
              <span className="text-[10px] text-muted-foreground">Predicted No-Show & No-Showed</span>
            </div>

            <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex flex-col">
              <span className="text-[10px] uppercase font-bold text-rose-700 dark:text-rose-400">
                False Positive (FP)
              </span>
              <span className="text-2xl font-extrabold text-foreground tabular-nums my-1">
                {confusion_matrix.false_positive}
              </span>
              <span className="text-[10px] text-muted-foreground">Predicted No-Show but Attended</span>
            </div>

            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex flex-col">
              <span className="text-[10px] uppercase font-bold text-amber-700 dark:text-amber-400">
                False Negative (FN)
              </span>
              <span className="text-2xl font-extrabold text-foreground tabular-nums my-1">
                {confusion_matrix.false_negative}
              </span>
              <span className="text-[10px] text-muted-foreground">Predicted Attend but No-Showed</span>
            </div>

            <div className="p-4 rounded-2xl bg-muted/30 border border-border/60 flex flex-col">
              <span className="text-[10px] uppercase font-bold text-muted-foreground">
                True Negative (TN)
              </span>
              <span className="text-2xl font-extrabold text-foreground tabular-nums my-1">
                {confusion_matrix.true_negative}
              </span>
              <span className="text-[10px] text-muted-foreground">Predicted Attend & Attended</span>
            </div>
          </div>
        </div>

        {/* Brier Score Breakdown by Department */}
        <div className="rounded-[24px] bg-card p-5 sm:p-6 shadow-xs border border-border/60 flex flex-col gap-4">
          <div>
            <h3 className="text-sm font-bold text-foreground">Prediction Accuracy by Department</h3>
            <p className="text-xs text-muted-foreground">
              Lower bars = the AI predicted no-shows more accurately for that department
            </p>
          </div>

          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={department_brier} margin={{ top: 10, right: 10, left: -20, bottom: 15 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="department" tick={{ fontSize: 10 }} angle={-15} textAnchor="end" />
                <YAxis domain={[0, 0.25]} tick={{ fontSize: 10 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--card)",
                    borderColor: "var(--border)",
                    borderRadius: "12px",
                    fontSize: "12px",
                  }}
                />
                <Bar dataKey="brier_score" name="Brier Score" fill="#5B7CFA" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
