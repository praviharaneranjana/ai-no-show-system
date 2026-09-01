import { MapPin, Smartphone, Wallet, ArrowRight, Info } from "lucide-react";

import { cn } from "@/lib/utils";
import type { ContextualAdjustment } from "@/lib/types";

function MultiplierBadge({ multiplier }: { multiplier: number }) {
  const pct = Math.round((multiplier - 1) * 100);
  if (pct === 0) {
    return <span className="text-[11px] font-mono text-muted-foreground">neutral</span>;
  }
  return (
    <span
      className={cn(
        "text-[11px] font-mono font-semibold tabular-nums",
        pct > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"
      )}
    >
      {pct > 0 ? "+" : ""}
      {pct}%
    </span>
  );
}

export function ContextualAdjustmentPanel({
  adjustment,
}: {
  adjustment: ContextualAdjustment;
}) {
  const rows = [
    {
      icon: MapPin,
      label: "Travel Distance",
      detail:
        adjustment.distance_km !== null ? `${adjustment.distance_km} km from hospital` : "Not on record",
      multiplier: adjustment.distance_multiplier,
    },
    {
      icon: Smartphone,
      label: "Booking Channel",
      detail: adjustment.booking_channel ?? "Not on record",
      multiplier: adjustment.channel_multiplier,
    },
    {
      icon: Wallet,
      label: "Payment Commitment",
      detail: adjustment.payment_mode ?? "Not on record",
      multiplier: adjustment.payment_multiplier,
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between border-b border-border/60 pb-2 text-xs">
        <span className="font-semibold text-foreground">Contextual Risk Adjustment</span>
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
          rule-based, not ML
        </span>
      </div>

      <div className="flex flex-col gap-2">
        {rows.map((r) => {
          const Icon = r.icon;
          return (
            <div
              key={r.label}
              className="flex items-center justify-between gap-2 rounded-lg border border-border/40 bg-muted/20 p-2.5"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Icon className="size-3.5 text-muted-foreground shrink-0" />
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-medium text-foreground">{r.label}</span>
                  <span className="text-[11px] text-muted-foreground truncate">{r.detail}</span>
                </div>
              </div>
              <MultiplierBadge multiplier={r.multiplier} />
            </div>
          );
        })}
      </div>

      {/* Score bridge: ML base -> final adjusted */}
      <div className="flex items-center justify-center gap-3 rounded-lg bg-muted/30 p-3 text-xs">
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">ML Score</span>
          <span className="font-bold tabular-nums text-foreground">
            {Math.round(adjustment.ml_risk_score * 100)}%
          </span>
        </div>
        <ArrowRight className="size-3.5 text-muted-foreground shrink-0" />
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Combined</span>
          <span className="font-mono text-muted-foreground">×{adjustment.combined_multiplier}</span>
        </div>
        <ArrowRight className="size-3.5 text-muted-foreground shrink-0" />
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-[10px] text-primary uppercase tracking-wide">Final Score</span>
          <span className="font-bold tabular-nums text-primary">
            {Math.round(adjustment.final_risk_score * 100)}%
          </span>
        </div>
      </div>

      <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
        <Info className="size-3.5 shrink-0 mt-0.5" />
        <span>{adjustment.note}</span>
      </div>
    </div>
  );
}
