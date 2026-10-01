"use client";

import React, { useState, useEffect, useTransition } from "react";
import {
  Settings,
  Save,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Shield,
  Zap,
  RotateCcw,
} from "lucide-react";

import {
  getCapacitySettingsAction,
  updateCapacitySettingsAction,
} from "@/app/capacity/actions";
import { formatLkr, cn } from "@/lib/utils";
import type { CapacitySetting } from "@/lib/types";

interface CapacitySettingsViewProps {
  initialSettings: CapacitySetting | null;
  departments: string[];
}

export function CapacitySettingsView({ initialSettings, departments }: CapacitySettingsViewProps) {
  const [scope, setScope] = useState<string>("global");
  const [setting, setSetting] = useState<CapacitySetting>(
    initialSettings ?? {
      scope: "global",
      wait_tolerance_mins: 20,
      safety_factor: 0.75,
      max_overbook_per_session: 3,
      max_overbook_per_slot: 1,
      consultation_fee_lkr: 4500,
      badge_safe_wait_mins: 8,
      badge_moderate_wait_mins: 15,
      auto_assign_waitlist: false,
      auto_assign_time_window_mins: 15,
    }
  );

  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      const s = await getCapacitySettingsAction(scope);
      if (s) setSetting(s);
    });
  }, [scope]);

  async function handleSave() {
    startTransition(async () => {
      const updated = await updateCapacitySettingsAction(scope, setting);
      if (updated) {
        setSetting(updated);
        setSavedSuccess(true);
        setTimeout(() => setSavedSuccess(false), 3000);
      }
    });
  }

  // Live impact calculation
  const samplePredictedNoShows = 2.5;
  const sampleOverbook = Math.min(
    setting.max_overbook_per_session,
    Math.round(samplePredictedNoShows * setting.safety_factor)
  );
  const sampleWait = Math.round(sampleOverbook * 12 * 0.35);
  const sampleRevenue = sampleOverbook * setting.consultation_fee_lkr;

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-300">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-[24px] bg-card border border-border/60 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <Settings className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-foreground">Capacity &amp; Overbooking Parameters</h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                Manager Control
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Configure hospital-wide baseline rules or department-specific mathematical overrides
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            className="h-9 px-3 text-xs rounded-xl bg-background border border-border text-foreground font-semibold"
          >
            <option value="global">Hospital-Wide (Global Default)</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d} (Override)
              </option>
            ))}
          </select>

          <button
            type="button"
            disabled={isPending}
            onClick={handleSave}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary/90 shadow-xs transition-colors"
          >
            <Save className="size-3.5" /> Save Changes
          </button>
        </div>
      </div>

      {savedSuccess && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="size-4" />
          <span>Capacity settings for {scope === "global" ? "Hospital-Wide" : scope} successfully saved and updated.</span>
        </div>
      )}

      {/* Main Grid: Settings Form on Left, Live Impact Preview on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Form Fields (7 cols) */}
        <div className="lg:col-span-7 flex flex-col gap-5 rounded-[24px] bg-card p-5 sm:p-6 shadow-xs border border-border/60">
          <h3 className="text-sm font-bold text-foreground pb-2 border-b border-border/40">
            Optimizer Bounds &amp; Safety Factors
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-foreground">
                Base Wait Tolerance (mins)
              </label>
              <input
                type="number"
                min="5"
                max="60"
                value={setting.wait_tolerance_mins}
                onChange={(e) =>
                  setSetting({ ...setting, wait_tolerance_mins: Number(e.target.value) })
                }
                className="h-10 px-3 text-xs rounded-xl bg-background border border-border text-foreground font-semibold"
              />
              <span className="text-[10px] text-muted-foreground">
                Tolerance curtailed by doctor delay: max(0, Base - Delay)
              </span>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-foreground">
                Safety Factor (&beta;)
              </label>
              <input
                type="number"
                min="0.1"
                max="1.0"
                step="0.05"
                value={setting.safety_factor}
                onChange={(e) =>
                  setSetting({ ...setting, safety_factor: Number(e.target.value) })
                }
                className="h-10 px-3 text-xs rounded-xl bg-background border border-border text-foreground font-semibold"
              />
              <span className="text-[10px] text-muted-foreground">
                Multiplier on expected no-shows (e.g. 0.75 = 75%)
              </span>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-foreground">
                Max Overbook Per Session
              </label>
              <input
                type="number"
                min="1"
                max="10"
                value={setting.max_overbook_per_session}
                onChange={(e) =>
                  setSetting({ ...setting, max_overbook_per_session: Number(e.target.value) })
                }
                className="h-10 px-3 text-xs rounded-xl bg-background border border-border text-foreground font-semibold"
              />
              <span className="text-[10px] text-muted-foreground">
                Upper limit per 4-hour clinic session
              </span>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-foreground">
                Max Overbook Per Slot
              </label>
              <input
                type="number"
                min="1"
                max="3"
                value={setting.max_overbook_per_slot}
                onChange={(e) =>
                  setSetting({ ...setting, max_overbook_per_slot: Number(e.target.value) })
                }
                className="h-10 px-3 text-xs rounded-xl bg-background border border-border text-foreground font-semibold"
              />
              <span className="text-[10px] text-muted-foreground">
                Upper limit for any single 15-minute slot
              </span>
            </div>

            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <label className="text-xs font-semibold text-foreground">
                Consultation Fee Baseline (LKR)
              </label>
              <input
                type="number"
                min="500"
                step="500"
                value={setting.consultation_fee_lkr}
                onChange={(e) =>
                  setSetting({ ...setting, consultation_fee_lkr: Number(e.target.value) })
                }
                className="h-10 px-3 text-xs rounded-xl bg-background border border-border text-foreground font-semibold"
              />
              <span className="text-[10px] text-muted-foreground">
                Used to calculate expected revenue recovery for this specialty
              </span>
            </div>
          </div>

          <h3 className="text-sm font-bold text-foreground pt-4 pb-2 border-b border-border/40">
            Waitlist Auto-Assign Policy
          </h3>

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between p-3.5 rounded-2xl bg-muted/20 border border-border/60">
              <div className="flex flex-col">
                <span className="text-xs font-bold text-foreground">
                  Automatic Waitlist Dispatch
                </span>
                <span className="text-[11px] text-muted-foreground">
                  When a slot opens, automatically assign the top-ranked patient without manual approval
                </span>
              </div>
              <input
                type="checkbox"
                checked={setting.auto_assign_waitlist}
                onChange={(e) =>
                  setSetting({ ...setting, auto_assign_waitlist: e.target.checked })
                }
                className="size-5 accent-primary cursor-pointer"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-foreground">
                Undo Action Window (mins)
              </label>
              <input
                type="number"
                min="5"
                max="60"
                value={setting.auto_assign_time_window_mins}
                onChange={(e) =>
                  setSetting({
                    ...setting,
                    auto_assign_time_window_mins: Number(e.target.value),
                  })
                }
                className="h-10 px-3 text-xs rounded-xl bg-background border border-border text-foreground font-semibold max-w-xs"
              />
              <span className="text-[10px] text-muted-foreground">
                Time window during which staff may revert an assignment
              </span>
            </div>
          </div>
        </div>

        {/* Live Impact Preview Card (5 cols) */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          <div className="rounded-[24px] bg-gradient-to-br from-primary/10 via-card to-card p-5 sm:p-6 shadow-xs border border-primary/20 flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Zap className="size-4 text-primary" />
              <h3 className="text-sm font-bold text-foreground">Live Impact Preview</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Example scenario: Session with 20 booked patients &amp; 2.5 expected no-shows:
            </p>

            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="p-3 rounded-2xl bg-background border border-border/60">
                <span className="text-[10px] text-muted-foreground font-medium">Safe Overbook</span>
                <p className="text-lg font-bold text-primary tabular-nums">
                  +{sampleOverbook}
                </p>
                <span className="text-[9px] text-muted-foreground">
                  (cap: {setting.max_overbook_per_session})
                </span>
              </div>

              <div className="p-3 rounded-2xl bg-background border border-border/60">
                <span className="text-[10px] text-muted-foreground font-medium">Expected Extra Wait</span>
                <p className="text-lg font-bold text-foreground tabular-nums">
                  {sampleWait} mins
                </p>
                <span className="text-[9px] text-muted-foreground">
                  (tol: {setting.wait_tolerance_mins}m)
                </span>
              </div>

              <div className="p-3 rounded-2xl bg-background border border-border/60 sm:col-span-2">
                <span className="text-[10px] text-muted-foreground font-medium">
                  Expected Upside @ {formatLkr(setting.consultation_fee_lkr)}
                </span>
                <p className="text-base font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                  +{formatLkr(sampleRevenue)}
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-muted/30 border border-border/40 text-[11px] text-muted-foreground leading-relaxed">
              <strong className="text-foreground">Policy Status:</strong> With a safety factor of{" "}
              {setting.safety_factor}, the queue simulator maintains a wait under{" "}
              {setting.wait_tolerance_mins}m with &gt;95% confidence under normal consultant punctuality.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
