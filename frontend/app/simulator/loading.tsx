export default function SimulatorLoading() {
  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8 animate-pulse max-w-[1400px] mx-auto">
      {/* Header Skeleton */}
      <div className="flex flex-col sm:flex-row justify-between gap-4 pb-2 border-b border-border/40">
        <div className="space-y-2">
          <div className="h-8 w-72 rounded-lg bg-muted/60" />
          <div className="h-4 w-96 rounded-lg bg-muted/40" />
        </div>
        <div className="h-10 w-48 rounded-xl bg-muted/50" />
      </div>

      {/* Simulator Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 h-[520px] rounded-[24px] bg-muted/40" />
        <div className="lg:col-span-7 h-[520px] rounded-[24px] bg-muted/40" />
      </div>
    </div>
  );
}
