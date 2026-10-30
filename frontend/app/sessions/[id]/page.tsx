import Link from "next/link";
import { notFound } from "next/navigation";

import { ApiError, getSessionDetail } from "@/lib/api";
import { BackendUnreachable } from "@/components/backend-unreachable";
import { PageHeader, Panel } from "@/components/page-header";
import { RiskPill } from "@/components/risk-pill";
import { DelayControl } from "./delay-control";

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let detail;
  try {
    detail = await getSessionDetail(id);
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 422)) notFound();
    return <BackendUnreachable error={err} />;
  }

  const { session: s } = detail;
  const utilisation = s.max_capacity > 0 ? Math.round((detail.booked / s.max_capacity) * 100) : 0;

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        back={{ href: "/capacity", label: "Capacity" }}
        title={s.doctor_name}
        subtitle={`${s.specialty} · ${s.room_number} · ${s.session_date} · starts ${s.scheduled_start_time}`}
        actions={
          <span
            className={
              s.delay_minutes > 0
                ? "rounded-full bg-rose-50 px-3 py-1 text-xs font-bold text-rose-600 dark:bg-rose-950/40 dark:text-rose-400"
                : "rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400"
            }
          >
            {s.delay_minutes > 0 ? `+${s.delay_minutes} min late` : "On time"}
          </span>
        }
      />

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          { label: "Booked", value: `${detail.booked} / ${s.max_capacity}`, sub: `${utilisation}% of capacity` },
          { label: "Expected no-shows", value: detail.predicted_no_shows.toFixed(1), sub: "sum of predicted risk" },
          { label: "High-risk bookings", value: String(detail.high_risk), sub: "need outreach" },
          { label: "Avg consultation", value: `${s.avg_consultation_mins} min`, sub: "per patient" },
        ].map((k) => (
          <div key={k.label} className="rounded-[22px] border border-border bg-card p-5 bento-card-shadow">
            <p className="text-xs font-semibold text-muted-foreground">{k.label}</p>
            <p className="mt-1 font-rounded text-2xl font-extrabold tabular-nums text-foreground">{k.value}</p>
            <p className="text-[11px] text-muted-foreground">{k.sub}</p>
          </div>
        ))}
      </section>

      <Panel title="Session delay" subtitle="Updates the dashboard’s clinic-session strip and notifications">
        <DelayControl sessionId={s.id} initial={s.delay_minutes} />
      </Panel>

      <Panel title="Patient queue" subtitle={`Appointments booked with ${s.doctor_name} on ${s.session_date}`}>
        {detail.queue.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">No appointments are booked for this doctor on this date.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border/60">
            {detail.queue.map((q) => (
              <li key={q.appointment_id}>
                <Link href={`/appointments/${q.appointment_id}`} className="flex items-center gap-3 px-2 py-3 transition-colors hover:bg-muted/50">
                  <span className="w-8 text-center text-xs font-bold tabular-nums text-muted-foreground">#{q.queue_number ?? "–"}</span>
                  <span className="flex-1 text-sm font-semibold text-foreground">{q.patient_name}</span>
                  <span className="text-xs tabular-nums text-muted-foreground">{q.scheduled_time ?? "—"}</span>
                  {q.risk_category && q.risk_score !== null && <RiskPill category={q.risk_category} score={q.risk_score} size="sm" />}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
