"use client";

import { useMemo, useState } from "react";
import {
  ChevronDown,
  Wallet,
  TrendingDown,
  Clock3,
  PhoneOff,
  Sparkles,
  Info,
} from "lucide-react";

import { Slider } from "@/components/ui/slider";
import { formatLkr } from "@/lib/utils";
import { ROI_SIMULATOR_DEFAULTS, evaluateRoi } from "@/lib/roi";
import type { SimulatorParams } from "@/lib/types";

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

export function RoiSimulator() {
  const [params, setParams] = useState<SimulatorParams>(ROI_SIMULATOR_DEFAULTS);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const result = useMemo(() => evaluateRoi(params), [params]);

  function set<K extends keyof SimulatorParams>(key: K, value: number) {
    setParams((p) => ({ ...p, [key]: value }));
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left Column: Input Sliders & Parameters */}
      <div className="lg:col-span-6 flex flex-col gap-4">
        <div className="rounded-[24px] bg-card p-5 sm:p-6 shadow-xs border border-border/60 flex flex-col gap-4">
          <div className="flex items-center justify-between pb-2 border-b border-border/40">
            <div>
              <h2 className="text-base font-bold text-foreground">Clinic Scale & Operating Model</h2>
              <p className="text-xs text-muted-foreground">Calibrate baseline parameters for hospital economics</p>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <SliderField
              label="Daily Consultant Sessions"
              sublabel="Active outpatient clinics per day"
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

          <button
            type="button"
            onClick={() => setShowAdvanced((s) => !s)}
            className="flex items-center gap-2 self-start text-xs font-semibold text-primary hover:underline transition-all mt-1 cursor-pointer"
          >
            <ChevronDown className={`size-3.5 transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
            <span>{showAdvanced ? "Hide" : "Show"} Advanced Conversion Assumptions</span>
          </button>

          {showAdvanced && (
            <div className="flex flex-col gap-3 border-t border-border/40 pt-4 animate-in fade-in duration-200">
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

        {/* Assumptions Transparency Card */}
        <div className="rounded-[20px] bg-muted/30 p-4 border border-border/40 flex items-start gap-3">
          <Info className="size-4 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            System amortisation model benchmarks against a fixed LKR 1.8M/year operational overhead. Doctor hour recovery models an average 15-minute consultation slot.
          </p>
        </div>
      </div>

      {/* Right Column: Hero Financial & Operational Outputs */}
      <div className="lg:col-span-6 flex flex-col gap-4">
        {/* Net ROI Hero Card */}
        <div className="rounded-[24px] bg-gradient-to-br from-[#8B7CF6]/15 via-background to-[#5B7CFA]/10 p-6 shadow-xs border border-primary/20 flex flex-col gap-4 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-primary">Boardroom Impact</span>
            <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <Sparkles className="size-4" />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex items-baseline gap-3">
              <span className="text-4xl sm:text-5xl font-extrabold tracking-tight text-foreground font-mono">
                {result.net_roi_multiple}x
              </span>
              <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                Net ROI Multiple
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Annual return on investment modeled against fixed system run-rate.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border/40">
            <div className="flex flex-col">
              <span className="text-[11px] text-muted-foreground">Recovered / Year</span>
              <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                {formatLkr(result.annual_revenue_recovered_lkr)}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] text-muted-foreground">Annual Leakage</span>
              <span className="text-lg font-bold text-rose-600 dark:text-rose-400 tabular-nums">
                {formatLkr(result.annual_revenue_leakage_lkr)}
              </span>
            </div>
          </div>
        </div>

        {/* Operational Efficiency Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Recovered Revenue Card */}
          <div className="rounded-[24px] bg-card p-5 shadow-xs border border-emerald-500/20 bg-emerald-500/[0.02] flex flex-col justify-between gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                Revenue Recovered
              </span>
              <div className="size-8 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                <Wallet className="size-4" />
              </div>
            </div>
            <div className="flex flex-col">
              <span className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400 tabular-nums">
                {formatLkr(result.annual_revenue_recovered_lkr)}
              </span>
              <span className="text-[11px] text-muted-foreground mt-0.5">
                Via automated SMS triage + overbooking backfill
              </span>
            </div>
          </div>

          {/* Revenue Leakage Card */}
          <div className="rounded-[24px] bg-card p-5 shadow-xs border border-rose-500/20 bg-rose-500/[0.02] flex flex-col justify-between gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-rose-700 dark:text-rose-300">
                Baseline Leakage
              </span>
              <div className="size-8 rounded-full bg-rose-500/10 flex items-center justify-center text-rose-600 dark:text-rose-400">
                <TrendingDown className="size-4" />
              </div>
            </div>
            <div className="flex flex-col">
              <span className="text-2xl font-bold tracking-tight text-rose-600 dark:text-rose-400 tabular-nums">
                {formatLkr(result.annual_revenue_leakage_lkr)}
              </span>
              <span className="text-[11px] text-muted-foreground mt-0.5">
                {result.daily_slots_at_risk} consultation slots lost daily
              </span>
            </div>
          </div>

          {/* Doctor Hours Reclaimed */}
          <div className="rounded-[24px] bg-card p-5 shadow-xs border border-border/60 flex flex-col justify-between gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground">Doctor Hours Reclaimed</span>
              <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <Clock3 className="size-4" />
              </div>
            </div>
            <div className="flex flex-col">
              <span className="text-2xl font-bold tracking-tight text-foreground tabular-nums">
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
              <span className="text-2xl font-bold tracking-tight text-foreground tabular-nums">
                {result.nurse_phone_hours_saved_monthly.toLocaleString()}
              </span>
              <span className="text-[11px] text-muted-foreground mt-0.5">Manual calling hours / month</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
