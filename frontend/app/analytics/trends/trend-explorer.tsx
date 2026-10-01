"use client";

import { useState } from "react";

import { NoShowTrendChart } from "@/components/charts/no-show-trend-chart";
import { Panel } from "@/components/page-header";
import type { TrendResponse } from "@/lib/types";

export function TrendExplorer({
  initial,
  department,
  doctor,
}: {
  initial: TrendResponse | null;
  department?: string;
  doctor?: string;
}) {
  const [data, setData] = useState<TrendResponse | null>(initial);

  return (
    <div className="flex flex-col gap-6">
      <Panel>
        <NoShowTrendChart initial={initial} department={department} doctor={doctor} onData={setData} />
      </Panel>

      <Panel title="Underlying periods" subtitle="Every number on the chart, with its sample size">
        {!data || data.points.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">No recorded outcomes for these filters.</p>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card text-left text-muted-foreground">
                <tr>
                  <th className="py-2 font-semibold">Period starting</th>
                  <th className="py-2 text-right font-semibold">Appointments</th>
                  <th className="py-2 text-right font-semibold">No-shows</th>
                  <th className="py-2 text-right font-semibold">Rate</th>
                </tr>
              </thead>
              <tbody>
                {[...data.points].reverse().map((p) => (
                  <tr key={p.period} className="border-t border-border/60">
                    <td className="py-2 tabular-nums text-foreground">
                      {p.period}
                      {p.partial && <span className="ml-2 rounded bg-amber-500/15 px-1.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">in progress</span>}
                    </td>
                    <td className="py-2 text-right tabular-nums">{p.total}</td>
                    <td className="py-2 text-right tabular-nums">{p.no_shows}</td>
                    <td className="py-2 text-right font-semibold tabular-nums text-foreground">{p.rate.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
