import { AppointmentActionCard, type CardAction } from "@/components/appointment-action-card";
import { recommendActions } from "@/lib/recommend-action";
import type { Appointment, FeatureContribution, Intervention, Patient, RescheduleConversation, RiskCategory } from "@/lib/types";

/**
 * Action card on the appointment page: the best next step for this patient, plus the alternatives.
 * High-risk patients are asked first (they choose, staff approve) instead of being offered a slot outright.
 */
export function AppointmentActionBar({
  appointment,
  patient,
  riskScore,
  category,
  explanation,
  interventions,
  telehealthOk,
  conversation,
  openPicker,
}: {
  appointment: Appointment;
  patient: Patient;
  riskScore: number | null | undefined;
  category: RiskCategory | null | undefined;
  explanation: FeatureContribution[];
  interventions: Intervention[];
  telehealthOk: boolean;
  conversation: RescheduleConversation | null;
  openPicker: boolean;
}) {
  const ranked = recommendActions({ riskScore, category, explanation, patient, appointment, interventions, telehealthOk });
  const hubHref = `/outreach?patient=${patient.id}`;
  const done = appointment.status !== "scheduled";
  const highRisk = category === "High";

  const actions: CardAction[] = ranked.map((a) => ({
    key: a.key,
    label: a.key === "reschedule" ? (highRisk ? "Pick a slot yourself" : "Offer a new slot") : a.label,
    reason: a.reason,
    href: a.key === "call" ? (patient.phone ? `tel:${patient.phone}` : null) : a.key === "monitor" ? null : hubHref,
  }));

  if (highRisk && !done && patient.phone) {
    const pct = Math.round((riskScore ?? 0) * 100);
    actions.unshift({
      key: "ask",
      label: "Ask patient to reschedule",
      reason: `Risk is ${pct}%. Message the patient first and let them choose a new time; the final booking waits for a manager's approval.`,
      href: null,
    });
  }

  const best = actions[0];
  const language = patient.preferred_language ?? "en";

  return (
    <AppointmentActionCard
      appointmentId={appointment.id}
      doctorId={appointment.doctor_id}
      currentLabel={`${appointment.appointment_day} ${appointment.scheduled_time ?? ""} · ${appointment.doctor_name ?? "doctor"}`.replace("  ", " ")}
      category={category ?? "Low"}
      actions={best ? actions : []}
      done={done}
      patientLanguage={language}
      patientHasPhone={!!patient.phone}
      initialConversation={conversation}
      openPicker={openPicker}
    />
  );
}
