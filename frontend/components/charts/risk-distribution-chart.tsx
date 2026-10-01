import { cn } from "@/lib/utils";
import type { RiskCategory } from "@/lib/types";

interface RiskDistributionChartProps {
  counts: Record<RiskCategory, number>;
  total: number;
  className?: string;
}

export function RiskDistributionChart({
  counts,
  total,
  className,
}: RiskDistributionChartProps) {
  if (total === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-xs text-muted-foreground">
        No prediction data available yet.
      </div>
    );
  }

  const highPct = (counts.High / total) * 100;
  const medPct = (counts.Medium / total) * 100;
  const lowPct = (counts.Low / total) * 100;

  // SVG Donut calculation
  const size = 160;
  const strokeWidth = 22;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  // Calculate stroke dashoffsets
  const highOffset = 0;
  const highDash = (highPct / 100) * circumference;

  const medOffset = -highDash;
  const medDash = (medPct / 100) * circumference;

  const lowOffset = -(highDash + medDash);
  const lowDash = (lowPct / 100) * circumference;

  return (
    <div className={cn("flex flex-col sm:flex-row items-center justify-between gap-6", className)}>
      {/* Donut graphic */}
      <div className="relative flex items-center justify-center shrink-0">
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="-rotate-90"
        >
          {/* Background Track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="transparent"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-muted/50"
          />

          {/* High Risk Segment (Red) */}
          {highPct > 0 && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="transparent"
              stroke="#ef4444"
              strokeWidth={strokeWidth}
              strokeDasharray={`${highDash} ${circumference}`}
              strokeDashoffset={highOffset}
              className="transition-all duration-500"
            />
          )}

          {/* Medium Risk Segment (Amber) */}
          {medPct > 0 && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="transparent"
              stroke="#f59e0b"
              strokeWidth={strokeWidth}
              strokeDasharray={`${medDash} ${circumference}`}
              strokeDashoffset={medOffset}
              className="transition-all duration-500"
            />
          )}

          {/* Low Risk Segment (Emerald) */}
          {lowPct > 0 && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="transparent"
              stroke="#10b981"
              strokeWidth={strokeWidth}
              strokeDasharray={`${lowDash} ${circumference}`}
              strokeDashoffset={lowOffset}
              className="transition-all duration-500"
            />
          )}
        </svg>

        {/* Center label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-2xl font-bold tracking-tight tabular-nums text-foreground">
            {total}
          </span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Assessed
          </span>
        </div>
      </div>

      {/* Legend & Breakdown */}
      <div className="flex flex-1 flex-col gap-3 w-full">
        {/* High Risk */}
        <div className="flex items-center justify-between rounded-lg border border-red-500/20 bg-red-500/[0.04] px-3 py-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="size-2.5 rounded-full bg-red-500 shrink-0" />
            <div className="flex flex-col">
              <span className="font-semibold text-red-700 dark:text-red-300">
                High Risk (≥27%)
              </span>
              <span className="text-[10px] text-muted-foreground">
                Requires direct call & rescheduling outreach
              </span>
            </div>
          </div>
          <div className="text-right">
            <span className="font-bold tabular-nums text-red-700 dark:text-red-300">
              {counts.High}
            </span>
            <span className="ml-1 text-[11px] text-muted-foreground tabular-nums">
              ({highPct.toFixed(0)}%)
            </span>
          </div>
        </div>

        {/* Medium Risk */}
        <div className="flex items-center justify-between rounded-lg border border-amber-500/20 bg-amber-500/[0.04] px-3 py-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="size-2.5 rounded-full bg-amber-500 shrink-0" />
            <div className="flex flex-col">
              <span className="font-semibold text-amber-700 dark:text-amber-300">
                Medium Risk (17–26%)
              </span>
              <span className="text-[10px] text-muted-foreground">
                Requires SMS + Email reminder 48h prior
              </span>
            </div>
          </div>
          <div className="text-right">
            <span className="font-bold tabular-nums text-amber-700 dark:text-amber-300">
              {counts.Medium}
            </span>
            <span className="ml-1 text-[11px] text-muted-foreground tabular-nums">
              ({medPct.toFixed(0)}%)
            </span>
          </div>
        </div>

        {/* Low Risk */}
        <div className="flex items-center justify-between rounded-lg border border-emerald-500/20 bg-emerald-500/[0.04] px-3 py-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="size-2.5 rounded-full bg-emerald-500 shrink-0" />
            <div className="flex flex-col">
              <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                Low Risk (&lt;17%)
              </span>
              <span className="text-[10px] text-muted-foreground">
                Standard automated reminder is sufficient
              </span>
            </div>
          </div>
          <div className="text-right">
            <span className="font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
              {counts.Low}
            </span>
            <span className="ml-1 text-[11px] text-muted-foreground tabular-nums">
              ({lowPct.toFixed(0)}%)
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
