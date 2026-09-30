import Link from "next/link";
import { AlertCircle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface ErrorCardProps {
  title?: string;
  message?: string;
  checklist?: string[];
  retryHref?: string;
  className?: string;
}

export function ErrorCard({
  title = "Service Temporarily Unavailable",
  message = "Could not reach the core server. Please verify your connection.",
  checklist = [
    "Ensure PostgreSQL is active (brew services start postgresql)",
    "Ensure FastAPI is running (uvicorn app.main:app --reload)",
    "Verify alembic migrations (cd backend && alembic upgrade head)",
  ],
  retryHref,
  className,
}: ErrorCardProps) {
  return (
    <div
      className={cn(
        "rounded-[24px] border border-rose-200 bg-card p-6 bento-card-shadow dark:border-rose-950/60",
        className
      )}
    >
      <div className="flex items-start gap-3.5">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400">
          <AlertCircle className="size-5" />
        </div>
        <div className="flex flex-col flex-1">
          <h3 className="font-bold text-sm text-foreground">{title}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{message}</p>

          {checklist && checklist.length > 0 && (
            <div className="mt-3 rounded-xl bg-[#F9F9FC] p-3 text-[11px] font-mono text-muted-foreground dark:bg-[#1E1E2D] border border-border/60">
              <span className="font-sans font-bold text-foreground block mb-1">
                Diagnostic Checklist:
              </span>
              <ul className="space-y-1">
                {checklist.map((item, idx) => (
                  <li key={idx} className="flex items-center gap-1.5">
                    <span className="text-[#8B7CF6]">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-4 flex items-center gap-3 text-xs">
            {retryHref ? (
              <Button size="sm" variant="outline" nativeButton={false} render={<Link href={retryHref}><RefreshCw className="size-3.5 mr-1" /> Retry</Link>} />
            ) : null}
            <Link href="/setup" className="font-semibold text-[#8B7CF6] hover:underline">
              Desktop Server Settings ›
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
