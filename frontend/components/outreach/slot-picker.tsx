"use client";

import { useMemo, useState } from "react";
import { Search, Users } from "lucide-react";

import { cn } from "@/lib/utils";
import type { SlotDict } from "@/lib/types";

const inputCls =
  "h-9 rounded-xl border border-border/80 bg-background/90 px-3 text-xs text-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20";

export const slotKey = (s: Pick<SlotDict, "session_id" | "date">) => `${s.session_id}|${s.date}`;

/** Open sessions of the department with a doctor dropdown and a search box; the list scrolls when long. */
export function SlotPicker({
  options,
  picked,
  onPick,
  currentDoctorId,
}: {
  options: SlotDict[];
  picked: SlotDict | null;
  onPick: (s: SlotDict) => void;
  currentDoctorId?: string | null;
}) {
  const [doctor, setDoctor] = useState("all");
  const [query, setQuery] = useState("");

  const doctors = useMemo(() => {
    const m = new Map<string, string>();
    options.forEach((o) => m.set(o.doctor_id, o.doctor_name));
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [options]);

  const q = query.trim().toLowerCase();
  const visible = options.filter(
    (o) => (doctor === "all" || o.doctor_id === doctor) && (!q || `${o.doctor_name} ${o.label} ${o.room} ${o.date}`.toLowerCase().includes(q))
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,260px)_1fr]">
        <select value={doctor} onChange={(e) => setDoctor(e.target.value)} aria-label="Filter by doctor" className={cn(inputCls, "cursor-pointer")}>
          <option value="all">All doctors in this department ({doctors.length})</option>
          {doctors.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
              {id === currentDoctorId ? " (current)" : ""}
            </option>
          ))}
        </select>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search doctor, room or date in this department"
            aria-label="Search sessions"
            className={cn(inputCls, "w-full pl-9")}
          />
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border/70 py-6 text-center text-xs text-muted-foreground">No sessions match.</p>
      ) : (
        <div className="grid max-h-80 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((o) => {
            const selected = picked ? slotKey(picked) === slotKey(o) : false;
            return (
              <button
                key={slotKey(o)}
                type="button"
                onClick={() => onPick(o)}
                className={cn(
                  "flex cursor-pointer flex-col gap-1 rounded-xl border p-3 text-left text-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-sm active:scale-[0.98]",
                  selected ? "border-primary bg-primary/10 ring-2 ring-primary/30" : "border-border/70 bg-muted/20"
                )}
              >
                <span className="font-bold text-foreground">
                  {new Date(`${o.date}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
                  <span className="ml-2 font-mono text-[11px] font-medium text-muted-foreground">
                    {o.start_time}-{o.end_time}
                  </span>
                </span>
                <span className="text-[11px] text-foreground">
                  {o.doctor_name}
                  {o.same_doctor && <span className="ml-1 font-semibold text-primary">· same doctor</span>}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {o.label} · Room {o.room.replace(/^Room\s+/i, "")}
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                  <Users className="size-3" /> {o.remaining} of {o.max_patients} places free
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
