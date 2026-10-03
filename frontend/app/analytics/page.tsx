import Link from "next/link";
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
  MessagesSquare,
  Bot,
  CheckCircle2,
  CalendarClock,
  Video,
  ChevronRight,
  ExternalLink,
  BarChart3,
} from "lucide-react";

import { getAppointmentsWithPredictions } from "@/lib/appointments-with-predictions";
import { isRedirectError, listConversations, getHospitalProfile, getModelInfo } from "@/lib/api";
import { BackendUnreachable } from "@/components/backend-unreachable";
import { RiskDistributionChart } from "@/components/charts/risk-distribution-chart";
import { DepartmentBreakdown } from "@/components/charts/department-breakdown";
import { DepartmentNoShowChart } from "@/components/charts/department-noshow-chart";
import { PriorityWorklist } from "@/components/priority-worklist";
import { SharedKpiCard } from "@/components/shared-kpi-card";
import { Button } from "@/components/ui/button";
import { getColomboToday } from "@/lib/date-colombo";
import { SyntheticBadge } from "@/components/synthetic-badge";
import type { RiskCategory, Intervention, HospitalDetail, ModelInfo } from "@/lib/types";

export default async function AnalyticsPage() {
  let records;
  let conversations: Intervention[] = [];
  let hospital: HospitalDetail | null = null;
  let modelInfo: ModelInfo | null = null;

  try {
    const [fetchedRecords, fetchedConversations, fetchedHospital, fetchedModel] = await Promise.all([
      getAppointmentsWithPredictions(),
      listConversations().catch(() => []),
      getHospitalProfile().catch(() => null),
      getModelInfo().catch(() => null),
    ]);
    modelInfo = fetchedModel;
    records = fetchedRecords;
    conversations = fetchedConversations;
    hospital = fetchedHospital;
  } catch (err) {
    if (isRedirectError(err)) throw err;
    return <BackendUnreachable error={err} />;
  }

  const todayStr = getColomboToday();

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

  // Outreach conversations stats
  const totalConversations = conversations.length;
  const confirmedCount = conversations.filter((c) => c.status === "confirmed").length;
  const rescheduledCount = conversations.filter((c) => c.status === "rescheduled").length;
  const telehealthCount = conversations.filter((c) => c.status === "telehealth_requested").length;
  const resolvedCount = confirmedCount + rescheduledCount + telehealthCount;
  const resolutionRate = totalConversations > 0 ? (resolvedCount / totalConversations) * 100 : 0;

  return (
    <div className="flex w-full flex-col gap-6 p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto animate-in fade-in duration-300">
      {/* Header with Hospital Badge (Phase 5: P5-1) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-border/40">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2.5">
            <div className="size-9 rounded-xl bg-gradient-to-tr from-[#8B7CF6] to-[#5B7CFA] flex items-center justify-center text-white shadow-xs">
              <TrendingUp className="size-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                Operations &amp; Risk Analytics
              </h1>
            </div>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Aggregated predictive telemetry, department exposure distributions, and verified thesis calibration metrics.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
          {hospital?.name && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold">
              <Building2 className="size-3.5" />
              <span>{hospital.name}</span>
            </div>
          )}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/60 border border-border/60 text-muted-foreground text-xs font-medium">
            <ShieldCheck className="size-3.5 text-primary" />
            <span>Calibrated Probabilities · Operational Telemetry</span>
          </div>
        </div>
      </div>

      {/* Top 5 KPI Tiles with Shared Component & Observed No-Show Rate (Phase 5: P5-1) */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3.5">
        <SharedKpiCard
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
        <SharedKpiCard
          title="Prediction Coverage"
          value={`${predictionCoverage.toFixed(0)}%`}
          icon={Sparkles}
          delta={{ value: `${predicted.length} scored`, isPositive: true }}
        />
        <SharedKpiCard
          title="Outreach Pending"
          value={outreachNeeded}
          icon={AlertTriangle}
          delta={{ value: `${categoryCounts.High} high risk`, isPositive: false }}
        />
        <SharedKpiCard
          title="Autonomous Outreach"
          value={totalConversations}
          icon={MessagesSquare}
          delta={{
            value:
              totalConversations > 0
                ? `${resolvedCount} resolved (${resolutionRate.toFixed(0)}%)`
                : "No conversations",
            isPositive: true,
          }}
        />
        <SharedKpiCard
          title="Total Appointments"
          value={records.length}
          icon={CalendarDays}
        />
      </div>

      {/* Analytics Midsection: Risk Distribution Donut & Outreach Hub Bridge */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
        {/* Left Column (5 cols): Risk Distribution + Outreach Resolution Bridge */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          {/* Risk Distribution Donut Card */}
          <div className="rounded-[24px] bg-card p-5 sm:p-6 shadow-xs border border-border/60 flex flex-col gap-4">
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
            <div className="pt-1">
              <RiskDistributionChart counts={categoryCounts} total={predicted.length} />
            </div>
          </div>

          {/* Outreach Resolution Hub Card */}
          <div className="rounded-[24px] bg-card p-5 sm:p-6 shadow-xs border border-border/60 flex flex-col gap-4">
            <div className="flex items-center justify-between pb-2 border-b border-border/40">
              <div className="flex items-center gap-2">
                <div className="size-8 rounded-full bg-gradient-to-tr from-[#8B7CF6]/20 to-[#5B7CFA]/20 flex items-center justify-center text-primary">
                  <Bot className="size-4" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-foreground">
                    Outreach Resolution Hub
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Autonomous patient engagement status
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-1 text-xs h-7"
                nativeButton={false}
                render={
                  <Link href="/outreach">
                    <span>Open Hub</span>
                    <ExternalLink className="size-3" />
                  </Link>
                }
              />
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2.5 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/20">
                <div className="flex items-center justify-center gap-1 text-emerald-700 dark:text-emerald-300 font-semibold text-xs">
                  <CheckCircle2 className="size-3" />
                  <span>Confirmed</span>
                </div>
                <div className="text-lg font-bold text-foreground mt-1 tabular-nums">
                  {confirmedCount}
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-sky-500/[0.06] border border-sky-500/20">
                <div className="flex items-center justify-center gap-1 text-sky-700 dark:text-sky-300 font-semibold text-xs">
                  <CalendarClock className="size-3" />
                  <span>Rescheduled</span>
                </div>
                <div className="text-lg font-bold text-foreground mt-1 tabular-nums">
                  {rescheduledCount}
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-purple-500/[0.06] border border-purple-500/20">
                <div className="flex items-center justify-center gap-1 text-purple-700 dark:text-purple-300 font-semibold text-xs">
                  <Video className="size-3" />
                  <span>Telehealth</span>
                </div>
                <div className="text-lg font-bold text-foreground mt-1 tabular-nums">
                  {telehealthCount}
                </div>
              </div>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              Trilingual agent autonomously converses with patients in English, Sinhala, and Tamil to confirm or reschedule high-risk slots before clinic day.
            </p>
          </div>
        </div>

        {/* Right Column (7 cols): No-Show Rate by Department Chart & Department-Level Risk Exposure Table (Phase 5: P5-4 & P5-5) */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          {/* Actionable No-Show Rate by Department Chart (Phase 5: P5-5) */}
          <div className="rounded-[24px] bg-card p-5 sm:p-6 shadow-xs border border-border/60 flex flex-col gap-4">
            <div className="flex items-center justify-between pb-2 border-b border-border/40">
              <div className="flex items-center gap-2">
                <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                  <BarChart3 className="size-4" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-foreground">No-Show Rate by Department</h2>
                  <p className="text-xs text-muted-foreground">
                    Actionable clinical specialty breakdown · Click any bar to inspect scheduled patients
                  </p>
                </div>
              </div>
            </div>
            <DepartmentNoShowChart records={records} />
          </div>

          {/* Department-Level Risk Exposure Table (Phase 5: P5-4) */}
          <div className="rounded-[24px] bg-card p-5 sm:p-6 shadow-xs border border-border/60 flex flex-col gap-4">
            <div className="flex items-center justify-between pb-2 border-b border-border/40">
              <div className="flex items-center gap-2">
                <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                  <Building2 className="size-4" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-foreground">Department-Level Risk Exposure</h2>
                  <p className="text-xs text-muted-foreground">
                    Compare clinic load, risk concentration, and outreach dispatch status
                  </p>
                </div>
              </div>
              <Link
                href="/appointments"
                className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1"
                title="View all appointments across departments"
              >
                <span>All Appointments</span>
                <ChevronRight className="size-3.5" />
              </Link>
            </div>
            <div className="pt-1 overflow-x-auto">
              <DepartmentBreakdown records={records} conversations={conversations} />
            </div>
          </div>
        </div>
      </div>

      {/* Actionable Priority Worklist with Search & Pagination (Phase 5: P5-3) */}
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
                Target high-risk patients for proactive confirmation, SMS reminders, or direct conversational triage.
              </p>
            </div>
          </div>
        </div>
        <PriorityWorklist records={records} conversations={conversations} />
      </div>

      {/* Model quality: every figure is read from the active bundle (Model Hub shows the full detail) */}
      {modelInfo && (
        <div className="rounded-[24px] bg-gradient-to-r from-card to-muted/20 p-5 sm:p-6 shadow-xs border border-border/60 flex flex-col gap-4">
          <div className="flex items-center justify-between pb-2 border-b border-border/40">
            <div className="flex items-center gap-2.5">
              <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <Award className="size-4" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-foreground">Model benchmarks</h2>
                <p className="text-xs text-muted-foreground">Held-out test split from the training run. {modelInfo.limitation}</p>
              </div>
            </div>
            <span className="text-[11px] font-mono font-semibold px-2.5 py-1 rounded-full bg-muted text-muted-foreground">
              {modelInfo.version}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 2xl:grid-cols-6 gap-3">
            {[
              ["ROC-AUC", modelInfo.metrics.roc_auc?.toFixed(3)],
              ["PR-AUC", modelInfo.metrics.pr_auc?.toFixed(3)],
              ["Brier", modelInfo.metrics.brier?.toFixed(3)],
              ["Lift @ top 20%", modelInfo.metrics.lift_top20 == null ? undefined : `${modelInfo.metrics.lift_top20.toFixed(2)}×`],
              ["Base no-show rate", modelInfo.base_rate == null ? undefined : `${(modelInfo.base_rate * 100).toFixed(1)}%`],
              ["Oracle AUC", modelInfo.oracle_auc?.toFixed(3)],
            ].map(([label, value]) => (
              <div key={label} className="flex flex-col p-3 rounded-2xl bg-card border border-border/40">
                <span className="text-[11px] font-semibold text-muted-foreground">{label}</span>
                <span className="text-xl font-bold font-mono text-foreground mt-0.5">{value ?? "—"}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
