import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

// Server-rendered pager. `hrefFor(page)` builds the URL so filters are preserved.
export function Pagination({
  page,
  pageSize,
  total,
  hrefFor,
}: {
  page: number;
  pageSize: number;
  total: number;
  hrefFor: (page: number) => string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const btn = "inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold transition-colors";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
      <span className="tabular-nums">
        Showing <strong className="text-foreground">{from.toLocaleString()}–{to.toLocaleString()}</strong> of {total.toLocaleString()}
      </span>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Link href={hrefFor(page - 1)} className={cn(btn, "hover:bg-muted")}>
            <ChevronLeft className="size-3.5" /> Previous
          </Link>
        ) : (
          <span className={cn(btn, "opacity-40")}><ChevronLeft className="size-3.5" /> Previous</span>
        )}
        <span className="tabular-nums">Page {page} of {pages}</span>
        {page < pages ? (
          <Link href={hrefFor(page + 1)} className={cn(btn, "hover:bg-muted")}>
            Next <ChevronRight className="size-3.5" />
          </Link>
        ) : (
          <span className={cn(btn, "opacity-40")}>Next <ChevronRight className="size-3.5" /></span>
        )}
      </div>
    </div>
  );
}
