import { cn } from "@/lib/utils";
import type { ConversationState } from "@/lib/types";

const COPY: Record<ConversationState, { label: string; cls: string }> = {
  awaiting_reply: { label: "Waiting for reply", cls: "bg-violet-500/15 text-violet-700 dark:text-violet-300" },
  offering: { label: "Slot offered", cls: "bg-violet-500/15 text-violet-700 dark:text-violet-300" },
  choosing_doctor: { label: "Choosing doctor", cls: "bg-violet-500/15 text-violet-700 dark:text-violet-300" },
  pending_approval: { label: "Needs approval", cls: "bg-amber-500/20 text-amber-700 dark:text-amber-300" },
  needs_staff: { label: "Needs a call", cls: "bg-rose-500/15 text-rose-700 dark:text-rose-300" },
  no_reply: { label: "No reply 24h", cls: "bg-rose-500/15 text-rose-700 dark:text-rose-300" },
  booked: { label: "Booked", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  kept: { label: "Attending", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
};

export function StateBadge({ state, className }: { state: ConversationState | null; className?: string }) {
  if (!state) return null;
  const c = COPY[state];
  return <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold", c.cls, className)}>{c.label}</span>;
}
