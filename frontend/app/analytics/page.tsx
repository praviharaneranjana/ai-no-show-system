import {
  Percent,
  Sparkles,
  AlertTriangle,
  CalendarDays,
  ListTodo,
  TrendingUp,
  Building2,
  Award,
  ShieldCheck,
} from "lucide-react";

import { getAppointmentsWithPredictions } from "@/lib/appointments-with-predictions";
import { BackendUnreachable } from "@/components/backend-unreachable";
import { RiskDistributionChart } from "@/components/charts/risk-distribution-chart";
import { DepartmentBreakdown } from "@/components/charts/department-breakdown";
import { PriorityWorklist } from "@/components/priority-worklist";
import { StatCard } from "@/components/stat-card";
import type { RiskCategory } from "@/lib/types";

export default async function AnalyticsPage() {
  let records;
  try {
    records = await getAppointmentsWithPredictions();
  } catch (err) {
    return <BackendUnreachable error={err} />;
  }

  const todayStr = new Date().toISOString().slice(0, 10);

  // Predictions stats
  const predicted = records.filter((r) => r.prediction);
  const predictionCoverage = records.length > 0 ? (predicted.length / records.length) * 100 : 0;

  const categoryCounts: Record<RiskCategory, number> = { Low: 0, Medium: 0, High: 0 };
  for (const r of predicted) {
    categoryCounts[r.prediction!.risk_category] += 1;
  }

  // Outcome stats
  const recordedOutcomes = records.filter((r) => r.appointment.no_show !== null);
  const noShows = recordedOutcomes.filter((r) => r.appointment.no_show === true).length;
  const attended = recordedOutcomes.filter((r) => r.appointment.no_show === false).length;
  const noShowRate =
    recordedOutcomes.length > 0 ? (noShows / recordedOutcomes.length) * 100 : null;

  // Upcoming high/medium risk needing outreach
  const outreachNeeded = records.filter(
    (r) =>
      r.prediction?.risk_category === "High" &&
      r.appointment.no_show === null &&
      r.appointment.appointment_day >= todayStr
  ).length;

  return (
    <div className="flex w-full flex-col gap-6 p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-border/40">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2.5">
            <div className="size-9 rounded-xl bg-gradient-to-tr from-[#8B7CF6] to-[#5B7CFA] flex items-center justify-center text-white shadow-xs">
              <TrendingUp className="size-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                Operations & Risk Analytics
              </h1>
            </div>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Aggregated predictive telemetry, department exposure distributions, and verified thesis calibration metrics.
          </p>
        </div>

        <div className="inline-flex items-center gap-2 self-start md:self-auto px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium">
          <ShieldCheck className="size-3.5" />
          <span>Calibrated Probabilities · Synthetic Simulation Data</span>
        </div>
      </div>

      {/* Top 4 KPI Tiles (StatCards) */}
      <div className="grid grid-cols-2 2xl:grid-cols-4 gap-3.5">
        <StatCard
          title="Observed No-Show Rate"
          value={noShowRate !== null ? `${noShowRate.toFixed(1)}%` : "—"}
          icon={Percent}
          delta={{
            value:
              recordedOutcomes.length > 0
                ? `${noShows} no-show / ${attended} attended`
                : "No outcomes recorded yet",
            isPositive: false,
          }}
        />
        <StatCard
          title="Prediction Coverage"
          value={`${predictionCoverage.toFixed(0)}%`}
          icon={Sparkles}
          delta={{ value: `${predicted.length} scored`, isPositive: true }}
        />
        <StatCard
          title="Outreach Pending"
          value={outreachNeeded}
          icon={AlertTriangle}
          delta={{ value: `${categoryCounts.High} high risk`, isPositive: false }}
        />
        <StatCard
          title="Total Appointments"
          value={records.length}
          icon={CalendarDays}
        />
      </div>

      {/* Model Quality & Validation Bento Card (Strict Thesis Metrics) */}
      <div className="rounded-[24px] bg-gradient-to-r from-card to-muted/20 p-5 sm:p-6 shadow-xs border border-border/60 flex flex-col gap-4">
        <div className="flex items-center justify-between pb-2 border-b border-border/40">
          <div className="flex items-center gap-2.5">
            <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <Award className="size-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">Model Calibration & Discrimination Benchmarks</h2>
              <p className="text-xs text-muted-foreground">
                Rigorous evaluation across held-out test splits. Calibrated risk probabilities instead of uncalibrated accuracy.
              </p>
            </div>
          </div>
          <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-muted text-muted-foreground">
            XGBoost v1.4
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 2xl:grid-cols-6 gap-3">
          <div className="flex flex-col p-3 rounded-2xl bg-card border border-border/40">
            <span className="text-[11px] font-semibold text-muted-foreground">ROC-AUC</span>
            <span className="text-xl font-bold font-mono text-foreground mt-0.5">0.672</span>
            <span className="text-[10px] text-muted-foreground mt-0.5">vs 0.50 random</span>
          </div>

          <div className="flex flex-col p-3 rounded-2xl bg-card border border-border/40">
            <span className="text-[11px] font-semibold text-muted-foreground">PR-AUC</span>
            <span className="text-xl font-bold font-mono text-foreground mt-0.5">0.266</span>
            <span className="text-[10px] text-muted-foreground mt-0.5">Imbalanced precision</span>
          </div>

          <div className="flex flex-col p-3 rounded-2xl bg-card border border-primary/20 bg-primary/[0.03]">
            <span className="text-[11px] font-semibold text-primary">Lift @ Top 20%</span>
            <span className="text-xl font-bold font-mono text-primary mt-0.5">1.8×</span>
            <span className="text-[10px] text-primary/80 mt-0.5">Risk capture ratio</span>
          </div>

          <div className="flex flex-col p-3 rounded-2xl bg-card border border-border/40">
            <span className="text-[11px] font-semibold text-muted-foreground">Brier Score</span>
            <span className="text-xl font-bold font-mono text-foreground mt-0.5">0.124</span>
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-0.5">Well-calibrated</span>
          </div>

          <div className="flex flex-col p-3 rounded-2xl bg-card border border-border/40">
            <span className="text-[11px] font-semibold text-muted-foreground">Base Rate</span>
            <span className="text-xl font-bold font-mono text-foreground mt-0.5">15.9%</span>
            <span className="text-[10px] text-muted-foreground mt-0.5">No-show prevalence</span>
          </div>

          <div className="flex flex-col p-3 rounded-2xl bg-card border border-border/40">
            <span className="text-[11px] font-semibold text-muted-foreground">Oracle Ceiling</span>
            <span className="text-xl font-bold font-mono text-foreground mt-0.5">0.77</span>
            <span className="text-[10px] text-muted-foreground mt-0.5">Simulated max AUC</span>
          </div>
        </div>
      </div>

      {/* Charts Grid: Risk Distribution + Department Breakdown */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Risk Distribution Donut Card */}
        <div className="lg:col-span-5 rounded-[24px] bg-card p-5 sm:p-6 shadow-xs border border-border/60 flex flex-col justify-between gap-4">
          <div className="flex items-center gap-2 pb-2 border-b border-border/40">
            <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <TrendingUp className="size-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">Predicted Risk Distribution</h2>
              <p className="text-xs text-muted-foreground">
                Breakdown across {predicted.length} scored appointments
              </p>
            </div>
          </div>
          <div className="pt-2">
            <RiskDistributionChart counts={categoryCounts} total={predicted.length} />
          </div>
        </div>

        {/* Department Breakdown Table Card */}
        <div className="lg:col-span-7 rounded-[24px] bg-card p-5 sm:p-6 shadow-xs border border-border/60 flex flex-col gap-4">
          <div className="flex items-center gap-2 pb-2 border-b border-border/40">
            <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <Building2 className="size-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">Department-Level Risk Exposure</h2>
              <p className="text-xs text-muted-foreground">
                Compare clinic load and high-risk case concentration
              </p>
            </div>
          </div>
          <div className="pt-1 overflow-x-auto">
            <DepartmentBreakdown records={records} />
          </div>
        </div>
      </div>

      {/* Actionable Priority Worklist Bento Card */}
      <div className="rounded-[24px] bg-card p-5 sm:p-6 shadow-xs border border-border/60 flex flex-col gap-4">
        <div className="flex items-center justify-between pb-2 border-b border-border/40">
          <div className="flex items-center gap-2.5">
            <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <ListTodo className="size-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">
                Upcoming Priority Outreach Worklist
              </h2>
              <p className="text-xs text-muted-foreground">
                Target high-risk patients for proactive confirmation and SMS reminders before clinic day.
              </p>
            </div>
          </div>
        </div>
        <PriorityWorklist records={records} />
      </div>
    </div>
  );
}
