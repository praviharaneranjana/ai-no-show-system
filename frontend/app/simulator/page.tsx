import { Calculator } from "lucide-react";

import { RoiSimulator } from "@/app/simulator/roi-simulator";

export default function SimulatorPage() {
  return (
    <div className="flex w-full flex-col gap-6 p-6 lg:p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col gap-1 border-b border-border/80 pb-5">
        <div className="flex items-center gap-2">
          <Calculator className="size-5 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Executive ROI & What-If Simulator
          </h1>
        </div>
        <p className="text-xs sm:text-sm text-muted-foreground">
          Adjust clinic scale and intervention assumptions to model financial recovery for a
          hospital boardroom pitch.{" "}
          <span className="text-muted-foreground/70">
            Illustrative model built on stated assumptions, not audited hospital financials.
          </span>
        </p>
      </div>

      <RoiSimulator />
    </div>
  );
}
