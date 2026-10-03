"use client";

import { useEffect, useState } from "react";
import { FlaskConical } from "lucide-react";

import type { DataSourceInfo } from "@/lib/types";

/** Slim banner shown on every page while the hospital's appointments include data_source='synthetic' rows. */
export function SyntheticDataStrip() {
  const [info, setInfo] = useState<DataSourceInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/meta/data-source", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: DataSourceInfo | null) => {
        if (!cancelled) setInfo(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!info?.is_synthetic) return null;
  const pct = Math.round(info.synthetic_share * 100);
  return (
    <div
      role="status"
      className="flex shrink-0 items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-[11px] text-amber-800 dark:text-amber-200 lg:px-8"
    >
      <FlaskConical className="size-3.5 shrink-0" />
      <span className="font-bold uppercase tracking-wider">Synthetic data</span>
      <span className="truncate text-amber-800/80 dark:text-amber-200/80">
        KPIs on this page are computed from generated records ({pct}% of this hospital&apos;s appointments), not real patients.
      </span>
    </div>
  );
}
