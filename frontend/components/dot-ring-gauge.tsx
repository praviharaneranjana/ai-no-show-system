import { cn } from "@/lib/utils";
import type { RiskCategory } from "@/lib/types";

interface DotRingGaugeProps {
  score: number; // 0 to 1
  category?: RiskCategory;
  size?: number; // width/height
  dotCount?: number;
  showLabel?: boolean;
  className?: string;
}

export function DotRingGauge({
  score,
  category = "High",
  size = 150,
  dotCount = 28,
  showLabel = true,
  className,
}: DotRingGaugeProps) {
  const percentage = Math.round(Math.min(Math.max(score, 0), 1) * 100);
  const activeDots = Math.round((percentage / 100) * dotCount);

  // Derive points around circle
  const radius = (size / 2) - 16;
  const center = size / 2;

  const dots = Array.from({ length: dotCount }).map((_, i) => {
    // Start angle at top (-90 deg), sweep 360 deg
    const angle = ((i / dotCount) * 360 - 90) * (Math.PI / 180);
    const x = center + radius * Math.cos(angle);
    const y = center + radius * Math.sin(angle);
    const isActive = i < activeDots;
    return { x, y, isActive, index: i };
  });

  const categoryColor =
    category === "High"
      ? "text-[#E11D48] bg-[#FFE4E6] dark:text-rose-300 dark:bg-rose-950/40"
      : category === "Medium"
      ? "text-[#D97706] bg-[#FEF3C7] dark:text-amber-300 dark:bg-amber-950/40"
      : "text-[#16A34A] bg-[#DCFCE7] dark:text-emerald-300 dark:bg-emerald-950/40";

  return (
    <div className={cn("relative inline-flex flex-col items-center justify-center", className)}>
      <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="overflow-visible">
          {dots.map((d) => (
            <circle
              key={d.index}
              cx={d.x}
              cy={d.y}
              r={d.isActive ? 3.5 : 2.5}
              className={cn(
                "transition-all duration-500",
                d.isActive
                  ? "fill-[#8B7CF6]"
                  : "fill-[#EAE8F8] dark:fill-[#2D2D42]"
              )}
            />
          ))}
        </svg>

        {/* Center score & badge */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="font-rounded text-3xl font-extrabold tracking-tight text-foreground tabular-nums">
            {percentage}%
          </span>
          {showLabel && (
            <span
              className={cn(
                "mt-0.5 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider",
                categoryColor
              )}
            >
              {category} Risk
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
