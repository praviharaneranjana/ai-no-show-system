"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Plus, Trash2, Receipt, Info } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { SyntheticBadgeStatic } from "@/components/synthetic-badge";
import { Slider } from "@/components/ui/slider";
import { cn, formatLkr } from "@/lib/utils";
import type { ExpenseCategory, ExpenseRecurrence, HospitalExpense, SimulatorParams, SimulatorResult } from "@/lib/types";
import {
  createHospitalExpenseAction,
  deleteHospitalExpenseAction,
  evaluateSimulatorAction,
  updateHospitalExpenseAction,
} from "@/app/simulator/actions";

const DEFAULTS: SimulatorParams = {
  contact_fraction: 0.2,
  intervention_efficacy: 0.3,
  value_multiplier: 1.0,
  cost_per_contact_lkr: 50,
  window_days: 90,
};

const pct = (v: number | null | undefined, d = 1) => (v == null ? "—" : `${(v * 100).toFixed(d)}%`);
const lkr = (v: number) => `LKR ${formatLkr(Math.round(v))}`;

function Assumption({
  label,
  hint,
  display,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  hint: string;
  display: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border/40 bg-muted/20 p-3">
      <div className="flex items-start justify-between gap-2 text-xs">
        <div className="flex flex-col">
          <span className="flex items-center gap-1.5 font-semibold text-foreground">
            {label}
            <span className="rounded bg-amber-500/15 px-1.5 py-px text-[9px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
              assumption
            </span>
          </span>
          <span className="text-[10px] text-muted-foreground">{hint}</span>
        </div>
        <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 font-semibold tabular-nums text-primary">
          {display}
        </span>
      </div>
      <Slider value={value} min={min} max={max} step={step} onValueChange={(v) => onChange(v as number)} className="cursor-pointer py-1" />
    </div>
  );
}

function Fact({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-border/50 bg-card p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
        {label}
        <span className="rounded bg-emerald-500/15 px-1.5 py-px text-[9px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
          from database
        </span>
      </div>
      <div className="mt-1 font-mono text-xl font-extrabold text-foreground">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

export function RoiSimulator({
  initialCategories = [],
  initialExpenses = [],
}: {
  initialCategories?: ExpenseCategory[];
  initialExpenses?: HospitalExpense[];
}) {
  const [params, setParams] = useState<SimulatorParams>(DEFAULTS);
  const [result, setResult] = useState<SimulatorResult | null>(null);
  const [failed, setFailed] = useState(false);
  const [expenses, setExpenses] = useState<HospitalExpense[]>(initialExpenses);
  const [version, setVersion] = useState(0); // bump to re-run after the stored expenses change
  const [, startTransition] = useTransition();

  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newCategoryId, setNewCategoryId] = useState(initialCategories[0]?.id ?? "");
  const [newAmount, setNewAmount] = useState(250000);
  const [newRecurrence, setNewRecurrence] = useState<ExpenseRecurrence>("annual");

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      const res = await evaluateSimulatorAction(params);
      if (cancelled) return;
      setFailed(res == null);
      if (res) setResult(res);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [params, version]);

  const set = useCallback(<K extends keyof SimulatorParams>(key: K, value: number) => {
    setParams((p) => ({ ...p, [key]: value }));
  }, []);

  function toggleExpense(id: string, active: boolean) {
    setExpenses((prev) => prev.map((e) => (e.id === id ? { ...e, is_active: !active } : e)));
    startTransition(async () => {
      await updateHospitalExpenseAction(id, { is_active: !active });
      setVersion((v) => v + 1);
    });
  }

  function removeExpense(id: string) {
    setExpenses((prev) => prev.filter((e) => e.id !== id));
    startTransition(async () => {
      await deleteHospitalExpenseAction(id);
      setVersion((v) => v + 1);
    });
  }

  function addExpense(e: React.FormEvent) {
    e.preventDefault();
    const cat = initialCategories.find((c) => c.id === newCategoryId) ?? initialCategories[0];
    if (!newTitle.trim() || newAmount <= 0 || !cat) return;
    startTransition(async () => {
      const created = await createHospitalExpenseAction({
        category_id: cat.id,
        title: newTitle.trim(),
        amount_lkr: Number(newAmount),
        recurrence: newRecurrence,
        is_active: true,
      });
      if (created) setExpenses((prev) => [created, ...prev]);
      setVersion((v) => v + 1);
    });
    setNewTitle("");
    setShowAdd(false);
  }

  const synthetic = result && !result.empty && result.baseline.synthetic;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-3 rounded-2xl border border-border/60 bg-card p-4 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0 text-primary" />
        <p>
          Volume, average fee and no-show rate are read from this hospital&apos;s recorded history. The benefit is a
          replay: each past day&apos;s bookings are ranked by their stored risk score, the top share is contacted, and the
          no-shows caught are valued at the booking&apos;s own fee. Everything marked <b>assumption</b> is a guess you can change.
          {synthetic && <span className="ml-2 inline-block align-middle"><SyntheticBadgeStatic /></span>}
        </p>
      </div>

      {failed && <p className="text-xs text-rose-600">Could not evaluate the model. Try again.</p>}

      {result?.empty && (
        <EmptyState
          title="No history to replay"
          description="The simulator needs appointments with a recorded outcome and a stored prediction in the replay window."
        />
      )}

      {result && !result.empty && (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Fact
              label="Bookings per day"
              value={result.baseline.daily_appointments.toFixed(0)}
              sub={`${result.baseline.n_appointments.toLocaleString()} appointments over ${result.baseline.window_calendar_days} days`}
            />
            <Fact label="Average fee" value={lkr(result.baseline.avg_fee_lkr)} sub="per appointment, recorded" />
            <Fact label="No-show rate" value={pct(result.baseline.no_show_rate)} sub="observed outcomes" />
            <Fact
              label="Recorded platform costs"
              value={lkr(result.annual.fixed_expenses_lkr)}
              sub={result.annual.expenses_recorded ? `${result.annual.expenses_recorded} active expense rows / year` : "none recorded"}
            />
          </section>

          <section className="rounded-[24px] border border-border/60 bg-card p-5 shadow-xs">
            <h3 className="text-sm font-bold text-foreground">Annual net benefit of risk-ranked outreach</h3>
            <div className="mt-2 flex flex-wrap items-end gap-x-8 gap-y-2">
              <div>
                <div
                  className={cn(
                    "font-mono text-4xl font-extrabold tracking-tight",
                    result.annual.net_benefit_lkr >= 0 ? "text-emerald-600" : "text-rose-600"
                  )}
                >
                  {lkr(result.annual.net_benefit_lkr)}
                </div>
                <div className="text-xs text-muted-foreground">
                  range across the sensitivity table: {lkr(result.annual.net_benefit_low_lkr)} to {lkr(result.annual.net_benefit_high_lkr)}
                </div>
              </div>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-4">
                <div><dt className="text-muted-foreground">Recovered revenue</dt><dd className="font-mono font-semibold">{lkr(result.annual.recovered_lkr)}</dd></div>
                <div><dt className="text-muted-foreground">Contact cost</dt><dd className="font-mono font-semibold">{lkr(result.annual.contact_cost_lkr)}</dd></div>
                <div><dt className="text-muted-foreground">Platform costs</dt><dd className="font-mono font-semibold">{lkr(result.annual.fixed_expenses_lkr)}</dd></div>
                <div>
                  <dt className="text-muted-foreground">Return on cost</dt>
                  <dd className="font-mono font-semibold">
                    {result.annual.roi_multiple == null ? "—" : `${result.annual.roi_multiple.toFixed(2)}×`}
                    {result.annual.payback_days != null && (
                      <span className="ml-1 font-sans text-muted-foreground">· payback {Math.round(result.annual.payback_days)} d</span>
                    )}
                  </dd>
                </div>
              </dl>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Annualised from a {result.baseline.window_calendar_days}-day replay (×{result.annual.scale.toFixed(2)}). Net = recovered revenue − contact cost − recorded platform costs.
            </p>
          </section>
        </>
      )}

      <section className="rounded-[24px] border border-border/60 bg-card p-5 shadow-xs">
        <h3 className="mb-3 text-sm font-bold text-foreground">Assumptions</h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Assumption
            label="Contact top share"
            hint="Of each day's bookings, contact the riskiest this share"
            display={pct(params.contact_fraction, 0)}
            value={params.contact_fraction}
            min={0.05}
            max={0.5}
            step={0.05}
            onChange={(v) => set("contact_fraction", v)}
          />
          <Assumption
            label="Efficacy"
            hint="Chance a contacted would-be no-show is recovered"
            display={pct(params.intervention_efficacy, 0)}
            value={params.intervention_efficacy}
            min={0.05}
            max={0.6}
            step={0.05}
            onChange={(v) => set("intervention_efficacy", v)}
          />
          <Assumption
            label="Cost per contact"
            hint="Staff time and message cost per call or message"
            display={`LKR ${params.cost_per_contact_lkr}`}
            value={params.cost_per_contact_lkr}
            min={0}
            max={300}
            step={5}
            onChange={(v) => set("cost_per_contact_lkr", v)}
          />
          <Assumption
            label="Revenue per LKR of fee"
            hint="1.0 = consultation fee only; above 1 adds lab / pharmacy revenue"
            display={`${params.value_multiplier.toFixed(1)}×`}
            value={params.value_multiplier}
            min={0.3}
            max={2}
            step={0.1}
            onChange={(v) => set("value_multiplier", v)}
          />
          <Assumption
            label="History replayed"
            hint="Most recent days of recorded outcomes"
            display={`${params.window_days} days`}
            value={params.window_days}
            min={30}
            max={365}
            step={30}
            onChange={(v) => set("window_days", v)}
          />
        </div>
      </section>

      {result && !result.empty && (
        <>
          <section className="rounded-[24px] border border-border/60 bg-card p-5 shadow-xs">
            <h3 className="text-sm font-bold text-foreground">Replay on history</h3>
            <p className="mb-3 text-xs text-muted-foreground">
              {result.replay.appointments.toLocaleString()} past bookings over {result.replay.days} days; {result.replay.contacts.toLocaleString()} contacts
              ({pct(result.assumptions.contact_fraction, 0)} per day), efficacy {pct(result.assumptions.intervention_efficacy, 0)}.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="py-2 font-semibold">Contact policy</th>
                    <th className="font-semibold">No-shows reached</th>
                    <th className="font-semibold">Recall</th>
                    <th className="font-semibold">Recovered</th>
                    <th className="font-semibold">Contact cost</th>
                    <th className="font-semibold">Net (window)</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  <tr className="border-b border-border/50">
                    <td className="py-2 font-sans font-semibold text-foreground">Top risk first</td>
                    <td>{result.replay.caught_model} of {result.replay.no_shows}</td>
                    <td>{pct(result.replay.recall_model)}</td>
                    <td>{lkr(result.replay.recovered_lkr_model)}</td>
                    <td>{lkr(result.replay.contact_cost_lkr)}</td>
                    <td>{lkr(result.replay.net_lkr_model)}</td>
                  </tr>
                  <tr>
                    <td className="py-2 font-sans font-semibold text-foreground">Random contact (same count)</td>
                    <td>{result.replay.caught_random.toFixed(0)} of {result.replay.no_shows}</td>
                    <td>{pct(result.replay.recall_random)}</td>
                    <td>{lkr(result.replay.recovered_lkr_random)}</td>
                    <td>{lkr(result.replay.contact_cost_lkr)}</td>
                    <td>{lkr(result.replay.net_lkr_random)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs font-semibold text-foreground">
              Ranking by risk recovers {lkr(result.replay.uplift_vs_random_lkr)} more than random contact over this window.
            </p>
          </section>

          <section className="rounded-[24px] border border-border/60 bg-card p-5 shadow-xs">
            <h3 className="text-sm font-bold text-foreground">Sensitivity — annual net benefit</h3>
            <p className="mb-3 text-xs text-muted-foreground">Efficacy against share contacted; same replay, costs and platform expenses.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="py-2 text-left font-semibold">Efficacy ↓ / Contact top →</th>
                    {result.sensitivity.ks.map((k) => (
                      <th key={k} className="font-semibold">{pct(k, 0)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {result.sensitivity.efficacies.map((e) => (
                    <tr key={e} className="border-b border-border/50 last:border-none">
                      <td className="py-2 text-left font-sans font-semibold text-foreground">{pct(e, 0)}</td>
                      {result.sensitivity.ks.map((k) => {
                        const c = result.sensitivity.cells.find((x) => x.k === k && x.efficacy === e);
                        return (
                          <td key={k} className={cn(c && c.annual_net_lkr < 0 && "text-rose-600")}>
                            {c ? lkr(c.annual_net_lkr) : "—"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <section className="rounded-[24px] border border-border/60 bg-card p-5 shadow-xs">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
            <Receipt className="size-4 text-primary" /> Recorded platform costs
          </h3>
          <button
            type="button"
            onClick={() => setShowAdd((s) => !s)}
            className="inline-flex items-center gap-1 rounded-xl border border-border/70 px-3 py-1.5 text-xs font-semibold hover:bg-muted"
          >
            <Plus className="size-3.5" /> Add cost
          </button>
        </div>
        {showAdd && (
          <form onSubmit={addExpense} className="mb-4 grid grid-cols-1 gap-2 rounded-2xl border border-border/50 bg-muted/20 p-3 sm:grid-cols-5">
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Title"
              className="h-8 rounded-lg border border-border bg-background px-2 text-xs sm:col-span-2"
            />
            <select value={newCategoryId} onChange={(e) => setNewCategoryId(e.target.value)} className="h-8 rounded-lg border border-border bg-background px-2 text-xs">
              {initialCategories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              value={newAmount}
              onChange={(e) => setNewAmount(Number(e.target.value))}
              className="h-8 rounded-lg border border-border bg-background px-2 text-xs"
            />
            <select value={newRecurrence} onChange={(e) => setNewRecurrence(e.target.value as ExpenseRecurrence)} className="h-8 rounded-lg border border-border bg-background px-2 text-xs">
              <option value="annual">per year</option>
              <option value="monthly">per month</option>
              <option value="one_off">one-off (counted once a year)</option>
              <option value="per_patient">per contact</option>
            </select>
            <button type="submit" className="h-8 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground sm:col-span-5 sm:w-fit">
              Save
            </button>
          </form>
        )}
        {expenses.length === 0 ? (
          <p className="text-xs text-muted-foreground">No costs recorded. The net benefit above then excludes platform and licence costs.</p>
        ) : (
          <ul className="divide-y divide-border/50">
            {expenses.map((e) => (
              <li key={e.id} className={cn("flex items-center justify-between gap-3 py-2 text-xs", !e.is_active && "opacity-50")}>
                <div>
                  <div className="font-semibold text-foreground">{e.title}</div>
                  <div className="text-[10px] text-muted-foreground">{e.category?.name ?? e.category_key} · {e.recurrence.replace("_", " ")}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono">{lkr(e.amount_lkr)}</span>
                  <button type="button" onClick={() => toggleExpense(e.id, e.is_active)} className="rounded-lg border border-border/70 px-2 py-1 text-[10px] font-semibold hover:bg-muted">
                    {e.is_active ? "Disable" : "Enable"}
                  </button>
                  <button type="button" onClick={() => removeExpense(e.id)} aria-label="Delete cost" className="text-rose-600 hover:opacity-80">
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
