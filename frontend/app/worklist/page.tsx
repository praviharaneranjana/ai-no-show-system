import Link from "next/link";
import { CheckCircle2, ChevronRight, Phone } from "lucide-react";

import { getAppointmentRegister } from "@/lib/api";
import { registerHref, parseRegisterParams, type RawSearchParams } from "@/lib/search-params";
import { BackendUnreachable } from "@/components/backend-unreachable";
import { PageHeader, Panel } from "@/components/page-header";
import { Pagination } from "@/components/pagination";
import { RiskPill } from "@/components/risk-pill";
import { UrlSelect } from "@/components/url-select";

const PAGE_SIZE = 20;

export default async function WorklistPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const parsed = parseRegisterParams(await searchParams, PAGE_SIZE);
  // The worklist is upcoming, not-yet-resolved appointments, High risk unless told otherwise.
  const query = { ...parsed, view: "upcoming" as const, risk: parsed.risk ?? ("High" as const), sort: parsed.sort ?? ("date_asc" as const) };

  let data;
  try {
    data = await getAppointmentRegister(query);
  } catch (err) {
    return <BackendUnreachable error={err} />;
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        back={{ href: "/", label: "Dashboard" }}
        title="Priority Worklist"
        subtitle={`${data.total.toLocaleString()} upcoming ${query.risk}-risk appointments awaiting front-desk outreach`}
      />

      <Panel>
        <div className="mb-4 flex flex-wrap items-center gap-2.5">
          <UrlSelect
            param="risk"
            options={[
              { value: "High", label: "High risk" },
              { value: "Medium", label: "Medium risk" },
              { value: "Low", label: "Low risk" },
            ]}
          />
          <UrlSelect param="department" allLabel="All departments" options={data.departments.map((d) => ({ value: d, label: d }))} />
          <UrlSelect
            param="sort"
            options={[
              { value: "date_asc", label: "Soonest first" },
              { value: "risk", label: "Highest risk first" },
              { value: "name", label: "Patient name" },
            ]}
          />
          <UrlSelect
            param="window_days"
            allLabel="Any date"
            options={[
              { value: "1", label: "Next 24 hours" },
              { value: "7", label: "Next 7 days" },
              { value: "30", label: "Next 30 days" },
            ]}
          />
        </div>

        {data.items.length === 0 ? (
          <div className="py-14 text-center text-sm text-muted-foreground">
            <CheckCircle2 className="mx-auto mb-2 size-8 text-emerald-500" />
            All caught up — no {query.risk?.toLowerCase()}-risk appointments match these filters.
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.items.map(({ appointment, patient, prediction }) => (
              <li key={appointment.id} className="flex items-center gap-3 rounded-2xl border border-border/80 p-3.5 transition-colors hover:border-[#DDD6FE] hover:bg-muted/40">
                <Link href={`/appointments/${appointment.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#FFE4E6] text-xs font-bold text-[#E11D48] dark:bg-rose-950/40 dark:text-rose-300">
                    {(patient?.full_name ?? "?").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold text-foreground">{patient?.full_name ?? "Unknown patient"}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {appointment.appointment_day} · {appointment.scheduled_time ?? "—"} · {appointment.department ?? "General"} · {appointment.doctor_name ?? ""}
                    </span>
                    <span className="block truncate text-[11px] font-medium text-[#8B7CF6]">{prediction?.recommendation}</span>
                    {appointment.outreach_arm === "holdout" && (
                      <span className="mt-0.5 inline-block rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">
                        Control group · please do not contact
                      </span>
                    )}
                  </span>
                </Link>
                {prediction && <RiskPill category={prediction.risk_category} score={prediction.risk_score} size="sm" />}
                <span className="hidden text-[11px] text-muted-foreground sm:block">{appointment.sms_received ? "SMS sent" : "No SMS yet"}</span>
                {patient?.phone && (
                  <a href={`tel:${patient.phone}`} aria-label={`Call ${patient.full_name}`} className="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-[#8B7CF6] hover:text-white">
                    <Phone className="size-3.5" />
                  </a>
                )}
                <Link href={`/appointments/${appointment.id}`} aria-label="Open record" className="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-[#8B7CF6] hover:text-white">
                  <ChevronRight className="size-4" />
                </Link>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4">
          <Pagination page={data.page} pageSize={data.page_size} total={data.total} hrefFor={(p) => registerHref("/worklist", query, p)} />
        </div>
      </Panel>
    </div>
  );
}
