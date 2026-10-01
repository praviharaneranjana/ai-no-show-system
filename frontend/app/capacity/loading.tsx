export default function CapacityLoading() {
  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8 animate-pulse max-w-[1400px] mx-auto">
      {/* Header Skeleton */}
      <div className="flex flex-col sm:flex-row justify-between gap-4 pb-2 border-b border-border/40">
        <div className="space-y-2">
          <div className="h-8 w-64 rounded-lg bg-muted/60" />
          <div className="h-4 w-96 rounded-lg bg-muted/40" />
        </div>
        <div className="h-10 w-44 rounded-xl bg-muted/50" />
      </div>

      {/* 5 KPI Cards Skeleton */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-28 rounded-[22px] bg-muted/50 p-4" />
        ))}
      </div>

      {/* Main Grid Skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 h-80 rounded-[24px] bg-muted/40" />
        <div className="lg:col-span-4 h-80 rounded-[24px] bg-muted/40" />
      </div>
    </div>
  );
}
