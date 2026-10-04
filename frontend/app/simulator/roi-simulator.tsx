"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Plus, Trash2, Receipt, Info } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { SyntheticBadgeStatic } from "@/components/synthetic-badge-static";
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
  intervention_efficacy: 0.26,
  reach_rate: 1.0,
  value_multiplier: 1.0,
  sms_cost_lkr: 1,
  call_share: 0.25,
  call_minutes: 3.5,
  staff_hourly_cost_lkr: 850,
  window_days: 90,
};

const KPI_TONE: Record<string, string> = {
  emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  amber: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  sky: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  violet: "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300",
};

const pct = (v: number | null | undefined, d = 1) => (v == null ? "—" : `${(v * 100).toFixed(d)}%`);
// formatLkr already prefixes "LKR"; negatives keep the sign in front of it.
const lkr = (v: number) => (v < 0 ? `-${formatLkr(Math.round(-v))}` : formatLkr(Math.round(v)));

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
            <div className="mt-3 flex flex-col gap-5 lg:flex-row lg:items-center lg:gap-8">
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
              <dl className="grid w-full grid-cols-2 gap-3 lg:w-auto lg:flex-1 lg:grid-cols-4">
                {[
                  { k: "Recovered revenue", v: lkr(result.annual.recovered_lkr), tone: "emerald" },
                  { k: "Contact cost", v: lkr(result.annual.contact_cost_lkr), tone: "amber" },
                  { k: "Platform costs", v: lkr(result.annual.fixed_expenses_lkr), tone: "sky" },
                  {
                    k: "Return on cost",
                    v: result.annual.roi_multiple == null ? "—" : `${result.annual.roi_multiple.toFixed(2)}×`,
                    sub: result.annual.payback_days != null ? `payback ${Math.round(result.annual.payback_days)} days` : undefined,
                    tone: "violet",
                  },
                ].map((m) => (
                  <div key={m.k} className={cn("rounded-2xl border p-4 shadow-xs", KPI_TONE[m.tone])}>
                    <dt className="text-[11px] font-bold uppercase tracking-wider opacity-80">{m.k}</dt>
                    <dd className="mt-1 font-mono text-2xl font-extrabold tabular-nums text-foreground">{m.v}</dd>
                    {m.sub && <div className="mt-0.5 text-[11px] font-semibold opacity-80">{m.sub}</div>}
                  </div>
                ))}
              </dl>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Annualised from a {result.baseline.window_calendar_days}-day replay (×{result.annual.scale.toFixed(2)}). Net = recovered revenue − contact cost − recorded platform costs.
            </p>
          </section>

          <section
            className={cn(
              "rounded-[24px] border p-5 shadow-xs",
              result.evidence.break_even_above_evidence ? "border-rose-500/30 bg-rose-500/5" : "border-emerald-500/30 bg-emerald-500/5"
            )}
          >
            <h3 className="text-sm font-bold text-foreground">What efficacy do you need?</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              The benefit covers its costs only if outreach recovers at least{" "}
              <b className="font-mono text-foreground">{pct(result.annual.break_even_efficacy, 0)}</b> of the no-shows it reaches.
              The only Sri Lankan estimate is {pct(result.evidence.efficacy_central, 0)} (plausible range{" "}
              {pct(result.evidence.efficacy_low, 0)}–{pct(result.evidence.efficacy_high, 0)}).{" "}
              {result.evidence.break_even_above_evidence
                ? "The break-even is above that range, so on these inputs the case is not proven."
                : "The break-even is inside that range."}
            </p>
            <p className="mt-2 text-[11px] text-muted-foreground">{result.evidence.source} {result.evidence.caveat}</p>
          </section>
        </>
      )}

      <section className="rounded-[24px] border border-border/60 bg-card p-5 shadow-xs">
        <h3 className="text-sm font-bold text-foreground">Assumptions</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          {result && !result.empty
            ? `Cost per contact works out to LKR ${result.assumptions.cost_per_contact_lkr.toFixed(2)}: one SMS plus a call for ${pct(result.assumptions.call_share, 0)} of contacts.`
            : "Cost per contact is one SMS plus a phone call for the share that needs one."}
        </p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Assumption
            label="Contact top share"
            hint="Of each day's bookings, contact the riskiest this share"
            display={pct(params.contact_fraction, 0)}
            value={params.contact_fraction}
            min={0.01}
            max={0.5}
            step={0.01}
            onChange={(v) => set("contact_fraction", v)}
          />
          <Assumption
            label="Efficacy"
            hint="Chance a contacted would-be no-show attends. Sri Lankan study: 26% (16 of 61), uncontrolled"
            display={pct(params.intervention_efficacy, 0)}
            value={params.intervention_efficacy}
            min={0.01}
            max={0.6}
            step={0.01}
            onChange={(v) => set("intervention_efficacy", v)}
          />
          <Assumption
            label="Reach rate"
            hint="Share of the contact list that can be reached. Keep 100% unless your phone numbers are worse than the study's"
            display={pct(params.reach_rate, 0)}
            value={params.reach_rate}
            min={0.1}
            max={1}
            step={0.01}
            onChange={(v) => set("reach_rate", v)}
          />
          <Assumption
            label="SMS cost"
            hint="Bulk SMS is quoted under LKR 1 each; check your provider's tariff"
            display={`LKR ${params.sms_cost_lkr.toFixed(2)}`}
            value={params.sms_cost_lkr}
            min={0}
            max={5}
            step={0.05}
            onChange={(v) => set("sms_cost_lkr", v)}
          />
          <Assumption
            label="Contacts that also need a call"
            hint="Share where staff phone the patient after the SMS"
            display={pct(params.call_share, 0)}
            value={params.call_share}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => set("call_share", v)}
          />
          <Assumption
            label="Call length"
            hint="Minutes of staff time per phone call"
            display={`${params.call_minutes.toFixed(1)} min`}
            value={params.call_minutes}
            min={0.5}
            max={15}
            step={0.5}
            onChange={(v) => set("call_minutes", v)}
          />
          <Assumption
            label="Staff cost per hour"
            hint="Loaded cost of front-desk time"
            display={`LKR ${params.staff_hourly_cost_lkr}`}
            value={params.staff_hourly_cost_lkr}
            min={200}
            max={3000}
            step={50}
            onChange={(v) => set("staff_hourly_cost_lkr", v)}
          />
          <Assumption
            label="Revenue per LKR of fee"
            hint="1.0 = consultation fee only; above 1 adds lab / pharmacy revenue"
            display={`${params.value_multiplier.toFixed(2)}×`}
            value={params.value_multiplier}
            min={0.3}
            max={2}
            step={0.01}
            onChange={(v) => set("value_multiplier", v)}
          />
          <Assumption
            label="History replayed"
            hint="Most recent days of recorded outcomes"
            display={`${params.window_days} days`}
            value={params.window_days}
            min={14}
            max={365}
            step={1}
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
