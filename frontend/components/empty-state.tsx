import { type ReactNode } from "react";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  title = "No records found",
  description = "There are currently no items to display.",
  icon,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-[22px] border border-border/80 bg-card p-8 text-center bento-card-shadow",
        className
      )}
    >
      <div className="flex size-12 items-center justify-center rounded-full bg-[#F3F3F7] text-muted-foreground dark:bg-[#252538] mb-3">
        {icon || <Inbox className="size-6 text-muted-foreground" />}
      </div>
      <h3 className="font-bold text-sm text-foreground">{title}</h3>
      <p className="mt-1 max-w-xs text-xs text-muted-foreground">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
