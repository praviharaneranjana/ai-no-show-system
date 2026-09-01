import { describe, expect, it } from "vitest";

import { ROI_SIMULATOR_DEFAULTS, evaluateRoi } from "@/lib/roi";

describe("evaluateRoi", () => {
  it("matches the live backend response at default parameters", () => {
    // Values captured directly from POST /simulator/evaluate with {} (all
    // defaults) against the running backend — this is a parity test, not
    // just an internal-consistency check.
    const result = evaluateRoi(ROI_SIMULATOR_DEFAULTS);

    expect(result.daily_slots_at_risk).toBe(108.0);
    expect(result.annual_revenue_leakage_lkr).toBe(241_056_000);
    expect(result.annual_revenue_recovered_lkr).toBe(120_555_119);
    expect(result.recovered_doctor_hours_annual).toBe(3348.8);
    expect(result.nurse_phone_hours_saved_monthly).toBe(773.5);
    expect(result.net_roi_multiple).toBe(67.0);
  });

  it("scales revenue leakage linearly with clinic volume", () => {
    const small = evaluateRoi({ ...ROI_SIMULATOR_DEFAULTS, daily_clinics_count: 10 });
    const triple = evaluateRoi({ ...ROI_SIMULATOR_DEFAULTS, daily_clinics_count: 30 });
    expect(triple.annual_revenue_leakage_lkr).toBeCloseTo(small.annual_revenue_leakage_lkr * 3, -2);
  });

  it("increasing AI intervention coverage never decreases recovered revenue", () => {
    const lowCoverage = evaluateRoi({ ...ROI_SIMULATOR_DEFAULTS, ai_intervention_coverage: 0.1 });
    const highCoverage = evaluateRoi({ ...ROI_SIMULATOR_DEFAULTS, ai_intervention_coverage: 0.9 });
    expect(highCoverage.annual_revenue_recovered_lkr).toBeGreaterThan(lowCoverage.annual_revenue_recovered_lkr);
  });

  it("recovered revenue never exceeds the leakage it is recovering from", () => {
    const result = evaluateRoi({ ...ROI_SIMULATOR_DEFAULTS, ai_intervention_coverage: 1.0 });
    expect(result.annual_revenue_recovered_lkr).toBeLessThanOrEqual(result.annual_revenue_leakage_lkr);
  });
});
