import { riskPctLabel } from "@/lib/risk-display";
import { cn } from "@/lib/utils";
import type { RiskCategory } from "@/lib/types";

interface RiskGaugeProps {
  score: number; // 0 to 1
  category: RiskCategory;
  size?: "sm" | "default" | "lg";
  showLabel?: boolean;
  className?: string;
}

export function RiskGauge({
  score,
  category,
  size = "default",
  showLabel = true,
  className,
}: RiskGaugeProps) {
  const percentage = Math.round(Math.min(Math.max(score, 0), 1) * 100);

  // Colors per category
  const strokeColor =
    category === "High"
      ? "stroke-red-500 text-red-600 dark:text-red-400"
      : category === "Medium"
      ? "stroke-amber-500 text-amber-600 dark:text-amber-400"
      : "stroke-emerald-500 text-emerald-600 dark:text-emerald-400";

  const glowColor =
    category === "High"
      ? "from-red-500/10 to-transparent"
      : category === "Medium"
      ? "from-amber-500/10 to-transparent"
      : "from-emerald-500/10 to-transparent";

  const config = {
    sm: { dimension: 70, strokeWidth: 6, radius: 28, fontSize: "text-base", subSize: "text-[10px]" },
    default: { dimension: 110, strokeWidth: 8, radius: 44, fontSize: "text-2xl", subSize: "text-xs" },
    lg: { dimension: 140, strokeWidth: 10, radius: 56, fontSize: "text-3xl", subSize: "text-xs" },
  }[size];

  const circumference = 2 * Math.PI * config.radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className={cn("relative inline-flex flex-col items-center justify-center", className)}>
      <div
        className={cn(
          "relative flex items-center justify-center rounded-full bg-radial",
          glowColor
        )}
        style={{ width: config.dimension, height: config.dimension }}
      >
        <svg
          width={config.dimension}
          height={config.dimension}
          viewBox={`0 0 ${config.dimension} ${config.dimension}`}
          className="-rotate-90"
        >
          {/* Track */}
          <circle
            cx={config.dimension / 2}
            cy={config.dimension / 2}
            r={config.radius}
            fill="transparent"
            stroke="currentColor"
            strokeWidth={config.strokeWidth}
            className="text-muted/60"
          />
          {/* Progress */}
          <circle
            cx={config.dimension / 2}
            cy={config.dimension / 2}
            r={config.radius}
            fill="transparent"
            strokeWidth={config.strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className={cn("transition-all duration-700 ease-out", strokeColor)}
          />
        </svg>

        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className={cn("font-bold tracking-tight tabular-nums", config.fontSize, strokeColor)}>
            {riskPctLabel(score)}
          </span>
          {showLabel && size !== "sm" && (
            <span className={cn("font-medium uppercase tracking-wider text-muted-foreground", config.subSize)}>
              Risk
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
