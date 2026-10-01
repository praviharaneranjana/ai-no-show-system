"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2, Send, Bot, User, Sparkles, Copy, Check, WandSparkles } from "lucide-react";

import { draftOutreachAction, simulateAgentAction } from "@/app/outreach/actions";
import { Button } from "@/components/ui/button";
import type { AgentSimulateResult, InterventionLanguage, OutreachDraft } from "@/lib/types";

type AppointmentOption = {
  id: string;
  label: string;
};

const LANGUAGE_CONFIG: Record<InterventionLanguage, { label: string; badge: string }> = {
  en: { label: "English", badge: "EN" },
  si: { label: "සිංහල (Sinhala)", badge: "SI" },
  ta: { label: "தமிழ் (Tamil)", badge: "TA" },
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

export function AgentSimulator({
  appointments,
  initialAppointmentId,
}: {
  appointments: AppointmentOption[];
  initialAppointmentId?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [appointmentId, setAppointmentId] = useState(
    initialAppointmentId && appointments.some((a) => a.id === initialAppointmentId)
      ? initialAppointmentId
      : appointments[0]?.id ?? ""
  );
  const [language, setLanguage] = useState<InterventionLanguage>("en");
  const [message, setMessage] = useState("");
  const [lastPatientMessage, setLastPatientMessage] = useState<string | null>(null);
  const [result, setResult] = useState<AgentSimulateResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<OutreachDraft | null>(null);
  const [draftText, setDraftText] = useState("");
  const [copied, setCopied] = useState(false);

  // Arriving from "Dispatch Outreach": bring the draft card into view and draft straight away.
  const cardRef = useRef<HTMLDivElement>(null);
  const autoDrafted = useRef(false);
  useEffect(() => {
    if (!initialAppointmentId || autoDrafted.current || appointmentId !== initialAppointmentId) return;
    autoDrafted.current = true;
    cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    generateDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function generateDraft() {
    if (!appointmentId) return;
    setError(null);
    setCopied(false);
    startTransition(async () => {
      try {
        const res = await draftOutreachAction(appointmentId, language);
        setDraft(res);
        setDraftText(res.message);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not draft a message.");
      }
    });
  }

  async function copyDraft() {
    try {
      await navigator.clipboard.writeText(draftText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Copy failed — select the text and copy it manually.");
    }
  }

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
      <p className="text-sm text-muted-foreground py-6 text-center">
        No appointments available to simulate outreach for yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Controls: Target Appointment & Language Pill Selector */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 items-end">
        <div className="flex flex-col gap-1.5 md:col-span-7">
          <label className="text-xs font-semibold text-foreground">Select Target Appointment</label>
          <select
            value={appointmentId}
            onChange={(e) => setAppointmentId(e.target.value)}
            disabled={isPending}
            className="h-10 w-full rounded-xl border border-border/80 bg-background/90 px-3 text-xs outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 text-foreground"
          >
            {appointments.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5 md:col-span-5">
          <label className="text-xs font-semibold text-foreground">Language Mode</label>
          <div className="flex rounded-xl bg-muted/60 p-1 border border-border/50">
            {(["en", "si", "ta"] as InterventionLanguage[]).map((lang) => (
              <button
                key={lang}
                type="button"
                onClick={() => setLanguage(lang)}
                disabled={isPending}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  language === lang
                    ? "bg-card text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {LANGUAGE_CONFIG[lang].badge} · {LANGUAGE_CONFIG[lang].label.split(" ")[0]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* AI-drafted reminder (staff review; nothing is sent) */}
      <div ref={cardRef} className="flex flex-col gap-2.5 rounded-2xl border border-border/60 bg-muted/20 p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-foreground">AI reminder draft</span>
            <span className="text-[11px] text-muted-foreground">
              Tailored to this patient&apos;s risk drivers. Review and edit before sending — nothing is sent from here.
            </span>
          </div>
          <Button type="button" size="sm" onClick={generateDraft} disabled={isPending || !appointmentId} className="gap-1.5">
            {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <WandSparkles className="size-3.5" />}
            Draft with AI
          </Button>
        </div>

        {draft && (
          <>
            <textarea
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              rows={4}
              aria-label="Drafted reminder message"
              className="w-full resize-y rounded-xl border border-border/80 bg-background/90 p-3 text-xs leading-relaxed text-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-semibold">
                <span
                  className={`rounded-full px-2 py-0.5 ${
                    draft.source === "gemini"
                      ? "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {draft.source === "gemini" ? "Drafted by Gemini" : "Template (AI unavailable)"}
                </span>
                {draft.reasons.map((r) => (
                  <span key={r} className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                    {r.replace(/_/g, " ")}
                  </span>
                ))}
              </div>
              <Button type="button" variant="outline" size="sm" onClick={copyDraft} className="gap-1.5">
                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          </>
        )}
      </div>

      {/* Quick Replies Carousel / Chips */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-medium text-muted-foreground">Quick Test Inquiries:</span>
        <div className="flex flex-wrap gap-2">
          {QUICK_MESSAGES[language].map((q) => (
            <button
              key={q.label}
              type="button"
              disabled={isPending}
              onClick={() => send(q.text)}
              className="px-3 py-1.5 rounded-full text-xs font-medium border border-border/80 bg-card hover:bg-muted/40 hover:border-primary/50 text-foreground transition-all cursor-pointer disabled:opacity-50 active:scale-95"
            >
              {q.label}
            </button>
          ))}
        </div>
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
          placeholder={`Type custom patient response in ${LANGUAGE_CONFIG[language].label}…`}
          className="h-10 flex-1 rounded-xl border border-border/80 bg-background/90 px-3.5 text-xs outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 text-foreground placeholder:text-muted-foreground/60"
        />
        <Button
          size="sm"
          disabled={isPending || !message.trim()}
          onClick={() => send(message)}
          className="h-10 px-4 rounded-xl gap-2 shrink-0 bg-gradient-to-r from-[#8B7CF6] to-[#5B7CFA] text-white hover:opacity-90 shadow-xs cursor-pointer"
        >
          {isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          <span>Send Reply</span>
        </Button>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-600 dark:text-rose-400 font-medium">
          {error}
        </div>
      )}

      {/* WhatsApp / Chat simulation thread */}
      {(lastPatientMessage || result) && (
        <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-muted/20 p-4 animate-in fade-in duration-200">
          <div className="flex items-center justify-between pb-2 border-b border-border/40 text-[11px] text-muted-foreground">
            <span className="font-semibold uppercase tracking-wider">SMS / WhatsApp Session Stream</span>
            <span>Real-time NLP Parser</span>
          </div>

          {lastPatientMessage && (
            <div className="flex items-start justify-end gap-2.5">
              <div className="max-w-[75%] rounded-2xl rounded-tr-xs bg-gradient-to-r from-[#8B7CF6] to-[#5B7CFA] px-4 py-2.5 text-xs text-white shadow-xs">
                {lastPatientMessage}
              </div>
              <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground font-semibold text-xs border border-border/60">
                <User className="size-3.5" />
              </div>
            </div>
          )}

          {isPending && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground pl-1 py-1">
              <Loader2 className="size-3.5 animate-spin text-primary" />
              <span>SHAI autonomous agent is reasoning and drafting response…</span>
            </div>
          )}

          {result && !isPending && (
            <div className="flex items-start gap-2.5">
              <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary border border-primary/20">
                <Bot className="size-4" />
              </div>
              <div className="flex max-w-[80%] flex-col gap-2">
                <div className="rounded-2xl rounded-tl-xs bg-card border border-border/60 p-3.5 text-xs text-foreground whitespace-pre-line shadow-xs">
                  {result.agent_response}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20">
                    <Sparkles className="size-3" />
                    Intent: {result.intent}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    Action executed: <strong className="text-foreground">{result.suggested_action}</strong>
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
