import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Calendar,
  Phone,
  Mail,
  User,
  Building,
  CreditCard,
  Send,
} from "lucide-react";

import {
  ApiError,
  getAppointment,
  getPatient,
  getPrediction,
  listAppointmentInterventions,
  getModelInfo,
  getDoctors,
  getDepartments,
  getAppointmentConversation,
  getAppointmentHistory,
} from "@/lib/api";
import { OutcomeActions } from "@/app/appointments/[id]/outcome-actions";
import { ShapTornadoChart } from "@/components/shap-tornado-chart";
import { DotRingGauge } from "@/components/dot-ring-gauge";
import { RiskPill } from "@/components/risk-pill";
import { JourneyMap } from "@/components/journey-map";
import { AppointmentActionBar } from "@/components/appointment-action-bar";
import { BookingHistoryCard } from "@/components/booking-history-card";
import { OutreachHistory } from "@/components/outreach-history";

function calculateAge(dobStr: string): number {
  const dob = new Date(dobStr);
  const today = new Date();
  let age = today.getUTCFullYear() - dob.getUTCFullYear();
  const hadBirthday =
    today.getUTCMonth() > dob.getUTCMonth() ||
    (today.getUTCMonth() === dob.getUTCMonth() && today.getUTCDate() >= dob.getUTCDate());
  if (!hadBirthday) age -= 1;
  return Math.max(0, age);
}

export default async function AppointmentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ reschedule?: string }>;
}) {
  const { id } = await params;
  const openPicker = (await searchParams)?.reschedule === "1";

  const appointment = await getAppointment(id).catch((err) => {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  });

  const patient = await getPatient(appointment.patient_id);

  const prediction = await getPrediction(id).catch((err) => {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  });

  const modelInfo = await getModelInfo().catch(() => null);

  // Outreach history is supplementary: never let it take the page down.
  const interventions = await listAppointmentInterventions(id).catch(() => []);

  // Telehealth rule: only departments flagged telehealth_ok may be offered a video consult.
  const [doctors, departments] = await Promise.all([getDoctors().catch(() => []), getDepartments().catch(() => [])]);
  const doctorDeptId = doctors.find((d) => d.id === appointment.doctor_id)?.department_id;
  const telehealthOk = departments.find((d) => d.id === doctorDeptId)?.telehealth_ok ?? false;

  const [conversation, history] = await Promise.all([
    getAppointmentConversation(id).catch(() => null),
    getAppointmentHistory(id).catch(() => []),
  ]);

  const age = calculateAge(patient.date_of_birth);

  const shapCard = (span: string) => (
    <div className={`${span} rounded-[24px] border border-border bg-card p-6 bento-card-shadow flex flex-col justify-between`}>
      <div>
        <div className="pb-3 border-b border-border/60">
          <h2 className="font-heading text-base font-bold text-foreground">
            SHAP Attribution Drivers
          </h2>
          <p className="text-[11px] text-muted-foreground">
            Key clinical and logistic factors influencing risk
          </p>
        </div>

        <div className="mt-4">
          <ShapTornadoChart
            contributions={prediction?.explanation || []}
          />
        </div>
      </div>

      <div className="pt-3 border-t border-border/60 text-[10px] text-muted-foreground">
        ×N = how much each factor multiplies the odds of a no-show (SHAP log-odds, exponentiated).
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 lg:p-8">
      {/* Top Breadcrumb & Outcome Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border/60">
        <div className="flex items-center gap-3">
          <Link
            href="/appointments"
            className="flex items-center gap-1.5 text-xs font-semibold text-[#8B7CF6] hover:underline"
          >
            <ArrowLeft className="size-4" />
            <span>Appointments</span>
          </Link>
          <span className="text-muted-foreground">/</span>
          <h1 className="font-heading text-lg font-bold text-foreground sm:text-xl">
            Appointment #{appointment.id.slice(0, 8).toUpperCase()}
          </h1>
        </div>

        {/* Outcome Actions (Mark Attended / Mark No-Show / Undo) */}
        <OutcomeActions
          appointmentId={appointment.id}
          currentStatus={appointment.status}
        />
      </div>

      <AppointmentActionBar
        appointment={appointment}
        patient={patient}
        riskScore={prediction?.risk_score}
        category={prediction?.risk_category}
        explanation={prediction?.explanation ?? []}
        interventions={interventions}
        telehealthOk={telehealthOk}
        conversation={conversation}
        openPicker={openPicker}
      />

      {/* 12-Col Bento Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* Risk Hero Card (4 cols) */}
        <div className="lg:col-span-4 rounded-[24px] border border-border bg-card p-6 bento-card-shadow flex flex-col items-center justify-between text-center">
          <div className="w-full flex items-center justify-between pb-3 border-b border-border/60">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              Calibrated Risk Model
            </span>
            <span className="font-mono text-[10px] text-muted-foreground">
              {modelInfo?.version ?? ""}
            </span>
          </div>

          <div className="my-4">
            <DotRingGauge
              score={prediction?.risk_score || 0.15}
              category={prediction?.risk_category || "Low"}
              size={150}
            />
          </div>

          <div className="w-full space-y-2">
            <div className="flex items-center justify-center gap-2">
              <RiskPill
                category={prediction?.risk_category || "Low"}
                score={prediction?.risk_score}
                size="default"
              />
            </div>

            {conversation?.state === "booked" && conversation.appointment_id === id && (
              <p className="mx-auto max-w-xs rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-700 dark:text-emerald-300">
                Patient confirmed this slot through outreach
                {conversation.approved_by ? ` (approved by ${conversation.approved_by})` : ""}. The score above is the model&apos;s own
                estimate and does not include this confirmation.
              </p>
            )}

            <p className="text-xs text-muted-foreground max-w-xs mx-auto">
              Recommendation:{" "}
              <strong className="text-foreground">
                {prediction?.recommendation || "Standard SMS reminder protocol."}
              </strong>
            </p>
          </div>

          <div className="w-full pt-3 border-t border-border/60 text-[10px] text-muted-foreground flex justify-between">
            <span>{modelInfo?.metrics.roc_auc != null ? `ROC-AUC: ${modelInfo.metrics.roc_auc.toFixed(3)}` : ""}</span>
            <span>{modelInfo?.metrics.lift_top20 != null ? `${modelInfo.metrics.lift_top20.toFixed(1)}× Lift on Top 20%` : ""}</span>
          </div>
        </div>

        {/* SHAP drivers sit here until the booking has a reschedule history, which takes this slot */}
        {history.length > 0 ? <BookingHistoryCard steps={history} /> : shapCard("lg:col-span-4")}

        {/* Patient Profile Card (4 cols) */}
        <div className="lg:col-span-4 rounded-[24px] border border-border bg-card p-6 bento-card-shadow flex flex-col justify-between">
          <div>
            <div className="pb-3 border-b border-border/60 flex items-center justify-between">
              <div>
                <h2 className="font-heading text-base font-bold text-foreground">
                  Patient Profile
                </h2>
                <p className="text-[11px] text-muted-foreground">
                  Demographic & clinical history
                </p>
              </div>
              <span className="font-mono text-xs font-bold text-[#8B7CF6]">
                {patient.uhid}
              </span>
            </div>

            <div className="mt-4 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <User className="size-3.5" /> Full Name
                </span>
                <span className="font-bold text-foreground">{patient.full_name}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Age & Gender</span>
                <span className="font-medium text-foreground">
                  {age} years · {patient.gender === "M" ? "Male" : patient.gender === "F" ? "Female" : patient.gender}
                </span>
              </div>

              {patient.phone && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <Phone className="size-3.5" /> Phone
                  </span>
                  <a href={`tel:${patient.phone}`} className="font-mono text-[#8B7CF6] hover:underline">
                    {patient.phone}
                  </a>
                </div>
              )}

              {patient.email && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <Mail className="size-3.5" /> Email
                  </span>
                  <span className="font-mono text-foreground truncate max-w-[160px]">{patient.email}</span>
                </div>
              )}

              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Residence</span>
                <span className="text-foreground">
                  {patient.city || "Colombo"}, {patient.distance_km ? `${patient.distance_km} km` : "Western Province"}
                </span>
              </div>

              {/* Chronic Conditions Badges */}
              <div className="pt-2 border-t border-border/60">
                <span className="text-[10px] font-bold text-muted-foreground uppercase block mb-1.5">
                  Recorded Chronic Conditions
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {patient.hypertension ? (
                    <span className="rounded-md bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                      Hypertension
                    </span>
                  ) : null}
                  {patient.diabetes ? (
                    <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                      Diabetes
                    </span>
                  ) : null}
                  {patient.alcoholism ? (
                    <span className="rounded-md bg-purple-50 px-2 py-0.5 text-[10px] font-bold text-purple-700 dark:bg-purple-950/40 dark:text-purple-300">
                      Alcohol Use
                    </span>
                  ) : null}
                  {patient.handicap > 0 ? (
                    <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                      Mobility Impairment (L{patient.handicap})
                    </span>
                  ) : null}
                  {!patient.hypertension && !patient.diabetes && !patient.alcoholism && patient.handicap === 0 && (
                    <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                      None documented
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-border/60 text-[10px] text-muted-foreground">
            Enrolled in subsidy: {patient.scholarship ? "Yes (Subsidized)" : "Standard Private Care"}
          </div>
        </div>

        {/* Journey Map Card (6 cols) */}
        <div className="lg:col-span-6 rounded-[24px] border border-border bg-card p-6 bento-card-shadow">
          <div className="pb-3 border-b border-border/60 flex items-center justify-between mb-4">
            <div>
              <h2 className="font-heading text-base font-bold text-foreground">
                Patient Journey Map
              </h2>
              <p className="text-[11px] text-muted-foreground">
                Transit route and distance risk attribution
              </p>
            </div>
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
              Carto Positron
            </span>
          </div>

          <JourneyMap
            patientName={patient.full_name}
            city={patient.city}
            distanceKm={patient.distance_km}
            latitude={patient.latitude}
            longitude={patient.longitude}
            contributions={prediction?.explanation || []}
          />
        </div>

        {/* Clinic Logistics Card (6 cols) */}
        <div className="lg:col-span-6 rounded-[24px] border border-border bg-card p-6 bento-card-shadow flex flex-col justify-between">
          <div>
            <div className="pb-3 border-b border-border/60 flex items-center justify-between mb-4">
              <div>
                <h2 className="font-heading text-base font-bold text-foreground">
                  Appointment Logistics
                </h2>
                <p className="text-[11px] text-muted-foreground">
                  Clinic scheduling and payment channel
                </p>
              </div>
              <span className="font-mono text-xs font-bold text-foreground">
                Queue #{appointment.queue_number || "—"}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-2xl bg-muted/40 border border-border/60">
                <span className="text-muted-foreground flex items-center gap-1.5 text-[11px] mb-1">
                  <Calendar className="size-3.5" /> Date & Time
                </span>
                <span className="font-bold text-foreground">
                  {appointment.appointment_day}
                </span>
                <span className="text-[10px] text-muted-foreground block">
                  {appointment.scheduled_time || "Morning Session"}
                </span>
              </div>

              <div className="p-3 rounded-2xl bg-muted/40 border border-border/60">
                <span className="text-muted-foreground flex items-center gap-1.5 text-[11px] mb-1">
                  <Building className="size-3.5" /> Department & Doctor
                </span>
                <span className="font-bold text-foreground">
                  {appointment.department || "General Outpatient"}
                </span>
                <span className="text-[10px] text-muted-foreground block">
                  {appointment.doctor_name || "Consultant on duty"}
                </span>
              </div>

              <div className="p-3 rounded-2xl bg-muted/40 border border-border/60">
                <span className="text-muted-foreground flex items-center gap-1.5 text-[11px] mb-1">
                  <CreditCard className="size-3.5" /> Booking Channel
                </span>
                <span className="font-bold text-foreground">
                  {appointment.booking_channel || "Counter"}
                </span>
                <span className="text-[10px] text-muted-foreground block">
                  Payment: {appointment.payment_mode || "Cash at desk"}
                </span>
              </div>

              <div className="p-3 rounded-2xl bg-muted/40 border border-border/60">
                <span className="text-muted-foreground flex items-center gap-1.5 text-[11px] mb-1">
                  <Send className="size-3.5" /> Outreach Telemetry
                </span>
                <span className="font-bold text-foreground">
                  {appointment.sms_received ? "Reminder SMS Delivered" : "No Reminder Sent"}
                </span>
                <span className="text-[10px] text-[#8B7CF6] font-semibold block">
                  {appointment.ai_action_status || "Standard Protocol"}
                </span>
                {appointment.outreach_arm === "holdout" && (
                  <span className="mt-1 inline-block rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">
                    Control group · please do not contact
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-border/60 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Current Appointment Status:</span>
            <span className="font-bold text-foreground capitalize">
              {appointment.status || "Scheduled"}
            </span>
          </div>
        </div>

        {history.length > 0 && shapCard("lg:col-span-12")}

        {/* Outreach history (full width) */}
        <OutreachHistory interventions={interventions} className="lg:col-span-12" />

      </div>
    </div>
  );
}
