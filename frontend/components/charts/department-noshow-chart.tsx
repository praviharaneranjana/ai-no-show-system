"use client";

import { useMemo } from "react";
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

interface DepartmentNoShowChartProps {
  records: AppointmentRecord[];
}

export function DepartmentNoShowChart({ records }: DepartmentNoShowChartProps) {
  const router = useRouter();

  const data = useMemo(() => {
    const deptStats = new Map<
      string,
      { total: number; outcomes: number; noShows: number; highRisk: number }
    >();

    for (const r of records) {
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
  }, [records]);

  if (data.length === 0) {
    return (
      <div className="py-8 text-center text-xs text-muted-foreground">
        No department data recorded yet.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
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
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border) / 0.5)" />
            <XAxis
              type="number"
              domain={[0, 40]}
              tickFormatter={(v) => `${v}%`}
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            />
            <YAxis
              type="category"
              dataKey="department"
              tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }}
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
