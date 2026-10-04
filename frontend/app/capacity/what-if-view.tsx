"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import { Sliders, BookmarkPlus, Trash2, FolderOpen, CalendarDays, RotateCcw } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

import {
  evaluateWhatIfAction,
  getCapacityScenariosAction,
  getCapacitySettingsAction,
  saveCapacityScenarioAction,
  deleteCapacityScenarioAction,
} from "@/app/capacity/actions";
import { Slider } from "@/components/ui/slider";
import { cn, formatLkr } from "@/lib/utils";
import type { WhatIfRequest, WhatIfResponse, CapacityScenario, DoctorSession } from "@/lib/types";

interface WhatIfViewProps {
  sessions: DoctorSession[];
  onBack?: () => void;
}

const inputCls = "h-10 rounded-xl border border-border bg-background px-3 text-xs font-semibold text-foreground";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Typeable YYYY-MM-DD field with a calendar button for the native picker. */
function DateField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  const nativeRef = useRef<HTMLInputElement>(null);

  // Re-sync when the parent changes the value (e.g. a loaded scenario).
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setDraft(value);
  }

  function type(raw: string) {
    // Keep digits only and re-insert the dashes as the user types.
    const d = raw.replace(/\D/g, "").slice(0, 8);
    const masked = d.length > 6 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}` : d.length > 4 ? `${d.slice(0, 4)}-${d.slice(4)}` : d;
    setDraft(masked);
    if (masked === "") onChange("");
    else if (ISO_DATE.test(masked) && !Number.isNaN(Date.parse(masked))) onChange(masked);
  }

  const invalid = draft !== "" && !ISO_DATE.test(draft);

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold text-foreground">Date</label>
      <div className="relative">
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="yyyy-mm-dd"
          value={draft}
          onChange={(e) => type(e.target.value)}
          aria-invalid={invalid}
          className={cn(inputCls, "w-full pr-10", invalid && "border-rose-500/60")}
        />
        <button
          type="button"
          aria-label="Pick a date"
          onClick={() => nativeRef.current?.showPicker?.()}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <CalendarDays className="size-4" />
        </button>
        <input
          ref={nativeRef}
          type="date"
          tabIndex={-1}
          aria-hidden
          value={ISO_DATE.test(value) ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          className="pointer-events-none absolute right-2 top-full h-0 w-0 opacity-0"
        />
      </div>
      <span className="text-[10px] text-muted-foreground">{invalid ? "Use yyyy-mm-dd" : "Type a date or pick one · empty = today"}</span>
    </div>
  );
}

/** Draggable lever (1-unit steps) plus an exact number box. `value === null` means "use the saved setting". */
function LeverField({
  label,
  hint,
  value,
  fallback,
  min,
  max,
  step = 1,
  format,
  onChange,
}: {
  label: string;
  hint: string;
  value: number | null;
  fallback: number;
  min: number;
  max: number;
  step?: number;
  format: (v: number) => string;
  onChange: (v: number | null) => void;
}) {
  const shown = value ?? fallback;
  return (
    <div className="flex flex-col gap-1.5 rounded-2xl border border-border/40 bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs font-semibold text-foreground">{label}</label>
        <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-primary">
          {format(shown)}
        </span>
      </div>
      <Slider value={shown} min={min} max={max} step={step} onValueChange={(v) => onChange(v as number)} className="cursor-pointer py-1" />
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value ?? ""}
          placeholder={format(fallback)}
          onChange={(e) => onChange(e.target.value === "" ? null : Math.min(max, Math.max(min, Number(e.target.value))))}
          className={cn(inputCls, "h-8 w-full text-[11px]")}
        />
        {value !== null && (
          <button type="button" onClick={() => onChange(null)} aria-label="Use saved setting" className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
            <RotateCcw className="size-3.5" />
          </button>
        )}
      </div>
      <span className="text-[10px] text-muted-foreground">{value === null ? `${hint} · using saved setting` : hint}</span>
    </div>
  );
}

export function WhatIfView({ onBack }: WhatIfViewProps) {
  const [targetDate, setTargetDate] = useState<string>("");
  const [waitCost, setWaitCost] = useState<number | null>(null);
  const [maxOverbook, setMaxOverbook] = useState<number | null>(null);
  const [fee, setFee] = useState<number | null>(null);
  const [saved, setSaved] = useState<{ wait: number; overbook: number; fee: number }>({ wait: 0, overbook: 0, fee: 0 });

  const [result, setResult] = useState<WhatIfResponse | null>(null);
  const [scenarios, setScenarios] = useState<CapacityScenario[]>([]);
  const [scenarioName, setScenarioName] = useState("");
  const [, startTransition] = useTransition();

  useEffect(() => {
    getCapacityScenariosAction().then(setScenarios);
    getCapacitySettingsAction().then((c) => {
      if (c) setSaved({ wait: c.wait_cost_lkr, overbook: c.max_overbook_per_session, fee: c.consultation_fee_lkr });
    });
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      startTransition(async () => {
        const payload: WhatIfRequest = {
          target_date: targetDate || undefined,
          wait_cost_lkr: waitCost ?? undefined,
          max_overbook_per_session: maxOverbook ?? undefined,
          consultation_fee_lkr: fee ?? undefined,
        };
        const res = await evaluateWhatIfAction(payload);
        if (res) setResult(res);
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [targetDate, waitCost, maxOverbook, fee]);

  async function saveScenario() {
    if (!scenarioName.trim() || !result) return;
    const sc = await saveCapacityScenarioAction({
      name: scenarioName.trim(),
      params: {
        target_date: targetDate,
        wait_cost_lkr: waitCost == null ? "" : String(waitCost),
        max_overbook_per_session: maxOverbook == null ? "" : String(maxOverbook),
        consultation_fee_lkr: fee == null ? "" : String(fee),
      },
      results: { current_policy: result.current_policy, what_if_policy: result.what_if_policy },
    });
    if (sc) {
      setScenarios((prev) => [sc, ...prev]);
      setScenarioName("");
    }
  }

  function loadScenario(sc: CapacityScenario) {
    const p = sc.params as Record<string, string | undefined>;
    setTargetDate(p.target_date ?? "");
    const num = (v?: string) => (v == null || v === "" ? null : Number(v));
    setWaitCost(num(p.wait_cost_lkr));
    setMaxOverbook(num(p.max_overbook_per_session));
    setFee(num(p.consultation_fee_lkr));
  }

  const rows: Array<[string, (p: WhatIfResponse["current_policy"]) => string]> = [
    ["Overbook (full sessions)", (p) => `+${p.recommended_overbook}`],
    ["Extra patients expected to be seen", (p) => p.expected_filled_gaps.toFixed(2)],
    ["Expected overflow patients", (p) => p.expected_overflow.toFixed(2)],
    ["Expected overrun (min)", (p) => p.expected_wait_mins.toFixed(1)],
    ["Worst session P(overflow)", (p) => `${Math.round(p.p_overcrowding * 100)}%`],
    ["Extra revenue", (p) => formatLkr(p.expected_revenue_lkr)],
    ["Net value (revenue − overflow cost)", (p) => formatLkr(p.net_value_gain_lkr)],
  ];

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-300">
      <div className="flex flex-col gap-4 rounded-[24px] border border-border/60 bg-card p-5 shadow-xs sm:p-6">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
            <Sliders className="size-4 text-primary" /> What-if on the real sessions
          </h2>
          {onBack && (
            <button type="button" onClick={onBack} className="text-xs font-semibold text-muted-foreground hover:text-foreground">
              Back
            </button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Re-runs the exact overbooking maths on the sessions that have bookings on the chosen date. Leave a field empty to use the saved setting
          (or each session&apos;s recorded fee).
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <DateField value={targetDate} onChange={setTargetDate} />
          <LeverField
            label="Cost per overflow patient"
            hint="Assumption"
            value={waitCost}
            fallback={saved.wait}
            min={0}
            max={20000}
            format={(v) => `LKR ${v.toLocaleString("en-US")}`}
            onChange={setWaitCost}
          />
          <LeverField
            label="Max overbooking per session"
            hint="Beyond capacity"
            value={maxOverbook}
            fallback={saved.overbook}
            min={0}
            max={20}
            format={(v) => `+${v}`}
            onChange={setMaxOverbook}
          />
          <LeverField
            label="Fee per patient"
            hint="Recorded fees when unset"
            value={fee}
            fallback={saved.fee}
            min={0}
            max={20000}
            format={(v) => `LKR ${v.toLocaleString("en-US")}`}
            onChange={setFee}
          />
        </div>
      </div>

      {result && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-[24px] border border-primary/40 bg-gradient-to-br from-primary/10 via-card to-card p-5 shadow-md shadow-primary/10 ring-1 ring-primary/20">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-foreground">
              Saved policy vs. what-if
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">live</span>
            </h3>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2 font-semibold" />
                  <th className="font-semibold">Saved</th>
                  <th className="font-bold text-primary">What-if</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {rows.map(([label, fmt]) => (
                  <tr key={label} className="border-b border-border/50 last:border-none">
                    <td className="py-2 pr-2 font-sans text-foreground">{label}</td>
                    <td>{fmt(result.current_policy)}</td>
                    <td className="rounded-md bg-primary/10 px-2 font-bold text-primary">{fmt(result.what_if_policy)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-[24px] border border-border/60 bg-card p-5 shadow-xs">
            <h3 className="text-sm font-bold text-foreground">Value by number of extra bookings</h3>
            <p className="mb-2 text-xs text-muted-foreground">Summed over the sessions of the date (fee × seen − cost × overflow).</p>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={result.trade_off_curve} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis dataKey="extra_bookings" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                  <Tooltip
                    formatter={(v: unknown) => formatLkr(Number(v))}
                    contentStyle={{ backgroundColor: "var(--card)", borderColor: "var(--border)", borderRadius: "12px", fontSize: "12px" }}
                  />
                  <Bar dataKey="value_lkr" name="Value" fill="#8B7CF6" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-[24px] border border-border/60 bg-card p-5 shadow-xs">
        <h3 className="mb-3 text-sm font-bold text-foreground">Saved scenarios</h3>
        <div className="mb-3 flex gap-2">
          <input value={scenarioName} onChange={(e) => setScenarioName(e.target.value)} placeholder="Scenario name" className={`${inputCls} flex-1`} />
          <button
            type="button"
            onClick={saveScenario}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-bold text-white"
          >
            <BookmarkPlus className="size-3.5" /> Save
          </button>
        </div>
        {scenarios.length === 0 ? (
          <p className="text-xs text-muted-foreground">No saved scenarios.</p>
        ) : (
          <ul className="divide-y divide-border/50">
            {scenarios.map((sc) => (
              <li key={sc.id} className="flex items-center justify-between py-2 text-xs">
                <span className="font-semibold text-foreground">{sc.name}</span>
                <span className="flex items-center gap-3">
                  <button type="button" onClick={() => loadScenario(sc)} aria-label="Load scenario" className="text-primary">
                    <FolderOpen className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Delete scenario"
                    className="text-rose-600"
                    onClick={async () => {
                      if (await deleteCapacityScenarioAction(sc.id)) setScenarios((prev) => prev.filter((s) => s.id !== sc.id));
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
