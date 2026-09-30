import { cn } from "@/lib/utils";

interface RingProgressProps {
  value: number; // 0 to 100 or 0 to max
  max?: number;
  label?: string;
  sublabel?: string;
  size?: number; // diameter in px
  strokeWidth?: number;
  color?: string;
  trackColor?: string;
  className?: string;
}

export function RingProgress({
  value,
  max = 100,
  label,
  sublabel,
  size = 120,
  strokeWidth = 10,
  color = "#8B7CF6",
  trackColor,
  className,
}: RingProgressProps) {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className={cn("relative inline-flex flex-col items-center justify-center", className)}>
      <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="-rotate-90 overflow-visible"
        >
          {/* Background Track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className={cn("text-[#F0F0F5] dark:text-[#252538]", trackColor)}
          />

          {/* Animated Progress Circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-700 ease-out"
          />
        </svg>

        {/* Center label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="font-rounded text-2xl font-extrabold tracking-tight text-foreground tabular-nums">
            {Math.round(percentage)}%
          </span>
          {label && (
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mt-0.5">
              {label}
            </span>
          )}
        </div>
      </div>

      {sublabel && (
        <span className="mt-2 text-xs font-semibold text-muted-foreground">
          {sublabel}
        </span>
      )}
    </div>
  );
}
