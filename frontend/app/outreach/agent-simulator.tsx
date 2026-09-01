"use client";

import { useState, useTransition } from "react";
import { Loader2, Send, Bot, User } from "lucide-react";

import { simulateAgentAction } from "@/app/outreach/actions";
import { Button } from "@/components/ui/button";
import type { AgentSimulateResult, InterventionLanguage } from "@/lib/types";

type AppointmentOption = {
  id: string;
  label: string;
};

const LANGUAGE_LABELS: Record<InterventionLanguage, string> = {
  en: "English",
  si: "Sinhala",
  ta: "Tamil",
};

const QUICK_MESSAGES: Record<InterventionLanguage, { label: string; text: string }[]> = {
  en: [
    { label: "Can't make it", text: "I can't come tomorrow, can we change to next week?" },
    { label: "Prefer video call", text: "Can we do a video call instead?" },
    { label: "Ask about prep", text: "What should I do before the fasting test?" },
    { label: "Confirm attendance", text: "Yes, I'll be coming, thank you" },
    { label: "Cancel visit", text: "Please cancel my appointment" },
  ],
  si: [
    { label: "Can't make it", text: "Mata heta enna bahe, wena dawasak thiyenawada?" },
    { label: "Prefer video call", text: "Gedara indan doctor va video eken balanna puluwanda?" },
    { label: "Ask about prep", text: "Test eken kalin monawada kanna one?" },
    { label: "Confirm attendance", text: "Hari, mama enawa heta." },
    { label: "Cancel visit", text: "Mata me appointment eka epaa, ain karanna." },
  ],
  ta: [
    { label: "Can't make it", text: "Naan naalai varamudiyadhu, vera naal kidaikuma?" },
    { label: "Prefer video call", text: "Video call moolam doctor paarkka mudiyuma?" },
    { label: "Ask about prep", text: "Test edukka munnadi naan enna pannanum?" },
    { label: "Confirm attendance", text: "Sari, naan varuven." },
    { label: "Cancel visit", text: "Vendaam, appointment ah cancel pannunga." },
  ],
};

export function AgentSimulator({ appointments }: { appointments: AppointmentOption[] }) {
  const [isPending, startTransition] = useTransition();
  const [appointmentId, setAppointmentId] = useState(appointments[0]?.id ?? "");
  const [language, setLanguage] = useState<InterventionLanguage>("en");
  const [message, setMessage] = useState("");
  const [lastPatientMessage, setLastPatientMessage] = useState<string | null>(null);
  const [result, setResult] = useState<AgentSimulateResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function send(text: string) {
    if (!appointmentId || !text.trim()) return;
    setError(null);
    setLastPatientMessage(text);
    startTransition(async () => {
      try {
        const res = await simulateAgentAction(appointmentId, text, language);
        setResult(res);
        setMessage("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Simulation failed.");
      }
    });
  }

  if (appointments.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No appointments available to simulate outreach for yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Controls */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-foreground">Appointment</label>
          <select
            value={appointmentId}
            onChange={(e) => setAppointmentId(e.target.value)}
            disabled={isPending}
            className="h-9 w-full rounded-lg border border-input bg-card px-2.5 text-xs outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20 text-foreground"
          >
            {appointments.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-foreground">Patient Language</label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as InterventionLanguage)}
            disabled={isPending}
            className="h-9 w-full rounded-lg border border-input bg-card px-2.5 text-xs outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20 text-foreground"
          >
            <option value="en">English</option>
            <option value="si">Sinhala</option>
            <option value="ta">Tamil</option>
          </select>
        </div>
      </div>

      {/* Quick canned messages */}
      <div className="flex flex-wrap gap-1.5">
        {QUICK_MESSAGES[language].map((q) => (
          <Button
            key={q.label}
            variant="outline"
            size="xs"
            disabled={isPending}
            onClick={() => send(q.text)}
            className="text-[11px]"
          >
            {q.label}
          </Button>
        ))}
      </div>

      {/* Free text input */}
      <div className="flex items-center gap-2">
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send(message);
          }}
          disabled={isPending}
          placeholder={`Type a patient reply in ${LANGUAGE_LABELS[language]}…`}
          className="h-9 flex-1 rounded-lg border border-input bg-card px-3 text-xs outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20 text-foreground"
        />
        <Button
          size="sm"
          disabled={isPending || !message.trim()}
          onClick={() => send(message)}
          className="gap-1.5 shrink-0"
        >
          {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
          <span>Send</span>
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive font-medium">
          {error}
        </div>
      )}

      {/* Live conversation preview */}
      {(lastPatientMessage || result) && (
        <div className="flex flex-col gap-2.5 rounded-lg border border-border/70 bg-muted/20 p-3.5">
          {lastPatientMessage && (
            <div className="flex items-start justify-end gap-2">
              <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-primary px-3 py-2 text-xs text-primary-foreground">
                {lastPatientMessage}
              </div>
              <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <User className="size-3.5" />
              </div>
            </div>
          )}

          {isPending && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              <span>SHAI agent is composing a reply…</span>
            </div>
          )}

          {result && !isPending && (
            <div className="flex items-start gap-2">
              <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                <Bot className="size-3.5" />
              </div>
              <div className="flex max-w-[80%] flex-col gap-1.5">
                <div className="rounded-2xl rounded-tl-sm bg-card ring-1 ring-foreground/10 px-3 py-2 text-xs text-foreground whitespace-pre-line">
                  {result.agent_response}
                </div>
                <span className="text-[10px] text-muted-foreground">
                  Detected intent: <strong>{result.intent}</strong> · Action: {result.suggested_action}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
