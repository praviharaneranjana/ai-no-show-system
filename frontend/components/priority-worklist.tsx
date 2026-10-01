"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Phone,
  ChevronRight,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Bot,
  CalendarClock,
  Video,
  Send,
  Search,
  ChevronLeft,
  X,
  ExternalLink,
} from "lucide-react";

import type { AppointmentRecord } from "@/lib/appointments-with-predictions";
import type { Intervention } from "@/lib/types";
import { RiskBadge } from "@/components/risk-badge";
import { Button } from "@/components/ui/button";
import { getColomboToday } from "@/lib/date-colombo";

interface PriorityWorklistProps {
  records: AppointmentRecord[];
  conversations?: Intervention[];
}

const PAGE_SIZE = 10;

export function PriorityWorklist({ records, conversations = [] }: PriorityWorklistProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const todayStr = getColomboToday();

  // Map appointment ID to latest conversation
  const convMap = useMemo(() => {
    const map = new Map<string, Intervention>();
    for (const c of conversations) {
      if (!map.has(c.appointment_id)) {
        map.set(c.appointment_id, c);
      }
    }
    return map;
  }, [conversations]);

  // Filter for upcoming high/medium risk appointments without recorded outcome
  const rawWorklist = useMemo(() => {
    return records
      .filter(
        (r) =>
          (r.prediction?.risk_category === "High" || r.prediction?.risk_category === "Medium") &&
          r.appointment.no_show === null &&
          r.appointment.appointment_day >= todayStr
      )
      .sort((a, b) => {
        // Sort High risk first, then by date
        if (a.prediction?.risk_category !== b.prediction?.risk_category) {
          return a.prediction?.risk_category === "High" ? -1 : 1;
        }
        return a.appointment.appointment_day.localeCompare(b.appointment.appointment_day);
      });
  }, [records, todayStr]);

  // Filter by search query
  const filteredWorklist = useMemo(() => {
    if (!searchQuery.trim()) return rawWorklist;
    const q = searchQuery.toLowerCase().trim();
    return rawWorklist.filter(({ appointment, patient }) => {
      const pName = (patient?.full_name || "").toLowerCase();
      const pPhone = (patient?.phone || "").toLowerCase();
      const pUhid = (patient?.uhid || "").toLowerCase();
      const docName = (appointment.doctor_name || "").toLowerCase();
      const dept = (appointment.department || "").toLowerCase();
      return (
        pName.includes(q) ||
        pPhone.includes(q) ||
        pUhid.includes(q) ||
        docName.includes(q) ||
        dept.includes(q)
      );
    });
  }, [rawWorklist, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredWorklist.length / PAGE_SIZE));
  const activePage = Math.min(currentPage, totalPages);

  const paginatedItems = useMemo(() => {
    const start = (activePage - 1) * PAGE_SIZE;
    return filteredWorklist.slice(start, start + PAGE_SIZE);
  }, [filteredWorklist, activePage]);

  if (rawWorklist.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border/80 bg-card py-10 text-center shadow-xs">
        <div className="flex size-10 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="size-5" />
        </div>
        <span className="font-semibold text-foreground text-sm">All caught up!</span>
        <p className="text-xs text-muted-foreground max-w-xs">
          No upcoming high or medium risk appointments requiring urgent front-desk outreach.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3.5">
      {/* Search Bar & Summary (P5-3) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Search patient, phone, doctor, or department..."
            className="w-full h-9 pl-9 pr-8 rounded-xl bg-background border border-border/80 text-foreground text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary shadow-xs"
          />
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery("");
                setCurrentPage(1);
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
          <span>
            Showing <strong>{filteredWorklist.length}</strong> of <strong>{rawWorklist.length}</strong> priority patients
          </span>
          <Link
            href="/outreach"
            className="ml-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary text-xs font-semibold hover:bg-primary/20 transition-colors"
          >
            <span>Outreach Hub</span>
            <ExternalLink className="size-3" />
          </Link>
        </div>
      </div>

      {/* Patient Worklist Items */}
      {paginatedItems.length === 0 ? (
        <div className="py-8 text-center text-xs text-muted-foreground rounded-xl border border-dashed border-border/80">
          No priority patients match &ldquo;{searchQuery}&rdquo;.
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {paginatedItems.map(({ appointment, patient, prediction }) => {
            const isHigh = prediction?.risk_category === "High";
            const conv = convMap.get(appointment.id);

            return (
              <div
                key={appointment.id}
                className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border p-3.5 transition-colors shadow-xs ${
                  isHigh
                    ? "border-red-500/30 bg-red-500/[0.03] hover:bg-red-500/[0.06] dark:bg-red-950/20"
                    : "border-border/80 bg-card hover:bg-muted/40"
                }`}
              >
                {/* Left: Patient & Contact */}
                <div className="flex items-start gap-3">
                  <div
                    className={`flex size-9 shrink-0 items-center justify-center rounded-xl font-bold text-xs ${
                      isHigh
                        ? "bg-red-500/15 text-red-700 dark:text-red-300 ring-1 ring-red-500/30"
                        : "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                    }`}
                  >
                    {isHigh ? <AlertTriangle className="size-4" /> : <Clock className="size-4" />}
                  </div>

                  <div className="flex flex-col gap-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-foreground text-sm">
                        {patient?.full_name ?? "Unknown Patient"}
                      </span>
                      <RiskBadge
                        category={prediction!.risk_category}
                        score={prediction!.risk_score}
                        size="sm"
                      />
                      {patient?.uhid && (
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {patient.uhid}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground mt-0.5">
                      <span>{appointment.appointment_day}</span>
                      <span>·</span>
                      <span>{appointment.scheduled_time || "09:00"}</span>
                      <span>·</span>
                      <span className="font-medium text-foreground">
                        {appointment.doctor_name || "Specialist Clinic"}
                      </span>
                      <span>·</span>
                      <span>{appointment.department || "General Medicine"}</span>
                      {patient?.phone && (
                        <>
                          <span>·</span>
                          <span className="font-mono text-[11px] text-foreground font-medium">
                            {patient.phone}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Outreach Status & Action Button */}
                <div className="flex items-center gap-2.5 self-end sm:self-auto shrink-0">
                  {conv ? (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-muted text-xs">
                      {conv.status === "confirmed" ? (
                        <>
                          <CheckCircle2 className="size-3.5 text-emerald-500" />
                          <span className="text-emerald-700 dark:text-emerald-300 font-medium">Confirmed</span>
                        </>
                      ) : conv.status === "rescheduled" ? (
                        <>
                          <CalendarClock className="size-3.5 text-sky-500" />
                          <span className="text-sky-700 dark:text-sky-300 font-medium">Rescheduled</span>
                        </>
                      ) : conv.status === "telehealth_requested" ? (
                        <>
                          <Video className="size-3.5 text-purple-500" />
                          <span className="text-purple-700 dark:text-purple-300 font-medium">Telehealth</span>
                        </>
                      ) : (
                        <>
                          <Bot className="size-3.5 text-primary" />
                          <span className="text-foreground capitalize">{conv.status || "In conversation"}</span>
                        </>
                      )}
                    </div>
                  ) : (
                    <Link
                      href={`/outreach?appointmentId=${appointment.id}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors shadow-xs"
                    >
                      <Send className="size-3" />
                      <span>Dispatch Outreach</span>
                    </Link>
                  )}

                  <Link
                    href={`/appointments/${appointment.id}`}
                    className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                    title="View clinical detail"
                  >
                    <ChevronRight className="size-4" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Numbered Pagination Controls (P5-3: Page size 10, numbered pagination) */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border/60 pt-3 mt-1 text-xs">
          <span className="text-muted-foreground">
            Page <strong>{activePage}</strong> of <strong>{totalPages}</strong> ({filteredWorklist.length} total)
          </span>

          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
              disabled={activePage === 1}
              className="h-8 px-2.5 text-xs gap-1"
            >
              <ChevronLeft className="size-3.5" />
              <span>Prev</span>
            </Button>

            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - activePage) <= 1)
              .map((p, idx, arr) => {
                const prevP = arr[idx - 1];
                const showEllipsis = prevP && p - prevP > 1;
                return (
                  <div key={p} className="flex items-center gap-1">
                    {showEllipsis && <span className="px-1 text-muted-foreground">...</span>}
                    <button
                      type="button"
                      onClick={() => setCurrentPage(p)}
                      className={`size-8 rounded-lg text-xs font-bold transition-all ${
                        p === activePage
                          ? "bg-primary text-primary-foreground shadow-xs"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted"
                      }`}
                    >
                      {p}
                    </button>
                  </div>
                );
              })}

            <Button
              size="sm"
              variant="outline"
              onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
              disabled={activePage === totalPages}
              className="h-8 px-2.5 text-xs gap-1"
            >
              <span>Next</span>
              <ChevronRight className="size-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
