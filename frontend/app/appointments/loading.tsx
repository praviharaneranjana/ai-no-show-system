export default function AppointmentsLoading() {
  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 lg:p-8 animate-pulse max-w-[1400px] mx-auto">
      <div className="flex flex-col gap-2">
        <div className="h-8 w-72 rounded-lg bg-muted/60" />
        <div className="h-4 w-96 rounded-lg bg-muted/40" />
      </div>

      {/* Filter Bar Skeleton */}
      <div className="h-14 w-full rounded-2xl bg-muted/40" />

      {/* Table Skeleton */}
      <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
        <div className="h-12 bg-muted/50 border-b border-border/40" />
        {[1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div key={i} className="h-16 border-b border-border/20 px-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="size-8 rounded-full bg-muted/60" />
              <div className="space-y-1">
                <div className="h-4 w-36 rounded bg-muted/60" />
                <div className="h-3 w-24 rounded bg-muted/40" />
              </div>
            </div>
            <div className="h-6 w-20 rounded-full bg-muted/40" />
          </div>
        ))}
      </div>
    </div>
  );
}
