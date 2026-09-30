"use client";

import { useState } from "react";
import { PillTabs } from "@/components/pill-tabs";

interface NoShowTrendChartProps {
  observedRate?: number | null;
  className?: string;
}

type Period = "day" | "week" | "month" | "year";

export function NoShowTrendChart({
  observedRate,
  className,
}: NoShowTrendChartProps) {
  const [period, setPeriod] = useState<Period>("month");

  const displayRate =
    observedRate !== null && observedRate !== undefined
      ? `${observedRate.toFixed(1)}%`
      : "15.9%";

  // Sample data points across months (Sri Lankan outpatient clinic attendance trends)
  const monthData = [
    { label: "May", rate: 18.2 },
    { label: "Jun", rate: 17.0 },
    { label: "Jul", rate: 19.5 },
    { label: "Aug", rate: 14.8 },
    { label: "Sep", rate: 16.4 },
    { label: "Oct", rate: 15.9 },
  ];

  return (
    <div className={className}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-border/60">
        <div>
          <h3 className="font-heading text-base font-bold text-foreground">
            No-Show Trend Dynamics
          </h3>
          <p className="text-[11px] text-muted-foreground">
            Historical observed attendance variation
          </p>
        </div>

        <PillTabs<Period>
          tabs={[
            { id: "day", label: "Day" },
            { id: "week", label: "Week" },
            { id: "month", label: "Month" },
            { id: "year", label: "Year" },
          ]}
          activeTab={period}
          onChange={setPeriod}
          size="sm"
        />
      </div>

      {/* Main Metric Highlight (Peymen $234.2 style) */}
      <div className="flex items-baseline gap-2.5 mt-3">
        <span className="font-rounded text-3xl font-extrabold text-foreground tabular-nums">
          {displayRate}
        </span>
        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
          ↓ 2.4% vs last cycle
        </span>
      </div>

      {/* Smooth Area Line Chart with Highlighted Point & Vertical Drop-Line (Peymen reference) */}
      <div className="relative w-full h-[140px] mt-2">
        <svg
          className="w-full h-full overflow-visible"
          viewBox="0 0 500 130"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8B7CF6" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#8B7CF6" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Area Fill */}
          <path
            d="M 0 100 Q 60 40, 120 70 T 240 30 T 340 85 T 440 20 L 500 45 L 500 130 L 0 130 Z"
            fill="url(#areaGrad)"
          />

          {/* Smooth Stroke Line */}
          <path
            d="M 0 100 Q 60 40, 120 70 T 240 30 T 340 85 T 440 20 L 500 45"
            fill="none"
            stroke="#8B7CF6"
            strokeWidth="3.5"
            strokeLinecap="round"
          />

          {/* Single Highlighted Point at x=340 with vertical dashed drop-line (Peymen style) */}
          <line
            x1="340"
            y1="85"
            x2="340"
            y2="130"
            stroke="#8B7CF6"
            strokeWidth="1.5"
            strokeDasharray="3,3"
          />
          <circle cx="340" cy="85" r="7" fill="white" stroke="#8B7CF6" strokeWidth="3.5" />
          <circle cx="340" cy="85" r="3" fill="#8B7CF6" />
        </svg>

        {/* Highlight Tag Tooltip */}
        <div className="absolute left-[68%] top-[55%] -translate-x-1/2 -translate-y-full rounded-md bg-[#171725] px-2 py-0.5 text-[9px] font-bold text-white shadow-md dark:bg-white dark:text-[#171725]">
          14.8% (Target)
        </div>
      </div>

      {/* Axis Labels */}
      <div className="flex justify-between text-[11px] font-medium text-muted-foreground px-1 mt-1">
        {monthData.map((m, idx) => (
          <span
            key={m.label}
            className={idx === 4 ? "font-bold text-[#8B7CF6]" : ""}
          >
            {m.label}
          </span>
        ))}
      </div>
    </div>
  );
}
