import { getDataSourceInfo } from "@/lib/api";
import { isRedirectError } from "@/lib/errors";
import { SyntheticBadgeStatic } from "@/components/synthetic-badge-static";

export { SyntheticBadgeStatic };

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
