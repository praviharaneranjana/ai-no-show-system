import type { HospitalExpense, SimulatorParams, SimulatorResult } from "@/lib/types";

export const ROI_SIMULATOR_DEFAULTS: SimulatorParams = {
  daily_clinics_count: 30,
  avg_consultation_fee_lkr: 4500,
  baseline_no_show_rate: 0.18,
  ai_intervention_coverage: 0.25,
  patient_reachability_rate: 0.85,
  reschedule_success_rate: 0.65,
  overbooking_fill_rate: 0.7,
  hospital_retained_fee_pct: 0.30,
  ancillary_revenue_per_attended_lkr: 3500,
  staff_hourly_rate_lkr: 850,
  telco_cost_per_msg_lkr: 2.0,
  operational_days_year: 310,
};

export type HospitalProfile = {
  hospital_name: string;
  facility_tier?: string;
  defaults: SimulatorParams;
};

export const DEFAULT_HOSPITAL_PROFILE: HospitalProfile = {
  hospital_name: "Hospital Main Center",
  facility_tier: "Tertiary Private Care",
  defaults: { ...ROI_SIMULATOR_DEFAULTS },
};


// Mirrors backend/app/main.py:evaluate_roi_simulation() exactly, so the boardroom
// sliders update instantly without a network round trip on every drag.
export function evaluateRoi(params: SimulatorParams): SimulatorResult {
  const dailyConsultations = params.daily_clinics_count * 20;
  const dailyAtRiskSlots = dailyConsultations * params.baseline_no_show_rate;

  const annualOperationalDays = params.operational_days_year ?? 310;
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

  const staffHourlyRate = params.staff_hourly_rate_lkr ?? 850;
  const directLaborSavings = nurseHoursSavedMonthly * 12 * staffHourlyRate;

  // Dynamic CapEx/OpEx Normalization
  let totalAnnualExpenses = 1_800_000.0;
  const categoryBreakdown: Record<string, number> = {
    tech_infrastructure: 1_800_000.0,
  };

  if (params.custom_expenses && params.custom_expenses.length > 0) {
    totalAnnualExpenses = 0.0;
    categoryBreakdown.tech_infrastructure = 0.0;

    for (const item of params.custom_expenses) {
      if (!item.is_active) continue;
      const catKey = item.category?.key || item.category_key || "other";
      let annualCost = item.amount_lkr;

      if (item.recurrence === "monthly") {
        annualCost = item.amount_lkr * 12;
      } else if (item.recurrence === "per_patient") {
        annualCost = item.amount_lkr * (intervenedSlots * annualOperationalDays);
      } // "annual" or "one_off" remain item.amount_lkr

      totalAnnualExpenses += annualCost;
      categoryBreakdown[catKey] = Math.round(((categoryBreakdown[catKey] || 0) + annualCost) * 100) / 100;
    }
  }

  const totalGrossValue = annualRevenueRecovered + directLaborSavings;
  const trueNetProfit = totalGrossValue - totalAnnualExpenses;

  const paybackDays =
    totalGrossValue > 0
      ? Math.round((totalAnnualExpenses / totalGrossValue) * 365 * 10) / 10
      : 0;

  const expenseDrag =
    totalGrossValue > 0
      ? Math.round((totalAnnualExpenses / totalGrossValue) * 100 * 100) / 100
      : 0;

  const netRoi = annualRevenueRecovered / Math.max(totalAnnualExpenses, 1.0);

  return {
    daily_slots_at_risk: Math.round(dailyAtRiskSlots * 10) / 10,
    annual_revenue_leakage_lkr: Math.round(annualRevenueLeakage),
    annual_revenue_recovered_lkr: Math.round(annualRevenueRecovered),
    recovered_doctor_hours_annual: Math.round(annualDoctorHours * 10) / 10,
    nurse_phone_hours_saved_monthly: Math.round(nurseHoursSavedMonthly * 10) / 10,
    net_roi_multiple: Math.round(netRoi * 10) / 10,
    total_annual_expenses_lkr: Math.round(totalAnnualExpenses),
    gross_revenue_recovered_lkr: Math.round(annualRevenueRecovered),
    direct_labor_savings_lkr: Math.round(directLaborSavings),
    total_gross_value_created_lkr: Math.round(totalGrossValue),
    true_net_profit_lkr: Math.round(trueNetProfit),
    payback_period_days: paybackDays,
    expense_drag_pct: expenseDrag,
    expense_category_breakdown: categoryBreakdown,
  };
}

