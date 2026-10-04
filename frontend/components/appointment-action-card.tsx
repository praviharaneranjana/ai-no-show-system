"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Phone,
  MessageSquareText,
  CalendarClock,
  Video,
  Sparkles,
  ShieldCheck,
  Send,
  Loader2,
  Check,
  ChevronDown,
  Clock,
  UserCheck,
  X,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Collapse } from "@/components/ui/collapse";
import { SlotPicker } from "@/components/outreach/slot-picker";
import { useCanApprove } from "@/components/use-role";
import { getRescheduleOptionsAction, rescheduleAction } from "@/app/appointments/[id]/actions";
import {
  appointmentConversationAction,
  approveConversationAction,
  bookConversationAction,
  rejectConversationAction,
  startConversationAction,
  takeOverAction,
} from "@/app/outreach/thread-actions";
import type { ConversationState, InterventionLanguage, RescheduleConversation, SlotDict } from "@/lib/types";

export type CardAction = {
  key: "ask" | "call" | "sms" | "reschedule" | "telehealth" | "monitor";
  label: string;
  reason: string;
  href: string | null;
};

const ICONS: Record<CardAction["key"], LucideIcon> = {
  ask: Send,
  call: Phone,
  sms: MessageSquareText,
  reschedule: CalendarClock,
  telehealth: Video,
  monitor: ShieldCheck,
};

const TIER: Record<string, string> = {
  High: "border-rose-500/40 from-rose-500/10",
  Medium: "border-amber-500/40 from-amber-500/10",
  Low: "border-emerald-500/40 from-emerald-500/10",
};

const LANGS: { key: InterventionLanguage; label: string }[] = [
  { key: "en", label: "English" },
  { key: "si", label: "සිංහල" },
  { key: "ta", label: "தமிழ்" },
];

const CLOSED: ConversationState[] = ["booked", "kept"];

function timeLeft(iso: string | null): string | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "overdue";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m left` : `${m}m left`;
}

const slotText = (s: SlotDict) =>
  `${s.doctor_name}, ${new Date(`${s.date}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })} ${s.start_time}`;

export function AppointmentActionCard({
  appointmentId,
  doctorId,
  currentLabel,
  category,
  actions,
  done,
  patientLanguage,
  patientHasPhone,
  initialConversation,
  openPicker,
}: {
  appointmentId: string;
  doctorId: string | null | undefined;
  currentLabel: string;
  category: string;
  actions: CardAction[];
  done: boolean;
  patientLanguage: InterventionLanguage;
  patientHasPhone: boolean;
  initialConversation: RescheduleConversation | null;
  openPicker: boolean;
}) {
  const router = useRouter();
  const canApprove = useCanApprove();
  const best = actions[0];

  const [conv, setConv] = useState<RescheduleConversation | null>(initialConversation);
  const [open, setOpen] = useState(openPicker);
  const [options, setOptions] = useState<SlotDict[] | null>(null);
  const [picked, setPicked] = useState<SlotDict | null>(null);
  const [notify, setNotify] = useState(patientHasPhone);
  const [language, setLanguage] = useState<InterventionLanguage>(patientLanguage);
  const [error, setError] = useState<string | null>(null);
  const [booked, setBooked] = useState<{ id: string; text: string; message: string | null } | null>(null);
  const [busy, startBusy] = useTransition();

  const active = conv && !CLOSED.includes(conv.state);

  const loading = open && options === null;

  useEffect(() => {
    if (!open || options !== null) return;
    let cancelled = false;
    getRescheduleOptionsAction(appointmentId).then((o) => {
      if (!cancelled) setOptions(o ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [open, options, appointmentId]);

  // Follow the conversation while it is live so a patient's reply shows up here.
  useEffect(() => {
    if (!conv || CLOSED.includes(conv.state)) return;
    const t = setInterval(async () => {
      const next = await appointmentConversationAction(appointmentId);
      if (next) setConv(next);
    }, 12_000);
    return () => clearInterval(t);
  }, [conv, appointmentId]);

  function ask() {
    setError(null);
    startBusy(async () => {
      const res = await startConversationAction(appointmentId, language);
      if (res.ok) setConv(res.data);
      else setError(res.message);
    });
  }

  function confirmBooking() {
    if (!picked) return;
    setError(null);
    startBusy(async () => {
      if (active && conv) {
        const res = await bookConversationAction(conv.id, {
          clinic_session_id: picked.session_id,
          appointment_day: picked.date,
          doctor_id: picked.doctor_id,
          notify,
          language,
        });
        if (res.ok) {
          setConv(res.data);
          setBooked({ id: res.data.appointment_id, text: `${slotText(picked)} · token #${res.data.appointment?.token ?? "?"}`, message: notify ? "Confirmation logged to the patient." : null });
          setOpen(false);
        } else setError(res.message);
        return;
      }
      const res = await rescheduleAction(appointmentId, { day: picked.date, sessionId: picked.session_id, doctorId: picked.doctor_id }, notify, language);
      if (res.ok) {
        setBooked({ id: res.newId, text: `${slotText(picked)} · token #${res.appointment.queue_number ?? "?"}`, message: res.message });
        setOpen(false);
      } else {
        setError(res.message);
        setPicked(null);
        setOptions(null); // the list may have changed under us: reload
      }
    });
  }

  function approve() {
    if (!conv) return;
    setError(null);
    startBusy(async () => {
      const res = await approveConversationAction(conv.id);
      if (!res.ok) return setError(res.message);
      setConv(res.data.conversation);
      if (res.data.booked) {
        const a = res.data.conversation.appointment;
        setBooked({ id: res.data.conversation.appointment_id, text: `${conv.offer ? slotText(conv.offer) : ""} · token #${a?.token ?? "?"}`, message: res.data.message });
      } else setError("That slot was just taken. The patient has been offered another option.");
    });
  }

  function decline() {
    if (!conv) return;
    startBusy(async () => {
      const res = await rejectConversationAction(conv.id);
      if (res.ok) setConv(res.data);
      else setError(res.message);
    });
  }

  function takeOver() {
    if (!conv) return;
    startBusy(async () => {
      const res = await takeOverAction(conv.id);
      if (res.ok) setConv(res.data);
    });
  }

  function handleAction(a: CardAction) {
    if (a.key === "ask") return ask();
    if (a.key === "reschedule") return setOpen((o) => !o);
  }

  const btn = (primary: boolean, disabled = false) =>
    cn(
      "inline-flex h-10 cursor-pointer select-none items-center gap-2 rounded-xl border px-4 text-xs font-bold transition-all duration-200",
      "hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
      primary
        ? "border-transparent bg-gradient-to-r from-[#8B7CF6] to-[#5B7CFA] text-white shadow-md shadow-[#8B7CF6]/25 hover:shadow-lg hover:shadow-[#8B7CF6]/30"
        : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-muted",
      disabled && "pointer-events-none opacity-45"
    );

  return (
    <section
      aria-label="Patient outreach actions"
      className={cn("flex flex-col gap-4 rounded-[24px] border bg-gradient-to-br to-card p-5 bento-card-shadow", TIER[category] ?? "border-border")}
    >
      {/* 1. Header: title and why */}
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-[#8B7CF6]">
          <Sparkles className="size-3.5" /> Recommended action
        </div>
        <h2 className="mt-1 font-heading text-lg font-bold text-foreground">{done ? "Outcome recorded" : best.label}</h2>
        <p className="mt-0.5 max-w-3xl text-xs text-muted-foreground">
          {done ? "This visit is closed; use Undo above if it was recorded by mistake." : best.reason}
        </p>
      </div>

      {/* 2. Conversation status */}
      <Collapse open={!!conv}>
        {conv && (
          <ConversationStrip
            conv={conv}
            busy={busy}
            canApprove={canApprove}
            onApprove={approve}
            onDecline={decline}
            onTakeOver={takeOver}
            onPick={() => setOpen(true)}
          />
        )}
      </Collapse>

      {/* 3. Result of a booking */}
      <Collapse open={!!booked}>
        {booked && (
          <div className="flex flex-col gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-700 dark:text-emerald-300">
            <div className="flex items-center gap-2 text-sm font-bold">
              <Check className="size-4" /> Booking moved
            </div>
            <div className="grid gap-2 text-xs sm:grid-cols-[1fr_auto_1fr] sm:items-center">
              <div className="rounded-xl bg-background/60 p-2.5 text-foreground">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Was</div>
                {currentLabel}
              </div>
              <ArrowRight className="hidden size-4 sm:block" />
              <div className="rounded-xl bg-background/60 p-2.5 text-foreground">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Now</div>
                {booked.text}
              </div>
            </div>
            {booked.message && (
              <div className="rounded-xl bg-background/60 p-2.5 text-xs text-foreground">
                <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Message sent to the patient</div>
                {booked.message}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => router.push(`/appointments/${booked.id}`)} className={btn(true)}>
                Open new appointment <ArrowRight className="size-4" />
              </button>
            </div>
          </div>
        )}
      </Collapse>

      {/* 4. Action buttons */}
      {!done && (
        <div className="flex flex-wrap items-center gap-2">
          {actions
            .filter((a) => a.key !== "monitor")
            .map((a) => {
              const Icon = ICONS[a.key];
              const primary = a.key === best.key;
              const disabledAsk = a.key === "ask" && (busy || !!active || !patientHasPhone);
              const content = (
                <>
                  {a.key === "ask" && busy ? <Loader2 className="size-4 animate-spin" /> : <Icon className="size-4" />}
                  {a.label}
                  {a.key === "reschedule" && <ChevronDown className={cn("size-4 transition-transform duration-300", open && "rotate-180")} />}
                  {primary && <span className="rounded-full bg-white/20 px-1.5 py-px text-[9px] uppercase">best</span>}
                  {a.key === "call" && !a.href && <span className="text-[10px] font-medium">no phone</span>}
                </>
              );
              if (a.key === "ask" || a.key === "reschedule") {
                return (
                  <button
                    key={a.key}
                    type="button"
                    title={a.reason}
                    aria-expanded={a.key === "reschedule" ? open : undefined}
                    onClick={() => handleAction(a)}
                    className={btn(primary, disabledAsk)}
                  >
                    {content}
                  </button>
                );
              }
              return a.href ? (
                <Link key={a.key} href={a.href} title={a.reason} className={btn(primary)}>
                  {content}
                </Link>
              ) : (
                <span key={a.key} aria-disabled className={btn(primary, true)}>
                  {content}
                </span>
              );
            })}
          {!patientHasPhone && actions.some((a) => a.key === "ask") && (
            <span className="text-[11px] text-muted-foreground">No phone on file, so the patient cannot be asked.</span>
          )}
        </div>
      )}

      {/* 5. Slot picker */}
      <Collapse open={open && !done}>
        <div className="rounded-2xl border border-border/70 bg-card/80 p-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-foreground">Open sessions in this department</div>
              <div className="text-[11px] text-muted-foreground">
                Booked for {currentLabel}. Pick any session with free places, with this doctor or a colleague. The old place is released for the waitlist.
              </div>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="cursor-pointer rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted">
              <X className="size-4" />
            </button>
          </div>

          {loading || options === null ? (
            <div className="flex items-center gap-2 py-8 text-xs text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading sessions…
            </div>
          ) : options.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">No open session in the next 4 weeks for this department. Add the patient to the waitlist from Capacity.</p>
          ) : (
            <SlotPicker options={options} picked={picked} onPick={setPicked} currentDoctorId={doctorId} />
          )}

          <div className="mt-4 flex flex-col gap-3 border-t border-border/60 pt-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <label className={cn("flex cursor-pointer items-center gap-2 font-semibold", !patientHasPhone && "cursor-not-allowed opacity-50")}>
                <input type="checkbox" checked={notify} disabled={!patientHasPhone} onChange={(e) => setNotify(e.target.checked)} className="size-4 cursor-pointer accent-[#8B7CF6]" />
                Message the patient the new time
              </label>
              {notify && (
                <div className="flex rounded-lg bg-muted/60 p-0.5">
                  {LANGS.map((l) => (
                    <button
                      key={l.key}
                      type="button"
                      onClick={() => setLanguage(l.key)}
                      className={cn("cursor-pointer rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors", language === l.key ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground")}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
              )}
              {!patientHasPhone && <span className="text-[11px] text-muted-foreground">No phone on file</span>}
            </div>
            <button type="button" disabled={!picked || busy} onClick={confirmBooking} className={btn(true, !picked || busy)}>
              {busy && <Loader2 className="size-3.5 animate-spin" />}
              {notify ? "Move booking and message patient" : "Move booking"}
            </button>
          </div>
        </div>
      </Collapse>

      {error && <p className="text-xs font-medium text-rose-500">{error}</p>}
    </section>
  );
}

const STATE_COPY: Record<ConversationState, { title: string; tone: string }> = {
  awaiting_reply: { title: "Asked the patient. Waiting for a reply", tone: "violet" },
  offering: { title: "Offered a slot. Waiting for the patient", tone: "violet" },
  choosing_doctor: { title: "Patient is choosing between doctors", tone: "violet" },
  pending_approval: { title: "Patient agreed. Waiting for your approval", tone: "amber" },
  needs_staff: { title: "Needs a person to arrange a time", tone: "rose" },
  no_reply: { title: "No reply in 24 hours. Call the patient", tone: "rose" },
  booked: { title: "New slot booked and confirmed to the patient", tone: "emerald" },
  kept: { title: "Patient confirmed they will attend", tone: "emerald" },
};

const TONE: Record<string, string> = {
  violet: "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  amber: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  rose: "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
};

function ConversationStrip({
  conv,
  busy,
  canApprove,
  onApprove,
  onDecline,
  onTakeOver,
  onPick,
}: {
  conv: RescheduleConversation;
  busy: boolean;
  canApprove: boolean;
  onApprove: () => void;
  onDecline: () => void;
  onTakeOver: () => void;
  onPick: () => void;
}) {
  const copy = STATE_COPY[conv.state];
  const left = ["awaiting_reply", "offering", "choosing_doctor"].includes(conv.state) ? timeLeft(conv.expires_at) : null;
  const small = "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border px-3 text-[11px] font-bold transition-all hover:-translate-y-0.5 active:scale-95 disabled:pointer-events-none disabled:opacity-50";

  return (
    <div className={cn("flex flex-col gap-3 rounded-2xl border p-4", TONE[copy.tone])}>
      <div className="flex flex-wrap items-center gap-2 text-sm font-bold">
        {conv.state === "pending_approval" ? <UserCheck className="size-4" /> : <Clock className="size-4" />}
        {copy.title}
        {left && <span className="rounded-full bg-background/60 px-2 py-0.5 text-[10px] font-semibold text-foreground">{left}</span>}
        {conv.handled_by_staff && <span className="rounded-full bg-background/60 px-2 py-0.5 text-[10px] font-semibold text-foreground">staff handling</span>}
      </div>

      {conv.state === "pending_approval" && conv.offer && (
        <div className="rounded-xl bg-background/60 p-3 text-xs text-foreground">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Proposed booking</div>
          <div className="mt-0.5 font-semibold">{slotText(conv.offer)}</div>
          <div className="text-muted-foreground">
            {conv.offer.label} · Room {conv.offer.room.replace(/^Room\s+/i, "")} · token #{conv.offer.next_token}
            {!conv.offer.same_doctor && " · different doctor"}
          </div>
        </div>
      )}

      {conv.state === "choosing_doctor" && conv.options.length > 0 && (
        <ul className="grid gap-1 text-xs text-foreground">
          {conv.options.map((o, i) => (
            <li key={`${o.session_id}-${o.date}`} className="rounded-lg bg-background/60 px-3 py-1.5">
              {i + 1}. {slotText(o)}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2 text-foreground">
        {conv.state === "pending_approval" &&
          (canApprove ? (
            <>
              <button type="button" disabled={busy} onClick={onApprove} className={cn(small, "border-transparent bg-emerald-600 text-white shadow-sm")}>
                {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Approve and book
              </button>
              <button type="button" disabled={busy} onClick={onDecline} className={cn(small, "border-border bg-card")}>
                Decline
              </button>
            </>
          ) : (
            <span className="text-[11px] text-muted-foreground">Your role can view this but not approve it.</span>
          ))}
        {(conv.state === "needs_staff" || conv.state === "no_reply") && (
          <button type="button" onClick={onPick} className={cn(small, "border-transparent bg-gradient-to-r from-[#8B7CF6] to-[#5B7CFA] text-white")}>
            <CalendarClock className="size-3.5" /> Pick a slot manually
          </button>
        )}
        {["awaiting_reply", "offering", "choosing_doctor"].includes(conv.state) && !conv.handled_by_staff && (
          <button type="button" disabled={busy} onClick={onTakeOver} className={cn(small, "border-border bg-card")}>
            Take over
          </button>
        )}
        {conv.state === "booked" && (
          <Link href={`/appointments/${conv.appointment_id}`} className={cn(small, "border-border bg-card")}>
            Open new appointment <ArrowRight className="size-3.5" />
          </Link>
        )}
        <Link href={`/outreach?patient=${conv.patient_id}`} className={cn(small, "border-border bg-card")}>
          <MessageSquareText className="size-3.5" /> Open chat
        </Link>
      </div>
    </div>
  );
}
