"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Stage {
  id: string;
  label: string;
  description?: string;
}

export interface ProgressStagesProps {
  stages: Stage[];
  currentStageIndex: number;
  onStageClick?: (index: number) => void;
  className?: string;
}

export function ProgressStages({
  stages,
  currentStageIndex,
  onStageClick,
  className,
}: ProgressStagesProps) {
  const currentStage = stages[currentStageIndex] || stages[0];

  return (
    <div className={cn("w-full select-none", className)}>
      {/* Mobile Compact View (< 640px) */}
      <div className="sm:hidden flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs font-medium">
          <span className="text-muted-foreground">
            Step {currentStageIndex + 1} of {stages.length}
          </span>
          <span className="font-semibold text-foreground tracking-tight">
            {currentStage?.label}
          </span>
        </div>
        <div className="h-1.5 w-full bg-secondary/80 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all duration-300 ease-out shadow-[0_0_8px_rgba(16,185,129,0.5)]"
            style={{
              width: `${((currentStageIndex + 1) / stages.length) * 100}%`,
            }}
          />
        </div>
      </div>

      {/* Desktop Horizontal View (>= 640px) */}
      <nav aria-label="Progress" className="hidden sm:block">
        <ol className="flex items-center justify-between w-full">
          {stages.map((stage, idx) => {
            const isCompleted = idx < currentStageIndex;
            const isCurrent = idx === currentStageIndex;
            const isFuture = idx > currentStageIndex;
            const isClickable = isCompleted && onStageClick !== undefined;

            return (
              <li
                key={stage.id}
                className={cn(
                  "relative flex-1 flex flex-col items-center group",
                  idx !== stages.length - 1 && "after:content-[''] after:absolute after:top-4 after:left-[50%] after:w-full after:h-[2px] after:z-0",
                  idx !== stages.length - 1 &&
                    (isCompleted
                      ? "after:bg-emerald-500 dark:after:bg-emerald-600"
                      : "after:bg-border")
                )}
              >
                <button
                  type="button"
                  disabled={!isClickable}
                  onClick={() => isClickable && onStageClick(idx)}
                  className={cn(
                    "relative z-10 flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-all duration-200 outline-none",
                    isCompleted &&
                      "bg-emerald-500 text-white hover:bg-emerald-600 cursor-pointer shadow-sm",
                    isCurrent &&
                      "bg-background text-emerald-600 dark:text-emerald-400 border-2 border-emerald-500 ring-4 ring-emerald-500/20 shadow-[0_0_12px_rgba(16,185,129,0.4)]",
                    isFuture &&
                      "bg-secondary/60 text-muted-foreground border border-border cursor-not-allowed",
                    isClickable && "focus-visible:ring-2 focus-visible:ring-emerald-500"
                  )}
                  aria-current={isCurrent ? "step" : undefined}
                >
                  {isCompleted ? (
                    <Check className="h-4 w-4 stroke-[2.5]" />
                  ) : (
                    <span>{idx + 1}</span>
                  )}
                </button>
                <div className="mt-2 text-center">
                  <span
                    className={cn(
                      "block text-xs font-medium tracking-tight",
                      isCurrent && "font-semibold text-emerald-600 dark:text-emerald-400",
                      isCompleted && "text-foreground",
                      isFuture && "text-muted-foreground"
                    )}
                  >
                    {stage.label}
                  </span>
                  {stage.description && (
                    <span className="hidden md:block text-[10px] text-muted-foreground">
                      {stage.description}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </nav>
    </div>
  );
}
