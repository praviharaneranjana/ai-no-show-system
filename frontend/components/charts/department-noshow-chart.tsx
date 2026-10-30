"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  CartesianGrid,
} from "recharts";
import type { AppointmentRecord } from "@/lib/appointments-with-predictions";

const SELECT_CLASS =
  "h-8 rounded-lg border border-border bg-card px-2 text-xs text-foreground outline-none focus:ring-2 focus:ring-primary/30";
const AXIS_TEXT = "var(--muted-foreground)";
const LABEL_TEXT = "var(--foreground)";

interface DepartmentNoShowChartProps {
  records: AppointmentRecord[];
}

export function DepartmentNoShowChart({ records }: DepartmentNoShowChartProps) {
  const router = useRouter();
  const [risk, setRisk] = useState("all");
  const [period, setPeriod] = useState("all");
  const [now] = useState(() => Date.now());

  const filtered = useMemo(() => {
    const cutoff =
      period === "all"
        ? null
        : new Date(now - Number(period) * 86400000).toISOString().slice(0, 10);
    return records.filter(
      (r) =>
        (risk === "all" || r.prediction?.risk_category === risk) &&
        (cutoff === null || r.appointment.appointment_day >= cutoff)
    );
  }, [records, risk, period, now]);

  const data = useMemo(() => {
    const deptStats = new Map<
      string,
      { total: number; outcomes: number; noShows: number; highRisk: number }
    >();

    for (const r of filtered) {
      const dept = r.appointment.department || "General Medicine";
      if (!deptStats.has(dept)) {
        deptStats.set(dept, { total: 0, outcomes: 0, noShows: 0, highRisk: 0 });
      }
      const s = deptStats.get(dept)!;
      s.total += 1;
      if (r.prediction?.risk_category === "High") {
        s.highRisk += 1;
      }
      if (r.appointment.no_show !== null) {
        s.outcomes += 1;
        if (r.appointment.no_show === true) {
          s.noShows += 1;
        }
      }
    }

    return Array.from(deptStats.entries())
      .map(([name, s]) => {
        const rate =
          s.outcomes > 0
            ? Math.round((s.noShows / s.outcomes) * 1000) / 10
            : Math.round((s.highRisk / Math.max(s.total, 1)) * 1000) / 10;
        return {
          department: name,
          rate,
          total: s.total,
          outcomes: s.outcomes,
          noShows: s.noShows,
          isEstimated: s.outcomes === 0,
        };
      })
      .sort((a, b) => b.rate - a.rate);
  }, [filtered]);

  const filters = (
    <div className="flex flex-wrap items-center gap-2">
      <select aria-label="Risk category" className={SELECT_CLASS} value={risk} onChange={(e) => setRisk(e.target.value)}>
        <option value="all">All risk levels</option>
        <option value="High">High risk</option>
        <option value="Medium">Medium risk</option>
        <option value="Low">Low risk</option>
      </select>
      <select aria-label="Period" className={SELECT_CLASS} value={period} onChange={(e) => setPeriod(e.target.value)}>
        <option value="all">All dates</option>
        <option value="7">Last 7 days</option>
        <option value="14">Last 14 days</option>
        <option value="30">Last 30 days</option>
      </select>
      {(risk !== "all" || period !== "all") && (
        <button
          type="button"
          className="text-xs font-semibold text-primary hover:underline"
          onClick={() => {
            setRisk("all");
            setPeriod("all");
          }}
        >
          Reset
        </button>
      )}
    </div>
  );

  if (data.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        {filters}
        <div className="py-8 text-center text-xs text-muted-foreground">
          No departments match these filters.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {filters}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Click any department bar to filter Appointments</span>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-emerald-500" />
            <span>&lt; 15% (Low)</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-amber-500" />
            <span>15-25% (Moderate)</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-rose-500" />
            <span>&gt; 25% (High Risk)</span>
          </span>
        </div>
      </div>

      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
            <XAxis
              type="number"
              domain={[0, 40]}
              tickFormatter={(v) => `${v}%`}
              tick={{ fontSize: 11, fill: AXIS_TEXT }}
              axisLine={{ stroke: "var(--border)" }}
              tickLine={{ stroke: "var(--border)" }}
            />
            <YAxis
              type="category"
              dataKey="department"
              tick={{ fontSize: 11, fill: LABEL_TEXT }}
              axisLine={{ stroke: "var(--border)" }}
              tickLine={{ stroke: "var(--border)" }}
              width={95}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const item = payload[0].payload;
                  return (
                    <div className="rounded-xl border border-border/80 bg-card p-2.5 shadow-lg text-xs">
                      <span className="font-bold text-foreground block">{item.department}</span>
                      <span className="text-muted-foreground block mt-1">
                        No-Show Rate: <strong className="text-foreground">{item.rate}%</strong>
                        {item.isEstimated && " (High-Risk Model Ratio)"}
                      </span>
                      <span className="text-[10px] text-muted-foreground block mt-0.5">
                        Recorded: {item.noShows} no-shows / {item.outcomes} outcomes ({item.total} total slots)
                      </span>
                      <span className="text-[10px] text-primary font-semibold block mt-1">
                        Click to view appointments →
                      </span>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Bar
              dataKey="rate"
              radius={[0, 6, 6, 0]}
              className="cursor-pointer"
              onClick={(entry: unknown) => {
                const d = entry as { department?: string };
                if (d?.department) {
                  router.push(`/appointments?department=${encodeURIComponent(d.department)}`);
                }
              }}
            >
              {data.map((entry) => {
                let fill = "rgb(16 185 129)"; // emerald
                if (entry.rate > 25) fill = "rgb(244 63 94)"; // rose
                else if (entry.rate > 15) fill = "rgb(245 158 11)"; // amber
                return <Cell key={entry.department} fill={fill} className="hover:opacity-80 transition-opacity" />;
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
