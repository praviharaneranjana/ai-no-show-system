"use client";

import { useMemo, useState } from "react";
import { PieChart, Pie, Cell, Sector, Tooltip, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";
import type { RiskCategory } from "@/lib/types";
import type { AppointmentRecord } from "@/lib/appointments-with-predictions";

interface RiskDistributionChartProps {
  records: AppointmentRecord[];
  className?: string;
}

const SELECT_CLASS =
  "h-8 rounded-lg border border-border bg-card px-2 text-xs text-foreground outline-none focus:ring-2 focus:ring-primary/30";

const SEGMENTS: {
  key: RiskCategory;
  label: string;
  range: string;
  action: string;
  color: string;
  text: string;
  box: string;
}[] = [
  {
    key: "High",
    label: "High Risk",
    range: "≥27%",
    action: "Requires direct call & rescheduling outreach",
    color: "#ef4444",
    text: "text-red-700 dark:text-red-300",
    box: "border-red-500/20 bg-red-500/[0.04]",
  },
  {
    key: "Medium",
    label: "Medium Risk",
    range: "17–26%",
    action: "Requires SMS + Email reminder 48h prior",
    color: "#f59e0b",
    text: "text-amber-700 dark:text-amber-300",
    box: "border-amber-500/20 bg-amber-500/[0.04]",
  },
  {
    key: "Low",
    label: "Low Risk",
    range: "<17%",
    action: "Standard automated reminder is sufficient",
    color: "#10b981",
    text: "text-emerald-700 dark:text-emerald-300",
    box: "border-emerald-500/20 bg-emerald-500/[0.04]",
  },
];

export function RiskDistributionChart({ records, className }: RiskDistributionChartProps) {
  const [department, setDepartment] = useState("all");
  const [period, setPeriod] = useState("all");
  const [now] = useState(() => Date.now());
  const [activeKey, setActiveKey] = useState<RiskCategory | null>(null);

  const departments = useMemo(
    () =>
      Array.from(new Set(records.map((r) => r.appointment.department || "General Medicine"))).sort(),
    [records]
  );

  const { counts, total } = useMemo(() => {
    const cutoff =
      period === "all"
        ? null
        : new Date(now - Number(period) * 86400000).toISOString().slice(0, 10);
    const c: Record<RiskCategory, number> = { Low: 0, Medium: 0, High: 0 };
    let t = 0;
    for (const r of records) {
      if (!r.prediction) continue;
      if (department !== "all" && (r.appointment.department || "General Medicine") !== department) continue;
      if (cutoff !== null && r.appointment.appointment_day < cutoff) continue;
      c[r.prediction.risk_category] += 1;
      t += 1;
    }
    return { counts: c, total: t };
  }, [records, department, period, now]);

  const data = SEGMENTS.map((s) => ({ ...s, value: counts[s.key] })).filter((d) => d.value > 0);
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);

  const filters = (
    <div className="flex flex-wrap items-center gap-2">
      <select aria-label="Department" className={SELECT_CLASS} value={department} onChange={(e) => setDepartment(e.target.value)}>
        <option value="all">All departments</option>
        {departments.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>
      <select aria-label="Period" className={SELECT_CLASS} value={period} onChange={(e) => setPeriod(e.target.value)}>
        <option value="all">All dates</option>
        <option value="7">Last 7 days</option>
        <option value="14">Last 14 days</option>
        <option value="30">Last 30 days</option>
      </select>
      {(department !== "all" || period !== "all") && (
        <button
          type="button"
          className="text-xs font-semibold text-primary hover:underline"
          onClick={() => {
            setDepartment("all");
            setPeriod("all");
          }}
        >
          Reset
        </button>
      )}
    </div>
  );

  if (total === 0) {
    return (
      <div className={cn("flex flex-col gap-3", className)}>
        {filters}
        <div className="flex h-48 items-center justify-center text-xs text-muted-foreground">
          No prediction data for these filters.
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {filters}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
        <div className="relative shrink-0 size-[190px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="label"
                innerRadius={52}
                outerRadius={74}
                paddingAngle={data.length > 1 ? 2 : 0}
                stroke="none"
                startAngle={90}
                endAngle={-270}
                shape={(props: unknown) => {
                  const { key: _key, ...p } = props as React.ComponentProps<typeof Sector> & {
                    payload?: { key: RiskCategory };
                    key?: string;
                  };
                  const hot = p.payload?.key === activeKey;
                  return (
                    <Sector
                      {...p}
                      outerRadius={(p.outerRadius ?? 74) + (hot ? 9 : 0)}
                      opacity={activeKey && !hot ? 0.45 : 1}
                    />
                  );
                }}
                onMouseEnter={(_, i) => setActiveKey(data[i]?.key ?? null)}
                onMouseLeave={() => setActiveKey(null)}
                isAnimationActive={false}
              >
                {data.map((d) => (
                  <Cell
                    key={d.key}
                    fill={d.color}
                    className="cursor-pointer outline-none"
                  />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload as (typeof data)[number];
                  return (
                    <div className="rounded-xl border border-border/80 bg-card p-2.5 shadow-lg text-xs max-w-[220px]">
                      <span className="flex items-center gap-1.5 font-bold text-foreground">
                        <span className="size-2.5 rounded-full" style={{ background: d.color }} />
                        {d.label} ({d.range})
                      </span>
                      <span className="block mt-1 text-muted-foreground">
                        <strong className="text-foreground">{d.value}</strong> of {total} appointments ·{" "}
                        <strong className="text-foreground">{pct(d.value).toFixed(1)}%</strong>
                      </span>
                      <span className="block mt-0.5 text-[10px] text-muted-foreground">{d.action}</span>
                    </div>
                  );
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-2xl font-bold tracking-tight tabular-nums text-foreground">{total}</span>
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Assessed
            </span>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-3 w-full">
          {SEGMENTS.map((s) => (
            <div
              key={s.key}
              onMouseEnter={() => counts[s.key] > 0 && setActiveKey(s.key)}
              onMouseLeave={() => setActiveKey(null)}
              className={cn(
                "flex items-center justify-between rounded-lg border px-3 py-2 text-xs transition-shadow",
                s.box,
                activeKey === s.key && "shadow-md ring-1 ring-current/20"
              )}
            >
              <div className="flex items-center gap-2">
                <span className="size-2.5 rounded-full shrink-0" style={{ background: s.color }} />
                <div className="flex flex-col">
                  <span className={cn("font-semibold", s.text)}>
                    {s.label} ({s.range})
                  </span>
                  <span className="text-[10px] text-muted-foreground">{s.action}</span>
                </div>
              </div>
              <div className="text-right">
                <span className={cn("font-bold tabular-nums", s.text)}>{counts[s.key]}</span>
                <span className="ml-1 text-[11px] text-muted-foreground tabular-nums">
                  ({pct(counts[s.key]).toFixed(0)}%)
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
