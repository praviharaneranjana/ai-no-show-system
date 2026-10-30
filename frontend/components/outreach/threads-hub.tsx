"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  Search,
  ArrowLeft,
  Send,
  Loader2,
  Check,
  Phone,
  UserCheck,
  CalendarClock,
  Bot,
  Hand,
  MessagesSquare,
  X,
  FlaskConical,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Collapse } from "@/components/ui/collapse";
import { StateBadge } from "@/components/outreach/state-badge";
import { SlotPicker } from "@/components/outreach/slot-picker";
import { useCanApprove } from "@/components/use-role";
import { getRescheduleOptionsAction } from "@/app/appointments/[id]/actions";
import {
  bookConversationAction,
  getThreadAction,
  listThreadsAction,
  rejectConversationAction,
  resumeAction,
  sendIncomingAction,
  sendStaffMessageAction,
  startConversationAction,
  takeOverAction,
} from "@/app/outreach/thread-actions";
import type { ChatBubble, SlotDict, ThreadDetail, ThreadSummary } from "@/lib/types";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "needs_staff", label: "Needs you" },
  { key: "approval", label: "Approval" },
  { key: "in_progress", label: "In progress" },
  { key: "booked", label: "Booked" },
];

const initials = (n: string) =>
  n.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

function ago(iso: string) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h`;
  return `${Math.floor(mins / 1440)}d`;
}

const slotLine = (s: SlotDict) =>
  `${s.doctor_name}, ${new Date(`${s.date}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })} ${s.start_time}`;

export function ThreadsHub({ initialThreads, initialPatientId }: { initialThreads: ThreadSummary[]; initialPatientId?: string }) {
  const router = useRouter();
  const canApprove = useCanApprove();
  const [threads, setThreads] = useState(initialThreads);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<string | null>(initialPatientId ?? initialThreads[0]?.patient_id ?? null);
  const [mobileChat, setMobileChat] = useState(!!initialPatientId);
  const [detail, setDetail] = useState<ThreadDetail | null>(null);
  const [text, setText] = useState("");
  const [asPatient, setAsPatient] = useState(false);
  const [manual, setManual] = useState(false);
  const [options, setOptions] = useState<SlotDict[] | null>(null);
  const [picked, setPicked] = useState<SlotDict | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, startBusy] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);

  const refreshThreads = useCallback(async () => {
    const rows = await listThreadsAction(query, filter);
    if (rows) setThreads(rows);
  }, [query, filter]);

  // Search and filter, debounced.
  useEffect(() => {
    const t = setTimeout(refreshThreads, 250);
    return () => clearTimeout(t);
  }, [refreshThreads]);

  const loadDetail = useCallback(async (id: string) => {
    const d = await getThreadAction(id);
    if (d) setDetail(d);
  }, []);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    getThreadAction(selected).then((d) => {
      if (!cancelled && d) setDetail(d);
    });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  // Live-ish: refresh the list and the open chat every 10 s.
  useEffect(() => {
    const t = setInterval(() => {
      void refreshThreads();
      if (selected) void loadDetail(selected);
    }, 10_000);
    return () => clearInterval(t);
  }, [refreshThreads, loadDetail, selected]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [detail?.messages.length, selected]);

  const conv = detail && detail.patient.id === selected ? detail.conversation : null;
  const active = conv && !["booked", "kept"].includes(conv.state);
  const current = detail && detail.patient.id === selected ? detail : null;

  function pick(id: string) {
    setSelected(id);
    setDetail(null);
    setManual(false);
    setPicked(null);
    setError(null);
    setMobileChat(true);
  }

  async function act<T>(fn: () => Promise<{ ok: true; data: T } | { ok: false; message: string }>) {
    setError(null);
    const res = await fn();
    if (!res.ok) setError(res.message);
    if (selected) await loadDetail(selected);
    await refreshThreads();
    return res;
  }

  function send() {
    const body = text.trim();
    if (!body || !conv) return;
    setText("");
    startBusy(async () => {
      await act(() => (asPatient ? sendIncomingAction(conv.id, body) : sendStaffMessageAction(conv.id, body)));
    });
  }

  function toggleManual() {
    const next = !manual;
    setManual(next);
    if (next && conv && options === null) {
      getRescheduleOptionsAction(conv.appointment_id).then((o) => setOptions(o ?? []));
    }
  }

  const grouped = useMemo(() => threads, [threads]);

  return (
    <div className="grid h-[calc(100vh-17rem)] min-h-[560px] overflow-hidden rounded-[24px] border border-border/60 bg-card shadow-xs lg:grid-cols-[360px_1fr]">
      {/* ---------------- Thread list ---------------- */}
      <aside className={cn("flex min-h-0 flex-col border-border/60 lg:border-r", mobileChat && "hidden lg:flex")}>
        <div className="flex flex-col gap-2.5 border-b border-border/60 p-3.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search patient, phone or message…"
              aria-label="Search conversations"
              className="h-10 w-full rounded-xl border border-border/80 bg-background/90 pl-9 pr-3 text-xs outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={cn(
                  "cursor-pointer rounded-full border px-3 py-1 text-[11px] font-semibold transition-all active:scale-95",
                  filter === f.key ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {grouped.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-14 text-center text-xs text-muted-foreground">
              <MessagesSquare className="size-8 text-muted-foreground/40" />
              {query || filter !== "all" ? "No conversations match." : "No conversations yet. Ask a high-risk patient to reschedule from their appointment page."}
            </div>
          ) : (
            grouped.map((t) => (
              <button
                key={t.patient_id}
                type="button"
                onClick={() => pick(t.patient_id)}
                className={cn(
                  "flex w-full cursor-pointer items-start gap-3 border-b border-border/40 px-3.5 py-3 text-left transition-colors hover:bg-muted/40",
                  selected === t.patient_id && "bg-primary/5"
                )}
              >
                <span className="relative flex size-10 shrink-0 items-center justify-center rounded-full bg-[#EDE9FE] text-xs font-bold text-[#8B7CF6] dark:bg-[#252538] dark:text-[#C4B5FD]">
                  {initials(t.patient_name)}
                  {t.needs_attention && <span className="absolute -right-0.5 -top-0.5 size-3 rounded-full bg-rose-500 ring-2 ring-card" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-bold text-foreground">{t.patient_name}</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">{ago(t.last_at)}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{t.last_text}</span>
                  <StateBadge state={t.state} className="mt-1.5 inline-block" />
                </span>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* ---------------- Chat ---------------- */}
      <section className={cn("flex min-h-0 flex-col", !mobileChat && "hidden lg:flex")}>
        {!current ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
            {selected ? <Loader2 className="size-5 animate-spin" /> : <MessagesSquare className="size-10 text-muted-foreground/30" />}
            {selected ? "Loading conversation…" : "Select a patient to see the conversation."}
          </div>
        ) : (
          <>
            {/* header */}
            <div className="flex flex-wrap items-center gap-3 border-b border-border/60 px-4 py-3">
              <button type="button" onClick={() => setMobileChat(false)} aria-label="Back to list" className="cursor-pointer rounded-lg p-1.5 hover:bg-muted lg:hidden">
                <ArrowLeft className="size-4" />
              </button>
              <span className="flex size-9 items-center justify-center rounded-full bg-[#EDE9FE] text-xs font-bold text-[#8B7CF6] dark:bg-[#252538] dark:text-[#C4B5FD]">
                {initials(current.patient.name)}
              </span>
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-foreground">{current.patient.name}</div>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  {current.patient.phone && (
                    <a href={`tel:${current.patient.phone}`} className="inline-flex items-center gap-1 hover:text-foreground">
                      <Phone className="size-3" /> {current.patient.phone}
                    </a>
                  )}
                  {current.patient.uhid && <span className="font-mono">{current.patient.uhid}</span>}
                </div>
              </div>
              <StateBadge state={conv?.state ?? null} />
              <div className="ml-auto flex flex-wrap items-center gap-2">
                {active && conv && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => startBusy(async () => void (await act(() => (conv.handled_by_staff ? resumeAction(conv.id) : takeOverAction(conv.id)))))}
                    className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 text-[11px] font-bold transition-all hover:-translate-y-0.5 hover:bg-muted active:scale-95"
                  >
                    {conv.handled_by_staff ? <Bot className="size-3.5" /> : <Hand className="size-3.5" />}
                    {conv.handled_by_staff ? "Resume automation" : "Take over"}
                  </button>
                )}
                {active && (
                  <button
                    type="button"
                    onClick={toggleManual}
                    className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 text-[11px] font-bold transition-all hover:-translate-y-0.5 hover:bg-muted active:scale-95"
                  >
                    <CalendarClock className="size-3.5" /> Book manually
                  </button>
                )}
                {current.appointment && (
                  <a href={`/appointments/${current.appointment.id}`} className="text-[11px] font-semibold text-[#8B7CF6] hover:underline">
                    Open appointment
                  </a>
                )}
              </div>
            </div>

            {/* manual booking */}
            <Collapse open={manual && !!active}>
              <div className="border-b border-border/60 bg-muted/20 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-bold text-foreground">Pick any open session</span>
                  <button type="button" onClick={() => setManual(false)} aria-label="Close" className="cursor-pointer rounded-lg p-1 hover:bg-muted">
                    <X className="size-4" />
                  </button>
                </div>
                {options === null ? (
                  <div className="flex items-center gap-2 py-6 text-xs text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading sessions…</div>
                ) : (
                  <SlotPicker options={options} picked={picked} onPick={setPicked} currentDoctorId={null} />
                )}
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    disabled={!picked || busy || !conv}
                    onClick={() =>
                      conv &&
                      picked &&
                      startBusy(async () => {
                        const r = await act(() =>
                          bookConversationAction(conv.id, { clinic_session_id: picked.session_id, appointment_day: picked.date, doctor_id: picked.doctor_id, notify: true })
                        );
                        if (r.ok) {
                          setManual(false);
                          setPicked(null);
                          setOptions(null);
                        }
                      })
                    }
                    className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 text-xs font-bold text-primary-foreground transition-all hover:-translate-y-0.5 active:scale-95 disabled:pointer-events-none disabled:opacity-50"
                  >
                    {busy && <Loader2 className="size-3.5 animate-spin" />} Book and message patient
                  </button>
                </div>
              </div>
            </Collapse>

            {/* messages */}
            <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto bg-muted/10 px-4 py-4">
              {current.messages.map((m) => (
                <Bubble key={m.id} m={m} />
              ))}
              <div ref={bottomRef} />
            </div>

            {/* approval */}
            <Collapse open={conv?.state === "pending_approval"}>
              {conv?.state === "pending_approval" && conv.offer && (
                <div className="border-t border-amber-500/40 bg-amber-500/10 p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <UserCheck className="size-5 text-amber-600" />
                    <div className="min-w-0 flex-1 text-xs">
                      <div className="font-bold text-foreground">Patient agreed. Approve this booking?</div>
                      <div className="text-muted-foreground">
                        {slotLine(conv.offer)} · Room {conv.offer.room.replace(/^Room\s+/i, "")} · token #{conv.offer.next_token}
                        {!conv.offer.same_doctor && " · different doctor"}
                      </div>
                    </div>
                    {canApprove ? (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => router.push(`/new?conversation=${conv.id}&patient=${conv.patient_id}`)}
                          className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-emerald-600 px-4 text-xs font-bold text-white shadow-sm transition-all hover:-translate-y-0.5 active:scale-95 disabled:opacity-50"
                        >
                          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Approve and book
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => startBusy(async () => void (await act(() => rejectConversationAction(conv.id))))}
                          className="inline-flex h-9 cursor-pointer items-center rounded-lg border border-border bg-card px-4 text-xs font-bold transition-all hover:-translate-y-0.5 active:scale-95"
                        >
                          Decline
                        </button>
                      </div>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">Your role can view this but not approve it.</span>
                    )}
                  </div>
                </div>
              )}
            </Collapse>

            {/* composer */}
            <div className="border-t border-border/60 p-3">
              {error && <p className="mb-2 text-xs font-medium text-rose-500">{error}</p>}
              {!active ? (
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>
                    {conv ? "This conversation is closed." : "No open conversation with this patient."}
                  </span>
                  {current.appointment?.status === "scheduled" && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => current.appointment && startBusy(async () => void (await act(() => startConversationAction(current.appointment!.id, current.patient.language))))}
                      className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 font-bold text-foreground transition-all hover:-translate-y-0.5 hover:bg-muted active:scale-95"
                    >
                      <Send className="size-3.5" /> Ask to reschedule
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-1 self-start rounded-lg bg-muted/60 p-0.5 text-[11px] font-semibold">
                    <button type="button" onClick={() => setAsPatient(false)} className={cn("cursor-pointer rounded-md px-2.5 py-1 transition-colors", !asPatient ? "bg-card text-foreground shadow-xs" : "text-muted-foreground")}>
                      Reply as staff
                    </button>
                    <button type="button" onClick={() => setAsPatient(true)} className={cn("inline-flex cursor-pointer items-center gap-1 rounded-md px-2.5 py-1 transition-colors", asPatient ? "bg-card text-foreground shadow-xs" : "text-muted-foreground")}>
                      <FlaskConical className="size-3" /> Test as patient
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && send()}
                      placeholder={asPatient ? "Type what the patient would reply (demo)…" : "Type a message to the patient (this pauses automation)…"}
                      className="h-10 flex-1 rounded-xl border border-border/80 bg-background/90 px-3.5 text-xs outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                    />
                    <button
                      type="button"
                      disabled={busy || !text.trim()}
                      onClick={send}
                      className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl bg-gradient-to-r from-[#8B7CF6] to-[#5B7CFA] px-4 text-xs font-bold text-white shadow-xs transition-all hover:-translate-y-0.5 active:scale-95 disabled:pointer-events-none disabled:opacity-50"
                    >
                      {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Send
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function Bubble({ m }: { m: ChatBubble }) {
  const time = new Date(m.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (m.direction === "note") {
    return (
      <div className="flex justify-center animate-in fade-in duration-300">
        <span className="rounded-full bg-muted px-3 py-1 text-[10px] font-medium text-muted-foreground">{m.text}</span>
      </div>
    );
  }
  const out = m.direction === "out";
  return (
    <div className={cn("flex animate-in fade-in slide-in-from-bottom-1 duration-300", out ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[78%] whitespace-pre-line rounded-2xl px-3.5 py-2.5 text-xs shadow-xs",
          out ? "rounded-tr-sm bg-gradient-to-r from-[#8B7CF6] to-[#5B7CFA] text-white" : "rounded-tl-sm border border-border/60 bg-card text-foreground"
        )}
      >
        {m.text}
        {m.offer && (
          <div className={cn("mt-2 rounded-lg border p-2 text-[11px]", out ? "border-white/30 bg-white/10" : "border-border bg-muted/40")}>
            <div className="font-bold">{slotLine(m.offer)}</div>
            <div className="opacity-80">Room {m.offer.room.replace(/^Room\s+/i, "")}</div>
          </div>
        )}
        <div className={cn("mt-1 text-[10px]", out ? "text-white/70" : "text-muted-foreground")}>
          {time}
          {m.channel ? ` · ${m.channel}` : ""}
        </div>
      </div>
    </div>
  );
}
