"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface SegmentedCardOption {
  value: string;
  title: string;
  subtitle?: string;
  description?: string;
  badge?: string;
  badgeVariant?: "default" | "success" | "warning" | "destructive";
  icon?: React.ReactNode;
  disabled?: boolean;
}

export interface SegmentedCardsProps {
  options: SegmentedCardOption[];
  value?: string;
  onChange: (value: string) => void;
  columns?: 2 | 3 | 4;
  disabled?: boolean;
  className?: string;
}

export function SegmentedCards({
  options,
  value,
  onChange,
  columns = 3,
  disabled = false,
  className,
}: SegmentedCardsProps) {
  const gridColsClass = {
    2: "grid-cols-1 sm:grid-cols-2",
    3: "grid-cols-1 sm:grid-cols-3",
    4: "grid-cols-2 sm:grid-cols-4",
  }[columns];

  return (
    <div
      role="radiogroup"
      className={cn("grid gap-2.5 w-full select-none", gridColsClass, className)}
    >
      {options.map((opt) => {
        const isSelected = opt.value === value;
        const isDisabled = disabled || opt.disabled;

        const badgeColors = {
          default: "bg-secondary text-secondary-foreground",
          success: "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800",
          warning: "bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800",
          destructive: "bg-destructive/10 text-destructive border border-destructive/20",
        }[opt.badgeVariant || "default"];

        return (
          <div
            key={opt.value}
            role="radio"
            aria-checked={isSelected}
            aria-disabled={isDisabled}
            tabIndex={isDisabled ? -1 : 0}
            onClick={() => !isDisabled && onChange(opt.value)}
            onKeyDown={(e) => {
              if (!isDisabled && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault();
                onChange(opt.value);
              }
            }}
            className={cn(
              "relative flex flex-col justify-between p-3 rounded-xl border bg-card text-card-foreground transition-all outline-none",
              !isDisabled && "cursor-pointer hover:border-emerald-500/50 hover:bg-accent/30",
              isSelected &&
                "border-emerald-500 bg-emerald-50/30 dark:bg-emerald-950/20 ring-2 ring-emerald-500/20 shadow-sm",
              isDisabled && "opacity-50 cursor-not-allowed bg-muted/40",
              "focus-visible:ring-2 focus-visible:ring-emerald-500"
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                {opt.icon && (
                  <span className={cn("shrink-0", isSelected ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>
                    {opt.icon}
                  </span>
                )}
                <div>
                  <span className={cn("text-xs sm:text-sm font-semibold tracking-tight", isSelected && "text-emerald-600 dark:text-emerald-400")}>
                    {opt.title}
                  </span>
                  {opt.subtitle && (
                    <span className="block text-[11px] text-muted-foreground">
                      {opt.subtitle}
                    </span>
                  )}
                </div>
              </div>

              {opt.badge && (
                <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0", badgeColors)}>
                  {opt.badge}
                </span>
              )}
            </div>

            {opt.description && (
              <p className="mt-2 text-[11px] text-muted-foreground line-clamp-2">
                {opt.description}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
