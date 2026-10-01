import { Suspense } from "react";

import { getGeoPatients } from "@/lib/api";
import { BackendUnreachable } from "@/components/backend-unreachable";
import { PageHeader, Panel } from "@/components/page-header";
import { PatientMap } from "@/components/patient-map";
import { UrlSelect } from "@/components/url-select";
import { TRAVEL_ASSUMPTION } from "@/lib/geo";

const RISKS = ["High", "Medium", "Low"];

export default async function MapPage({
  searchParams,
}: {
  searchParams: Promise<{ risk?: string; department?: string; days_back?: string }>;
}) {
  const sp = await searchParams;
  const risk = RISKS.includes(sp.risk ?? "") ? sp.risk : undefined;
  const parsedDays = Number.parseInt(sp.days_back ?? "45", 10);
  const daysBack = [7, 45, 180, 3650].includes(parsedDays) ? parsedDays : 45;

  let data;
  try {
    data = await getGeoPatients({ risk, department: sp.department, days_back: daysBack, limit: 2000 });
  } catch (err) {
    return <BackendUnreachable error={err} />;
  }

  const maxRate = Math.max(...data.bins.map((b) => b.no_show_rate ?? 0), 1);
  const maxPatients = Math.max(...data.bins.map((b) => b.patients), 1);

  return (
    <div className="flex h-full flex-col gap-4 p-4 md:p-6 lg:p-8">
      <PageHeader
        back={{ href: "/", label: "Dashboard" }}
        title="Patient Geography"
        subtitle={`${data.points.length.toLocaleString()} patients plotted at their real town-level location · hospital: ${data.hospital_name}`}
        actions={
          <Suspense fallback={null}>
            <div className="flex flex-wrap gap-2.5">
              <UrlSelect param="risk" allLabel="All risk levels" options={RISKS.map((r) => ({ value: r, label: `${r} risk` }))} />
              <UrlSelect param="department" allLabel="All departments" options={data.departments.map((d) => ({ value: d, label: d }))} />
              <UrlSelect
                param="days_back"
                options={[
                  { value: "7", label: "Last 7 days + upcoming" },
                  { value: "", label: "Last 45 days + upcoming" },
                  { value: "180", label: "Last 6 months + upcoming" },
                  { value: "3650", label: "All appointments" },
                ]}
              />
            </div>
          </Suspense>
        }
      />

      <div className="grid min-h-[560px] flex-1 grid-cols-1 gap-6 xl:grid-cols-[1fr_340px]">
        <div className="relative min-h-[460px]">
          {data.points.length === 0 ? (
            <div className="flex h-full items-center justify-center rounded-[20px] border border-dashed border-border text-sm text-muted-foreground">
              No located patients match these filters.
            </div>
          ) : (
            <PatientMap points={data.points} />
          )}
          <div className="pointer-events-none absolute bottom-3 left-3 flex gap-3 rounded-xl bg-white/95 px-3 py-2 text-[11px] font-semibold text-[#171725] shadow dark:bg-[#181824]/95 dark:text-white">
            {[["High", "#E11D48"], ["Medium", "#D97706"], ["Low", "#16A34A"]].map(([l, c]) => (
              <span key={l} className="flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: c }} />{l}</span>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <Panel title="Distance vs no-shows" subtitle="All appointments with a recorded outcome">
            <ul className="flex flex-col gap-3">
              {data.bins.map((b) => (
                <li key={b.label} className="text-xs">
                  <div className="mb-1 flex justify-between">
                    <span className="font-semibold text-foreground">{b.label}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {b.no_show_rate !== null ? `${b.no_show_rate}% no-show` : "no outcomes"} · {b.patients.toLocaleString()} appts
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-[#8B7CF6]" style={{ width: `${((b.no_show_rate ?? 0) / maxRate) * 100}%` }} />
                  </div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted/60">
                    <div className="h-full rounded-full bg-[#5B7CFA]/50" style={{ width: `${(b.patients / maxPatients) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[10px] text-muted-foreground">Top bar: no-show rate. Thin bar: share of appointments in the band.</p>
          </Panel>

          <Panel title="Average distance">
            <dl className="grid grid-cols-2 gap-3 text-center">
              <div className="rounded-2xl bg-muted/50 p-3">
                <dt className="text-[11px] text-muted-foreground">No-shows</dt>
                <dd className="font-rounded text-xl font-extrabold tabular-nums text-foreground">{data.avg_km_no_show ?? "—"} km</dd>
              </div>
              <div className="rounded-2xl bg-muted/50 p-3">
                <dt className="text-[11px] text-muted-foreground">Attended</dt>
                <dd className="font-rounded text-xl font-extrabold tabular-nums text-foreground">{data.avg_km_attended ?? "—"} km</dd>
              </div>
            </dl>
          </Panel>

          <p className="px-1 text-[10px] leading-relaxed text-muted-foreground">
            Locations are town-level (patients’ recorded city), not home addresses. {TRAVEL_ASSUMPTION}
            {data.truncated && " Showing the first 2,000 matching patients."}
          </p>
        </div>
      </div>
    </div>
  );
}
