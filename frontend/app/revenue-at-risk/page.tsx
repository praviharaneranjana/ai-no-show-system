import Link from "next/link";

import { getRevenueAtRisk } from "@/lib/api";
import { formatLkr } from "@/lib/format";
import { BackendUnreachable } from "@/components/backend-unreachable";
import { BarList } from "@/components/bar-list";
import { PageHeader, Panel } from "@/components/page-header";
import { cn } from "@/lib/utils";

const WINDOWS = [7, 14, 30];

export default async function RevenueAtRiskPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const raw = Number.parseInt((await searchParams).days ?? "7", 10);
  const days = WINDOWS.includes(raw) ? raw : 7;

  let data;
  try {
    data = await getRevenueAtRisk(days);
  } catch (err) {
    return <BackendUnreachable error={err} />;
  }

  const slotValue = data.consultation_fee_lkr * data.ancillary_multiplier;
  const maxDay = Math.max(...data.by_day.map((d) => d.revenue_at_risk_lkr), 1);

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        back={{ href: "/", label: "Dashboard" }}
        title="Revenue at Risk"
        subtitle={`Expected revenue lost to no-shows across the next ${days} days, from each appointment’s predicted risk`}
        actions={
          <div className="flex gap-1.5 rounded-lg bg-muted/60 p-1">
            {WINDOWS.map((w) => (
              <Link
                key={w}
                href={`/revenue-at-risk?days=${w}`}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium",
                  w === days ? "bg-background font-semibold text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {w} days
              </Link>
            ))}
          </div>
        }
      />

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {[
          { label: "Revenue at risk", value: formatLkr(data.revenue_at_risk_lkr), sub: `Rs. ${data.revenue_at_risk_lkr.toLocaleString()}` },
          { label: "Expected no-shows", value: data.expected_no_shows.toFixed(1), sub: `of ${data.total_appointments} booked appointments` },
          { label: "Value of one slot", value: `Rs. ${slotValue.toLocaleString()}`, sub: `Rs. ${data.consultation_fee_lkr.toLocaleString()} fee × ${data.ancillary_multiplier} ancillary` },
        ].map((k) => (
          <div key={k.label} className="rounded-[22px] border border-border bg-card p-5 bento-card-shadow">
            <p className="text-xs font-semibold text-muted-foreground">{k.label}</p>
            <p className="mt-1 font-rounded text-3xl font-extrabold tabular-nums text-foreground">{k.value}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{k.sub}</p>
          </div>
        ))}
      </section>

      <Panel title="By day" subtitle="Expected revenue at risk per appointment day">
        {data.total_appointments === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">No upcoming appointments in this window.</p>
        ) : (
          <div className="flex h-44 items-end gap-1.5">
            {data.by_day.map((d) => (
              <div key={d.key} className="group relative flex h-full flex-1 flex-col items-center justify-end gap-1">
                <div
                  className="w-full max-w-10 rounded-t-md bg-[#8B7CF6]/80 transition-colors group-hover:bg-[#8B7CF6]"
                  style={{ height: `${Math.max((d.revenue_at_risk_lkr / maxDay) * 100, d.revenue_at_risk_lkr > 0 ? 3 : 0)}%` }}
                  title={`${d.key}: ${formatLkr(d.revenue_at_risk_lkr)} (${d.appointments} appts)`}
                />
                <span className="text-[9px] text-muted-foreground">{d.key.slice(5)}</span>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="By department">
          <BarList
            rows={data.by_department.map((b) => ({ key: b.key, value: b.revenue_at_risk_lkr, hint: `${b.expected_no_shows.toFixed(1)} no-shows` }))}
            format={formatLkr}
          />
        </Panel>
        <Panel title="By doctor" subtitle="Top 15">
          <BarList
            rows={data.by_doctor.map((b) => ({ key: b.key, value: b.revenue_at_risk_lkr, hint: `${b.appointments} booked` }))}
            format={formatLkr}
            barClass="bg-[#5B7CFA]"
          />
        </Panel>
      </div>

      <Panel title="How this is calculated">
        <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
          <li>Each upcoming appointment has a calibrated no-show probability from the SHAI model.</li>
          <li>Expected no-shows = the sum of those probabilities over the window (not a count of “high risk” patients).</li>
          <li>
            Revenue at risk = expected no-shows × slot value (Rs. {data.consultation_fee_lkr.toLocaleString()} consultation fee × {data.ancillary_multiplier} for ancillary
            revenue — the same assumptions as the <Link href="/simulator" className="font-semibold text-[#8B7CF6] hover:underline">ROI Simulator</Link>).
          </li>
        </ul>
      </Panel>
    </div>
  );
}
