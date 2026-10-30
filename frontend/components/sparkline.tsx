import { cn } from "@/lib/utils";

interface SparklineProps {
  data?: number[];
  color?: string;
  width?: number;
  height?: number;
  className?: string;
}

export function Sparkline({
  data = [12, 14, 11, 16, 18, 15, 21],
  color = "#8B7CF6",
  width = 80,
  height = 36,
  className,
}: SparklineProps) {
  if (!data || data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const padding = 4;
  const usableWidth = width - padding * 2;
  const usableHeight = height - padding * 2;

  const points = data.map((val, idx) => {
    const x = padding + (idx / (data.length - 1)) * usableWidth;
    const y = height - padding - ((val - min) / range) * usableHeight;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const pathD = `M ${points.join(" L ")}`;
  const lastPoint = points[points.length - 1].split(",");

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      className={cn("overflow-visible shrink-0", className)}
      aria-hidden="true"
    >
      <path
        d={pathD}
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {lastPoint.length === 2 && (
        <circle
          cx={lastPoint[0]}
          cy={lastPoint[1]}
          r="3"
          fill={color}
          className="animate-pulse"
        />
      )}
    </svg>
  );
}
