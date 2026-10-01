"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Sparkles,
  RefreshCw,
  CloudRain,
  Phone,
  MessageSquare,
  X,
  Stethoscope,
  ChevronDown,
  ChevronUp,
  Search,
  ExternalLink,
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { RiskPill } from "@/components/risk-pill";
import type {
  PredictionTodayResponse,
  HISStatusResponse,
  PredictionRunResponse,
  HubAppointmentItem,
  RiskCategory,
} from "@/lib/types";

type ActiveHubAppointment = HubAppointmentItem & {
  doctor_name?: string;
  department?: string;
  room?: string | null;
};

interface PredictionHubClientProps {
  initialData: PredictionTodayResponse | null;
  initialHisStatus: HISStatusResponse | null;
  initialDate: string;
}

export function PredictionHubClient({
  initialData,
  initialHisStatus,
  initialDate,
}: PredictionHubClientProps) {
  const searchParams = useSearchParams();
  const focusAppointmentId = searchParams.get("focus_appointment_id");

  const [targetDate, setTargetDate] = useState<string>(initialDate);
  const [data, setData] = useState<PredictionTodayResponse | null>(initialData);
  const [hisStatus, setHisStatus] = useState<HISStatusResponse | null>(initialHisStatus);
  const [heavyRain, setHeavyRain] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<"by_doctor" | "all_table">("by_doctor");
  const [searchQuery, setSearchQuery] = useState("");
  const [tierFilter, setTierFilter] = useState<"all" | "High" | "Medium" | "Low">("all");
  const [expandedDoctors, setExpandedDoctors] = useState<Record<string, boolean>>({});

  // Batch run progress state
  const [isRunningPredictions, setIsRunningPredictions] = useState(false);
  const [runProgress, setRunProgress] = useState<{
    completed: number;
    total: number;
    percent: number;
    status: string;
  } | null>(null);

  // Sync state
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

  // Quick Action Drawer state
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isDrawerManuallyClosed, setIsDrawerManuallyClosed] = useState(false);
  const [outreachLang, setOutreachLang] = useState<"en" | "si" | "ta">("en");

  // Flat list of all appointments across doctor groups
  const byDoctor = data?.by_doctor;
  const allAppointments = useMemo(() => {
    if (!byDoctor) return [];
    return byDoctor.flatMap((docGroup) =>
      docGroup.appointments.map((appt) => ({
        ...appt,
        doctor_name: docGroup.doctor_name,
        department: docGroup.department,
        room: docGroup.room,
      }))
    );
  }, [byDoctor]);

  // Derived active appointment (either clicked or from focus query param)
  const activeId = selectedId || (!isDrawerManuallyClosed ? focusAppointmentId : null);
  const activeAppointment = useMemo(() => {
    if (!activeId || !allAppointments.length) return null;
    return allAppointments.find((a) => a.appointment_id === activeId) || null;
  }, [activeId, allAppointments]);

  const isDrawerOpen = !!activeAppointment;

  // Fetch updated data for target date
  async function refreshData(dateToFetch = targetDate) {
    try {
      const res = await fetch(`/api/predictions/today?date=${dateToFetch}`, { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
      const hisRes = await fetch("/api/his/status", { cache: "no-store" });
      if (hisRes.ok) {
        const hisJson = await hisRes.json();
        setHisStatus(hisJson);
      }
    } catch (e) {
      console.error("Failed to refresh prediction hub data", e);
    }
  }

  // Handle Date change
  function handleDateChange(newDate: string) {
    setTargetDate(newDate);
    refreshData(newDate);
  }

  // Trigger HIS Sync
  async function handleSync() {
    setIsSyncing(true);
    setSyncFeedback(null);
    try {
      const res = await fetch(`/api/his/sync?date=${targetDate}`, { method: "POST" });
      const result = await res.json();
      if (res.ok) {
        setSyncFeedback(
          `Synced ${result.fetched} appointments (${result.created} new, ${result.updated} updated).`
        );
        await refreshData(targetDate);
      } else {
        setSyncFeedback(`Sync failed: ${result.detail || "Server error"}`);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Sync error";
      setSyncFeedback(`Sync error: ${msg}`);
    } finally {
      setIsSyncing(false);
    }
  }

  // Trigger Batch Predictions Run with polling
  async function handleRunPredictions() {
    setIsRunningPredictions(true);
    const totalCount = data?.kpis?.total_appointments || 1;
    setRunProgress({ completed: 0, total: totalCount, percent: 0, status: "queued" });

    try {
      const res = await fetch("/api/predictions/runs?run_sync=false", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          run_date: targetDate,
          heavy_rain: heavyRain,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed to start batch prediction");
      }

      const run = (await res.json()) as PredictionRunResponse;
      const runId = run.id;

      // Poll until completed
      const interval = setInterval(async () => {
        try {
          const pollRes = await fetch(`/api/predictions/runs/${runId}`, { cache: "no-store" });
          if (pollRes.ok) {
            const statusJson = (await pollRes.json()) as PredictionRunResponse;
            setRunProgress({
              completed: statusJson.scored,
              total: statusJson.total,
              percent: statusJson.percent_complete,
              status: statusJson.status,
            });

            if (statusJson.status === "done" || statusJson.status === "failed") {
              clearInterval(interval);
              setIsRunningPredictions(false);
              await refreshData(targetDate);
            }
          }
        } catch {
          clearInterval(interval);
          setIsRunningPredictions(false);
        }
      }, 1000);
    } catch (e) {
      console.error(e);
      setIsRunningPredictions(false);
    }
  }

  // Filtered Appointments
  const filteredAppointments = useMemo(() => {
    return allAppointments.filter((appt) => {
      // Tier filter
      if (tierFilter !== "all" && appt.risk_category !== tierFilter) {
        return false;
      }
      // Text search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = appt.patient_name.toLowerCase().includes(q);
        const matchesUhid = appt.uhid.toLowerCase().includes(q);
        const matchesDoc = (appt.doctor_name || "").toLowerCase().includes(q);
        const matchesDept = (appt.department || "").toLowerCase().includes(q);
        const matchesToken = String(appt.token_number || "").includes(q);
        return matchesName || matchesUhid || matchesDoc || matchesDept || matchesToken;
      }
      return true;
    });
  }, [allAppointments, tierFilter, searchQuery]);

  function toggleDoctorExpand(key: string) {
    setExpandedDoctors((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  // Multilingual WhatsApp / SMS Templates
  const outreachMessages = useMemo(() => {
    if (!activeAppointment) return { en: "", si: "", ta: "" };
    const name = activeAppointment.patient_name;
    const doc = activeAppointment.doctor_name || "Specialist";
    const time = activeAppointment.scheduled_time || "Scheduled Time";

    return {
      en: `Colombo General Hospital Reminder: Dear ${name}, your consultation with ${doc} is scheduled for today at ${time}. Reply 1 to CONFIRM, 2 to RESCHEDULE, or 3 for assistance. Inquiries: 011-2691111.`,
      si: `කොළඹ මහ රෝහල: හිතවත් ${name}, ${doc} මහතා/මහත්මිය සමඟ ඔබගේ වෛද්‍ය හමුව අද ${time} ට පැවැත්වේ. තහවුරු කිරීමට 1, වෙනස් කිරීමට 2 ලෙස පිළිතුරු එවන්න. විමසීම්: 011-2691111.`,
      ta: `கொழும்பு பொது வைத்தியசாலை: அன்புள்ள ${name}, ${doc} உடனான உங்கள் மருத்துவ சந்திப்பு இன்று ${time} மணிக்கு திட்டமிடப்பட்டுள்ளது. உறுதிப்படுத்த 1, மாற்றியமைக்க 2 என பதிலளிக்கவும்.`,
    };
  }, [activeAppointment]);

  const kpis = data?.kpis || {
    total_appointments: 0,
    scored_count: 0,
    high_risk_count: 0,
    medium_risk_count: 0,
    low_risk_count: 0,
    estimated_lost_revenue_lkr: 0,
    average_no_show_risk: 0,
  };

  return (
    <div className="flex w-full flex-col gap-6 p-6 lg:p-8 max-w-7xl mx-auto">
      {/* 1. Header Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-border/80 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Sparkles className="size-4" />
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Prediction Hub
            </h1>
            <Badge variant="outline" className="text-xs bg-muted/40 font-mono">
              Asia/Colombo
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Outpatient attendance intelligence, batch risk scoring, and proactive patient outreach.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Target Date Picker */}
          <div className="flex items-center gap-2 bg-card border border-border/80 rounded-lg px-3 py-1.5 shadow-sm">
            <Calendar className="size-4 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Date:</span>
            <input
              type="date"
              value={targetDate}
              onChange={(e) => handleDateChange(e.target.value)}
              className="bg-transparent text-xs font-semibold text-foreground focus:outline-none"
            />
          </div>

          {/* Heavy Rain Weather Flag */}
          <button
            type="button"
            onClick={() => setHeavyRain(!heavyRain)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              heavyRain
                ? "bg-blue-500/10 border-blue-500/40 text-blue-400"
                : "bg-card border-border/80 text-muted-foreground hover:text-foreground"
            }`}
          >
            <CloudRain className={`size-3.5 ${heavyRain ? "text-blue-400" : ""}`} />
            <span>Heavy Rain</span>
            {heavyRain && <span className="size-1.5 rounded-full bg-blue-500 animate-pulse" />}
          </button>

          {/* Simulated HIS Sync Pill & Trigger */}
          <div className="flex items-center gap-1.5 bg-card border border-border/80 rounded-lg p-1 shadow-sm">
            <div className="flex items-center gap-1.5 px-2.5 py-1 text-xs">
              <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-muted-foreground">
                HIS Sync:{" "}
                <strong className="text-foreground font-medium capitalize">
                  {hisStatus?.connector_type || "Simulated"}
                </strong>
              </span>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleSync}
              disabled={isSyncing}
              className="h-7 text-xs px-2.5 gap-1.5 text-muted-foreground hover:text-foreground"
            >
              <RefreshCw className={`size-3.5 ${isSyncing ? "animate-spin" : ""}`} />
              <span>{isSyncing ? "Syncing..." : "Sync"}</span>
            </Button>
          </div>

          {/* Run Predictions For Today Button */}
          <Button
            size="sm"
            onClick={handleRunPredictions}
            disabled={isRunningPredictions}
            className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2 text-xs font-semibold shadow-sm h-9 px-4"
          >
            <Sparkles className={`size-3.5 ${isRunningPredictions ? "animate-spin" : ""}`} />
            <span>{isRunningPredictions ? "Scoring..." : "Run Predictions"}</span>
          </Button>
        </div>
      </div>

      {/* Sync Feedback Message */}
      {syncFeedback && (
        <div className="rounded-lg bg-muted/40 border border-border/80 px-4 py-2 text-xs text-foreground flex items-center justify-between">
          <span>{syncFeedback}</span>
          <button
            onClick={() => setSyncFeedback(null)}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {/* Prediction Run Live Progress Bar */}
      {isRunningPredictions && runProgress && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 flex flex-col gap-2 animate-in fade-in duration-300">
          <div className="flex items-center justify-between text-xs font-medium">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary animate-pulse" />
              <span className="text-foreground">
                Batch Scoring in progress: {runProgress.completed} of {runProgress.total} evaluated
              </span>
            </div>
            <span className="font-mono text-primary font-bold">{runProgress.percent}%</span>
          </div>
          <div className="w-full bg-muted/40 rounded-full h-2 overflow-hidden">
            <div
              className="bg-primary h-2 rounded-full transition-all duration-300"
              style={{ width: `${Math.max(runProgress.percent, 5)}%` }}
            />
          </div>
        </div>
      )}

      {/* 2. KPI Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Total Booked */}
        <div className="rounded-xl border border-border/80 bg-card p-4 flex flex-col justify-between shadow-sm">
          <span className="text-xs font-medium text-muted-foreground">Total Booked</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-bold tracking-tight text-foreground">
              {kpis.total_appointments}
            </span>
            <span className="text-[10px] text-muted-foreground font-mono">appointments</span>
          </div>
        </div>

        {/* High Risk */}
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 flex flex-col justify-between shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-rose-400">High Risk</span>
            <span className="size-2 rounded-full bg-rose-500 animate-pulse" />
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-bold tracking-tight text-rose-400">
              {kpis.high_risk_count}
            </span>
            <span className="text-[10px] text-rose-400/80 font-mono">
              {kpis.total_appointments > 0
                ? Math.round((kpis.high_risk_count / kpis.total_appointments) * 100)
                : 0}
              %
            </span>
          </div>
        </div>

        {/* Medium Risk */}
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 flex flex-col justify-between shadow-sm">
          <span className="text-xs font-medium text-amber-400">Medium Risk</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-bold tracking-tight text-amber-400">
              {kpis.medium_risk_count}
            </span>
            <span className="text-[10px] text-amber-400/80 font-mono">
              {kpis.total_appointments > 0
                ? Math.round((kpis.medium_risk_count / kpis.total_appointments) * 100)
                : 0}
              %
            </span>
          </div>
        </div>

        {/* Low Risk */}
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 flex flex-col justify-between shadow-sm">
          <span className="text-xs font-medium text-emerald-400">Low Risk</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-bold tracking-tight text-emerald-400">
              {kpis.low_risk_count}
            </span>
            <span className="text-[10px] text-emerald-400/80 font-mono">
              {kpis.total_appointments > 0
                ? Math.round((kpis.low_risk_count / kpis.total_appointments) * 100)
                : 0}
              %
            </span>
          </div>
        </div>

        {/* Est. Lost Revenue */}
        <div className="rounded-xl border border-border/80 bg-card p-4 flex flex-col justify-between shadow-sm">
          <span className="text-xs font-medium text-muted-foreground">Revenue at Risk</span>
          <div className="flex flex-col mt-2">
            <span className="text-xl font-bold tracking-tight text-foreground font-mono">
              LKR {Number(kpis.estimated_lost_revenue_lkr).toLocaleString()}
            </span>
            <span className="text-[10px] text-muted-foreground">High risk loss est.</span>
          </div>
        </div>

        {/* Avg No-Show Risk */}
        <div className="rounded-xl border border-border/80 bg-card p-4 flex flex-col justify-between shadow-sm">
          <span className="text-xs font-medium text-muted-foreground">Avg Cohort Risk</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-bold tracking-tight text-foreground">
              {(kpis.average_no_show_risk * 100).toFixed(1)}%
            </span>
            <span className="text-[10px] text-muted-foreground font-mono">baseline 15.9%</span>
          </div>
        </div>
      </div>

      {/* 3. Filters & View Switcher Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
        <div className="flex flex-wrap items-center gap-2">
          {/* View Mode Toggle */}
          <div className="inline-flex rounded-lg border border-border/80 bg-card p-0.5 text-xs">
            <button
              onClick={() => setViewMode("by_doctor")}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                viewMode === "by_doctor"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              By Doctor Clinic
            </button>
            <button
              onClick={() => setViewMode("all_table")}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                viewMode === "all_table"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              All Appointments ({filteredAppointments.length})
            </button>
          </div>

          {/* Risk Tier Chips */}
          <div className="inline-flex rounded-lg border border-border/80 bg-card p-0.5 text-xs">
            {(["all", "High", "Medium", "Low"] as const).map((tier) => (
              <button
                key={tier}
                onClick={() => setTierFilter(tier)}
                className={`px-2.5 py-1.5 rounded-md font-medium capitalize transition-colors ${
                  tierFilter === tier
                    ? "bg-muted text-foreground font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tier}
              </button>
            ))}
          </div>
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search patient, UHID, doctor..."
            className="pl-9 h-8 text-xs bg-card"
          />
        </div>
      </div>

      {/* 4. Main Content: View 1 (By Doctor) vs View 2 (All Table) */}
      {viewMode === "by_doctor" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {!data?.by_doctor || data.by_doctor.length === 0 ? (
            <div className="col-span-full py-16 text-center text-sm text-muted-foreground border border-dashed rounded-xl">
              No appointments found for the selected date. Click &quot;Sync&quot; or &quot;New Appointment&quot; to book.
            </div>
          ) : (
            data.by_doctor.map((group) => {
              const groupKey = `${group.doctor_id}-${group.session_time || ""}`;
              const isExpanded = !!expandedDoctors[groupKey];
              const totalInGroup = group.appointments.length;
              return (
                <div
                  key={groupKey}
                  className="rounded-xl border border-border/80 bg-card flex flex-col justify-between shadow-xs hover:border-border transition-all"
                >
                  <div className="p-4 border-b border-border/60">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-semibold text-foreground text-sm flex items-center gap-1.5">
                          <Stethoscope className="size-4 text-primary" />
                          <span>{group.doctor_name}</span>
                        </h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {group.department} · {group.room || "Room 102"}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-[10px] font-mono">
                        {group.session_time || "Morning"}
                      </Badge>
                    </div>

                    {/* Mini Risk Breakdown Bar */}
                    <div className="mt-3 flex flex-col gap-1.5">
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground font-mono">
                        <span>{totalInGroup} Booked</span>
                        <div className="flex items-center gap-2">
                          {group.high > 0 && (
                            <span className="text-rose-400 font-bold">{group.high} High</span>
                          )}
                          {group.medium > 0 && (
                            <span className="text-amber-400">{group.medium} Med</span>
                          )}
                          <span className="text-emerald-400">{group.low} Low</span>
                        </div>
                      </div>
                      <div className="h-1.5 w-full bg-muted/40 rounded-full flex overflow-hidden">
                        {totalInGroup > 0 && (
                          <>
                            <div
                              style={{ width: `${(group.high / totalInGroup) * 100}%` }}
                              className="bg-rose-500"
                            />
                            <div
                              style={{ width: `${(group.medium / totalInGroup) * 100}%` }}
                              className="bg-amber-500"
                            />
                            <div
                              style={{ width: `${(group.low / totalInGroup) * 100}%` }}
                              className="bg-emerald-500"
                            />
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Appointments list */}
                  <div className="p-3 flex flex-col gap-2">
                    {group.appointments
                      .slice(0, isExpanded ? undefined : 3)
                      .map((appt) => {
                        const isFocused = appt.appointment_id === focusAppointmentId;
                        const cat = (appt.risk_category || "Low") as RiskCategory;
                        return (
                          <div
                            key={appt.appointment_id}
                            onClick={() => {
                              setSelectedId(appt.appointment_id);
                              setIsDrawerManuallyClosed(false);
                            }}
                            className={`p-2.5 rounded-lg border text-xs cursor-pointer transition-all ${
                              isFocused
                                ? "border-primary bg-primary/10 ring-2 ring-primary/30"
                                : "border-border/60 bg-muted/20 hover:bg-muted/40"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-foreground">
                                  #{appt.token_number || "—"}
                                </span>
                                <span className="font-medium text-foreground truncate max-w-[120px]">
                                  {appt.patient_name}
                                </span>
                              </div>
                              <RiskPill category={cat} score={appt.risk_score || undefined} />
                            </div>
                            {appt.top_reasons && appt.top_reasons.length > 0 && (
                              <div className="mt-1.5 flex flex-wrap gap-1">
                                {appt.top_reasons.slice(0, 2).map((reason: string, idx: number) => (
                                  <span
                                    key={idx}
                                    className="px-1.5 py-0.5 rounded text-[10px] bg-background border border-border/60 text-muted-foreground"
                                  >
                                    {reason}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}

                    {totalInGroup > 3 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleDoctorExpand(groupKey)}
                        className="w-full text-xs h-7 text-muted-foreground hover:text-foreground"
                      >
                        {isExpanded ? (
                          <>
                            <ChevronUp className="size-3.5 mr-1" /> Show Less
                          </>
                        ) : (
                          <>
                            <ChevronDown className="size-3.5 mr-1" /> View all {totalInGroup} patients
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        /* View 2: All Appointments Table */
        <div className="rounded-xl border border-border/80 bg-card overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/40 border-b border-border/80 text-muted-foreground uppercase font-mono text-[10px]">
                <tr>
                  <th className="py-3 px-4">Token</th>
                  <th className="py-3 px-4">Patient & UHID</th>
                  <th className="py-3 px-4">Doctor & Dept</th>
                  <th className="py-3 px-4">Slot</th>
                  <th className="py-3 px-4">Risk Tier</th>
                  <th className="py-3 px-4">Top Drivers (SHAP)</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredAppointments.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-muted-foreground">
                      No matching appointments.
                    </td>
                  </tr>
                ) : (
                  filteredAppointments.map((appt) => {
                    const isFocused = appt.appointment_id === focusAppointmentId;
                    const cat = (appt.risk_category || "Low") as RiskCategory;
                    return (
                      <tr
                        key={appt.appointment_id}
                        className={`transition-colors hover:bg-muted/30 cursor-pointer ${
                          isFocused ? "bg-primary/10 ring-1 ring-primary/40" : ""
                        }`}
                        onClick={() => {
                          setSelectedId(appt.appointment_id);
                          setIsDrawerManuallyClosed(false);
                        }}
                      >
                        <td className="py-3 px-4 font-mono font-bold text-foreground">
                          #{appt.token_number || "—"}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-foreground">{appt.patient_name}</div>
                          <div className="text-[10px] text-muted-foreground font-mono">
                            {appt.uhid}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-foreground">{appt.doctor_name || "Unassigned"}</div>
                          <div className="text-[10px] text-muted-foreground">{appt.department}</div>
                        </td>
                        <td className="py-3 px-4 font-mono text-muted-foreground">
                          {appt.scheduled_time || "Morning"}
                        </td>
                        <td className="py-3 px-4">
                          <RiskPill category={cat} score={appt.risk_score || undefined} />
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            {appt.top_reasons?.slice(0, 2).map((reason: string, idx: number) => (
                              <span
                                key={idx}
                                className="px-1.5 py-0.5 rounded text-[10px] bg-muted/60 border border-border/60 text-muted-foreground"
                              >
                                {reason}
                              </span>
                            )) || <span className="text-muted-foreground italic">None</span>}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span className="capitalize px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted/40 text-muted-foreground border border-border/60">
                            {appt.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedId(appt.appointment_id);
                              setIsDrawerManuallyClosed(false);
                            }}
                            className="h-7 text-xs text-primary hover:text-primary hover:bg-primary/10"
                          >
                            Outreach
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5. Patient Outreach & Action Drawer */}
      {isDrawerOpen && activeAppointment && (
        <div className="fixed inset-0 z-50 flex justify-end bg-background/80 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-card border-l border-border h-full shadow-2xl p-6 flex flex-col justify-between overflow-y-auto">
            <div>
              {/* Drawer Header */}
              <div className="flex items-center justify-between border-b border-border/80 pb-4">
                <div>
                  <h2 className="text-lg font-bold text-foreground">Outreach & Clinical Action</h2>
                  <p className="text-xs text-muted-foreground">
                    Token #{activeAppointment.token_number || "—"} · UHID: {activeAppointment.uhid}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setSelectedId(null);
                    setIsDrawerManuallyClosed(true);
                  }}
                  className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted"
                >
                  <X className="size-4" />
                </button>
              </div>

              {/* Patient Core Card */}
              <div className="mt-4 p-4 rounded-xl border border-border/80 bg-muted/20 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-foreground">
                      {activeAppointment.patient_name}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Phone: {activeAppointment.phone || "Not recorded"}
                    </p>
                  </div>
                  <RiskPill
                    category={(activeAppointment.risk_category || "Low") as RiskCategory}
                    score={activeAppointment.risk_score || undefined}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs border-t border-border/60 pt-2 font-mono">
                  <div>
                    <span className="text-muted-foreground">Doctor: </span>
                    <span className="text-foreground">{activeAppointment.doctor_name || "—"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Session: </span>
                    <span className="text-foreground">{activeAppointment.scheduled_time || "Morning"}</span>
                  </div>
                </div>
              </div>

              {/* Multilingual Message Drafter */}
              <div className="mt-6 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <MessageSquare className="size-3.5 text-primary" />
                    <span>WhatsApp / SMS Reminder Draft</span>
                  </label>
                  {/* Language switch */}
                  <div className="inline-flex rounded-md border border-border/80 bg-card p-0.5 text-[11px]">
                    {(["en", "si", "ta"] as const).map((lang) => (
                      <button
                        key={lang}
                        onClick={() => setOutreachLang(lang)}
                        className={`px-2 py-0.5 rounded font-medium uppercase ${
                          outreachLang === lang
                            ? "bg-primary text-primary-foreground font-bold"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {lang}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-3 rounded-lg border border-border/80 bg-background text-xs text-foreground leading-relaxed">
                  {outreachMessages[outreachLang]}
                </div>
              </div>

              {/* Direct Communication Channels */}
              <div className="mt-4 flex flex-col gap-2">
                <a
                  href={`tel:${activeAppointment.phone || ""}`}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-muted text-foreground hover:bg-muted/80 text-xs font-semibold border border-border/80 transition-colors"
                >
                  <Phone className="size-3.5 text-emerald-500" />
                  <span>Call Patient ({activeAppointment.phone || "No phone"})</span>
                </a>

                <a
                  href={`https://wa.me/${(activeAppointment.phone || "").replace(/[^0-9]/g, "")}?text=${encodeURIComponent(
                    outreachMessages[outreachLang]
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600/10 text-emerald-400 hover:bg-emerald-600/20 text-xs font-semibold border border-emerald-500/30 transition-colors"
                >
                  <MessageSquare className="size-3.5 text-emerald-500" />
                  <span>Send via WhatsApp</span>
                </a>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="border-t border-border/80 pt-4 mt-6 flex flex-col gap-2">
              <Link
                href={`/appointments/${activeAppointment.appointment_id}`}
                className="w-full flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground py-2"
              >
                <span>View Full Clinical Record & Map</span>
                <ExternalLink className="size-3" />
              </Link>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSelectedId(null);
                  setIsDrawerManuallyClosed(true);
                }}
                className="w-full text-xs"
              >
                Close Drawer
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
