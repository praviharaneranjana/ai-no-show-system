import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  Calendar,
  Phone,
  Mail,
  Sparkles,
  CheckCircle2,
  XCircle,
  ShieldAlert,
  HeartPulse,
} from "lucide-react";

import { ApiError, getAppointment, getPatient, getPrediction } from "@/lib/api";
import { OutcomeActions } from "@/app/appointments/[id]/outcome-actions";
import { ShapTornadoChart } from "@/components/shap-tornado-chart";
import { ContextualAdjustmentPanel } from "@/components/contextual-adjustment-panel";
import { RiskBadge } from "@/components/risk-badge";
import { RiskGauge } from "@/components/risk-gauge";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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

function calculateDaysAhead(scheduled: string, appointment: string): number {
  const s = new Date(scheduled);
  const a = new Date(appointment);
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.max(0, Math.round((a.getTime() - s.getTime()) / msPerDay));
}

export default async function AppointmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const appointment = await getAppointment(id).catch((err) => {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  });

  const patient = await getPatient(appointment.patient_id);

  const prediction = await getPrediction(id).catch((err) => {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  });

  const age = calculateAge(patient.date_of_birth);
  const daysAhead = calculateDaysAhead(appointment.scheduled_day, appointment.appointment_day);
  const todayStr = new Date().toISOString().slice(0, 10);
  const isPastOrToday = appointment.appointment_day <= todayStr;
  const isHighRisk = prediction?.risk_category === "High";

  return (
    <div className="flex w-full flex-col gap-6 p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Back link & Title */}
      <div className="flex flex-col gap-2">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors w-fit"
        >
          <ArrowLeft className="size-3.5" />
          <span>Back to appointments triage</span>
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/80 pb-5">
          <div className="flex items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary font-bold text-base">
              {patient.full_name
                .split(" ")
                .map((n) => n[0])
                .slice(0, 2)
                .join("")
                .toUpperCase()}
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                  {patient.full_name}
                </h1>
                {prediction && (
                  <RiskBadge
                    category={prediction.risk_category}
                    score={prediction.risk_score}
                    size="default"
                  />
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Appointment on <strong>{appointment.appointment_day}</strong> • {appointment.department ?? "General Medicine"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {appointment.no_show !== null ? (
              <Badge
                variant="outline"
                className={
                  appointment.no_show
                    ? "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300 font-semibold px-3 py-1"
                    : "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-semibold px-3 py-1"
                }
              >
                {appointment.no_show ? "Visit Outcome: No-Show" : "Visit Outcome: Attended"}
              </Badge>
            ) : isPastOrToday ? (
              <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300 font-medium">
                Pending Outcome Recording
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">
                Upcoming Appointment
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Main Grid: AI Prediction (Left) + Details & Outcomes (Right) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column: AI Prediction & SHAP (7 cols) */}
        <div className="flex flex-col gap-6 lg:col-span-7">
          {/* AI Assessment Card */}
          <Card className="border-border/80 shadow-xs">
            <CardHeader className="pb-3 border-b border-border/60">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="size-4 text-primary" />
                  <CardTitle className="text-base">AI Attendance Risk Assessment</CardTitle>
                </div>
                <span className="text-[11px] font-mono text-muted-foreground">
                  XGBoost + SHAP
                </span>
              </div>
            </CardHeader>

            <CardContent className="flex flex-col gap-5 pt-4">
              {prediction ? (
                <>
                  {/* Risk Score & Recommendation Reveal */}
                  <div className="flex flex-col sm:flex-row items-center gap-5 rounded-xl border border-border/80 bg-muted/20 p-4">
                    <RiskGauge
                      score={prediction.risk_score}
                      category={prediction.risk_category}
                      size="default"
                    />

                    <div className="flex flex-1 flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <RiskBadge
                          category={prediction.risk_category}
                          score={prediction.risk_score}
                          size="default"
                        />
                        <span className="text-xs text-muted-foreground">
                          probability of missing visit
                        </span>
                      </div>

                      {/* Action Recommendation Box */}
                      <div
                        className={`rounded-lg border p-3 text-xs leading-relaxed ${
                          isHighRisk
                            ? "border-red-500/40 bg-red-500/10 text-red-800 dark:text-red-200 font-medium"
                            : prediction.risk_category === "Medium"
                            ? "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200 font-medium"
                            : "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
                        }`}
                      >
                        <div className="font-semibold mb-0.5 flex items-center gap-1.5">
                          <ShieldAlert className="size-3.5" />
                          <span>Staff Action Recommendation:</span>
                        </div>
                        {prediction.recommendation}
                      </div>
                    </div>
                  </div>

                  {/* SHAP Feature Contribution Chart */}
                  <div className="flex flex-col gap-1 pt-1">
                    <ShapTornadoChart contributions={prediction.explanation} />
                  </div>

                  {/* Contextual Risk Adjustment (rule-based, separate from ML) */}
                  {prediction.contextual_adjustment && (
                    <div className="border-t border-border/60 pt-4">
                      <ContextualAdjustmentPanel adjustment={prediction.contextual_adjustment} />
                    </div>
                  )}
                </>
              ) : (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  No prediction has been computed for this appointment yet.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Outcomes & Patient Profile (5 cols) */}
        <div className="flex flex-col gap-6 lg:col-span-5">
          {/* Outcome Recording Card */}
          <Card className="border-border/80 shadow-xs">
            <CardHeader className="pb-3 border-b border-border/60">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-primary" />
                <CardTitle className="text-base">Visit Outcome Status</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 pt-4 text-xs">
              {appointment.no_show !== null ? (
                <div
                  className={`flex items-center gap-3 rounded-lg border p-3.5 ${
                    appointment.no_show
                      ? "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300"
                      : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  }`}
                >
                  {appointment.no_show ? (
                    <XCircle className="size-5 shrink-0 text-red-600 dark:text-red-400" />
                  ) : (
                    <CheckCircle2 className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  )}
                  <div className="flex flex-col">
                    <span className="font-bold text-sm">
                      {appointment.no_show ? "Recorded as No-Show" : "Recorded as Attended"}
                    </span>
                    <span className="text-[11px] opacity-85">
                      Status has been recorded and contributed to hospital analytics.
                    </span>
                  </div>
                </div>
              ) : isPastOrToday ? (
                <div className="flex flex-col gap-2.5">
                  <p className="text-muted-foreground text-xs">
                    Appointment date is reached. Record whether the patient attended or missed their appointment:
                  </p>
                  <OutcomeActions appointmentId={appointment.id} />
                </div>
              ) : (
                <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-muted-foreground text-xs">
                  📅 Outcome recording will unlock on the appointment date (<strong>{appointment.appointment_day}</strong>).
                </div>
              )}
            </CardContent>
          </Card>

          {/* Appointment Timing & Logistics */}
          <Card className="border-border/80 shadow-xs">
            <CardHeader className="pb-3 border-b border-border/60">
              <div className="flex items-center gap-2">
                <Calendar className="size-4 text-primary" />
                <CardTitle className="text-base">Appointment Logistics</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-2.5 pt-4 text-xs">
              <DetailRow label="Appointment Date" value={appointment.appointment_day} highlight />
              <DetailRow label="Scheduled Date" value={appointment.scheduled_day} />
              <DetailRow
                label="Lead Time"
                value={`${daysAhead} day${daysAhead === 1 ? "" : "s"} in advance`}
              />
              <DetailRow
                label="Department"
                value={appointment.department ?? "General Medicine"}
              />
              <DetailRow
                label="SMS Reminder"
                value={appointment.sms_received ? "Sent ✅" : "Not Sent ❌"}
              />
              <DetailRow label="Status Code" value={appointment.status} />
            </CardContent>
          </Card>

          {/* Patient Demographic & Clinical Profile */}
          <Card className="border-border/80 shadow-xs">
            <CardHeader className="pb-3 border-b border-border/60">
              <div className="flex items-center gap-2">
                <HeartPulse className="size-4 text-primary" />
                <CardTitle className="text-base">Patient Clinical Profile</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-2.5 pt-4 text-xs">
              <DetailRow
                label="Full Name"
                value={patient.full_name}
                highlight
              />
              <DetailRow
                label="Age / DOB"
                value={`${age} years old (${patient.date_of_birth})`}
              />
              <DetailRow
                label="Gender"
                value={
                  patient.gender === "F"
                    ? "Female"
                    : patient.gender === "M"
                    ? "Male"
                    : patient.gender ?? "Not specified"
                }
              />
              {patient.phone && (
                <div className="flex items-center justify-between gap-4 py-1">
                  <span className="text-muted-foreground">Phone</span>
                  <a
                    href={`tel:${patient.phone}`}
                    className="flex items-center gap-1 font-medium text-primary hover:underline"
                  >
                    <Phone className="size-3" />
                    {patient.phone}
                  </a>
                </div>
              )}
              {patient.email && (
                <div className="flex items-center justify-between gap-4 py-1">
                  <span className="text-muted-foreground">Email</span>
                  <a
                    href={`mailto:${patient.email}`}
                    className="flex items-center gap-1 font-medium text-primary hover:underline"
                  >
                    <Mail className="size-3" />
                    {patient.email}
                  </a>
                </div>
              )}

              <div className="border-t border-border/60 pt-2.5 mt-1 flex flex-col gap-2">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Recorded Chronic Conditions & Welfare
                </span>
                <div className="flex flex-wrap gap-1.5">
                  <ConditionChip label="Hypertension" active={patient.hypertension} />
                  <ConditionChip label="Diabetes" active={patient.diabetes} />
                  <ConditionChip label="Alcoholism" active={patient.alcoholism} />
                  <ConditionChip label="Scholarship Program" active={patient.scholarship} />
                  {patient.handicap > 0 && (
                    <Badge variant="outline" className="border-border text-foreground text-[11px]">
                      Handicap Level {patient.handicap}
                    </Badge>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: ReactNode;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span className={`text-right tabular-nums ${highlight ? "font-semibold text-foreground" : "text-foreground"}`}>
        {value}
      </span>
    </div>
  );
}

function ConditionChip({ label, active }: { label: string; active: boolean }) {
  if (!active) return null;
  return (
    <Badge
      variant="outline"
      className="border-primary/30 bg-primary/10 text-primary font-medium text-[11px]"
    >
      {label}
    </Badge>
  );
}
