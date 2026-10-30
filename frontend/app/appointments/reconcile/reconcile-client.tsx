"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Ban,
  Clock,
  User,
  Stethoscope,
  Filter,
  Check,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { RiskPill } from "@/components/risk-pill";
import type { PredictionTodayResponse, HubAppointmentItem, RiskCategory } from "@/lib/types";

interface ReconcileClientProps {
  initialData: PredictionTodayResponse | null;
  targetDate: string;
}

export function ReconcileClient({ initialData, targetDate }: ReconcileClientProps) {
  const [appointments, setAppointments] = useState<
    Array<
      HubAppointmentItem & {
        doctor_name: string;
        department: string;
        room: string | null;
        outcome?: "attended" | "no_show" | "cancelled" | "pending";
        reason?: string;
      }
    >
  >(() => {
    if (!initialData?.by_doctor) return [];
    return initialData.by_doctor.flatMap((docGroup) =>
      docGroup.appointments.map((a) => {
        let initialOutcome: "attended" | "no_show" | "cancelled" | "pending" = "pending";
        if (a.status === "completed" || a.status === "arrived") initialOutcome = "attended";
        else if (a.status === "no_show") initialOutcome = "no_show";
        else if (a.status === "cancelled") initialOutcome = "cancelled";

        return {
          ...a,
          doctor_name: docGroup.doctor_name,
          department: docGroup.department,
          room: docGroup.room,
          outcome: initialOutcome,
        };
      })
    );
  });

  const [filterDoc, setFilterDoc] = useState<string>("all");
  const [savingId, setSavingId] = useState<string | null>(null);

  // Stats calculation
  const total = appointments.length;
  const attended = appointments.filter((a) => a.outcome === "attended").length;
  const noShows = appointments.filter((a) => a.outcome === "no_show").length;
  const pending = appointments.filter((a) => a.outcome === "pending").length;

  async function handleRecordOutcome(
    appointmentId: string,
    outcomeType: "attended" | "no_show" | "cancelled" | "undo",
    reason = "Clinic Outcome Recorded"
  ) {
    setSavingId(appointmentId);
    let payload: { no_show?: boolean | null; cancelled?: boolean; reason?: string } = {};

    if (outcomeType === "attended") {
      payload = { no_show: false, reason };
    } else if (outcomeType === "no_show") {
      payload = { no_show: true, reason };
    } else if (outcomeType === "cancelled") {
      payload = { cancelled: true, reason };
    } else if (outcomeType === "undo") {
      payload = { no_show: null, cancelled: false };
    }

    try {
      const res = await fetch(`/api/appointments/${appointmentId}/outcome`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setAppointments((prev) =>
          prev.map((a) => {
            if (a.appointment_id !== appointmentId) return a;
            let nextOutcome: "attended" | "no_show" | "cancelled" | "pending" = "pending";
            if (outcomeType === "attended") nextOutcome = "attended";
            else if (outcomeType === "no_show") nextOutcome = "no_show";
            else if (outcomeType === "cancelled") nextOutcome = "cancelled";
            else if (outcomeType === "undo") nextOutcome = "pending";

            return {
              ...a,
              outcome: nextOutcome,
              reason: outcomeType === "no_show" ? reason : undefined,
            };
          })
        );
      }
    } catch (e) {
      console.error("Failed to update outcome", e);
    } finally {
      setSavingId(null);
    }
  }

  const doctorsList = Array.from(new Set(appointments.map((a) => a.doctor_name)));

  const filtered = appointments.filter((a) => {
    if (filterDoc !== "all" && a.doctor_name !== filterDoc) return false;
    return true;
  });

  return (
    <div className="flex w-full flex-col gap-6 p-6 lg:p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <Link
          href="/predictions"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors w-fit"
        >
          <ArrowLeft className="size-3.5" />
          <span>Back to Prediction Hub</span>
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/80 pb-5">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                End-of-Clinic Outcome Reconciliation
              </h1>
              <Badge variant="outline" className="text-xs bg-muted/40 font-mono">
                {targetDate}
              </Badge>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Reconcile patient arrivals, no-shows, and cancellations for continuous model feedback and training.
            </p>
          </div>

          {/* Doctor filter dropdown */}
          <div className="flex items-center gap-2">
            <Filter className="size-4 text-muted-foreground" />
            <select
              value={filterDoc}
              onChange={(e) => setFilterDoc(e.target.value)}
              className="h-8 px-2.5 rounded-lg border border-border/80 bg-card text-xs font-medium"
            >
              <option value="all">All Doctors ({doctorsList.length})</option>
              {doctorsList.map((doc) => (
                <option key={doc} value={doc}>
                  {doc}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Reconciliation KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="border-border/80 bg-card shadow-xs">
          <CardContent className="p-4 flex flex-col justify-between">
            <span className="text-xs font-medium text-muted-foreground">Total Cohort</span>
            <div className="text-2xl font-extrabold text-foreground font-mono mt-1">{total}</div>
            <span className="text-[10px] text-muted-foreground">Scheduled today</span>
          </CardContent>
        </Card>

        <Card className="border-emerald-500/20 bg-emerald-500/5 shadow-xs">
          <CardContent className="p-4 flex flex-col justify-between">
            <span className="text-xs font-medium text-emerald-400">Arrived / Attended</span>
            <div className="text-2xl font-extrabold text-emerald-400 font-mono mt-1">{attended}</div>
            <span className="text-[10px] text-emerald-400/80">
              {total > 0 ? Math.round((attended / total) * 100) : 0}% attendance rate
            </span>
          </CardContent>
        </Card>

        <Card className="border-rose-500/20 bg-rose-500/5 shadow-xs">
          <CardContent className="p-4 flex flex-col justify-between">
            <span className="text-xs font-medium text-rose-400">Confirmed No-Shows</span>
            <div className="text-2xl font-extrabold text-rose-400 font-mono mt-1">{noShows}</div>
            <span className="text-[10px] text-rose-400/80">
              {total > 0 ? Math.round((noShows / total) * 100) : 0}% non-attendance
            </span>
          </CardContent>
        </Card>

        <Card className="border-amber-500/20 bg-amber-500/5 shadow-xs">
          <CardContent className="p-4 flex flex-col justify-between">
            <span className="text-xs font-medium text-amber-400">Pending Reconciliation</span>
            <div className="text-2xl font-extrabold text-amber-400 font-mono mt-1">{pending}</div>
            <span className="text-[10px] text-amber-400/80">Awaiting counter update</span>
          </CardContent>
        </Card>
      </div>

      {/* Appointment Reconciliation Rows */}
      <div className="rounded-xl border border-border/80 bg-card overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/40 border-b border-border/80 text-muted-foreground uppercase font-mono text-[10px]">
              <tr>
                <th className="py-3 px-4">Token</th>
                <th className="py-3 px-4">Patient & UHID</th>
                <th className="py-3 px-4">Doctor</th>
                <th className="py-3 px-4">Predicted Risk</th>
                <th className="py-3 px-4">Reconciled Status</th>
                <th className="py-3 px-4 text-right">Quick Reconciliation Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-muted-foreground">
                    No appointments to reconcile.
                  </td>
                </tr>
              ) : (
                filtered.map((appt) => {
                  const isSaving = savingId === appt.appointment_id;
                  const cat = (appt.risk_category || "Low") as RiskCategory;

                  return (
                    <tr key={appt.appointment_id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-foreground">
                        #{appt.token_number || "—"}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-foreground">{appt.patient_name}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">{appt.uhid}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-foreground">{appt.doctor_name}</div>
                        <div className="text-[10px] text-muted-foreground">{appt.department}</div>
                      </td>
                      <td className="py-3 px-4">
                        <RiskPill category={cat} score={appt.risk_score || undefined} />
                      </td>
                      <td className="py-3 px-4">
                        {appt.outcome === "attended" && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                            <CheckCircle2 className="size-3.5" />
                            <span>Arrived / Attended</span>
                          </span>
                        )}
                        {appt.outcome === "no_show" && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/30">
                            <XCircle className="size-3.5" />
                            <span>No-Show Recorded</span>
                          </span>
                        )}
                        {appt.outcome === "cancelled" && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-muted text-muted-foreground border border-border/80">
                            <Ban className="size-3.5" />
                            <span>Cancelled</span>
                          </span>
                        )}
                        {appt.outcome === "pending" && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                            <Clock className="size-3.5" />
                            <span>Pending Outcome</span>
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          {appt.outcome !== "attended" && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={isSaving}
                              onClick={() => handleRecordOutcome(appt.appointment_id, "attended")}
                              className="h-7 text-xs px-2.5 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 border-emerald-500/30"
                            >
                              <Check className="size-3.5 mr-1" /> Attended
                            </Button>
                          )}

                          {appt.outcome !== "no_show" && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={isSaving}
                              onClick={() =>
                                handleRecordOutcome(
                                  appt.appointment_id,
                                  "no_show",
                                  "Did not arrive for clinic"
                                )
                              }
                              className="h-7 text-xs px-2.5 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 border-rose-500/30"
                            >
                              <XCircle className="size-3.5 mr-1" /> No-Show
                            </Button>
                          )}

                          {appt.outcome !== "pending" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={isSaving}
                              onClick={() => handleRecordOutcome(appt.appointment_id, "undo")}
                              className="h-7 text-xs px-2 text-muted-foreground hover:text-foreground"
                            >
                              <RotateCcw className="size-3 mr-1" /> Undo
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
