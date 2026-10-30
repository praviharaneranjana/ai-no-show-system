"use client";

import React, { useState, useEffect, useTransition } from "react";
import {
  CalendarDays,
  TrendingUp,
  AlertTriangle,
  Wallet,
  Layers,
  Sparkles,
  ChevronRight,
  Filter,
} from "lucide-react";
import {
  AreaChart,
  Area,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
  ComposedChart,
} from "recharts";

import { getCapacityForecastAction } from "@/app/capacity/actions";
import { SharedKpiCard } from "@/components/shared-kpi-card";
import { formatLkr, cn } from "@/lib/utils";
import type { ForecastResponse } from "@/lib/types";

interface ForecastViewProps {
  initialForecast: ForecastResponse | null;
  departments: string[];
}

export function ForecastView({ initialForecast, departments }: ForecastViewProps) {
  const [days, setDays] = useState<number>(14);
  const [selectedDept, setSelectedDept] = useState<string>("all");
  const [forecast, setForecast] = useState<ForecastResponse | null>(initialForecast);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      const res = await getCapacityForecastAction(
        days,
        selectedDept === "all" ? undefined : selectedDept
      );
      if (res) setForecast(res);
    });
  }, [days, selectedDept]);

  if (!forecast) {
    return (
      <div className="rounded-[24px] bg-card p-12 text-center border border-border/60 text-xs text-muted-foreground">
        Loading multi-horizon capacity forecast...
      </div>
    );
  }

  const total_forecasted_appointments =
    forecast.total_forecasted_appointments ??
    forecast.summary?.total_projected_appointments ??
    0;
  const total_expected_no_shows =
    forecast.total_expected_no_shows ??
    forecast.summary?.total_expected_no_shows ??
    0;
  const expected_no_shows_range = [
    forecast.expected_no_shows_range?.[0] ?? forecast.summary?.expected_no_shows_interval_low ?? total_expected_no_shows,
    forecast.expected_no_shows_range?.[1] ?? forecast.summary?.expected_no_shows_interval_high ?? total_expected_no_shows,
  ];
  const total_recommended_overbooks =
    forecast.total_recommended_overbooks ??
    forecast.summary?.total_bufferable_overbooks ??
    0;
  const total_revenue_at_risk_lkr =
    forecast.total_revenue_at_risk_lkr ??
    forecast.summary?.total_revenue_at_risk_lkr ??
    0;
  const daily_forecast =
    forecast.daily_forecast ??
    (Array.isArray(forecast.days) ? forecast.days : []);
  const department_breakdown = forecast.department_breakdown ?? forecast.departments ?? [];

  // Confidence band data for Recharts
  const chartData = daily_forecast.map((d) => ({
    date: d.date.slice(5),
    weekday: (d.weekday ?? "").slice(0, 3),
    label: `${(d.weekday ?? "").slice(0, 3)} ${d.date.slice(5)}`,
    Booked: d.booked_appointments ?? d.total_projected_booked ?? 0,
    "Expected No-Shows": d.expected_no_shows,
    "Lower Bound": d.interval_low,
    "Band Span": Math.max(0, d.interval_high - d.interval_low),
    "Upper Bound": d.interval_high,
    Overbooks: d.recommended_overbooks ?? d.bufferable_overbooks ?? 0,
  }));

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-300">
      {/* Horizon & Department Filter Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-[20px] bg-card border border-border/60">
        <div className="flex items-center gap-3">
          <div className="size-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            <CalendarDays className="size-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-foreground">Multi-Horizon Capacity Forecast</h2>
            <p className="text-xs text-muted-foreground">
              Poisson-binomial confidence bounds for booked slots &amp; weekday-adjusted estimates for upcoming days
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Horizon tabs */}
          <div className="flex items-center p-1 rounded-xl bg-muted/40 border border-border/60">
            {[7, 14, 30].map((horizon) => (
              <button
                key={horizon}
                type="button"
                onClick={() => setDays(horizon)}
                className={cn(
                  "px-3 py-1 text-xs font-semibold rounded-lg transition-all",
                  days === horizon
                    ? "bg-background text-foreground shadow-2xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {horizon} Days
              </button>
            ))}
          </div>

          {/* Department selector */}
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
          title="Forecasted Appts"
          value={total_forecasted_appointments}
          icon={CalendarDays}
          subvalue={`Next ${days} days`}
        />
        <SharedKpiCard
          title="Expected No-Shows"
          value={total_expected_no_shows}
          icon={AlertTriangle}
          delta={{
            value: `80% sampling range: ${expected_no_shows_range[0]} – ${expected_no_shows_range[1]}`,
            isPositive: false,
          }}
          subvalue="Assumes calibrated, independent scores"
        />
        <SharedKpiCard
          title="Rec. Overbooks"
          value={`+${total_recommended_overbooks}`}
          icon={TrendingUp}
          delta={{ value: "Safe recovery slots", isPositive: true }}
          subvalue="Sessions that are already full"
        />
        <SharedKpiCard
          title="Revenue at Risk"
          value={formatLkr(total_revenue_at_risk_lkr)}
          icon={Wallet}
          delta={{ value: "Expected shortfall", isPositive: false }}
          subvalue="Doctor consultation fee"
        />
      </div>

      {/* Confidence Band Line Chart */}
      <div className="rounded-[24px] bg-card p-5 sm:p-6 shadow-xs border border-border/60 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-foreground">
              Expected No-Shows with 80% Confidence Range
            </h3>
            <p className="text-xs text-muted-foreground">
              Shaded area shows the range within which actual no-shows are expected to fall 8 times out of 10
            </p>
          </div>
        </div>

        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--card)",
                  borderColor: "var(--border)",
                  borderRadius: "12px",
                  fontSize: "12px",
                }}
              />
              <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }} />
              <Bar dataKey="Booked" name="Booked Appts" fill="#5B7CFA" opacity={0.3} radius={[4, 4, 0, 0]} />
              <Area
                type="monotone"
                dataKey="Band Span"
                stackId="band"
                fill="#8B7CF6"
                stroke="transparent"
                fillOpacity={0.2}
                name="80% CI Interval"
              />
              <Line
                type="monotone"
                dataKey="Expected No-Shows"
                name="Expected No-Shows"
                stroke="#EF4444"
                strokeWidth={2.5}
                dot={{ r: 3 }}
              />
              <Line
                type="monotone"
                dataKey="Overbooks"
                name="Rec. Overbooks"
                stroke="#8B7CF6"
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={{ r: 2 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bottom Grid: Department Risk Breakdown + Calendar Heat Strip */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Department Forecast Stacked Bar */}
        <div className="rounded-[24px] bg-card p-5 shadow-xs border border-border/60 flex flex-col gap-3">
          <div>
            <h3 className="text-sm font-bold text-foreground">Revenue at Risk by Department</h3>
            <p className="text-xs text-muted-foreground">Expected revenue shortfall over the next {days} days</p>
          </div>
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={department_breakdown}
                margin={{ top: 10, right: 10, left: 10, bottom: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="department" tick={{ fontSize: 10 }} angle={-15} textAnchor="end" />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `LKR ${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(val: unknown) => formatLkr(Number(val))}
                  contentStyle={{
                    backgroundColor: "var(--card)",
                    borderColor: "var(--border)",
                    borderRadius: "12px",
                    fontSize: "12px",
                  }}
                />
                <Bar dataKey="revenue_at_risk_lkr" name="Revenue at Risk (LKR)" fill="#8B7CF6" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Calendar Heat Strip */}
        <div className="rounded-[24px] bg-card p-5 shadow-xs border border-border/60 flex flex-col gap-3">
          <div>
            <h3 className="text-sm font-bold text-foreground">Day-by-Day Risk Intensity Heat Strip</h3>
            <p className="text-xs text-muted-foreground">Relative no-show pressure across the forecast window</p>
          </div>

          <div className="grid grid-cols-7 gap-2 pt-2">
            {daily_forecast.slice(0, 14).map((d) => {
              const intensity = d.heat_intensity ?? 0.2;
              let bg = "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
              if (intensity > 0.6) bg = "bg-rose-500/15 text-rose-600 border-rose-500/30";
              else if (intensity > 0.3) bg = "bg-amber-500/15 text-amber-600 border-amber-500/30";

              return (
                <div
                  key={d.date}
                  className={cn(
                    "p-2 rounded-xl border flex flex-col items-center justify-center text-center gap-0.5",
                    bg
                  )}
                >
                  <span className="text-[10px] font-bold uppercase">{(d.weekday ?? "").slice(0, 3)}</span>
                  <span className="text-xs font-mono font-extrabold">{d.date.slice(8)}</span>
                  <span className="text-[9px] font-bold mt-1">
                    {d.expected_no_shows} ns
                  </span>
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-3 border-t border-border/40">
            <span>Low Risk (&lt;10%)</span>
            <span>Moderate (10-25%)</span>
            <span>High Pressure (&gt;25%)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
