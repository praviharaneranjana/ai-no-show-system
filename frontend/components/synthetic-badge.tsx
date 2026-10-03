import { FlaskConical } from "lucide-react";
import { getDataSourceInfo } from "@/lib/api";
import { isRedirectError } from "@/lib/errors";

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

/** Renders only when this hospital's appointments include data_source='synthetic' rows. */
export async function SyntheticBadge({ className }: { className?: string }) {
  try {
    const info = await getDataSourceInfo();
    if (!info.is_synthetic) return null;
  } catch (error) {
    if (isRedirectError(error)) throw error;
    // Unknown data source: stay honest and show the badge.
  }
  return <SyntheticBadgeStatic className={className} />;
}
