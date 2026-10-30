export default function PredictionsLoading() {
  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8 animate-pulse max-w-[1400px] mx-auto">
      {/* Header Skeleton */}
      <div className="flex flex-col sm:flex-row justify-between gap-4 pb-2 border-b border-border/40">
        <div className="space-y-2">
          <div className="h-8 w-60 rounded-lg bg-muted/60" />
          <div className="h-4 w-80 rounded-lg bg-muted/40" />
        </div>
        <div className="h-10 w-36 rounded-xl bg-muted/50" />
      </div>

      {/* Tiers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-48 rounded-[24px] bg-muted/50 p-5" />
        ))}
      </div>

      {/* Doctor Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-44 rounded-2xl bg-muted/40 p-4" />
        ))}
      </div>
    </div>
  );
}
