import { Calculator, Sparkles } from "lucide-react";

import { RoiSimulator } from "@/app/simulator/roi-simulator";

export default function SimulatorPage() {
  return (
    <div className="flex w-full flex-col gap-6 p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-border/40">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2.5">
            <div className="size-9 rounded-xl bg-gradient-to-tr from-[#8B7CF6] to-[#5B7CFA] flex items-center justify-center text-white shadow-xs">
              <Calculator className="size-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                Executive ROI & What-If Simulator
              </h1>
            </div>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Adjust clinic scale and intervention parameters to model financial upside for hospital leadership.
          </p>
        </div>

        <div className="inline-flex items-center gap-2 self-start md:self-auto px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium">
          <Sparkles className="size-3.5" />
          <span>Parametric Economic Model · Currency in LKR</span>
        </div>
      </div>

      <RoiSimulator />
    </div>
  );
}
