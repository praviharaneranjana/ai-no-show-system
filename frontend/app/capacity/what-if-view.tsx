"use client";

import React, { useState, useEffect, useTransition } from "react";
import {
  Sliders,
  Sparkles,
  ArrowRight,
  TrendingUp,
  AlertTriangle,
  Wallet,
  Clock,
  BookmarkPlus,
  Trash2,
  RefreshCw,
  FolderOpen,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  CartesianGrid,
  ComposedChart,
  Line,
  Legend,
} from "recharts";

import {
  evaluateWhatIfAction,
  getCapacityScenariosAction,
  saveCapacityScenarioAction,
  deleteCapacityScenarioAction,
} from "@/app/capacity/actions";
import { formatLkr, cn } from "@/lib/utils";
import type {
  WhatIfRequest,
  WhatIfResponse,
  CapacityScenario,
  DoctorSession,
} from "@/lib/types";

interface WhatIfViewProps {
  sessions: DoctorSession[];
}

export function WhatIfView({ sessions }: WhatIfViewProps) {
  // Input parameters
  const [department, setDepartment] = useState<string>("all");
  const [doctorId, setDoctorId] = useState<string>("all");
  const [waitTolerance, setWaitTolerance] = useState<number>(20);
  const [safetyFactor, setSafetyFactor] = useState<number>(0.75);
  const [maxOverbook, setMaxOverbook] = useState<number>(3);
  const [consultationFee, setConsultationFee] = useState<number>(4500);
  const [doctorDelay, setDoctorDelay] = useState<number>(0);

  // Results & Scenarios
  const [result, setResult] = useState<WhatIfResponse | null>(null);
  const [savedScenarios, setSavedScenarios] = useState<CapacityScenario[]>([]);
  const [scenarioName, setScenarioName] = useState<string>("");
  const [showSaveModal, setShowSaveModal] = useState<boolean>(false);
  const [isPending, startTransition] = useTransition();

  // Load scenarios on mount
  useEffect(() => {
    getCapacityScenariosAction().then((sc) => setSavedScenarios(sc));
  }, []);

  // Debounced evaluate function
  useEffect(() => {
    const timer = setTimeout(() => {
      startTransition(async () => {
        const payload: WhatIfRequest = {
          department: department === "all" ? undefined : department,
          doctor_id: doctorId === "all" ? undefined : doctorId,
          wait_tolerance_mins: waitTolerance,
          safety_factor: safetyFactor,
          max_overbook_per_slot: maxOverbook,
          consultation_fee_lkr: consultationFee,
          assumed_delay_mins: doctorDelay,
        };
        const res = await evaluateWhatIfAction(payload);
        if (res) setResult(res);
      });
    }, 250);

    return () => clearTimeout(timer);
  }, [department, doctorId, waitTolerance, safetyFactor, maxOverbook, consultationFee, doctorDelay]);

  // Unique departments from sessions
  const departments = Array.from(new Set(sessions.map((s) => s.specialty)));

  async function handleSaveScenario() {
    if (!scenarioName.trim() || !result) return;
    const baseline = result.baseline ?? result.current_policy;
    const scenario = result.scenario ?? result.what_if_policy;
    const newSc = await saveCapacityScenarioAction({
      name: scenarioName.trim(),
      department: department === "all" ? "Hospital Wide" : department,
      params: {
        wait_tolerance_mins: waitTolerance,
        safety_factor: safetyFactor,
        max_overbook_per_slot: maxOverbook,
        consultation_fee_lkr: consultationFee,
        assumed_delay_mins: doctorDelay,
      },
      results: {
        baseline: baseline ?? {},
        scenario: scenario ?? {},
        delta: result.delta ?? {},
      },
    });
    if (newSc) {
      setSavedScenarios((prev) => [newSc, ...prev]);
      setScenarioName("");
      setShowSaveModal(false);
    }
  }

  async function handleDeleteScenario(id: string) {
    const ok = await deleteCapacityScenarioAction(id);
    if (ok) {
      setSavedScenarios((prev) => prev.filter((s) => s.id !== id));
    }
  }

  function handleLoadScenario(sc: CapacityScenario) {
    const p = sc.params;
    if (p.wait_tolerance_mins !== undefined) setWaitTolerance(Number(p.wait_tolerance_mins));
    if (p.safety_factor !== undefined) setSafetyFactor(Number(p.safety_factor));
    if (p.max_overbook_per_slot !== undefined) setMaxOverbook(Number(p.max_overbook_per_slot));
    if (p.consultation_fee_lkr !== undefined) setConsultationFee(Number(p.consultation_fee_lkr));
    if (p.assumed_delay_mins !== undefined) setDoctorDelay(Number(p.assumed_delay_mins));
  }

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-300">
      {/* Studio Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-[24px] bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/20">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-primary text-white flex items-center justify-center shadow-md">
            <Sliders className="size-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-foreground">What-If Simulation Studio</h2>
            <p className="text-xs text-muted-foreground">
              Evaluate real-time policy adjustments using single-server Monte Carlo simulation (2,000 vectorised runs)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isPending && (
            <span className="flex items-center gap-1.5 text-xs text-primary font-medium animate-pulse">
              <RefreshCw className="size-3 animate-spin" /> Simulating...
            </span>
          )}
          <button
            type="button"
            onClick={() => setShowSaveModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary text-white text-xs font-semibold hover:bg-primary/90 shadow-xs transition-colors"
          >
            <BookmarkPlus className="size-3.5" /> Save Scenario
          </button>
        </div>
      </div>

      {/* Main Grid: Controls on Left, Results on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Interactive Parameters (5 cols) */}
        <div className="lg:col-span-5 flex flex-col gap-4 rounded-[24px] bg-card p-5 sm:p-6 shadow-xs border border-border/60">
          <h3 className="text-sm font-bold text-foreground border-b border-border/40 pb-2">
            Simulation Parameters
          </h3>

          {/* Scope Selectors */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Department</label>
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="h-9 px-3 text-xs rounded-xl bg-background border border-border text-foreground font-medium"
              >
                <option value="all">All Departments</option>
                {departments.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Consultant</label>
              <select
                value={doctorId}
                onChange={(e) => setDoctorId(e.target.value)}
                className="h-9 px-3 text-xs rounded-xl bg-background border border-border text-foreground font-medium"
              >
                <option value="all">All Consultants</option>
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.doctor_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Slider 1: Max Wait Tolerance */}
          <div className="flex flex-col gap-2 pt-2 border-t border-border/40">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-foreground">Base Wait Tolerance</span>
              <span className="font-bold text-primary tabular-nums">{waitTolerance} mins</span>
            </div>
            <input
              type="range"
              min="5"
              max="45"
              step="5"
              value={waitTolerance}
              onChange={(e) => setWaitTolerance(Number(e.target.value))}
              className="w-full accent-primary cursor-pointer"
            />
            <span className="text-[10px] text-muted-foreground">Maximum acceptable delay added to waiting room</span>
          </div>

          {/* Slider 2: Safety Factor Beta */}
          <div className="flex flex-col gap-2 pt-2 border-t border-border/40">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-foreground">Safety Factor (&beta;)</span>
              <span className="font-bold text-primary tabular-nums">{(safetyFactor * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min="0.2"
              max="1.0"
              step="0.05"
              value={safetyFactor}
              onChange={(e) => setSafetyFactor(Number(e.target.value))}
              className="w-full accent-primary cursor-pointer"
            />
            <span className="text-[10px] text-muted-foreground">
              Risk conservatism multiplier applied to Poisson-binomial variance
            </span>
          </div>

          {/* Slider 3: Doctor Delay */}
          <div className="flex flex-col gap-2 pt-2 border-t border-border/40">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-foreground">Assumed Doctor Delay</span>
              <span className="font-bold text-amber-600 dark:text-amber-400 tabular-nums">+{doctorDelay} mins</span>
            </div>
            <input
              type="range"
              min="0"
              max="60"
              step="5"
              value={doctorDelay}
              onChange={(e) => setDoctorDelay(Number(e.target.value))}
              className="w-full accent-amber-500 cursor-pointer"
            />
            <span className="text-[10px] text-muted-foreground">
              Effective Tolerance = max(0, {waitTolerance} - {doctorDelay}) = {Math.max(0, waitTolerance - doctorDelay)} mins
            </span>
          </div>

          {/* Input 4: Fee & Max Overbook */}
          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border/40">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-foreground">Consultation Fee (LKR)</label>
              <input
                type="number"
                min="500"
                step="500"
                value={consultationFee}
                onChange={(e) => setConsultationFee(Number(e.target.value))}
                className="h-9 px-3 text-xs rounded-xl bg-background border border-border text-foreground font-semibold"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-foreground">Max Overbook / Slot</label>
              <input
                type="number"
                min="1"
                max="5"
                value={maxOverbook}
                onChange={(e) => setMaxOverbook(Number(e.target.value))}
                className="h-9 px-3 text-xs rounded-xl bg-background border border-border text-foreground font-semibold"
              />
            </div>
          </div>
        </div>

        {/* Right Column: Comparison & Charts (7 cols) */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          {/* Side-by-Side Comparison Bento */}
          {(() => {
            const baseline = result?.baseline ?? result?.current_policy;
            const scenario = result?.scenario ?? result?.what_if_policy;
            const baseOver = baseline?.total_overbooks ?? baseline?.recommended_overbook ?? 0;
            const scenOver = scenario?.total_overbooks ?? scenario?.recommended_overbook ?? 0;
            const baseWait = baseline?.expected_wait_mins ?? 0;
            const scenWait = scenario?.expected_wait_mins ?? 0;
            const baseRev = baseline?.expected_revenue_lkr ?? 0;
            const scenRev = scenario?.expected_revenue_lkr ?? 0;
            const baseRisk = baseline?.risk_of_overcrowding_pct ?? Math.round((baseline?.p_overcrowding ?? 0) * 100);
            const scenRisk = scenario?.risk_of_overcrowding_pct ?? Math.round((scenario?.p_overcrowding ?? 0) * 100);

            return (
              <div className="grid grid-cols-2 gap-3.5">
                {/* Baseline Card */}
                <div className="rounded-[24px] bg-card p-5 shadow-xs border border-border/60 flex flex-col gap-3">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    Current Settings (Baseline)
                  </span>
                  <div className="grid grid-cols-2 gap-2 text-center">
                    <div className="p-2 rounded-xl bg-muted/30">
                      <span className="text-[10px] text-muted-foreground">Extra Patients</span>
                      <p className="text-base font-bold text-foreground">
                        +{baseOver}
                      </p>
                    </div>
                    <div className="p-2 rounded-xl bg-muted/30">
                      <span className="text-[10px] text-muted-foreground">Expected Wait</span>
                      <p className="text-base font-bold text-foreground">
                        {baseWait}m
                      </p>
                    </div>
                    <div className="p-2 rounded-xl bg-muted/30">
                      <span className="text-[10px] text-muted-foreground">Expected Upside</span>
                      <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                        +{formatLkr(baseRev)}
                      </p>
                    </div>
                    <div className="p-2 rounded-xl bg-muted/30">
                      <span className="text-[10px] text-muted-foreground">Overcrowd Risk</span>
                      <p className="text-base font-bold text-foreground">
                        {baseRisk}%
                      </p>
                    </div>
                  </div>
                </div>

                {/* What-If Card */}
                <div className="rounded-[24px] bg-primary/5 p-5 shadow-xs border border-primary/30 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-primary uppercase tracking-wider">
                      What-If Scenario
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/20 text-primary font-bold">
                      Simulated
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-center">
                    <div className="p-2 rounded-xl bg-background border border-primary/20">
                      <span className="text-[10px] text-muted-foreground">Extra Patients</span>
                      <p className="text-base font-bold text-primary">
                        +{scenOver}
                      </p>
                    </div>
                    <div className="p-2 rounded-xl bg-background border border-primary/20">
                      <span className="text-[10px] text-muted-foreground">Expected Wait</span>
                      <p className="text-base font-bold text-foreground">
                        {scenWait}m
                      </p>
                    </div>
                    <div className="p-2 rounded-xl bg-background border border-primary/20">
                      <span className="text-[10px] text-muted-foreground">Expected Upside</span>
                      <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                        +{formatLkr(scenRev)}
                      </p>
                    </div>
                    <div className="p-2 rounded-xl bg-background border border-primary/20">
                      <span className="text-[10px] text-muted-foreground">Overcrowd Risk</span>
                      <p
                        className={cn(
                          "text-base font-bold",
                          scenRisk > 15
                            ? "text-rose-600 dark:text-rose-400"
                            : "text-foreground"
                        )}
                      >
                        {scenRisk}%
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Trade-off Curve Chart */}
          <div className="rounded-[24px] bg-card p-5 shadow-xs border border-border/60 flex flex-col gap-3">
            <div>
              <h4 className="text-xs font-bold text-foreground">
                Revenue vs Overcrowding Risk Trade-Off Curve
              </h4>
              <p className="text-[11px] text-muted-foreground">
                Parametric sweep across overbooking depths
              </p>
            </div>
            {result?.trade_off_curve && result.trade_off_curve.length > 0 ? (
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={result.trade_off_curve}
                    margin={{ top: 10, right: 10, left: -10, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                    <XAxis dataKey="overbook_count" tick={{ fontSize: 11 }} label={{ value: "+Overbook Count", position: "insideBottom", offset: -2, fontSize: 10 }} />
                    <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} unit="%" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "var(--card)",
                        borderColor: "var(--border)",
                        borderRadius: "12px",
                        fontSize: "12px",
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "4px" }} />
                    <Bar
                      yAxisId="left"
                      dataKey="expected_revenue_lkr"
                      name="Exp. Revenue (LKR)"
                      fill="#8B7CF6"
                      radius={[4, 4, 0, 0]}
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="overcrowding_risk_pct"
                      name="P(Overcrowding) %"
                      stroke="#EF4444"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-56 flex items-center justify-center text-xs text-muted-foreground">
                Simulating trade-off curve...
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Saved Scenarios Manager */}
      <div className="rounded-[24px] bg-card p-5 sm:p-6 shadow-xs border border-border/60 flex flex-col gap-4">
        <div className="flex items-center justify-between pb-2 border-b border-border/40">
          <div className="flex items-center gap-2.5">
            <FolderOpen className="size-4 text-primary" />
            <h3 className="text-sm font-bold text-foreground">Saved Capacity Scenarios</h3>
          </div>
          <span className="text-xs text-muted-foreground">
            {savedScenarios.length} Scenarios Stored
          </span>
        </div>

        {savedScenarios.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">
            No saved scenarios yet. Configure parameters above and click &quot;Save Scenario&quot;.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {savedScenarios.map((sc) => (
              <div
                key={sc.id}
                className="p-3.5 rounded-2xl bg-muted/20 border border-border/60 flex flex-col justify-between gap-3 hover:border-primary/40 transition-colors"
              >
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-foreground">{sc.name}</span>
                    <button
                      type="button"
                      onClick={() => handleDeleteScenario(sc.id)}
                      className="text-muted-foreground hover:text-rose-500 p-1"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {sc.department || "Hospital Wide"} · {new Date(sc.created_at).toLocaleDateString()}
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px] pt-2 border-t border-border/40">
                  <span className="text-muted-foreground">
                    Tol: {String(sc.params?.wait_tolerance_mins ?? 20)}m | &beta;: {String(sc.params?.safety_factor ?? 0.75)}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleLoadScenario(sc)}
                    className="text-primary font-bold text-xs hover:underline"
                  >
                    Load &rarr;
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Save Scenario Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-sm rounded-[24px] bg-card p-6 border border-border shadow-2xl flex flex-col gap-4">
            <h3 className="text-base font-bold text-foreground">Save What-If Scenario</h3>
            <p className="text-xs text-muted-foreground">
              Save the current simulation parameters and outcomes for later review and side-by-side comparison.
            </p>
            <input
              type="text"
              placeholder="e.g. Peak Season High Demand Strategy"
              value={scenarioName}
              onChange={(e) => setScenarioName(e.target.value)}
              className="h-10 px-3 text-xs rounded-xl bg-background border border-border text-foreground font-medium"
            />
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowSaveModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-muted-foreground hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveScenario}
                disabled={!scenarioName.trim()}
                className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-semibold hover:bg-primary/90 disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
