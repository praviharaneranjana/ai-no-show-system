import React, { isValidElement, type ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { ChipDelta } from "@/components/chip-delta";
import { Sparkline } from "@/components/sparkline";

export interface SharedKpiCardProps {
  label?: string;
  title?: string;
  value: string | number | null | undefined;
  subvalue?: string | null;
  delta?: string | { value: string; isPositive?: boolean } | null;
  deltaDirection?: "up" | "down" | "neutral";
  icon: React.ElementType | ReactNode;
  iconBg?: string;
  chartType?: "sparkline" | "bars" | "none";
  sparklineData?: number[];
  barValues?: number[];
  href?: string;
  className?: string;
}

export function SharedKpiCard({
  label,
  title,
  value,
  subvalue,
  delta,
  deltaDirection,
  icon,
  iconBg,
  chartType,
  sparklineData,
  barValues,
  href,
  className,
}: SharedKpiCardProps) {
  const displayLabel = label ?? title ?? "";

  // Normalize delta string and direction
  let deltaStr: string | undefined;
  let computedDirection: "up" | "down" | "neutral" | undefined = deltaDirection;

  if (typeof delta === "string") {
    deltaStr = delta;
  } else if (delta && typeof delta === "object") {
    deltaStr = delta.value;
    if (computedDirection === undefined && delta.isPositive !== undefined) {
      computedDirection = delta.isPositive ? "up" : "down";
    }
  }

  // Safe display value (never show literal "undefined" or "NaN")
  const displayValue =
    value === undefined || value === null || (typeof value === "number" && isNaN(value))
      ? "—"
      : String(value);

  // Safe display subvalue (clean out literal "undefined" strings)
  const cleanSubvalue =
    subvalue && !subvalue.includes("undefined") && !subvalue.includes("null")
      ? subvalue
      : undefined;

  const effectiveChartType =
    chartType ??
    (sparklineData && sparklineData.length > 1
      ? "sparkline"
      : barValues && barValues.length > 0
      ? "bars"
      : "none");

  const renderIcon = () => {
    if (isValidElement(icon)) return icon;
    if (typeof icon === "function" || (typeof icon === "object" && icon !== null)) {
      const IconComponent = icon as React.ElementType;
      return <IconComponent className="size-5" />;
    }
    return null;
  };

  const cardClass = cn(
    "group flex flex-col justify-between rounded-[22px] border border-border bg-card p-4 sm:p-5 text-card-foreground bento-card-shadow transition-all duration-200 hover:-translate-y-0.5 min-w-0 overflow-hidden",
    href && "cursor-pointer hover:border-primary/50 focus-visible:outline-2 focus-visible:outline-primary",
    className
  );

  const content = (
    <div className="flex flex-col justify-between h-full gap-3 min-w-0">
      {/* Top Header: Icon & Label */}
      <div className="flex items-center justify-between gap-2 min-w-0">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={cn(
              "flex size-10 sm:size-11 shrink-0 items-center justify-center rounded-xl bg-muted/70 text-foreground border border-border/60 shadow-xs transition-transform duration-200 group-hover:scale-105",
              iconBg
            )}
          >
            {renderIcon()}
          </div>
          <span className="text-xs font-semibold text-muted-foreground truncate leading-tight">
            {displayLabel}
          </span>
        </div>

        {/* Right mini chart */}
        {effectiveChartType === "sparkline" && sparklineData && sparklineData.length > 1 && (
          <div className="shrink-0">
            <Sparkline data={sparklineData} />
          </div>
        )}

        {effectiveChartType === "bars" && barValues && barValues.length > 0 && (
          <div className="flex items-end gap-1 h-8 shrink-0" aria-hidden="true">
            {barValues.slice(-5).map((val, idx, arr) => {
              const isLast = idx === arr.length - 1;
              const heightPct = Math.max(Math.min(val, 100), 20);
              return (
                <div
                  key={idx}
                  className={cn(
                    "w-1 rounded-full transition-all duration-300",
                    isLast ? "bg-primary" : "bg-muted-foreground/30"
                  )}
                  style={{ height: `${heightPct}%` }}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Main Metric & Contextual Meta */}
      <div className="flex flex-col gap-1 min-w-0">
        <div className="font-rounded text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground tabular-nums truncate">
          {displayValue}
        </div>

        {/* Meta / Subvalue and Delta: Cleanly stacked & wrapping */}
        {(cleanSubvalue || deltaStr) && (
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5 text-xs">
            {deltaStr && (
              <ChipDelta value={deltaStr} direction={computedDirection} className="shrink-0 text-[11px]" />
            )}
            {cleanSubvalue && (
              <span className="text-[11px] font-medium text-muted-foreground truncate max-w-full">
                {cleanSubvalue}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return href ? (
    <Link href={href} className={cardClass}>
      {content}
    </Link>
  ) : (
    <div className={cardClass}>{content}</div>
  );
}
