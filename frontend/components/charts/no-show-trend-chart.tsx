"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { trendAction } from "@/app/shell-actions";
import { PillTabs } from "@/components/pill-tabs";
import { cn } from "@/lib/utils";
import type { TrendGranularity, TrendResponse } from "@/lib/types";

interface NoShowTrendChartProps {
  /** Server-rendered data for the initial granularity. */
  initial: TrendResponse | null;
  initialGranularity?: TrendGranularity;
  /** Dashboard card mode: small chart + link to the full trends screen. */
  compact?: boolean;
  department?: string;
  doctor?: string;
  className?: string;
  onData?: (data: TrendResponse) => void;
}

const PERIOD_NOUN: Record<TrendGranularity, string> = {
  day: "day",
  week: "week",
  month: "month",
  year: "year",
};

// Everything plotted here comes from /analytics/trend: observed no-shows divided by
// appointments with a recorded outcome, per period. No targets or placeholder series.
export function NoShowTrendChart({
  initial,
  initialGranularity = "month",
  compact = false,
  department,
  doctor,
  className,
  onData,
}: NoShowTrendChartProps) {
  const [granularity, setGranularity] = useState<TrendGranularity>(initialGranularity);
  const [data, setData] = useState<TrendResponse | null>(initial);
  const [failed, setFailed] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  function change(next: TrendGranularity) {
    setGranularity(next);
    setHover(null);
    startTransition(async () => {
      const res = await trendAction(next, department, doctor);
      setFailed(res === null);
      if (res) {
        setData(res);
        onData?.(res);
      }
    });
  }

  // The still-running period is excluded from the line (it would plot a misleadingly low rate); it is listed in the table.
  const points = (data?.points ?? []).filter((p) => !p.partial);
  const enough = points.filter((p) => p.total > 0).length >= 2;
  const maxRate = Math.max(...points.map((p) => p.rate), data?.baseline_rate ?? 0, 5);
  const yMax = Math.ceil((maxRate * 1.15) / 5) * 5;
  const W = 500;
  const H = 140;
  // centred in each hover column so dots/tooltips line up with the line
  const x = (i: number) => ((i + 0.5) / Math.max(points.length, 1)) * W;
  const y = (rate: number) => H - (rate / yMax) * H;
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.rate).toFixed(1)}`).join(" ");
  const area = points.length ? `${line} L ${x(points.length - 1)} ${H} L ${x(0)} ${H} Z` : "";

  const latest = data?.latest_rate ?? null;
  const prev = data?.previous_rate ?? null;
  const delta = latest !== null && prev !== null ? latest - prev : null;
  const hovered = hover !== null ? points[hover] : null;
  const labelEvery = Math.max(1, Math.ceil(points.length / (compact ? 6 : 12)));

  return (
    <div className={cn("flex h-full flex-col", className)}>
      <div className="flex flex-col justify-between gap-2 border-b border-border/60 pb-3 sm:flex-row sm:items-center">
        <div>
          <h3 className="font-heading text-base font-bold text-foreground">No-Show Trend Dynamics</h3>
          <p className="text-[11px] text-muted-foreground">
            Observed no-show rate · {data?.sample_size.toLocaleString() ?? 0} recorded outcomes
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PillTabs<TrendGranularity>
            tabs={[
              { id: "day", label: "Day" },
              { id: "week", label: "Week" },
              { id: "month", label: "Month" },
              { id: "year", label: "Year" },
            ]}
            activeTab={granularity}
            onChange={change}
            size="sm"
          />
          {compact && (
            <Link
              href="/analytics/trends"
              aria-label="Open full trend analysis"
              className="flex size-7 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ArrowUpRight className="size-3.5" />
            </Link>
          )}
        </div>
      </div>

      {failed ? (
        <p className="py-10 text-center text-xs text-muted-foreground">Couldn’t load the trend. Try another range.</p>
      ) : !enough ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 py-10 text-center">
          <p className="text-xs font-semibold text-foreground">Not enough recorded outcomes yet</p>
          <p className="max-w-xs text-[11px] text-muted-foreground">
            The trend appears once attended / no-show outcomes are recorded for at least two {PERIOD_NOUN[granularity]}s.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-baseline gap-2.5">
            <span className="font-rounded text-3xl font-extrabold tabular-nums text-foreground">
              {latest !== null ? `${latest.toFixed(1)}%` : "—"}
            </span>
            {delta !== null && (
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-bold",
                  delta <= 0
                    ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400"
                    : "bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400"
                )}
              >
                {delta <= 0 ? "↓" : "↑"} {Math.abs(delta).toFixed(1)} pts vs previous {PERIOD_NOUN[granularity]}
              </span>
            )}
            <span className="text-[11px] text-muted-foreground">
              latest complete {PERIOD_NOUN[granularity]}
              {data?.baseline_rate != null && ` · overall average ${data.baseline_rate.toFixed(1)}%`}
            </span>
          </div>

          <div className={cn("relative mt-3 w-full", compact ? "h-[140px]" : "h-[260px]", pending && "opacity-60 transition-opacity")}>
            {/* gridlines + y labels */}
            {[0, 0.5, 1].map((f) => (
              <div key={f} className="absolute inset-x-0 border-t border-dashed border-border/60" style={{ top: `${(1 - f) * 100}%` }}>
                <span className="absolute -top-2 left-0 bg-card pr-1 text-[9px] text-muted-foreground">{Math.round(yMax * f)}%</span>
              </div>
            ))}
            <svg className="h-full w-full overflow-visible" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
              <defs>
                <linearGradient id="trendArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8B7CF6" stopOpacity="0.28" />
                  <stop offset="100%" stopColor="#8B7CF6" stopOpacity="0" />
                </linearGradient>
              </defs>
              {data?.baseline_rate != null && (
                <line x1="0" x2={W} y1={y(data.baseline_rate)} y2={y(data.baseline_rate)} stroke="#8C8CA1" strokeWidth="1.25" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
              )}
              <path d={area} fill="url(#trendArea)" />
              <path d={line} fill="none" stroke="#8B7CF6" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            </svg>

            {/* hover columns */}
            <div className="absolute inset-0 flex">
              {points.map((p, i) => (
                <div
                  key={p.period}
                  className="relative h-full flex-1"
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                >
                  {(hover === i || (!compact && points.length <= 14)) && (
                    <span
                      className={cn(
                        "absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#8B7CF6] shadow",
                        p.partial && "bg-transparent border-[#8B7CF6]"
                      )}
                      style={{ left: "50%", top: `${(y(p.rate) / H) * 100}%` }}
                    />
                  )}
                </div>
              ))}
            </div>

            {hovered && hover !== null && (
              <div
                className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg bg-[#171725] px-2.5 py-1.5 text-[10px] text-white shadow-lg dark:bg-white dark:text-[#171725]"
                style={{ left: `${((hover + 0.5) / points.length) * 100}%`, top: `calc(${(y(hovered.rate) / H) * 100}% - 10px)` }}
              >
                <div className="font-bold">
                  {hovered.rate.toFixed(1)}% · {hovered.label}
                  {hovered.partial && " (in progress)"}
                </div>
                <div className="opacity-80">
                  {hovered.no_shows} of {hovered.total} appointments
                </div>
              </div>
            )}
          </div>

          <div className="mt-1 flex px-0 text-[10px] font-medium text-muted-foreground">
            {points.map((p, i) => (
              <span key={p.period} className="flex-1 text-center">
                {i % labelEvery === 0 ? p.label : ""}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
