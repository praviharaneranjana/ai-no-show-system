import React, { isValidElement, type ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { ChipDelta } from "@/components/chip-delta";
import { Sparkline } from "@/components/sparkline";

export interface StatCardProps {
  label?: string;
  title?: string;
  value: string | number;
  subvalue?: string;
  delta?: string | { value: string; isPositive?: boolean };
  deltaDirection?: "up" | "down" | "neutral";
  icon: React.ElementType | ReactNode;
  iconBg?: string;
  chartType?: "sparkline" | "bars" | "none";
  sparklineData?: number[];
  barValues?: number[];
  /** Makes the whole card a link to the screen that explains the number. */
  href?: string;
  className?: string;
}

export function StatCard({
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
}: StatCardProps) {
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

  // Determine effective chart type
  // Charts only render from real data passed in by the caller — never a placeholder series.
  const effectiveChartType =
    chartType ??
    (sparklineData && sparklineData.length > 1
      ? "sparkline"
      : barValues && barValues.length > 0
      ? "bars"
      : "none");

  // Render icon whether it's a Component function or a JSX element
  const renderIcon = () => {
    if (isValidElement(icon)) {
      return icon;
    }
    if (typeof icon === "function" || (typeof icon === "object" && icon !== null)) {
      const IconComponent = icon as React.ElementType;
      return <IconComponent className="size-5" />;
    }
    return null;
  };

  const cardClass = cn(
    "group flex items-center justify-between rounded-[22px] border border-border bg-card p-5 text-card-foreground bento-card-shadow transition-all duration-200 hover:-translate-y-0.5",
    href && "cursor-pointer hover:border-[#8B7CF6]/50 focus-visible:outline-2 focus-visible:outline-[#8B7CF6]",
    className
  );
  const content = (
    <>
      <div className="flex items-center gap-4">
        {/* Dark round icon circle (Dropify reference) */}
        <div
          className={cn(
            "flex size-12 shrink-0 items-center justify-center rounded-full bg-[#171725] text-white shadow-sm transition-transform duration-200 group-hover:scale-105 dark:bg-white dark:text-[#171725]",
            iconBg
          )}
        >
          {renderIcon()}
        </div>

        <div className="flex flex-col">
          <span className="text-xs font-semibold text-muted-foreground leading-tight">
            {displayLabel}
          </span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-rounded text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground tabular-nums">
              {value}
            </span>
            {subvalue && (
              <span className="text-xs font-semibold text-muted-foreground">
                {subvalue}
              </span>
            )}
            {deltaStr && (
              <ChipDelta value={deltaStr} direction={computedDirection} />
            )}
          </div>
        </div>
      </div>

      {/* Right mini chart */}
      {effectiveChartType === "sparkline" && sparklineData && sparklineData.length > 1 && (
        <Sparkline data={sparklineData} />
      )}

      {effectiveChartType === "bars" && barValues && barValues.length > 0 && (
        <div className="flex items-end gap-1.5 h-10 px-1 shrink-0" aria-hidden="true">
          {barValues.slice(-6).map((val, idx, arr) => {
            const isLast = idx === arr.length - 1;
            const heightPct = Math.max(Math.min(val, 100), 15);
            return (
              <div
                key={idx}
                className={cn(
                  "w-1.5 rounded-full transition-all duration-500",
                  isLast
                    ? "bg-[#8B7CF6]"
                    : "bg-[#EDE9FE] dark:bg-[#333348]"
                )}
                style={{ height: `${heightPct}%` }}
              />
            );
          })}
        </div>
      )}
    </>
  );

  return href ? (
    <Link href={href} className={cardClass}>
      {content}
    </Link>
  ) : (
    <div className={cardClass}>{content}</div>
  );
}
