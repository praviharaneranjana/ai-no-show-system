"use client";

import { useState, useEffect, useTransition } from "react";
import { Sliders, BookmarkPlus, Trash2, FolderOpen } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

import {
  evaluateWhatIfAction,
  getCapacityScenariosAction,
  saveCapacityScenarioAction,
  deleteCapacityScenarioAction,
} from "@/app/capacity/actions";
import { formatLkr } from "@/lib/utils";
import type { WhatIfRequest, WhatIfResponse, CapacityScenario, DoctorSession } from "@/lib/types";

interface WhatIfViewProps {
  sessions: DoctorSession[];
  onBack?: () => void;
}

function Field({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold text-foreground">{label}</label>
      {children}
      <span className="text-[10px] text-muted-foreground">{hint}</span>
    </div>
  );
}

const inputCls = "h-10 rounded-xl border border-border bg-background px-3 text-xs font-semibold text-foreground";

export function WhatIfView({ onBack }: WhatIfViewProps) {
  const [targetDate, setTargetDate] = useState<string>("");
  const [waitCost, setWaitCost] = useState<string>("");
  const [maxOverbook, setMaxOverbook] = useState<string>("");
  const [fee, setFee] = useState<string>("");

  const [result, setResult] = useState<WhatIfResponse | null>(null);
  const [scenarios, setScenarios] = useState<CapacityScenario[]>([]);
  const [scenarioName, setScenarioName] = useState("");
  const [, startTransition] = useTransition();

  useEffect(() => {
    getCapacityScenariosAction().then(setScenarios);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      startTransition(async () => {
        const payload: WhatIfRequest = {
          target_date: targetDate || undefined,
          wait_cost_lkr: waitCost === "" ? undefined : Number(waitCost),
          max_overbook_per_session: maxOverbook === "" ? undefined : Number(maxOverbook),
          consultation_fee_lkr: fee === "" ? undefined : Number(fee),
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
      params: { target_date: targetDate, wait_cost_lkr: waitCost, max_overbook_per_session: maxOverbook, consultation_fee_lkr: fee },
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
    setWaitCost(p.wait_cost_lkr ?? "");
    setMaxOverbook(p.max_overbook_per_session ?? "");
    setFee(p.consultation_fee_lkr ?? "");
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
          <Field label="Date" hint="Empty = today">
            <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Cost per overflow patient (LKR)" hint="Assumption">
            <input type="number" min={0} step={500} value={waitCost} onChange={(e) => setWaitCost(e.target.value)} className={inputCls} placeholder="saved setting" />
          </Field>
          <Field label="Max overbooking per session" hint="Beyond capacity">
            <input type="number" min={0} max={20} value={maxOverbook} onChange={(e) => setMaxOverbook(e.target.value)} className={inputCls} placeholder="saved setting" />
          </Field>
          <Field label="Fee per patient (LKR)" hint="Empty = recorded fees">
            <input type="number" min={0} step={100} value={fee} onChange={(e) => setFee(e.target.value)} className={inputCls} placeholder="recorded" />
          </Field>
        </div>
      </div>

      {result && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-[24px] border border-border/60 bg-card p-5 shadow-xs">
            <h3 className="mb-3 text-sm font-bold text-foreground">Saved policy vs. what-if</h3>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2 font-semibold" />
                  <th className="font-semibold">Saved</th>
                  <th className="font-semibold">What-if</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {rows.map(([label, fmt]) => (
                  <tr key={label} className="border-b border-border/50 last:border-none">
                    <td className="py-2 pr-2 font-sans text-foreground">{label}</td>
                    <td>{fmt(result.current_policy)}</td>
                    <td className="font-bold">{fmt(result.what_if_policy)}</td>
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
