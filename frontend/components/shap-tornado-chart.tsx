import { TrendingUp, TrendingDown, Info } from "lucide-react";
import { cn, formatOddsMultiplier } from "@/lib/utils";
import type { FeatureContribution } from "@/lib/types";
import { formatFeatureLabel } from "@/components/shap-driver-bars";

interface ShapTornadoChartProps {
  contributions: FeatureContribution[];
  className?: string;
}

export function formatFeature(feature: string, value: number | string | boolean): { title: string; subtitle: string } {
  const { label, formattedVal } = formatFeatureLabel(feature, value);
  return { title: label, subtitle: formattedVal };
}

export function ShapTornadoChart({
  contributions,
  className,
}: ShapTornadoChartProps) {
  if (!contributions || contributions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center text-xs text-muted-foreground rounded-2xl bg-muted/20">
        <Info className="size-6 text-muted-foreground mb-2" />
        <span>No feature explanations available for this prediction.</span>
      </div>
    );
  }

  // Sort by absolute magnitude of contribution
  const sorted = [...contributions].sort(
    (a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)
  );

  const maxAbs = Math.max(...sorted.map((c) => Math.abs(c.contribution)), 0.05);

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-center justify-between text-[11px] text-muted-foreground pb-2 border-b border-border/60">
        <span className="flex items-center gap-1 text-[#16A34A] font-bold">
          <TrendingDown className="size-3" /> Lowers Attendance Risk
        </span>
        <span className="flex items-center gap-1 text-[#E11D48] font-bold">
          Pushes Risk Higher <TrendingUp className="size-3" />
        </span>
      </div>

      <div className="flex flex-col gap-3">
        {sorted.slice(0, 6).map((c, idx) => {
          const { title, subtitle } = formatFeature(c.feature, c.value);
          const isPushUp = c.contribution > 0;
          const barWidth = Math.max(Math.min((Math.abs(c.contribution) / maxAbs) * 100, 100), 8);

          return (
            <div key={idx} className="flex flex-col gap-1 text-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-baseline gap-2 truncate max-w-[280px]">
                  <span className="font-bold text-foreground truncate">{title}</span>
                  <span className="text-[11px] text-muted-foreground truncate">({subtitle})</span>
                </div>
                <span
                  className={cn(
                    "font-bold font-mono text-[11px] shrink-0",
                    isPushUp ? "text-[#E11D48]" : "text-[#16A34A]"
                  )}
                >
                  {formatOddsMultiplier(c.contribution)}
                </span>
              </div>

              {/* Centered Diverging Tornado Bar */}
              <div className="relative h-2 w-full rounded-full bg-[#F0F0F5] dark:bg-[#252538] overflow-hidden flex items-center">
                {/* Center marker line */}
                <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-border z-10" />

                {isPushUp ? (
                  <div
                    className="h-full bg-[#E11D48] rounded-r-full ml-[50%] transition-all duration-500"
                    style={{ width: `${barWidth / 2}%` }}
                  />
                ) : (
                  <div
                    className="h-full bg-[#16A34A] rounded-l-full ml-auto mr-[50%] transition-all duration-500"
                    style={{ width: `${barWidth / 2}%` }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
