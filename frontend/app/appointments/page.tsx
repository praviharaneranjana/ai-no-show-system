import { getAppointmentsWithPredictions } from "@/lib/appointments-with-predictions";
import { BackendUnreachable } from "@/components/backend-unreachable";
import { AppointmentsTable } from "@/components/appointments-table";

export default async function AppointmentsPage() {
  let records;
  try {
    records = await getAppointmentsWithPredictions();
  } catch (err) {
    return <BackendUnreachable error={err} />;
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 lg:p-8">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-extrabold text-foreground tracking-tight sm:text-3xl">
            Appointments Master Schedule
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Full outpatient clinical roster, risk triage, and outcome verification ({records.length} records)
          </p>
        </div>
      </header>

      <section className="rounded-[24px] border border-border bg-card p-5 bento-card-shadow">
        <AppointmentsTable records={records} />
      </section>
    </div>
  );
}
