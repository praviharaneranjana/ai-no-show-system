"use client";

import { useState, type ReactNode } from "react";
import { Bot, ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { Collapse } from "@/components/ui/collapse";

/** The original single-message simulator, kept for demos behind a toggle. */
export function SimulatorPanel({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-[24px] border border-border/60 bg-card p-5 shadow-xs sm:p-6">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full cursor-pointer items-center justify-between gap-3 text-left">
        <span className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Bot className="size-4" />
          </span>
          <span>
            <span className="block text-base font-semibold text-foreground">Message simulator and AI drafts</span>
            <span className="block text-xs text-muted-foreground">Try Sinhala, Tamil or English replies on any appointment, or draft a reminder with AI.</span>
          </span>
        </span>
        <ChevronDown className={cn("size-5 text-muted-foreground transition-transform duration-300", open && "rotate-180")} />
      </button>
      <Collapse open={open}>
        <div className="pt-4">{children}</div>
      </Collapse>
    </div>
  );
}
