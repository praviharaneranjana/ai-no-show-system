import { FlaskConical } from "lucide-react";

export function SyntheticBadgeStatic({ className = "" }: { className?: string }) {
  return (
    <span
      title="These figures are computed from synthetic data (data_source = 'synthetic'), not real hospital records."
      className={`inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300 ${className}`}
    >
      <FlaskConical className="size-3" /> Synthetic data
    </span>
  );
}
