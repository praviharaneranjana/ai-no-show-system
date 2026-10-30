"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeft, FileText, Search, User } from "lucide-react";

import { searchAction } from "@/app/shell-actions";
import { cn } from "@/lib/utils";
import type { SearchHit } from "@/lib/types";

const PAGES: SearchHit[] = [
  { kind: "patient", title: "Dashboard", subtitle: "Overview", href: "/" },
  { kind: "patient", title: "Appointments", subtitle: "Full register", href: "/appointments" },
  { kind: "patient", title: "Priority Worklist", subtitle: "High-risk outreach queue", href: "/worklist" },
  { kind: "patient", title: "Capacity", subtitle: "Doctor sessions & waitlist", href: "/capacity" },
  { kind: "patient", title: "Outreach Hub", subtitle: "Conversations", href: "/outreach" },
  { kind: "patient", title: "Revenue at Risk", subtitle: "Expected no-show loss", href: "/revenue-at-risk" },
  { kind: "patient", title: "Patient Map", subtitle: "Where patients travel from", href: "/map" },
  { kind: "patient", title: "No-Show Trends", subtitle: "Observed attendance over time", href: "/analytics/trends" },
  { kind: "patient", title: "Analytics", subtitle: "Risk distribution", href: "/analytics" },
  { kind: "patient", title: "ROI Simulator", subtitle: "Model the savings", href: "/simulator" },
  { kind: "patient", title: "Notifications", subtitle: "All alerts", href: "/notifications" },
  { kind: "patient", title: "New Appointment", subtitle: "Book a patient", href: "/new" },
];

export function SearchPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      const res = await searchAction(q);
      if (!cancelled) {
        setHits(res);
        setLoading(false);
      }
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const q = query.trim().toLowerCase();
  const pageMatches = useMemo(
    () => (q ? PAGES.filter((p) => p.title.toLowerCase().includes(q)) : PAGES.slice(0, 6)),
    [q]
  );
  const patientHits = q.length >= 2 ? hits : [];
  const results = [...patientHits, ...pageMatches];
  const current = Math.min(active, Math.max(results.length - 1, 0));

  function go(hit: SearchHit | undefined) {
    if (!hit) return;
    onClose();
    router.push(hit.href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") onClose();
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(results[current]);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/50 px-4 pt-[12vh] backdrop-blur-xs" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label="Search"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
      >
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            placeholder="Search patients, phone, UHID, city, or jump to a page…"
            className="h-12 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          <kbd className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">Esc</kbd>
        </div>

        <div className="max-h-[50vh] overflow-y-auto p-2">
          {loading && <p className="px-3 py-2 text-[11px] text-muted-foreground">Searching…</p>}
          {q.length >= 2 && !loading && patientHits.length === 0 && (
            <p className="px-3 py-2 text-[11px] text-muted-foreground">No patients match “{query.trim()}”.</p>
          )}
          {results.map((r, i) => {
            const isPage = i >= patientHits.length;
            const Icon = isPage ? FileText : User;
            return (
              <button
                key={`${r.href}-${i}`}
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => go(r)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors",
                  i === current ? "bg-[#8B7CF6]/10" : "hover:bg-muted/60"
                )}
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-foreground">{r.title}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{r.subtitle}</span>
                </span>
                {i === current && <CornerDownLeft className="size-3.5 text-muted-foreground" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
