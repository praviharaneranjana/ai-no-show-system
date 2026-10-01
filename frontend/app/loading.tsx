export default function DashboardLoading() {
  return (
    <div className="flex w-full flex-col gap-6 p-4 sm:p-6 lg:p-8 animate-pulse max-w-[1400px] mx-auto">
      {/* Top Banner Skeleton */}
      <div className="h-28 w-full rounded-[24px] bg-muted/60" />

      {/* 4 KPI Cards Skeleton */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-32 rounded-[22px] bg-muted/50 p-5 flex flex-col justify-between" />
        ))}
      </div>

      {/* Main Bento Grid Skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 h-96 rounded-[24px] bg-muted/40" />
        <div className="lg:col-span-4 h-96 rounded-[24px] bg-muted/40" />
      </div>
    </div>
  );
}
