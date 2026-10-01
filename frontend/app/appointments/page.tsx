import { Suspense } from "react";
import { FilterX } from "lucide-react";

import { getAppointmentRegister, isRedirectError } from "@/lib/api";
import { parseRegisterParams, registerHref, type RawSearchParams } from "@/lib/search-params";
import { BackendUnreachable } from "@/components/backend-unreachable";
import { AppointmentRows } from "@/components/appointment-rows";
import { Pagination } from "@/components/pagination";
import { RegisterFilters } from "@/components/register-filters";

const PAGE_SIZE = 25;

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const query = parseRegisterParams(await searchParams, PAGE_SIZE);

  let data;
  try {
    data = await getAppointmentRegister(query);
  } catch (err) {
    if (isRedirectError(err)) throw err;
    return <BackendUnreachable error={err} />;
  }

  const records = data.items.map((r) => ({
    appointment: r.appointment,
    patient: r.patient ?? undefined,
    prediction: r.prediction ?? undefined,
  }));

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 lg:p-8">
      <header>
        <h1 className="font-heading text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
          Appointments Master Schedule
        </h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Full outpatient clinical roster, risk triage, and outcome verification ({data.counts.all.toLocaleString()} records)
        </p>
      </header>

      <section className="flex flex-col gap-4 rounded-[24px] border border-border bg-card p-5 bento-card-shadow">
        <Suspense fallback={null}>
          <RegisterFilters counts={data.counts} departments={data.departments} />
        </Suspense>

        <div className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-xs">
          {records.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-4 py-14 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <FilterX className="size-6" />
              </div>
              <span className="text-sm font-semibold text-foreground">No matching appointments</span>
              <span className="max-w-sm text-xs text-muted-foreground">
                No appointments match your active search and filter criteria.
              </span>
            </div>
          ) : (
            <AppointmentRows records={records} />
          )}
        </div>

        <Pagination
          page={data.page}
          pageSize={data.page_size}
          total={data.total}
          hrefFor={(p) => registerHref("/appointments", query, p)}
        />
      </section>
    </div>
  );
}
