"use client";

import { useState, useTransition } from "react";
import { Check, Copy, EyeOff, Phone, RotateCcw } from "lucide-react";

import { Panel } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { SlotPicker } from "@/components/outreach/slot-picker";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { RecallChannel, RecallDraft, RecallItem, RecallQueue, RecallState, RecallSummary, SlotDict } from "@/lib/types";
import {
  recallContactAction,
  recallDraftAction,
  recallOptionsAction,
  recallQueueAction,
  recallRebookAction,
} from "@/app/recall/actions";

const pct = (v: number | null | undefined, d = 0) => (v == null ? "—" : `${(v * 100).toFixed(d)}%`);

const STATE_STYLE: Record<RecallState, string> = {
  not_contacted: "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
  contacted: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  rebooked: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
};
const STATE_LABEL: Record<RecallState, string> = { not_contacted: "Not contacted", contacted: "Contacted", rebooked: "Rebooked" };
const CHANNELS: RecallChannel[] = ["Call", "SMS", "WhatsApp", "Letter"];
const LANGS = [
  { v: "en", l: "English" },
  { v: "si", l: "සිංහල" },
  { v: "ta", l: "தமிழ்" },
];

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-border/50 bg-card p-3">
      <div className="text-[11px] font-semibold text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-xl font-extrabold text-foreground">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function RowPanel({ item, onChanged }: { item: RecallItem; onChanged: () => void }) {
  const [lang, setLang] = useState(item.preferred_language || "en");
  const [draft, setDraft] = useState<RecallDraft | null>(null);
  const [text, setText] = useState("");
  const [channel, setChannel] = useState<RecallChannel>(item.suggested_channel === "Letter" ? "Letter" : "Call");
  const [options, setOptions] = useState<SlotDict[] | null>(null);
  const [picked, setPicked] = useState<SlotDict | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  function makeDraft(language: string) {
    setLang(language);
    startTransition(async () => {
      const r = await recallDraftAction(item.appointment_id, language);
      if (r.ok) {
        setDraft(r.data);
        setText(r.data.message);
        setError(null);
      } else setError(r.message);
    });
  }

  function logContact() {
    startTransition(async () => {
      const r = await recallContactAction(item.appointment_id, channel, text || undefined);
      if (r.ok) onChanged();
      else setError(r.message);
    });
  }

  function loadSlots() {
    startTransition(async () => {
      setOptions((await recallOptionsAction(item.appointment_id)) as SlotDict[] | null ?? []);
    });
  }

  function book() {
    if (!picked) return;
    startTransition(async () => {
      const r = await recallRebookAction(item.appointment_id, {
        clinic_session_id: picked.session_id,
        appointment_day: picked.date,
        doctor_id: picked.doctor_id,
        language: lang,
      });
      if (r.ok) onChanged();
      else setError(r.message);
    });
  }

  return (
    <div className="mt-3 flex flex-col gap-4 rounded-2xl border border-border/60 bg-muted/20 p-4">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold text-foreground">1. Message</span>
          {LANGS.map((l) => (
            <button
              key={l.v}
              type="button"
              onClick={() => makeDraft(l.v)}
              className={cn("rounded-full border px-2.5 py-0.5 text-[11px] font-semibold", lang === l.v && draft ? "border-primary bg-primary/10 text-primary" : "border-border/70 hover:bg-muted")}
            >
              {l.l}
            </button>
          ))}
          {item.discreet && (
            <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">
              <EyeOff className="size-3" /> Specialty hidden in the message
            </span>
          )}
        </div>
        {draft && (
          <>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              aria-label="Recall message"
              className="w-full resize-y rounded-xl border border-border/80 bg-background/90 p-3 text-xs leading-relaxed outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={async () => {
                  await navigator.clipboard?.writeText(text);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          </>
        )}
      </div>

      {item.state !== "rebooked" && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold text-foreground">2. Log the contact</span>
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value as RecallChannel)}
            aria-label="Contact channel"
            className="h-8 rounded-lg border border-border bg-background px-2 text-xs"
          >
            {CHANNELS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <Button type="button" size="sm" disabled={busy} onClick={logContact}>Mark contacted</Button>
          <span className="text-[11px] text-muted-foreground">Nothing is sent from here; you phone, post or message the patient yourself.</span>
        </div>
      )}

      {item.state !== "rebooked" && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-semibold text-foreground">3. Rebook</span>
            {options === null && <Button type="button" variant="outline" size="sm" disabled={busy} onClick={loadSlots}>Find a new time</Button>}
          </div>
          {options !== null &&
            (options.length === 0 ? (
              <p className="text-xs text-muted-foreground">No open sessions in this department in the next four weeks.</p>
            ) : (
              <>
                <SlotPicker options={options} picked={picked} onPick={setPicked} currentDoctorId={null} />
                <div>
                  <Button type="button" size="sm" disabled={!picked || busy} onClick={book}>Book this time</Button>
                </div>
              </>
            ))}
        </div>
      )}
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
}

export function RecallClient({ initialQueue, summary }: { initialQueue: RecallQueue; summary: RecallSummary }) {
  const [queue, setQueue] = useState<RecallQueue>(initialQueue);
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState<RecallState | "all">("not_contacted");

  async function refresh() {
    const q = await recallQueueAction(queue.window_days);
    if (q) setQueue(q);
    setOpen(null);
  }

  const items = queue.items.filter((i) => filter === "all" || i.state === filter);
  const bench = summary.benchmark;

  return (
    <div className="flex flex-col gap-6">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Waiting to be contacted" value={String(queue.not_contacted)} sub={`missed in the last ${queue.window_days} days`} />
        <Kpi label="Contacted" value={String(queue.contacted)} sub="not yet rebooked" />
        <Kpi label="Rebooked" value={String(queue.rebooked)} sub="came back to the same service" />
        <Kpi
          label="Return rate after contact"
          value={pct(summary.return_rate_contacted)}
          sub={
            summary.contacted
              ? `${summary.returned_contacted} of ${summary.contacted} contacted (last ${summary.window_days} days)`
              : "fills in once staff log contacts"
          }
        />
      </section>

      <Panel
        title="How this compares with the study"
        subtitle={`${bench.recovered} of ${bench.contacted} missed patients attended after a call or letter (${pct(bench.rate)}, 95% interval ${pct(bench.ci[0])}–${pct(bench.ci[1])}) — ${bench.source}`}
      >
        <dl className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">Your contacted patients</dt>
            <dd className="font-mono text-base font-bold">
              {pct(summary.return_rate_contacted)}
              {summary.return_rate_contacted_ci && (
                <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                  ({pct(summary.return_rate_contacted_ci[0])}–{pct(summary.return_rate_contacted_ci[1])})
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Patients not contacted</dt>
            <dd className="font-mono text-base font-bold">{pct(summary.return_rate_not_contacted)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Study (contacted, no comparison group)</dt>
            <dd className="font-mono text-base font-bold">{pct(bench.rate)}</dd>
          </div>
        </dl>
        <p className="mt-3 text-[11px] text-muted-foreground">{summary.caveat}</p>
      </Panel>

      <Panel>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {(["not_contacted", "contacted", "rebooked", "all"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-semibold",
                filter === f ? "border-primary bg-primary/10 text-primary" : "border-border/70 text-muted-foreground hover:bg-muted"
              )}
            >
              {f === "all" ? "All" : STATE_LABEL[f]}
            </button>
          ))}
        </div>

        {items.length === 0 ? (
          <EmptyState title="Nothing here" description="No missed appointments match this filter in the recall window." />
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((i) => (
              <li key={i.appointment_id} className="rounded-2xl border border-border/80 p-3.5">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold text-foreground">{i.patient_name}</div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      Missed {i.missed_day} ({i.days_since} days ago) · {i.department ?? "General"} · {i.doctor_name ?? ""}
                      {i.last_contact_channel && ` · last contact: ${i.last_contact_channel}`}
                      {i.rebooked_day && ` · back on ${i.rebooked_day}`}
                    </div>
                  </div>
                  <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-semibold", STATE_STYLE[i.state])}>{STATE_LABEL[i.state]}</span>
                  {i.phone ? (
                    <a href={`tel:${i.phone}`} aria-label={`Call ${i.patient_name}`} className="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-primary hover:text-white">
                      <Phone className="size-3.5" />
                    </a>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">{i.suggested_channel === "Letter" ? "No phone: send a letter" : "No contact details"}</span>
                  )}
                  {i.state !== "rebooked" && (
                    <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setOpen(open === i.appointment_id ? null : i.appointment_id)}>
                      <RotateCcw className="size-3.5" /> {open === i.appointment_id ? "Close" : "Bring back"}
                    </Button>
                  )}
                </div>
                {open === i.appointment_id && <RowPanel item={i} onChanged={refresh} />}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
