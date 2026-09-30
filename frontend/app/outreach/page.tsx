import {
  MessagesSquare,
  CheckCircle2,
  CalendarClock,
  Video,
  Languages,
  History,
  Bot,
} from "lucide-react";

import { listConversations } from "@/lib/api";
import { getAppointmentsWithPredictions } from "@/lib/appointments-with-predictions";
import { BackendUnreachable } from "@/components/backend-unreachable";
import { AgentSimulator } from "@/app/outreach/agent-simulator";
import { StatCard } from "@/components/stat-card";
import type { InterventionLanguage } from "@/lib/types";

const LANGUAGE_BADGES: Record<InterventionLanguage, { label: string; className: string }> = {
  en: { label: "EN", className: "bg-muted text-foreground border border-border/80" },
  si: {
    label: "SI",
    className: "bg-violet-500/10 text-violet-700 dark:text-violet-300 border border-violet-500/30",
  },
  ta: {
    label: "TA",
    className: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/30",
  },
};

export default async function OutreachPage() {
  let conversations, records;
  try {
    [conversations, records] = await Promise.all([
      listConversations(),
      getAppointmentsWithPredictions(),
    ]);
  } catch (err) {
    return <BackendUnreachable error={err} />;
  }

  const total = conversations.length;
  const pct = (count: number) => (total > 0 ? Math.round((count / total) * 100) : 0);
  const confirmed = conversations.filter((c) => c.status === "confirmed").length;
  const rescheduled = conversations.filter((c) => c.status === "rescheduled").length;
  const telehealth = conversations.filter((c) => c.status === "telehealth_requested").length;

  const appointmentOptions = records
    .filter((r) => r.patient)
    .map((r) => ({
      id: r.appointment.id,
      label: `${r.patient!.full_name} — ${r.appointment.appointment_day}${
        r.appointment.department ? ` (${r.appointment.department})` : ""
      }`,
    }));

  return (
    <div className="flex w-full flex-col gap-6 p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-border/40">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2.5">
            <div className="size-9 rounded-xl bg-gradient-to-tr from-[#8B7CF6] to-[#5B7CFA] flex items-center justify-center text-white shadow-xs">
              <MessagesSquare className="size-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                Autonomous Patient Outreach Hub
              </h1>
            </div>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Trilingual (English / Sinhala / Tamil) proactive engagement engine with deterministic conversational triage.
          </p>
        </div>

        <div className="inline-flex items-center gap-2 self-start md:self-auto px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium">
          <Languages className="size-3.5" />
          <span>Rule-Based Intent Classifier · Demo Mode</span>
        </div>
      </div>

      {/* KPI StatCards (4 items) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <StatCard
          title="Total Conversations"
          value={total}
          icon={MessagesSquare}
        />
        <StatCard
          title="Confirmation Rate"
          value={`${pct(confirmed)}%`}
          icon={CheckCircle2}
        />
        <StatCard
          title="Autonomous Reschedule"
          value={`${pct(rescheduled)}%`}
          icon={CalendarClock}
          delta={{ value: "Slots preserved", isPositive: true }}
        />
        <StatCard
          title="Telehealth Conversion"
          value={`${pct(telehealth)}%`}
          icon={Video}
          delta={{ value: "Virtual slots", isPositive: true }}
        />
      </div>

      {/* Live Agent Simulator Bento Card */}
      <div className="rounded-[24px] bg-card p-5 sm:p-6 shadow-xs border border-border/60 flex flex-col gap-4">
        <div className="flex items-center justify-between pb-2 border-b border-border/40">
          <div className="flex items-center gap-2.5">
            <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <Bot className="size-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">Interactive Outreach Simulator</h2>
              <p className="text-xs text-muted-foreground">
                Trigger inbound messages across Sinhala, Tamil, or English to test classification and automated actions.
              </p>
            </div>
          </div>
        </div>

        <AgentSimulator appointments={appointmentOptions} />
      </div>

      {/* Recent Conversation Log Bento Card */}
      <div className="rounded-[24px] bg-card p-5 sm:p-6 shadow-xs border border-border/60 flex flex-col gap-4">
        <div className="flex items-center justify-between pb-2 border-b border-border/40">
          <div className="flex items-center gap-2.5">
            <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <History className="size-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">Recent Conversation History</h2>
              <p className="text-xs text-muted-foreground">
                Auditable log of all conversational triage dispatches handled by the outreach engine.
              </p>
            </div>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-muted text-muted-foreground">
            {conversations.length} Logs
          </span>
        </div>

        {conversations.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground flex flex-col items-center justify-center gap-2">
            <MessagesSquare className="size-8 text-muted-foreground/40" />
            <span>No conversations recorded yet. Use the simulator above to initiate interactions.</span>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-border/40">
            {conversations.map((c) => {
              const lang = LANGUAGE_BADGES[c.language] ?? LANGUAGE_BADGES.en;
              return (
                <div key={c.id} className="flex flex-col gap-2 py-3.5 hover:bg-muted/15 px-2 rounded-xl transition-colors">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${lang.className}`}>
                      {lang.label}
                    </span>
                    <span className="text-xs font-semibold text-foreground">
                      Intent: {c.intent_detected ?? c.status}
                    </span>
                    <span className="text-[11px] text-muted-foreground ml-auto">
                      {new Date(c.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} ·{" "}
                      {new Date(c.created_at).toLocaleDateString()}
                    </span>
                  </div>

                  {c.patient_reply && (
                    <p className="text-xs text-muted-foreground italic pl-3 border-l-2 border-border/80">
                      &ldquo;{c.patient_reply}&rdquo;
                    </p>
                  )}

                  {c.offered_slot && (
                    <div className="text-xs text-foreground flex items-center gap-1.5 pl-3">
                      <span className="text-primary font-semibold text-[11px]">System Action:</span>
                      <span className="text-muted-foreground">{c.offered_slot}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
