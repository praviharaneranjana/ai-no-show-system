import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { ContextualAdjustmentPanel } from "@/components/contextual-adjustment-panel";
import type { ContextualAdjustment } from "@/lib/types";

function makeAdjustment(overrides: Partial<ContextualAdjustment> = {}): ContextualAdjustment {
  return {
    ml_risk_score: 0.2618,
    distance_km: 62.5,
    distance_multiplier: 1.1875,
    booking_channel: "Hospital Counter",
    channel_multiplier: 1.08,
    payment_mode: "Cash",
    payment_multiplier: 1.06,
    combined_multiplier: 1.3595,
    final_risk_score: 0.3559,
    method: "rule_based_heuristic",
    note: "Illustrative domain-informed multipliers, not fitted on labelled local outcomes.",
    ...overrides,
  };
}

describe("ContextualAdjustmentPanel", () => {
  it("renders the ML base score and final adjusted score as percentages", () => {
    render(<ContextualAdjustmentPanel adjustment={makeAdjustment()} />);

    expect(screen.getByText("26%")).toBeInTheDocument(); // ml_risk_score 0.2618 -> 26%
    expect(screen.getByText("36%")).toBeInTheDocument(); // final_risk_score 0.3559 -> 36%
  });

  it("rounds a risk-raising multiplier to a positive percentage badge", () => {
    render(<ContextualAdjustmentPanel adjustment={makeAdjustment({ distance_multiplier: 1.1875 })} />);
    expect(screen.getByText("+19%")).toBeInTheDocument();
  });

  it("rounds a risk-lowering multiplier to a negative percentage badge", () => {
    render(
      <ContextualAdjustmentPanel
        adjustment={makeAdjustment({ payment_mode: "Credit Card (NSR Protected)", payment_multiplier: 0.88 })}
      />
    );
    expect(screen.getByText("-12%")).toBeInTheDocument();
  });

  it("labels a 1.0 multiplier as neutral rather than +0%/-0%", () => {
    render(
      <ContextualAdjustmentPanel
        adjustment={makeAdjustment({
          distance_km: null,
          distance_multiplier: 1.0,
          booking_channel: null,
          channel_multiplier: 1.0,
          payment_mode: null,
          payment_multiplier: 1.0,
          combined_multiplier: 1.0,
        })}
      />
    );
    const neutralLabels = screen.getAllByText("neutral");
    expect(neutralLabels).toHaveLength(3);
    expect(screen.getAllByText("Not on record")).toHaveLength(3);
  });

  it("shows the honesty note distinguishing this from the ML model", () => {
    render(<ContextualAdjustmentPanel adjustment={makeAdjustment()} />);
    expect(screen.getByText("rule-based, not ML")).toBeInTheDocument();
  });
});
