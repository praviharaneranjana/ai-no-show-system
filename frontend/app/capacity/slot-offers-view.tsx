"use client";

import React, { useState, useEffect, useTransition } from "react";
import {
  ListPlus,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Sparkles,
  Clock,
  UserCheck,
  Send,
  ShieldCheck,
  AlertCircle,
  Eye,
  X,
  Phone,
} from "lucide-react";

import {
  getSlotOffersAction,
  actOnSlotOfferAction,
  getCapacitySettingsAction,
} from "@/app/capacity/actions";
import { cn } from "@/lib/utils";
import type { SlotOffer, SlotOfferCandidate } from "@/lib/types";

interface SlotOffersViewProps {
  initialOffers: SlotOffer[];
}

export function SlotOffersView({ initialOffers }: SlotOffersViewProps) {
  const [offers, setOffers] = useState<SlotOffer[]>(initialOffers);
  const [autoAssignEnabled, setAutoAssignEnabled] = useState(false);
  const [selectedOfferForDraft, setSelectedOfferForDraft] = useState<{
    offer: SlotOffer;
    candidate: SlotOfferCandidate;
  } | null>(null);
  const [recentAction, setRecentAction] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    // Load manager settings for auto-assign status
    getCapacitySettingsAction().then((s) => {
      if (s) setAutoAssignEnabled(s.auto_assign_waitlist);
    });
  }, []);

  const openOffers = offers.filter((o) => o.status === "proposed");
  const completedOffers = offers.filter((o) => o.status === "approved" || o.status === "declined");

  const topCandidates = openOffers.map((o) => o.candidates?.[0]).filter((c): c is SlotOfferCandidate => !!c);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const avgTopScore = avg(topCandidates.map((c) => c.total_score));
  const avgTopRisk = avg(topCandidates.map((c) => c.predicted_no_show_prob * 100));
  const totalRanked = openOffers.reduce((n, o) => n + (o.candidates?.length ?? 0), 0);
  const summaryStats = [
    { label: "Open freed slots", value: String(openOffers.length), hint: "awaiting backfill" },
    { label: "Standby patients ranked", value: String(totalRanked), hint: "across all open slots" },
    { label: "Avg top-match score", value: avgTopScore === null ? "–" : `${avgTopScore.toFixed(0)} / 100`, hint: "best candidate per slot" },
    { label: "Avg top-match no-show risk", value: avgTopRisk === null ? "–" : `${avgTopRisk.toFixed(0)}%`, hint: "lower = more reliable fill" },
  ];
  const scoreLegend = [
    { label: "Specialty match", color: "bg-sky-500" },
    { label: "Reliability", color: "bg-emerald-500" },
    { label: "Wait time", color: "bg-primary" },
    { label: "Urgency", color: "bg-rose-500" },
    { label: "Proximity", color: "bg-amber-500" },
  ];

  async function handleAct(offerId: string, action: "approve" | "decline" | "undo") {
    startTransition(async () => {
      const updated = await actOnSlotOfferAction(offerId, action);
      if (updated) {
        setOffers((prev) =>
          prev.map((o) => (o.id === offerId ? { ...o, status: updated.status, acted_at: updated.acted_at } : o))
        );
        setRecentAction(
          action === "approve"
            ? `Offer ${offerId.slice(-6)} approved. Patient notified via draft outreach.`
            : action === "undo"
            ? `Offer ${offerId.slice(-6)} assignment reverted.`
            : `Offer ${offerId.slice(-6)} declined.`
        );
      }
    });
  }

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-300">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-[24px] bg-card border border-border/60 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <UserCheck className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-foreground">Auto-Fill from Waitlist</h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                Multi-Attribute Utility Ranker
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Proactively backfills cancelled or high-risk slots with the most reliable standby candidates
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-muted/30 border border-border/50 text-xs">
            <ShieldCheck className="size-4 text-emerald-500" />
            <span className="text-muted-foreground">Mode:</span>
            <span className="font-bold text-foreground">
              {autoAssignEnabled ? "Full Auto-Assign" : "Suggest & 1-Click Approve"}
            </span>
          </div>
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {summaryStats.map((st) => (
          <div key={st.label} className="rounded-2xl bg-card border border-border/60 p-4 flex flex-col gap-1 shadow-xs">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{st.label}</span>
            <span className="text-2xl font-bold text-foreground tabular-nums">{st.value}</span>
            <span className="text-[11px] text-muted-foreground">{st.hint}</span>
          </div>
        ))}
      </div>

      {recentAction && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-xs font-semibold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4" />
            <span>{recentAction}</span>
          </div>
          <button
            type="button"
            onClick={() => setRecentAction(null)}
            className="text-xs opacity-70 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Section: Slot Offers Queue */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-foreground">Freed Slot Queue</h3>
            <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-bold tabular-nums">
              {openOffers.length} Open
            </span>
          </div>
        </div>

        {openOffers.length === 0 ? (
          <div className="rounded-[24px] bg-card p-12 text-center border border-border/60 flex flex-col items-center justify-center gap-3">
            <CheckCircle2 className="size-10 text-emerald-500/40" />
            <div className="flex flex-col gap-1">
              <h4 className="text-base font-semibold text-foreground">All Slots Filled</h4>
              <p className="text-xs text-muted-foreground max-w-sm">
                No active cancellations or vacant slots requiring backfill right now. Standby ranker is idling.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {openOffers.map((offer) => {
              const candidates = offer.candidates ?? [];
              const topCandidate = candidates[0];
              const roomClean = (offer.room_number ?? offer.room ?? "1").replace(/^Room\s+/i, "");
              const deptName = offer.department ?? offer.specialty ?? "General";
              const freedReason = offer.reason ?? offer.freed_reason ?? "Confirmed Cancellation";

              return (
                <div
                  key={offer.id}
                  className="rounded-[24px] bg-card p-5 sm:p-6 shadow-xs border border-border/60 flex flex-col gap-4 hover:border-border transition-all"
                >
                  {/* Slot Overview Bar */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border/40">
                    <div className="flex items-center gap-3">
                      <div className="size-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                        {offer.slot_time}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-foreground">
                            {offer.doctor_name}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            ({deptName} · Room {roomClean})
                          </span>
                        </div>
                        <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                          Freed reason: {freedReason}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => handleAct(offer.id, "decline")}
                        className="px-3 py-1.5 rounded-xl border border-border text-muted-foreground text-xs font-semibold hover:bg-muted hover:text-foreground transition-colors"
                      >
                        Decline
                      </button>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => handleAct(offer.id, "approve")}
                        className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary/90 shadow-xs transition-colors"
                      >
                        <CheckCircle2 className="size-3.5" /> 1-Click Approve Top Candidate
                      </button>
                    </div>
                  </div>

                  {/* Ranked Candidates List */}
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                        Ranked Waitlist Candidates ({candidates.length})
                      </span>
                      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                        {scoreLegend.map((l) => (
                          <span key={l.label} className="flex items-center gap-1">
                            <span className={cn("size-2 rounded-full", l.color)} />
                            {l.label}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-2.5">
                      {candidates.map((cand, idx) => {
                        const isTop = idx === 0;
                        const bd = cand.score_breakdown;

                        return (
                          <div
                            key={cand.waitlist_id}
                            className={cn(
                              "p-3.5 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-3 transition-colors",
                              isTop
                                ? "bg-primary/5 border-primary/30"
                                : "bg-muted/15 border-border/40"
                            )}
                          >
                            <div className="flex items-center gap-3">
                              <span
                                className={cn(
                                  "size-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                                  isTop
                                    ? "bg-primary text-white"
                                    : "bg-muted text-muted-foreground"
                                )}
                              >
                                #{idx + 1}
                              </span>
                              <div className="flex flex-col">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold text-foreground">
                                    {cand.patient_name}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground">
                                    {cand.phone}
                                  </span>
                                  {cand.urgency === "urgent" && (
                                    <span className="px-1.5 py-0.2 rounded-md bg-rose-500/10 text-rose-600 dark:text-rose-400 text-[9px] font-bold border border-rose-500/20">
                                      Urgent
                                    </span>
                                  )}
                                </div>
                                <span className="text-[10px] text-muted-foreground">
                                  Waiting {cand.wait_days}d · {(cand.predicted_no_show_prob * 100).toFixed(0)}% risk · {cand.distance_km ? `${cand.distance_km}km away` : "Colombo"}
                                </span>
                              </div>
                            </div>

                            {/* Score Breakdown Bar */}
                            <div className="flex items-center gap-4">
                              <div className="flex flex-col gap-1 w-48">
                                <div className="flex justify-between text-[10px] font-semibold">
                                  <span className="text-muted-foreground">Match Score</span>
                                  <span className="text-foreground font-bold">{cand.total_score} / 100</span>
                                </div>
                                <div className="w-full h-2 rounded-full bg-muted/40 overflow-hidden flex">
                                  <div style={{ width: `${bd.specialty_doctor_match ?? 0}%` }} className="bg-sky-500" title="Specialty match" />
                                  <div style={{ width: `${bd.attendance_reliability ?? 0}%` }} className="bg-emerald-500" title="Reliability" />
                                  <div style={{ width: `${bd.waiting_time_priority ?? 0}%` }} className="bg-primary" title="Wait time" />
                                  <div style={{ width: `${bd.clinical_urgency ?? 0}%` }} className="bg-rose-500" title="Urgency" />
                                  <div style={{ width: `${bd.travel_proximity ?? 0}%` }} className="bg-amber-500" title="Proximity" />
                                </div>
                              </div>

                              <button
                                type="button"
                                onClick={() => setSelectedOfferForDraft({ offer, candidate: cand })}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:bg-muted"
                              >
                                <Eye className="size-3" /> Draft SMS
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 15-Minute Undo Audit Trail */}
      {completedOffers.length > 0 && (
        <div className="rounded-[24px] bg-card p-5 sm:p-6 shadow-xs border border-border/60 flex flex-col gap-4">
          <div className="flex items-center justify-between pb-2 border-b border-border/40">
            <div className="flex items-center gap-2">
              <Clock className="size-4 text-primary" />
              <h3 className="text-sm font-bold text-foreground">Recent Audit Trail & Undo Window</h3>
            </div>
            <span className="text-xs text-muted-foreground">15-minute reversible actions</span>
          </div>

          <div className="flex flex-col gap-2">
            {completedOffers.map((o) => (
              <div
                key={o.id}
                className="p-3 rounded-xl bg-muted/20 border border-border/40 flex items-center justify-between text-xs"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase",
                      o.status === "approved"
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                    )}
                  >
                    {o.status}
                  </span>
                  <span className="font-semibold text-foreground">
                    {o.doctor_name} ({o.slot_time}) &mdash; candidate assigned
                  </span>
                  <span className="text-muted-foreground text-[10px]">
                    Acted {o.acted_at ? new Date(o.acted_at).toLocaleTimeString() : "recently"} by {o.acted_by ?? "Staff"}
                  </span>
                </div>

                {o.status === "approved" && (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => handleAct(o.id, "undo")}
                    className="flex items-center gap-1 px-3 py-1 rounded-lg border border-border text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted"
                  >
                    <RotateCcw className="size-3" /> Undo
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Outreach Draft Preview Modal */}
      {selectedOfferForDraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-[24px] bg-card p-6 border border-border shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-border/40 pb-3">
              <div className="flex items-center gap-2.5">
                <Send className="size-4 text-primary" />
                <h3 className="text-sm font-bold text-foreground">Outreach Notification Draft</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOfferForDraft(null)}
                className="size-7 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-muted-foreground">Recipient</span>
              <div className="p-3 rounded-xl bg-muted/30 border border-border/50 text-xs flex items-center justify-between">
                <span className="font-bold text-foreground">
                  {selectedOfferForDraft.candidate.patient_name}
                </span>
                <span className="font-mono text-muted-foreground">
                  {selectedOfferForDraft.candidate.phone}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-muted-foreground">Message Body</span>
              <div className="p-3.5 rounded-xl bg-muted/20 border border-border/60 text-xs font-mono text-foreground leading-relaxed">
                Ayubowan {selectedOfferForDraft.candidate.patient_name}. An earlier consultation slot has opened with{" "}
                {selectedOfferForDraft.offer.doctor_name} at National Hospital Colombo today at{" "}
                {selectedOfferForDraft.offer.slot_time} (Room {(selectedOfferForDraft.offer.room_number ?? selectedOfferForDraft.offer.room ?? "1").replace(/^Room\s+/i, "")}).
                <br /><br />
                Please reply <strong>YES</strong> within 15 minutes to confirm, or <strong>NO</strong> to pass to the next standby patient.
              </div>
            </div>

            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-[11px] flex items-center gap-2">
              <AlertCircle className="size-4 shrink-0" />
              <span>Draft preview mode. In development mode, actual SMS/WhatsApp dispatch is disabled.</span>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/40">
              <button
                type="button"
                onClick={() => setSelectedOfferForDraft(null)}
                className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-semibold hover:bg-primary/90"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
