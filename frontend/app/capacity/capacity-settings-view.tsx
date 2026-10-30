"use client";

import { useState, useEffect, useTransition } from "react";
import { Settings, Save, CheckCircle2, Info } from "lucide-react";

import { getCapacitySettingsAction, updateCapacitySettingsAction } from "@/app/capacity/actions";
import type { CapacitySetting } from "@/lib/types";

interface CapacitySettingsViewProps {
  initialSettings: CapacitySetting | null;
  departments: string[];
}

function NumberField({
  label,
  hint,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold text-foreground">{label}</label>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-10 max-w-xs rounded-xl border border-border bg-background px-3 text-xs font-semibold text-foreground"
      />
      <span className="text-[10px] text-muted-foreground">{hint}</span>
    </div>
  );
}

export function CapacitySettingsView({ initialSettings }: CapacitySettingsViewProps) {
  const [setting, setSetting] = useState<CapacitySetting | null>(initialSettings);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (initialSettings) return;
    startTransition(async () => {
      const s = await getCapacitySettingsAction("global");
      if (s) setSetting(s);
    });
  }, [initialSettings]);

  if (!setting) {
    return <div className="rounded-[24px] border border-border/60 bg-card p-12 text-center text-xs text-muted-foreground">Loading settings…</div>;
  }

  function save() {
    if (!setting) return;
    startTransition(async () => {
      const updated = await updateCapacitySettingsAction("global", {
        wait_cost_lkr: setting.wait_cost_lkr,
        max_overbook_per_session: setting.max_overbook_per_session,
        badge_safe_mins: setting.badge_safe_mins,
        badge_moderate_mins: setting.badge_moderate_mins,
        auto_assign_waitlist: setting.auto_assign_waitlist,
      });
      if (updated) {
        setSetting(updated);
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    });
  }

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-300">
      <div className="flex flex-col justify-between gap-4 rounded-[24px] border border-border/60 bg-card p-5 shadow-xs sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Settings className="size-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-foreground">Overbooking parameters</h2>
            <p className="text-xs text-muted-foreground">Hospital-wide defaults used by the exact Poisson-binomial recommendation.</p>
          </div>
        </div>
        <button
          type="button"
          disabled={isPending}
          onClick={save}
          className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white shadow-xs transition-colors hover:bg-primary/90"
        >
          <Save className="size-3.5" /> Save changes
        </button>
      </div>

      {saved && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="size-4" /> Settings saved.
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="flex flex-col gap-5 rounded-[24px] border border-border/60 bg-card p-5 shadow-xs sm:p-6 lg:col-span-7">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <NumberField
              label="Cost of one overflow patient (LKR)"
              hint="Assumption, not a measured figure. Default LKR 10,000 is 4× the consultation fee: what a patient who arrives beyond capacity costs (long wait, turn-away, goodwill). Change it and the overbooking advice changes; see the What-If page for sensitivity."
              value={setting.wait_cost_lkr}
              min={0}
              max={1000000}
              step={500}
              onChange={(v) => setSetting({ ...setting, wait_cost_lkr: v })}
            />
            <NumberField
              label="Max overbooking per session"
              hint="Upper limit on bookings beyond capacity, whatever the maths says."
              value={setting.max_overbook_per_session}
              min={0}
              max={20}
              onChange={(v) => setSetting({ ...setting, max_overbook_per_session: v })}
            />
            <NumberField
              label="Badge: Safe up to (min overrun)"
              hint="Expected session overrun at or below this shows a Safe badge."
              value={setting.badge_safe_mins ?? 8}
              min={0}
              max={120}
              onChange={(v) => setSetting({ ...setting, badge_safe_mins: v })}
            />
            <NumberField
              label="Badge: Moderate up to (min overrun)"
              hint="Above this shows Caution."
              value={setting.badge_moderate_mins ?? 15}
              min={0}
              max={240}
              onChange={(v) => setSetting({ ...setting, badge_moderate_mins: v })}
            />
          </div>

          <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-border/50 bg-muted/20 p-4">
            <span className="flex flex-col">
              <span className="text-xs font-bold text-foreground">Automatic waitlist dispatch</span>
              <span className="text-[11px] text-muted-foreground">When a slot opens, offer it to the top-ranked waitlisted patient.</span>
            </span>
            <input
              type="checkbox"
              checked={setting.auto_assign_waitlist}
              onChange={(e) => setSetting({ ...setting, auto_assign_waitlist: e.target.checked })}
              className="size-5 cursor-pointer accent-primary"
            />
          </label>
        </div>

        <div className="flex flex-col gap-3 rounded-[24px] border border-primary/20 bg-primary/5 p-5 shadow-xs sm:p-6 lg:col-span-5">
          <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
            <Info className="size-4 text-primary" /> How the recommendation works
          </h3>
          <p className="text-xs leading-relaxed text-muted-foreground">
            For each session the number of patients who arrive is computed exactly from every booked patient&apos;s
            calibrated no-show probability. For k extra bookings:
          </p>
          <p className="rounded-xl bg-background/70 p-3 font-mono text-[11px] text-foreground">
            value(k) = fee × E[min(N, capacity)] − {setting.wait_cost_lkr.toLocaleString()} × E[max(N − capacity, 0)]
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            The best k is chosen, and the part beyond free seats is the overbooking. Each extra booking is worth taking while
            P(overflow) stays below fee / (fee + wait cost), so a higher cost per overflow patient means less overbooking.
            There is no simulation; the numbers are exact for the stored probabilities.
          </p>
        </div>
      </div>
    </div>
  );
}
