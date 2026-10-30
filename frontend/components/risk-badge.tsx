import { riskPctLabel } from "@/lib/risk-display";
import { AlertTriangle, AlertCircle, CheckCircle2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { RiskCategory } from "@/lib/types";

const STYLES: Record<RiskCategory, string> = {
  Low: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-500/40 dark:text-emerald-300 font-medium",
  Medium: "border-amber-500/35 bg-amber-500/10 text-amber-800 dark:bg-amber-950/40 dark:border-amber-500/40 dark:text-amber-300 font-medium",
  High: "border-red-500/40 bg-red-500/15 text-red-700 dark:bg-red-950/50 dark:border-red-500/50 dark:text-red-300 font-semibold shadow-xs",
};

const ICONS: Record<RiskCategory, React.ComponentType<{ className?: string }>> = {
  Low: CheckCircle2,
  Medium: AlertCircle,
  High: AlertTriangle,
};

interface RiskBadgeProps {
  category: RiskCategory;
  score?: number;
  size?: "sm" | "default" | "lg";
  showIcon?: boolean;
  className?: string;
}

export function RiskBadge({
  category,
  score,
  size = "default",
  showIcon = true,
  className,
}: RiskBadgeProps) {
  const Icon = ICONS[category];
  
  const sizeClasses = {
    sm: "h-5 px-1.5 text-[11px] gap-1",
    default: "h-6 px-2.5 text-xs gap-1.5",
    lg: "h-7 px-3 text-sm gap-1.5",
  };

  const iconSizes = {
    sm: "size-3",
    default: "size-3.5",
    lg: "size-4",
  };

  return (
    <Badge
      variant="outline"
      className={cn(
        STYLES[category],
        sizeClasses[size],
        "inline-flex items-center transition-all",
        className
      )}
    >
      {showIcon && <Icon className={cn("shrink-0", iconSizes[size])} />}
      <span>{category} risk</span>
      {typeof score === "number" && (
        <span className="ml-0.5 opacity-90 tabular-nums">
          ({riskPctLabel(score)})
        </span>
      )}
    </Badge>
  );
}
