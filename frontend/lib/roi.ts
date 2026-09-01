import type { SimulatorParams, SimulatorResult } from "@/lib/types";

export const ROI_SIMULATOR_DEFAULTS: SimulatorParams = {
  daily_clinics_count: 30,
  avg_consultation_fee_lkr: 4500,
  baseline_no_show_rate: 0.18,
  ai_intervention_coverage: 0.25,
  patient_reachability_rate: 0.85,
  reschedule_success_rate: 0.65,
  overbooking_fill_rate: 0.7,
};

// Mirrors backend/app/main.py:evaluate_roi_simulation() exactly, so the boardroom
// sliders update instantly without a network round trip on every drag.
export function evaluateRoi(params: SimulatorParams): SimulatorResult {
  const dailyConsultations = params.daily_clinics_count * 20;
  const dailyAtRiskSlots = dailyConsultations * params.baseline_no_show_rate;

  const annualOperationalDays = 310;
  const totalAnnualLostSlots = dailyAtRiskSlots * annualOperationalDays;

  const ancillaryMultiplier = 1.6;
  const effectiveSlotValue = params.avg_consultation_fee_lkr * ancillaryMultiplier;
  const annualRevenueLeakage = totalAnnualLostSlots * effectiveSlotValue;

  const intervenedSlots = dailyAtRiskSlots * params.ai_intervention_coverage;
  const reachedPatients = intervenedSlots * params.patient_reachability_rate;

  const rescheduledSlotsDaily = reachedPatients * params.reschedule_success_rate;
  const overbookedFilledDaily =
    (dailyAtRiskSlots - rescheduledSlotsDaily) * params.overbooking_fill_rate * 0.6;
  const totalRecoveredDaily = rescheduledSlotsDaily + overbookedFilledDaily;

  const annualRevenueRecovered = totalRecoveredDaily * annualOperationalDays * effectiveSlotValue;
  const annualDoctorHours = (totalRecoveredDaily * annualOperationalDays * 12) / 60.0;

  const monthlyCallsAutomated = dailyConsultations * 0.85 * 26;
  const nurseHoursSavedMonthly = (monthlyCallsAutomated * 3.5) / 60.0;

  const estimatedAnnualSystemCost = 1_800_000.0;
  const netRoi = annualRevenueRecovered / Math.max(estimatedAnnualSystemCost, 1.0);

  return {
    daily_slots_at_risk: Math.round(dailyAtRiskSlots * 10) / 10,
    annual_revenue_leakage_lkr: Math.round(annualRevenueLeakage),
    annual_revenue_recovered_lkr: Math.round(annualRevenueRecovered),
    recovered_doctor_hours_annual: Math.round(annualDoctorHours * 10) / 10,
    nurse_phone_hours_saved_monthly: Math.round(nurseHoursSavedMonthly * 10) / 10,
    net_roi_multiple: Math.round(netRoi * 10) / 10,
  };
}
