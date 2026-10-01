"use client";

import { useId, useMemo, useState, useTransition } from "react";
import {
  ChevronDown,
  Wallet,
  TrendingDown,
  Clock3,
  PhoneOff,
  Sparkles,
  Info,
  Gift,
  MessageSquare,
  Cpu,
  Users,
  Building2,
  Plus,
  Trash2,
  CheckCircle2,
  ArrowUpRight,
  RotateCcw,
  Percent,
  Layers,
  Check,
  Receipt,
  AlertCircle,
  HelpCircle,
} from "lucide-react";

import { Slider } from "@/components/ui/slider";
import { formatLkr } from "@/lib/utils";
import {
  HOSPITAL_PRESETS,
  ROI_SIMULATOR_DEFAULTS,
  evaluateRoi,
  type HospitalPreset,
} from "@/lib/roi";
import type {
  ExpenseCategory,
  ExpenseRecurrence,
  HospitalExpense,
  SimulatorParams,
} from "@/lib/types";
import {
  createHospitalExpenseAction,
  deleteHospitalExpenseAction,
  updateHospitalExpenseAction,
} from "@/app/simulator/actions";

function getCategoryIcon(key?: string) {
  switch (key) {
    case "patient_incentives":
      return <Gift className="size-4 text-pink-500" />;
    case "telco_outreach":
      return <MessageSquare className="size-4 text-sky-500" />;
    case "tech_infrastructure":
      return <Cpu className="size-4 text-indigo-500" />;
    case "staff_overtime":
      return <Users className="size-4 text-amber-500" />;
    case "admin_overhead":
      return <Building2 className="size-4 text-emerald-500" />;
    default:
      return <Receipt className="size-4 text-primary" />;
  }
}

function SliderField({
  label,
  value,
  displayValue,
  min,
  max,
  step,
  onChange,
  sublabel,
}: {
  label: string;
  value: number;
  displayValue: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  sublabel?: string;
}) {
  return (
    <div className="flex flex-col gap-2 p-3 rounded-2xl bg-muted/20 border border-border/40 hover:border-border/80 transition-all">
      <div className="flex items-center justify-between text-xs">
        <div className="flex flex-col">
          <span className="font-semibold text-foreground text-xs">{label}</span>
          {sublabel && <span className="text-[10px] text-muted-foreground">{sublabel}</span>}
        </div>
        <span className="font-semibold tabular-nums text-primary text-xs px-2.5 py-0.5 rounded-full bg-primary/10 border border-primary/20">
          {displayValue}
        </span>
      </div>
      <Slider
        value={value}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(v as number)}
        className="py-1 cursor-pointer"
      />
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
  const [selectedPreset, setSelectedPreset] = useState<string>("custom");
  const [expenses, setExpenses] = useState<HospitalExpense[]>(initialExpenses);
  const [categories] = useState<ExpenseCategory[]>(initialCategories);

  const [params, setParams] = useState<SimulatorParams>({
    ...ROI_SIMULATOR_DEFAULTS,
    custom_expenses: initialExpenses,
  });

  const [showAdvancedEconomics, setShowAdvancedEconomics] = useState(false);
  const [showAdvancedConversion, setShowAdvancedConversion] = useState(false);
  const [showAddExpense, setShowAddExpense] = useState(false);

  // New Expense Form State
  const [newTitle, setNewTitle] = useState("");
  const [newCategoryId, setNewCategoryId] = useState(initialCategories[0]?.id || "");
  const [newAmount, setNewAmount] = useState<number>(250000);
  const [newRecurrence, setNewRecurrence] = useState<ExpenseRecurrence>("annual");
  const [newNotes, setNewNotes] = useState("");

  const [isPending, startTransition] = useTransition();

  // Instant reactive evaluation
  const result = useMemo(() => {
    return evaluateRoi({ ...params, custom_expenses: expenses });
  }, [params, expenses]);

  function set<K extends keyof SimulatorParams>(key: K, value: number) {
    setSelectedPreset("custom");
    setParams((p) => ({ ...p, [key]: value }));
  }

  function handleApplyPreset(preset: HospitalPreset) {
    setSelectedPreset(preset.id);
    setParams((p) => ({
      ...p,
      ...preset.params,
    }));
  }

  function handleToggleExpense(expenseId: string, currentActive: boolean) {
    const updated = expenses.map((e) =>
      e.id === expenseId ? { ...e, is_active: !currentActive } : e
    );
    setExpenses(updated);
    startTransition(async () => {
      await updateHospitalExpenseAction(expenseId, { is_active: !currentActive });
    });
  }

  function handleDeleteExpense(expenseId: string) {
    const updated = expenses.filter((e) => e.id !== expenseId);
    setExpenses(updated);
    startTransition(async () => {
      await deleteHospitalExpenseAction(expenseId);
    });
  }

  function handleCreateExpense(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim() || newAmount <= 0) return;

    const matchedCat = categories.find((c) => c.id === newCategoryId) || categories[0];
    const tempId = `temp-${Date.now()}`;
    const newRecord: HospitalExpense = {
      id: tempId,
      hospital_name: "Default Hospital",
      category_id: matchedCat?.id || "temp",
      category: matchedCat,
      category_key: matchedCat?.key,
      title: newTitle.trim(),
      amount_lkr: Number(newAmount),
      recurrence: newRecurrence,
      is_active: true,
      notes: newNotes.trim() || undefined,
    };

    setExpenses((prev) => [newRecord, ...prev]);
    setNewTitle("");
    setNewAmount(250000);
    setNewNotes("");
    setShowAddExpense(false);

    startTransition(async () => {
      const persisted = await createHospitalExpenseAction({
        category_id: matchedCat?.id || categories[0]?.id || "",
        hospital_name: "Default Hospital",
        title: newRecord.title,
        amount_lkr: newRecord.amount_lkr,
        recurrence: newRecord.recurrence,
        is_active: true,
        notes: newRecord.notes || undefined,
      });
      if (persisted) {
        setExpenses((curr) => curr.map((x) => (x.id === tempId ? persisted : x)));
      }
    });
  }

  const activeExpensesCount = expenses.filter((e) => e.is_active).length;

  return (
    <div className="flex flex-col gap-6">
      {/* Hospital Preset Profiles Selector */}
      <div className="rounded-[24px] bg-card p-4 sm:p-5 shadow-xs border border-border/60 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="size-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
            <Building2 className="size-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">Select Hospital Operating Profile</h3>
            <p className="text-xs text-muted-foreground">
              Calibrate operational expenses and scale to match specific hospital footprints
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {HOSPITAL_PRESETS.map((preset) => {
            const isSelected = selectedPreset === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleApplyPreset(preset)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                  isSelected
                    ? "bg-primary text-primary-foreground shadow-xs ring-2 ring-primary/30"
                    : "bg-muted/40 hover:bg-muted text-foreground border border-border/50"
                }`}
              >
                <span>{preset.name}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isSelected ? "bg-white/20 text-white" : "bg-muted-foreground/15 text-muted-foreground"}`}>
                  {preset.tag}
                </span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setSelectedPreset("custom")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
              selectedPreset === "custom"
                ? "bg-primary text-primary-foreground shadow-xs ring-2 ring-primary/30"
                : "bg-muted/40 hover:bg-muted text-muted-foreground border border-border/50"
            }`}
          >
            <span>Custom Calibrated</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Sliders, Operating Model & Custom Expenses (6 Cols) */}
        <div className="lg:col-span-6 flex flex-col gap-5">
          {/* Card 1: Clinic Scale & Operating Model */}
          <div className="rounded-[24px] bg-card p-5 sm:p-6 shadow-xs border border-border/60 flex flex-col gap-4">
            <div className="flex items-center justify-between pb-2 border-b border-border/40">
              <div>
                <h2 className="text-base font-bold text-foreground">Clinic Scale & Operating Model</h2>
                <p className="text-xs text-muted-foreground">Calibrate baseline parameters for hospital volume & economics</p>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <SliderField
                label="Daily Consultant Sessions"
                sublabel="Active outpatient clinics per day (~20 patients/clinic)"
                value={params.daily_clinics_count}
                displayValue={`${params.daily_clinics_count} clinics`}
                min={1}
                max={150}
                step={1}
                onChange={(v) => set("daily_clinics_count", v)}
              />
              <SliderField
                label="Average Consultation Fee"
                sublabel="Specialist doctor channeling fee (LKR)"
                value={params.avg_consultation_fee_lkr}
                displayValue={`LKR ${params.avg_consultation_fee_lkr.toLocaleString()}`}
                min={1000}
                max={30000}
                step={250}
                onChange={(v) => set("avg_consultation_fee_lkr", v)}
              />
              <SliderField
                label="Baseline No-Show Rate"
                sublabel="Observed baseline prior to SHAI deployment"
                value={params.baseline_no_show_rate}
                displayValue={`${Math.round(params.baseline_no_show_rate * 100)}%`}
                min={0.01}
                max={0.6}
                step={0.01}
                onChange={(v) => set("baseline_no_show_rate", v)}
              />
              <SliderField
                label="AI Intervention Coverage"
                sublabel="Targeted top-risk deciles queued for outreach"
                value={params.ai_intervention_coverage}
                displayValue={`Top ${Math.round(params.ai_intervention_coverage * 100)}%`}
                min={0.05}
                max={1}
                step={0.05}
                onChange={(v) => set("ai_intervention_coverage", v)}
              />
            </div>

            {/* Expandable: Hospital Margin & Revenue Attribution */}
            <div className="border-t border-border/40 pt-2 flex flex-col gap-3">
              <button
                type="button"
                onClick={() => setShowAdvancedEconomics((s) => !s)}
                className="flex items-center justify-between text-xs font-semibold text-primary hover:underline transition-all py-1 cursor-pointer"
              >
                <div className="flex items-center gap-1.5">
                  <Percent className="size-3.5" />
                  <span>Hospital Facility Share & Ancillary Margins</span>
                </div>
                <ChevronDown className={`size-3.5 transition-transform ${showAdvancedEconomics ? "rotate-180" : ""}`} />
              </button>

              {showAdvancedEconomics && (
                <div className="flex flex-col gap-3 pt-1 animate-in fade-in duration-200">
                  <SliderField
                    label="Hospital Facility Retained Share"
                    sublabel="Hospital portion of the doctor channeling fee"
                    value={params.hospital_retained_fee_pct ?? 0.3}
                    displayValue={`${Math.round((params.hospital_retained_fee_pct ?? 0.3) * 100)}%`}
                    min={0.1}
                    max={1}
                    step={0.02}
                    onChange={(v) => set("hospital_retained_fee_pct", v)}
                  />
                  <SliderField
                    label="Average Ancillary Lab/Pharmacy Revenue"
                    sublabel="Estimated diagnostic tests & pharmacy per attended patient (LKR)"
                    value={params.ancillary_revenue_per_attended_lkr ?? 3500}
                    displayValue={`LKR ${(params.ancillary_revenue_per_attended_lkr ?? 3500).toLocaleString()}`}
                    min={0}
                    max={25000}
                    step={250}
                    onChange={(v) => set("ancillary_revenue_per_attended_lkr", v)}
                  />
                  <SliderField
                    label="Staff Loaded Hourly Rate"
                    sublabel="Nursing/Front-desk hourly rate to monetize saved time (LKR/hr)"
                    value={params.staff_hourly_rate_lkr ?? 850}
                    displayValue={`LKR ${(params.staff_hourly_rate_lkr ?? 850).toLocaleString()}/hr`}
                    min={300}
                    max={3000}
                    step={50}
                    onChange={(v) => set("staff_hourly_rate_lkr", v)}
                  />
                  <SliderField
                    label="Annual Operating Days"
                    sublabel="Annual active clinic operational days (e.g., 310 - 365)"
                    value={params.operational_days_year ?? 310}
                    displayValue={`${params.operational_days_year ?? 310} days`}
                    min={250}
                    max={365}
                    step={5}
                    onChange={(v) => set("operational_days_year", v)}
                  />
                </div>
              )}
            </div>

            {/* Expandable: Advanced Outreach Assumptions */}
            <div className="border-t border-border/40 pt-2 flex flex-col gap-3">
              <button
                type="button"
                onClick={() => setShowAdvancedConversion((s) => !s)}
                className="flex items-center justify-between text-xs font-semibold text-primary hover:underline transition-all py-1 cursor-pointer"
              >
                <div className="flex items-center gap-1.5">
                  <Layers className="size-3.5" />
                  <span>Outreach Conversion & Overbooking Ratios</span>
                </div>
                <ChevronDown className={`size-3.5 transition-transform ${showAdvancedConversion ? "rotate-180" : ""}`} />
              </button>

              {showAdvancedConversion && (
                <div className="flex flex-col gap-3 pt-1 animate-in fade-in duration-200">
                  <SliderField
                    label="Patient Reachability Rate"
                    sublabel="SMS/WhatsApp delivery & open rate"
                    value={params.patient_reachability_rate}
                    displayValue={`${Math.round(params.patient_reachability_rate * 100)}%`}
                    min={0.5}
                    max={1}
                    step={0.01}
                    onChange={(v) => set("patient_reachability_rate", v)}
                  />
                  <SliderField
                    label="Reschedule Conversion Success"
                    sublabel="Patients accepting proposed rescheduled date"
                    value={params.reschedule_success_rate}
                    displayValue={`${Math.round(params.reschedule_success_rate * 100)}%`}
                    min={0.2}
                    max={1}
                    step={0.01}
                    onChange={(v) => set("reschedule_success_rate", v)}
                  />
                  <SliderField
                    label="Overbooking Slot Fill Rate"
                    sublabel="Waitlist arrivals taking vacated capacity"
                    value={params.overbooking_fill_rate}
                    displayValue={`${Math.round(params.overbooking_fill_rate * 100)}%`}
                    min={0.2}
                    max={1}
                    step={0.01}
                    onChange={(v) => set("overbooking_fill_rate", v)}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Card 2: Hospital CapEx, OpEx & Patient Giveaways Manager */}
          <div className="rounded-[24px] bg-card p-5 sm:p-6 shadow-xs border border-border/60 flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-border/40 gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-foreground">Hospital Expenses & Giveaways</h2>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                    {activeExpensesCount} Active
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Define running expenses (giveaways, transport subsidies, telco, IT) to evaluate real net revenue
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowAddExpense((v) => !v)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold shadow-xs hover:bg-primary/90 transition-all self-start sm:self-auto cursor-pointer"
              >
                <Plus className="size-3.5" />
                <span>Add Expense Item</span>
              </button>
            </div>

            {/* Inline Add Expense Form */}
            {showAddExpense && (
              <form
                onSubmit={handleCreateExpense}
                className="p-4 rounded-2xl bg-muted/30 border border-primary/20 flex flex-col gap-3 animate-in fade-in duration-200"
              >
                <div className="flex items-center justify-between pb-2 border-b border-border/40">
                  <span className="text-xs font-bold text-foreground">New Expense / Giveaway Item</span>
                  <span className="text-[11px] text-muted-foreground">Saves to hospital database</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-semibold text-foreground">Expense Category</label>
                    <select
                      value={newCategoryId}
                      onChange={(e) => setNewCategoryId(e.target.value)}
                      className="h-9 px-2.5 rounded-xl bg-background border border-border text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                    >
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-semibold text-foreground">Frequency / Recurrence</label>
                    <select
                      value={newRecurrence}
                      onChange={(e) => setNewRecurrence(e.target.value as ExpenseRecurrence)}
                      className="h-9 px-2.5 rounded-xl bg-background border border-border text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                    >
                      <option value="annual">Annual Fixed Overhead</option>
                      <option value="monthly">Monthly Recurring</option>
                      <option value="per_patient">Per Intervened Patient (e.g. Voucher)</option>
                      <option value="one_off">One-Off Setup (Year 1)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-semibold text-foreground">
                      Title / Reason for Expense
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Free PickMe vouchers for elderly patients"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      required
                      className="h-9 px-3 rounded-xl bg-background border border-border text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-semibold text-foreground">
                      Amount (LKR)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={5000}
                      placeholder="e.g. 450000"
                      value={newAmount}
                      onChange={(e) => setNewAmount(Number(e.target.value))}
                      required
                      className="h-9 px-3 rounded-xl bg-background border border-border text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold text-foreground">Clinical / Operational Justification (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Subsidizes transport to eliminate travel friction for cardiology clinic"
                    value={newNotes}
                    onChange={(e) => setNewNotes(e.target.value)}
                    className="h-8 px-3 rounded-xl bg-background border border-border text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAddExpense(false)}
                    className="px-3 py-1.5 rounded-xl border border-border text-xs font-semibold hover:bg-muted text-muted-foreground transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold shadow-xs hover:bg-primary/90 transition-all cursor-pointer"
                  >
                    Save & Recalculate
                  </button>
                </div>
              </form>
            )}

            {/* List of Expense Cards with Live Toggle */}
            <div className="flex flex-col gap-2.5">
              {expenses.length === 0 ? (
                <div className="p-6 rounded-2xl bg-muted/20 border border-dashed border-border/80 text-center flex flex-col items-center gap-2">
                  <Receipt className="size-6 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">No custom expenses entered yet.</p>
                </div>
              ) : (
                expenses.map((expense) => {
                  const categoryKey = expense.category?.key || expense.category_key;
                  return (
                    <div
                      key={expense.id}
                      className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all ${
                        expense.is_active
                          ? "bg-card border-border/70 hover:border-border shadow-2xs"
                          : "bg-muted/10 border-border/30 opacity-60 hover:opacity-90"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={expense.is_active}
                          onChange={() => handleToggleExpense(expense.id, expense.is_active)}
                          className="size-4 rounded accent-primary cursor-pointer"
                          title="Toggle expense on/off to see live EBITDA delta"
                        />
                        <div className="size-8 rounded-xl bg-muted/40 flex items-center justify-center shrink-0">
                          {getCategoryIcon(categoryKey)}
                        </div>
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-foreground">
                              {expense.title}
                            </span>
                            <span className="text-[9px] uppercase font-mono tracking-wider px-1.5 py-0.2 rounded-full bg-muted border border-border/50 text-muted-foreground">
                              {expense.recurrence.replace("_", " ")}
                            </span>
                          </div>
                          {expense.notes && (
                            <span className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">
                              {expense.notes}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <div className="flex flex-col text-right">
                          <span className={`text-xs font-bold font-mono tabular-nums ${expense.is_active ? "text-foreground" : "text-muted-foreground line-through"}`}>
                            LKR {expense.amount_lkr.toLocaleString()}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {expense.recurrence === "monthly" ? "/month" : expense.recurrence === "per_patient" ? "/intervened" : "/year"}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleDeleteExpense(expense.id)}
                          title="Delete expense"
                          className="size-7 rounded-lg text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 flex items-center justify-center transition-all cursor-pointer"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Real-Time Sensitivity Dial Badge */}
            <div className="rounded-[18px] bg-primary/5 p-3.5 border border-primary/20 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Sparkles className="size-4 text-primary shrink-0" />
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-foreground">Live Expense Drag Telemetry</span>
                  <span className="text-[11px] text-muted-foreground">
                    Active expenses consume <strong>{result.expense_drag_pct}%</strong> of gross recovered value
                  </span>
                </div>
              </div>
              <div className="text-right">
                <span className="text-xs font-bold font-mono text-primary tabular-nums">
                  {formatLkr(result.total_annual_expenses_lkr)}
                </span>
                <span className="block text-[10px] text-muted-foreground">Total Deductions</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Hero Boardroom Impact & Operational Outputs (6 Cols) */}
        <div className="lg:col-span-6 flex flex-col gap-5">
          {/* Net ROI Hero Card */}
          <div className="rounded-[24px] bg-gradient-to-br from-[#8B7CF6]/20 via-background to-[#5B7CFA]/15 p-6 sm:p-7 shadow-xs border border-primary/30 flex flex-col gap-5 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-primary">
                  Boardroom Impact & Net EBITDA
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold border border-emerald-500/20">
                  Fully Amortized
                </span>
              </div>
              <div className="size-9 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <Sparkles className="size-4.5" />
              </div>
            </div>

            {/* Hero Main Numbers */}
            <div className="flex flex-col gap-1.5">
              <div className="flex flex-wrap items-baseline gap-3">
                <span className="text-4xl sm:text-5xl font-extrabold tracking-tight text-foreground font-mono">
                  {formatLkr(result.true_net_profit_lkr)}
                </span>
                <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                  True Net Hospital Gain
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Actual profit generated after deducting all custom hospital expenses, patient giveaways, and software licensing.
              </p>
            </div>

            {/* 3-Pillar Boardroom Grid */}
            <div className="grid grid-cols-3 gap-3 pt-4 border-t border-border/40">
              <div className="flex flex-col">
                <span className="text-[11px] text-muted-foreground">Net ROI Multiple</span>
                <span className="text-xl font-bold font-mono text-primary tabular-nums">
                  {result.net_roi_multiple}x
                </span>
                <span className="text-[10px] text-muted-foreground mt-0.5">Yield on CapEx</span>
              </div>

              <div className="flex flex-col">
                <span className="text-[11px] text-muted-foreground">Payback Velocity</span>
                <span className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">
                  {result.payback_period_days} Days
                </span>
                <span className="text-[10px] text-muted-foreground mt-0.5">To Break Even</span>
              </div>

              <div className="flex flex-col">
                <span className="text-[11px] text-muted-foreground">Annual Leakage</span>
                <span className="text-xl font-bold font-mono text-rose-600 dark:text-rose-400 tabular-nums">
                  {formatLkr(result.annual_revenue_leakage_lkr)}
                </span>
                <span className="text-[10px] text-muted-foreground mt-0.5">Without AI</span>
              </div>
            </div>
          </div>

          {/* Financial Waterfall Breakdown Card */}
          <div className="rounded-[24px] bg-card p-5 sm:p-6 shadow-xs border border-border/60 flex flex-col gap-4">
            <div className="flex items-center justify-between pb-2 border-b border-border/40">
              <div className="flex items-center gap-2">
                <Wallet className="size-4 text-primary" />
                <h3 className="text-sm font-bold text-foreground">Executive Financial Waterfall</h3>
              </div>
              <span className="text-[11px] text-muted-foreground">Annualized Reconciliation (LKR)</span>
            </div>

            <div className="flex flex-col gap-3">
              {/* Gross Clinical Revenue */}
              <div className="flex items-center justify-between text-xs p-2.5 rounded-xl bg-muted/20">
                <div className="flex flex-col">
                  <span className="font-semibold text-foreground">Reclaimed Clinical Appointments</span>
                  <span className="text-[10px] text-muted-foreground">Doctor channeling + hospital facility fees</span>
                </div>
                <span className="font-bold font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">
                  + {formatLkr(result.gross_revenue_recovered_lkr)}
                </span>
              </div>

              {/* Direct Labor Cost Saved */}
              <div className="flex items-center justify-between text-xs p-2.5 rounded-xl bg-muted/20">
                <div className="flex flex-col">
                  <span className="font-semibold text-foreground">Nursing Call-Center Hours Monetized</span>
                  <span className="text-[10px] text-muted-foreground">Eliminated manual calling at LKR {params.staff_hourly_rate_lkr ?? 850}/hr</span>
                </div>
                <span className="font-bold font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">
                  + {formatLkr(result.direct_labor_savings_lkr)}
                </span>
              </div>

              {/* Total Expenses Deducted */}
              <div className="flex items-center justify-between text-xs p-2.5 rounded-xl bg-rose-500/[0.04] border border-rose-500/20">
                <div className="flex flex-col">
                  <span className="font-semibold text-rose-700 dark:text-rose-300">
                    Hospital CapEx, Giveaways & Overheads
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    All {activeExpensesCount} active expenses, telco & IT licenses
                  </span>
                </div>
                <span className="font-bold font-mono text-rose-600 dark:text-rose-400 tabular-nums">
                  - {formatLkr(result.total_annual_expenses_lkr)}
                </span>
              </div>

              {/* Net Hospital Boardroom Gain */}
              <div className="flex items-center justify-between text-xs p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                <div className="flex flex-col">
                  <span className="font-bold text-foreground">True Net Hospital EBITDA</span>
                  <span className="text-[10px] text-emerald-700 dark:text-emerald-300 font-semibold">
                    Net cash impact for the Board of Directors
                  </span>
                </div>
                <span className="text-base font-extrabold font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">
                  {formatLkr(result.true_net_profit_lkr)}
                </span>
              </div>
            </div>
          </div>

          {/* Operational Dividends Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Doctor Clinical Hours Reclaimed */}
            <div className="rounded-[24px] bg-card p-5 shadow-xs border border-border/60 flex flex-col justify-between gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">Doctor Hours Reclaimed</span>
                <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                  <Clock3 className="size-4" />
                </div>
              </div>
              <div className="flex flex-col">
                <span className="text-2xl font-bold tracking-tight text-foreground tabular-nums font-mono">
                  {result.recovered_doctor_hours_annual.toLocaleString()}
                </span>
                <span className="text-[11px] text-muted-foreground mt-0.5">Specialist clinical hours / year</span>
              </div>
            </div>

            {/* Front Desk Phone Hours Saved */}
            <div className="rounded-[24px] bg-card p-5 shadow-xs border border-border/60 flex flex-col justify-between gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">Front-Desk Hours Saved</span>
                <div className="size-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                  <PhoneOff className="size-4" />
                </div>
              </div>
              <div className="flex flex-col">
                <span className="text-2xl font-bold tracking-tight text-foreground tabular-nums font-mono">
                  {result.nurse_phone_hours_saved_monthly.toLocaleString()}
                </span>
                <span className="text-[11px] text-muted-foreground mt-0.5">Manual calling hours / month</span>
              </div>
            </div>
          </div>

          {/* Transparency & Governance Card */}
          <div className="rounded-[20px] bg-muted/20 p-4 border border-border/40 flex items-start gap-3">
            <Info className="size-4 text-muted-foreground shrink-0 mt-0.5" />
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Every expense line item in this simulator updates calculations dynamically via Next.js and persists to PostgreSQL. Toggling expenses allows leadership to test sensitivity of giveaways (like PickMe vouchers or lab discounts) against recovered outpatient volume.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
