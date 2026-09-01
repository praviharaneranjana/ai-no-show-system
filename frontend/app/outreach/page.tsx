import { MessagesSquare, CheckCircle2, CalendarClock, Video, Languages } from "lucide-react";

import { listConversations } from "@/lib/api";
import { getAppointmentsWithPredictions } from "@/lib/appointments-with-predictions";
import { BackendUnreachable } from "@/components/backend-unreachable";
import { AgentSimulator } from "@/app/outreach/agent-simulator";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { InterventionLanguage } from "@/lib/types";

const LANGUAGE_BADGES: Record<InterventionLanguage, { label: string; className: string }> = {
  en: { label: "EN", className: "border-border text-foreground" },
  si: {
    label: "SI",
    className:
      "border-violet-500/40 bg-violet-500/10 text-violet-700 dark:border-violet-500/50 dark:bg-violet-950/40 dark:text-violet-300",
  },
  ta: {
    label: "TA",
    className:
      "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:border-sky-500/50 dark:bg-sky-950/40 dark:text-sky-300",
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
    <div className="flex w-full flex-col gap-6 p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col gap-1 border-b border-border/80 pb-5">
        <div className="flex items-center gap-2">
          <MessagesSquare className="size-5 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Autonomous Agent Hub
          </h1>
        </div>
        <p className="text-xs sm:text-sm text-muted-foreground">
          Trilingual (English / Sinhala / Tamil) patient outreach simulator and conversation log.{" "}
          <span className="text-muted-foreground/70">
            Rule-based intent classification prototype — a keyword/heuristic engine standing in for
            a production LLM agent, kept deterministic for demo reliability.
          </span>
        </p>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="border-border/80 shadow-xs">
          <CardContent className="flex items-center justify-between p-4">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Conversations</span>
              <span className="text-xl font-bold tracking-tight tabular-nums text-foreground">{total}</span>
            </div>
            <MessagesSquare className="size-5 text-muted-foreground" />
          </CardContent>
        </Card>

        <Card className="border-emerald-500/30 bg-emerald-500/[0.04] dark:bg-emerald-950/20 shadow-xs">
          <CardContent className="flex items-center justify-between p-4">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                Confirmation Rate
              </span>
              <span className="text-xl font-bold tracking-tight tabular-nums text-emerald-700 dark:text-emerald-300">
                {pct(confirmed)}%
              </span>
            </div>
            <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-300" />
          </CardContent>
        </Card>

        <Card className="border-amber-500/30 bg-amber-500/[0.04] dark:bg-amber-950/20 shadow-xs">
          <CardContent className="flex items-center justify-between p-4">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                Autonomous Reschedule
              </span>
              <span className="text-xl font-bold tracking-tight tabular-nums text-amber-700 dark:text-amber-300">
                {pct(rescheduled)}%
              </span>
            </div>
            <CalendarClock className="size-5 text-amber-600 dark:text-amber-300" />
          </CardContent>
        </Card>

        <Card className="border-border/80 shadow-xs">
          <CardContent className="flex items-center justify-between p-4">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Telehealth Conversion</span>
              <span className="text-xl font-bold tracking-tight tabular-nums text-foreground">
                {pct(telehealth)}%
              </span>
            </div>
            <Video className="size-5 text-primary" />
          </CardContent>
        </Card>
      </div>

      {/* Live Agent Simulator */}
      <Card className="border-border/80 shadow-xs">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Languages className="size-4 text-primary" />
            <CardTitle className="text-base">Live Trilingual Outreach Simulator</CardTitle>
          </div>
          <CardDescription className="text-xs">
            Pick an appointment, choose a patient reply, and watch the agent classify intent and
            respond autonomously.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AgentSimulator appointments={appointmentOptions} />
        </CardContent>
      </Card>

      {/* Conversation Feed */}
      <Card className="border-border/80 shadow-xs">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Recent Conversation Log</CardTitle>
          <CardDescription className="text-xs">
            All patient replies handled by the agent, most recent first.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {conversations.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No conversations recorded yet — try the simulator above.
            </p>
          ) : (
            <div className="flex flex-col divide-y divide-border/70">
              {conversations.map((c) => {
                const lang = LANGUAGE_BADGES[c.language] ?? LANGUAGE_BADGES.en;
                return (
                  <div key={c.id} className="flex flex-col gap-1.5 py-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={lang.className}>
                        {lang.label}
                      </Badge>
                      <span className="text-xs font-medium text-foreground">
                        {c.intent_detected ?? c.status}
                      </span>
                      <span className="text-[10px] text-muted-foreground ml-auto">
                        {new Date(c.created_at).toLocaleString()}
                      </span>
                    </div>
                    {c.patient_reply && (
                      <p className="text-xs text-muted-foreground italic">&ldquo;{c.patient_reply}&rdquo;</p>
                    )}
                    {c.offered_slot && (
                      <p className="text-xs text-foreground">
                        <span className="text-muted-foreground">AI action: </span>
                        {c.offered_slot}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
