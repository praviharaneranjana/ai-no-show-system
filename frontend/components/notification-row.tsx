import Link from "next/link";
import { AlertTriangle, Clock, MessageSquare, Users } from "lucide-react";

import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/format";
import type { NotificationItem } from "@/lib/types";

const STYLE: Record<NotificationItem["type"], { icon: typeof Clock; cls: string }> = {
  high_risk: { icon: AlertTriangle, cls: "bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400" },
  delay: { icon: Clock, cls: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400" },
  reply: { icon: MessageSquare, cls: "bg-[#EDE9FE] text-[#8B7CF6] dark:bg-[#8B7CF6]/20 dark:text-[#C4B5FD]" },
  waitlist: { icon: Users, cls: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400" },
};

export function NotificationRow({
  item,
  unread,
  onClick,
}: {
  item: NotificationItem;
  unread: boolean;
  onClick?: () => void;
}) {
  const { icon: Icon, cls } = STYLE[item.type];
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className="flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-muted/60"
    >
      <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full", cls)}>
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate text-xs text-foreground", unread ? "font-bold" : "font-medium")}>
          {item.title}
        </span>
        <span className="block truncate text-[11px] text-muted-foreground">{item.detail}</span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1 text-[10px] text-muted-foreground">
        {timeAgo(item.at)}
        {unread && <span className="size-2 rounded-full bg-[#E11D48]" />}
      </span>
    </Link>
  );
}
