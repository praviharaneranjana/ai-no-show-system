import { formatFeatureLabel } from "@/components/shap-driver-bars";
import type { Appointment, FeatureContribution, Intervention, Patient, RiskCategory } from "@/lib/types";

export type ActionKey = "call" | "sms" | "reschedule" | "telehealth" | "monitor";

export type RecommendedAction = {
  key: ActionKey;
  label: string;
  /** Why this action fits this patient, built from their own top risk drivers. */
  reason: string;
  score: number;
};

const LABELS: Record<ActionKey, string> = {
  call: "Phone call",
  sms: "SMS reminder",
  reschedule: "Offer a new slot",
  telehealth: "Offer telehealth",
  monitor: "Standard protocol",
};

function drivers(explanation: FeatureContribution[]) {
  return explanation
    .filter((c) => c.contribution > 0)
    .sort((a, b) => b.contribution - a.contribution)
    .map((c) => ({ ...c, label: formatFeatureLabel(c.feature, c.value).label }));
}

const has = (list: { feature: string }[], re: RegExp) => list.some((d) => re.test(d.feature.toLowerCase()));

/**
 * Ranks outreach actions for one appointment from its risk score and SHAP drivers,
 * so the best action differs patient to patient. Rule-based, not a trained policy.
 */
export function recommendActions(args: {
  riskScore: number | null | undefined;
  category: RiskCategory | null | undefined;
  explanation: FeatureContribution[];
  patient: Pick<Patient, "phone" | "distance_km">;
  appointment: Pick<Appointment, "sms_received">;
  interventions: Pick<Intervention, "channel" | "status">[];
  /** Department rule: video consults are only offered when the doctor's department allows them. */
  telehealthOk: boolean;
}): RecommendedAction[] {
  const { riskScore, category, explanation, patient, appointment, interventions, telehealthOk } = args;
  const score = riskScore ?? 0;
  const top = drivers(explanation);
  const topLabels = top.slice(0, 2).map((d) => d.label.toLowerCase());
  const because = topLabels.length ? ` Main drivers: ${topLabels.join(" and ")}.` : "";

  const longLead = has(top, /lead_days|daysahead/);
  const priorMisses = has(top, /prior_no_show/);
  const far = has(top, /distance_km/) || (patient.distance_km ?? 0) >= 20;
  const noReminder = !appointment.sms_received && !interventions.length;
  const hasPhone = !!patient.phone;
  const highTier = category === "High";
  const medTier = category === "Medium";

  const candidates: RecommendedAction[] = [
    {
      key: "call",
      label: LABELS.call,
      score: (highTier ? 3 : medTier ? 1.5 : 0) + (priorMisses ? 1.5 : 0) + (score >= 0.5 ? 1 : 0) - (hasPhone ? 0 : 10),
      reason: priorMisses
        ? `A history of missed visits is lifting the risk; a personal call is the strongest nudge.${because}`
        : `Risk is ${Math.round(score * 100)}%: speak to the patient directly and confirm they are coming.${because}`,
    },
    {
      key: "sms",
      label: LABELS.sms,
      score: (noReminder ? 2.5 : 0.5) + (medTier ? 1.5 : 0) + (highTier ? 1 : 0),
      reason: noReminder
        ? `No reminder has gone out yet, so a message is the cheapest first step.${because}`
        : `A follow-up reminder keeps the appointment top of mind.${because}`,
    },
    {
      key: "reschedule",
      label: LABELS.reschedule,
      score: (longLead ? 2.5 : 0) + (highTier ? 1.5 : 0) + (far ? 0.5 : 0),
      reason: longLead
        ? `Booked far ahead, so plans change. Offering a nearer slot or an easy reschedule recovers the visit.${because}`
        : `If the patient cannot make it, an offered replacement slot avoids an empty session.${because}`,
    },
    {
      key: "telehealth",
      label: LABELS.telehealth,
      score: telehealthOk && far ? 3 : 0,
      reason: `Travel distance is pushing the risk up; a video consult removes the journey.${because}`,
    },
    {
      key: "monitor",
      label: LABELS.monitor,
      score: !highTier && !medTier && !noReminder ? 2 : 0.2,
      reason: "Risk is low and a reminder is already sent; the standard protocol is enough.",
    },
  ];

  return candidates.filter((c) => c.key !== "telehealth" || telehealthOk).sort((a, b) => b.score - a.score);
}
