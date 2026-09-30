import { cn } from "@/lib/utils";

interface ChipDeltaProps {
  value: string | number;
  direction?: "up" | "down" | "neutral";
  variant?: "positive" | "negative" | "neutral";
  className?: string;
}

export function ChipDelta({
  value,
  direction,
  variant,
  className,
}: ChipDeltaProps) {
  // Infer variant from string if not explicitly given
  const isUp = direction === "up" || (typeof value === "string" && (value.includes("↑") || value.startsWith("+")));
  const isDown = direction === "down" || (typeof value === "string" && (value.includes("↓") || value.startsWith("-")));

  const activeVariant =
    variant ||
    (isUp ? "positive" : isDown ? "negative" : "neutral");

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold leading-none tracking-tight",
        activeVariant === "positive" &&
          "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400",
        activeVariant === "negative" &&
          "bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400",
        activeVariant === "neutral" &&
          "bg-muted text-muted-foreground",
        className
      )}
    >
      {value}
    </span>
  );
}
