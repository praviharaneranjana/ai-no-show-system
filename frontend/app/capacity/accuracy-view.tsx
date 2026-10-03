"use client";

import { useState, useEffect, useTransition } from "react";
import { Target, CheckCircle2, BarChart2, Gauge } from "lucide-react";
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
import { EmptyState } from "@/components/empty-state";
import { SharedKpiCard } from "@/components/shared-kpi-card";
import { SyntheticBadgeStatic } from "@/components/synthetic-badge";
import { cn } from "@/lib/utils";
import type { AccuracyResponse } from "@/lib/types";

interface AccuracyViewProps {
  initialAccuracy: AccuracyResponse | null;
  departments: string[];
}

const WINDOWS: Array<[number, string]> = [
  [30, "Last 30d"],
  [90, "Last 90d"],
  [365, "Last 365d"],
  [0, "All"],
];

const fmt = (v: number | null | undefined, digits = 3) => (v == null ? "—" : v.toFixed(digits));
const pct = (v: number | null | undefined, digits = 1) => (v == null ? "—" : `${(v * 100).toFixed(digits)}%`);

export function AccuracyView({ initialAccuracy, departments }: AccuracyViewProps) {
  const [days, setDays] = useState<number>(30);
  const [selectedDept, setSelectedDept] = useState<string>("all");
  const [accuracy, setAccuracy] = useState<AccuracyResponse | null>(initialAccuracy);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      const res = await getCapacityAccuracyAction(days, selectedDept === "all" ? undefined : selectedDept);
      if (res) setAccuracy(res);
    });
  }, [days, selectedDept]);

  const controls = (
    <div className="flex items-center gap-3">
      <div className="flex items-center p-1 rounded-xl bg-muted/40 border border-border/60">
        {WINDOWS.map(([d, label]) => (
          <button
            key={d}
            type="button"
            onClick={() => setDays(d)}
            className={cn(
              "px-3 py-1 text-xs font-semibold rounded-lg transition-all",
              days === d ? "bg-background text-foreground shadow-2xs" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {label}
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
  );

  if (!accuracy) {
    return (
      <div className="rounded-[24px] bg-card p-12 text-center border border-border/60 text-xs text-muted-foreground">
        Could not load accuracy metrics.
      </div>
    );
  }

  if (accuracy.empty) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex justify-end">{controls}</div>
        <EmptyState
          title="No evaluated appointments yet"
          description="Accuracy is computed from appointments whose outcome (attended / no-show) has been recorded. Nothing in this window has one."
        />
      </div>
    );
  }

  const cm = accuracy.confusion_matrix;
  const calData = (accuracy.calibration_deciles ?? []).map((c) => ({
    name: `D${c.decile}`,
    "Predicted %": +((c.mean_predicted_prob ?? 0) * 100).toFixed(1),
    "Observed %": +((c.observed_no_show_rate ?? 0) * 100).toFixed(1),
    Count: c.count,
  }));
  const dailyData = (accuracy.daily_accuracy ?? []).map((d) => ({
    date: d.date.slice(5),
    "Predicted no-shows": +d.predicted_no_shows.toFixed(1),
    "Actual no-shows": d.actual_no_shows,
  }));
  const tierRows = (["High", "Medium", "Low"] as const).map((t) => ({ tier: t, ...accuracy.tiers?.[t] }));
  const tooltipStyle = {
    backgroundColor: "var(--card)",
    borderColor: "var(--border)",
    borderRadius: "12px",
    fontSize: "12px",
  };

  return (
    <div className={cn("flex flex-col gap-6 animate-in fade-in duration-300", isPending && "opacity-70")}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-[20px] bg-card border border-border/60">
        <div className="flex items-center gap-3">
          <div className="size-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            <Target className="size-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              Predicted vs. observed
              {(accuracy.synthetic_share ?? 0) > 0 && <SyntheticBadgeStatic />}
            </h2>
            <p className="text-xs text-muted-foreground">
              {accuracy.n_evaluated.toLocaleString()} appointments with a recorded outcome · observed no-show rate{" "}
              {pct(accuracy.observed_no_show_rate)} · mean predicted {pct(accuracy.mean_predicted)}
            </p>
          </div>
        </div>
        {controls}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <SharedKpiCard
          title="ROC-AUC"
          value={fmt(accuracy.roc_auc)}
          icon={Target}
          delta={{ value: "0.5 = random, 1.0 = perfect", isPositive: (accuracy.roc_auc ?? 0) >= 0.6 }}
          subvalue={`PR-AUC ${fmt(accuracy.pr_auc)}`}
        />
        <SharedKpiCard
          title="Brier score"
          value={fmt(accuracy.brier)}
          icon={BarChart2}
          delta={{ value: "mean squared probability error", isPositive: true }}
          subvalue="Lower is better"
        />
        <SharedKpiCard
          title="Recall @ top 20%"
          value={pct(accuracy.recall_top20)}
          icon={CheckCircle2}
          delta={{ value: `precision ${pct(accuracy.precision_top20)}`, isPositive: true }}
          subvalue="Share of all no-shows found in the riskiest 20%"
        />
        <SharedKpiCard
          title="Lift @ top 20%"
          value={accuracy.lift_top20 == null ? "—" : `${accuracy.lift_top20.toFixed(2)}×`}
          icon={Gauge}
          delta={{ value: "vs. contacting at random", isPositive: (accuracy.lift_top20 ?? 0) > 1 }}
          subvalue={`${accuracy.n_evaluated.toLocaleString()} evaluated`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-[24px] bg-card p-5 shadow-xs border border-border/60 flex flex-col gap-3">
          <div>
            <h3 className="text-sm font-bold text-foreground">Calibration by predicted-risk decile</h3>
            <p className="text-xs text-muted-foreground">Equal-count bins; bars should track the predicted line.</p>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={calData} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis unit="%" tick={{ fontSize: 10 }} />
                <Tooltip formatter={(val: unknown) => `${val}%`} contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "6px" }} />
                <Line type="monotone" dataKey="Predicted %" stroke="#8C8CA1" strokeDasharray="4 4" dot={false} />
                <Line type="monotone" dataKey="Observed %" stroke="#8B7CF6" strokeWidth={2.5} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-[24px] bg-card p-5 shadow-xs border border-border/60 flex flex-col gap-3">
          <div>
            <h3 className="text-sm font-bold text-foreground">Predicted vs. actual daily no-shows</h3>
            <p className="text-xs text-muted-foreground">Sum of predicted probabilities against recorded no-shows per day.</p>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyData} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} minTickGap={24} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "6px" }} />
                <Line type="monotone" dataKey="Predicted no-shows" stroke="#8B7CF6" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Actual no-shows" stroke="#10B981" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-[24px] bg-card p-5 sm:p-6 shadow-xs border border-border/60 flex flex-col gap-4">
          <div>
            <h3 className="text-sm font-bold text-foreground">Confusion matrix</h3>
            <p className="text-xs text-muted-foreground">
              {cm?.rule ?? "Flagged = High or Medium tier"} · flagged {pct(cm?.flagged_share)} of appointments · precision{" "}
              {pct(cm?.precision)} · recall {pct(cm?.recall)}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-center">
            {[
              ["True positive", cm?.tp, "Flagged and no-showed", "bg-emerald-500/10 border-emerald-500/20"],
              ["False positive", cm?.fp, "Flagged but attended", "bg-rose-500/10 border-rose-500/20"],
              ["False negative", cm?.fn, "Not flagged but no-showed", "bg-amber-500/10 border-amber-500/20"],
              ["True negative", cm?.tn, "Not flagged and attended", "bg-muted/30 border-border/60"],
            ].map(([label, value, sub, cls]) => (
              <div key={label as string} className={cn("p-4 rounded-2xl border flex flex-col", cls as string)}>
                <span className="text-[10px] uppercase font-bold text-muted-foreground">{label as string}</span>
                <span className="text-2xl font-extrabold text-foreground tabular-nums my-1">
                  {((value as number | undefined) ?? 0).toLocaleString()}
                </span>
                <span className="text-[10px] text-muted-foreground">{sub as string}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[24px] bg-card p-5 sm:p-6 shadow-xs border border-border/60 flex flex-col gap-4">
          <div>
            <h3 className="text-sm font-bold text-foreground">Calibration by tier</h3>
            <p className="text-xs text-muted-foreground">Mean predicted risk against the observed no-show rate in each tier.</p>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-2 font-semibold">Tier</th>
                <th className="font-semibold">n</th>
                <th className="font-semibold">Share</th>
                <th className="font-semibold">Predicted</th>
                <th className="font-semibold">Observed</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {tierRows.map((r) => (
                <tr key={r.tier} className="border-b border-border/50 last:border-none">
                  <td className="py-2 font-sans font-semibold text-foreground">{r.tier}</td>
                  <td>{(r.n ?? 0).toLocaleString()}</td>
                  <td>{pct(r.share)}</td>
                  <td>{pct(r.mean_predicted)}</td>
                  <td>{pct(r.observed_no_show_rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {(accuracy.department_brier ?? []).length > 0 && (
            <>
              <h3 className="text-sm font-bold text-foreground">Brier score by department</h3>
              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={accuracy.department_brier} margin={{ top: 10, right: 10, left: -20, bottom: 15 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                    <XAxis dataKey="department" tick={{ fontSize: 9 }} angle={-20} textAnchor="end" interval={0} />
                    <YAxis domain={[0, "auto"]} tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="brier_score" name="Brier" fill="#5B7CFA" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
