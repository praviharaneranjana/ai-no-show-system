"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Calendar, Clock, Search, X } from "lucide-react";

import { cn } from "@/lib/utils";

type Counts = { all: number; high_risk: number; today: number; pending_outcome: number };

const SELECT_CLASS =
  "h-9 w-full rounded-lg border border-input bg-card px-2.5 text-xs text-foreground outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20";

// URL is the single source of truth (?view=&risk=&window_days=&q=&department=&sort=&page=), so every
// dashboard card can deep-link into a filtered register and the browser back button works.
export function RegisterFilters({ counts, departments }: { counts: Counts; departments: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const lastPushed = useRef(params.get("q") ?? "");

  function update(changes: Record<string, string | null>, keepPage = false) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    if (!keepPage) next.delete("page");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  // debounce the search box into the URL
  useEffect(() => {
    if (q === lastPushed.current) return;
    const t = setTimeout(() => {
      lastPushed.current = q;
      update({ q: q.trim() || null });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const view = params.get("view") ?? "all";
  const tabs = [
    { id: "all", label: "All Appointments", n: counts.all, Icon: null, tone: "" },
    { id: "high_risk", label: "High Risk Triage", n: counts.high_risk, Icon: AlertTriangle, tone: "text-red-500" },
    { id: "today", label: "Today’s Schedule", n: counts.today, Icon: Calendar, tone: "text-primary" },
    { id: "pending_outcome", label: "Pending Outcome", n: counts.pending_outcome, Icon: Clock, tone: "text-amber-500" },
  ] as const;

  const windowDays = params.get("window_days");
  const hasExtra = windowDays || params.get("risk") || params.get("department") || params.get("q") || params.get("status");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-muted/60 p-1 w-fit">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => update({ view: t.id === "all" ? null : t.id, window_days: null })}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all",
              view === t.id && !windowDays ? "bg-background font-semibold text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t.Icon && <t.Icon className={cn("size-3.5", t.tone)} />}
            <span>{t.label}</span>
            <span className="rounded-full bg-muted px-1.5 text-[10px] tabular-nums">{t.n.toLocaleString()}</span>
          </button>
        ))}
      </div>

      {(windowDays || view === "upcoming") && (
        <div className="flex items-center gap-2 text-[11px]">
          <span className="rounded-full bg-[#8B7CF6]/10 px-3 py-1 font-semibold text-[#8B7CF6]">
            Upcoming{windowDays ? ` · next ${windowDays} days` : ""}
            {params.get("risk") ? ` · ${params.get("risk")} risk` : ""}
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-12">
        <div className="relative sm:col-span-5">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search patient, phone, UHID, department…"
            className={cn(SELECT_CLASS, "pl-9")}
          />
        </div>
        <div className="sm:col-span-3">
          <select value={params.get("department") ?? ""} onChange={(e) => update({ department: e.target.value || null })} className={SELECT_CLASS}>
            <option value="">All Departments</option>
            {departments.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <select value={params.get("risk") ?? ""} onChange={(e) => update({ risk: e.target.value || null })} className={SELECT_CLASS}>
            <option value="">All Risk Levels</option>
            <option value="High">High Risk</option>
            <option value="Medium">Medium Risk</option>
            <option value="Low">Low Risk</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <select value={params.get("sort") ?? "risk"} onChange={(e) => update({ sort: e.target.value === "risk" ? null : e.target.value })} className={SELECT_CLASS}>
            <option value="risk">Risk (High → Low)</option>
            <option value="date_asc">Date (Earliest)</option>
            <option value="date_desc">Date (Latest)</option>
            <option value="name">Patient Name (A–Z)</option>
          </select>
        </div>
      </div>

      {(hasExtra || view !== "all") && (
        <button
          type="button"
          onClick={() => {
            setQ("");
            lastPushed.current = "";
            router.replace(pathname);
          }}
          className="flex w-fit items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
        >
          <X className="size-3" /> Clear all filters
        </button>
      )}
    </div>
  );
}
