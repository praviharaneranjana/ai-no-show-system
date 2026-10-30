import { Suspense } from "react";

import { getNoShowTrend } from "@/lib/api";
import { BackendUnreachable } from "@/components/backend-unreachable";
import { PageHeader } from "@/components/page-header";
import { UrlSelect } from "@/components/url-select";
import { TrendExplorer } from "./trend-explorer";

export default async function TrendsPage({ searchParams }: { searchParams: Promise<{ department?: string; doctor?: string }> }) {
  const { department, doctor } = await searchParams;

  let trend;
  try {
    trend = await getNoShowTrend("month", department, doctor);
  } catch (err) {
    return <BackendUnreachable error={err} />;
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        back={{ href: "/analytics", label: "Analytics" }}
        title="No-Show Trends"
        subtitle="Observed attendance over time — only appointments with a recorded outcome are counted"
        actions={
          <Suspense fallback={null}>
            <div className="flex flex-wrap gap-2.5">
              <UrlSelect param="department" allLabel="All departments" resetParams={["doctor"]} options={trend.departments.map((d) => ({ value: d, label: d }))} />
              <UrlSelect param="doctor" allLabel="All doctors" options={trend.doctors.map((d) => ({ value: d, label: d }))} />
            </div>
          </Suspense>
        }
      />
      {/* keyed so a filter change remounts the chart with fresh server data */}
      <TrendExplorer key={`${department ?? ""}|${doctor ?? ""}`} initial={trend} department={department} doctor={doctor} />
    </div>
  );
}
