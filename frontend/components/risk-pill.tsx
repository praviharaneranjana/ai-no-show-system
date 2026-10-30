import { cn } from "@/lib/utils";
import type { RiskCategory } from "@/lib/types";
import { riskPctLabel } from "@/lib/risk-display";

interface RiskPillProps {
  category: RiskCategory;
  score?: number; // 0 to 1
  size?: "sm" | "default" | "lg";
  className?: string;
}

export function RiskPill({
  category,
  score,
  size = "default",
  className,
}: RiskPillProps) {
  const percentage = score !== undefined ? riskPctLabel(score) : null;

  const sizeClasses = {
    sm: "px-2 py-0.5 text-[10px]",
    default: "px-2.5 py-1 text-xs",
    lg: "px-3.5 py-1.5 text-sm",
  }[size];

  const categoryStyles = {
    High: "bg-[#FFE4E6] text-[#E11D48] dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200/50 dark:border-rose-900/40",
    Medium: "bg-[#FEF3C7] text-[#D97706] dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200/50 dark:border-amber-900/40",
    Low: "bg-[#DCFCE7] text-[#16A34A] dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200/50 dark:border-emerald-900/40",
  }[category];

  const dotColor = {
    High: "bg-[#E11D48] dark:bg-rose-400",
    Medium: "bg-[#D97706] dark:bg-amber-400",
    Low: "bg-[#16A34A] dark:bg-emerald-400",
  }[category];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-bold leading-none tracking-tight shrink-0",
        sizeClasses,
        categoryStyles,
        className
      )}
    >
      <span className={cn("size-1.5 rounded-full shrink-0", dotColor)} />
      <span>
        {percentage !== null ? `${percentage} ` : ""}
        {category}
      </span>
    </span>
  );
}
