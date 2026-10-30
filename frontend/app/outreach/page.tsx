import {
  MessagesSquare,
  CheckCircle2,
  CalendarClock,
  Video,
  Languages,
} from "lucide-react";

import { listConversations, listThreads } from "@/lib/api";
import { getAppointmentsWithPredictions } from "@/lib/appointments-with-predictions";
import { BackendUnreachable } from "@/components/backend-unreachable";
import { AgentSimulator } from "@/app/outreach/agent-simulator";
import { ThreadsHub } from "@/components/outreach/threads-hub";
import { SimulatorPanel } from "@/components/outreach/simulator-panel";
import { StatCard } from "@/components/stat-card";

export default async function OutreachPage({
  searchParams,
}: {
  searchParams?: Promise<{ appointmentId?: string; patient?: string }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const targetAppointmentId = resolvedSearchParams?.appointmentId;
  const targetPatientId = resolvedSearchParams?.patient;

  let conversations, records, threads;
  try {
    [conversations, records, threads] = await Promise.all([
      listConversations(),
      getAppointmentsWithPredictions(),
      listThreads(),
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
      <div className="grid grid-cols-2 2xl:grid-cols-4 gap-3.5">
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

      {/* Patient conversations: list, search and WhatsApp-style chat */}
      <ThreadsHub initialThreads={threads} initialPatientId={targetPatientId} />

      {/* Original simulator, kept for demos */}
      <SimulatorPanel>
        <AgentSimulator appointments={appointmentOptions} initialAppointmentId={targetAppointmentId} />
      </SimulatorPanel>
    </div>
  );
}
