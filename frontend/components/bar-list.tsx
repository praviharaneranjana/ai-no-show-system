import { cn } from "@/lib/utils";

// Horizontal bar list (label, bar, value) — the bar length is proportional to `value`.
export function BarList({
  rows,
  format,
  barClass = "bg-[#8B7CF6]",
  empty = "No data for this window.",
}: {
  rows: { key: string; label?: string; value: number; hint?: string }[];
  format: (v: number) => string;
  barClass?: string;
  empty?: string;
}) {
  const max = Math.max(...rows.map((r) => r.value), 0);
  if (rows.length === 0 || max === 0) return <p className="py-6 text-center text-xs text-muted-foreground">{empty}</p>;
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
            <span className="truncate font-semibold text-foreground">{r.label ?? r.key}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {format(r.value)}
              {r.hint && <span className="ml-1.5 text-[10px]">{r.hint}</span>}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className={cn("h-full rounded-full", barClass)} style={{ width: `${Math.max((r.value / max) * 100, 2)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
