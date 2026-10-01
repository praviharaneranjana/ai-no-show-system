export default function AnalyticsLoading() {
  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8 animate-pulse max-w-[1400px] mx-auto">
      {/* Header Skeleton */}
      <div className="flex flex-col md:flex-row justify-between gap-4 pb-2 border-b border-border/40">
        <div className="space-y-2">
          <div className="h-8 w-64 rounded-lg bg-muted/60" />
          <div className="h-4 w-96 rounded-lg bg-muted/40" />
        </div>
        <div className="h-9 w-60 rounded-full bg-muted/40" />
      </div>

      {/* 5 KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-28 rounded-[22px] bg-muted/50 p-4" />
        ))}
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="h-80 rounded-[24px] bg-muted/40" />
        <div className="h-80 rounded-[24px] bg-muted/40" />
      </div>
    </div>
  );
}
