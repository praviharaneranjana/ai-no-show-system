"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Wallet, TrendingDown, Clock3, PhoneOff, Coins } from "lucide-react";

import { Slider } from "@/components/ui/slider";
import { Card, CardContent } from "@/components/ui/card";
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
}: {
  label: string;
  value: number;
  displayValue: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-foreground">{label}</span>
        <span className="font-mono tabular-nums text-primary font-semibold">{displayValue}</span>
      </div>
      <Slider
        value={value}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(v as number)}
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
    <div className="flex flex-col gap-6">
      {/* Primary Sliders */}
      <Card className="border-border/80 shadow-xs">
        <CardContent className="flex flex-col gap-5 p-5">
          <SliderField
            label="Daily Consultant Sessions"
            value={params.daily_clinics_count}
            displayValue={`${params.daily_clinics_count}`}
            min={1}
            max={150}
            step={1}
            onChange={(v) => set("daily_clinics_count", v)}
          />
          <SliderField
            label="Average Consultation Fee"
            value={params.avg_consultation_fee_lkr}
            displayValue={`LKR ${params.avg_consultation_fee_lkr.toLocaleString()}`}
            min={1000}
            max={30000}
            step={250}
            onChange={(v) => set("avg_consultation_fee_lkr", v)}
          />
          <SliderField
            label="Baseline No-Show Rate"
            value={params.baseline_no_show_rate}
            displayValue={`${Math.round(params.baseline_no_show_rate * 100)}%`}
            min={0.01}
            max={0.6}
            step={0.01}
            onChange={(v) => set("baseline_no_show_rate", v)}
          />
          <SliderField
            label="AI Intervention Coverage (top-risk %)"
            value={params.ai_intervention_coverage}
            displayValue={`${Math.round(params.ai_intervention_coverage * 100)}%`}
            min={0.05}
            max={1}
            step={0.05}
            onChange={(v) => set("ai_intervention_coverage", v)}
          />

          <button
            type="button"
            onClick={() => setShowAdvanced((s) => !s)}
            className="flex items-center gap-1.5 self-start text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronDown className={`size-3.5 transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
            <span>{showAdvanced ? "Hide" : "Show"} advanced assumptions</span>
          </button>

          {showAdvanced && (
            <div className="flex flex-col gap-5 border-t border-border/60 pt-4">
              <SliderField
                label="Patient Reachability Rate"
                value={params.patient_reachability_rate}
                displayValue={`${Math.round(params.patient_reachability_rate * 100)}%`}
                min={0.5}
                max={1}
                step={0.01}
                onChange={(v) => set("patient_reachability_rate", v)}
              />
              <SliderField
                label="Reschedule Success Rate"
                value={params.reschedule_success_rate}
                displayValue={`${Math.round(params.reschedule_success_rate * 100)}%`}
                min={0.2}
                max={1}
                step={0.01}
                onChange={(v) => set("reschedule_success_rate", v)}
              />
              <SliderField
                label="Overbooking Fill Rate"
                value={params.overbooking_fill_rate}
                displayValue={`${Math.round(params.overbooking_fill_rate * 100)}%`}
                min={0.2}
                max={1}
                step={0.01}
                onChange={(v) => set("overbooking_fill_rate", v)}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Computed Outputs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="border-red-500/30 bg-red-500/[0.04] dark:bg-red-950/20 shadow-xs">
          <CardContent className="flex items-center justify-between p-4">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-red-700 dark:text-red-300">
                Annual Revenue Leakage
              </span>
              <span className="text-xl font-bold tracking-tight tabular-nums text-red-700 dark:text-red-300">
                {formatLkr(result.annual_revenue_leakage_lkr)}
              </span>
              <span className="text-[11px] text-red-600/80 dark:text-red-400/80">
                {result.daily_slots_at_risk} slots at risk / day
              </span>
            </div>
            <TrendingDown className="size-5 text-red-600 dark:text-red-300" />
          </CardContent>
        </Card>

        <Card className="border-emerald-500/30 bg-emerald-500/[0.04] dark:bg-emerald-950/20 shadow-xs">
          <CardContent className="flex items-center justify-between p-4">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                Recovered Annual Revenue
              </span>
              <span className="text-xl font-bold tracking-tight tabular-nums text-emerald-700 dark:text-emerald-300">
                {formatLkr(result.annual_revenue_recovered_lkr)}
              </span>
              <span className="text-[11px] text-emerald-600/80 dark:text-emerald-400/80">
                Via autonomous reschedule + overbooking
              </span>
            </div>
            <Wallet className="size-5 text-emerald-600 dark:text-emerald-300" />
          </CardContent>
        </Card>

        <Card className="border-border/80 shadow-xs">
          <CardContent className="flex items-center justify-between p-4">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Net ROI Multiple</span>
              <span className="text-xl font-bold tracking-tight tabular-nums text-foreground">
                {result.net_roi_multiple}x
              </span>
              <span className="text-[11px] text-muted-foreground">vs. LKR 1.8M/yr system cost</span>
            </div>
            <Coins className="size-5 text-primary" />
          </CardContent>
        </Card>

        <Card className="border-border/80 shadow-xs">
          <CardContent className="flex items-center justify-between p-4">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Doctor Hours Reclaimed</span>
              <span className="text-xl font-bold tracking-tight tabular-nums text-foreground">
                {result.recovered_doctor_hours_annual.toLocaleString()}
              </span>
              <span className="text-[11px] text-muted-foreground">hours / year</span>
            </div>
            <Clock3 className="size-5 text-muted-foreground" />
          </CardContent>
        </Card>

        <Card className="border-border/80 shadow-xs sm:col-span-2 lg:col-span-1">
          <CardContent className="flex items-center justify-between p-4">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">
                Front-Desk Call Hours Saved
              </span>
              <span className="text-xl font-bold tracking-tight tabular-nums text-foreground">
                {result.nurse_phone_hours_saved_monthly.toLocaleString()}
              </span>
              <span className="text-[11px] text-muted-foreground">hours / month</span>
            </div>
            <PhoneOff className="size-5 text-muted-foreground" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
