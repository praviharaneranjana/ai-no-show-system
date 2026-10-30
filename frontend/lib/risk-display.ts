// Calibrated scores above ~60% rest on very few historical patients (about 230 of ~69k scored
// appointments), and the observed no-show rate there is roughly 45-50%, not the 80-95% the raw
// score implies. Display is capped; stored scores and expected-count maths are unchanged.
export const RISK_DISPLAY_CAP = 0.6;

export function riskPctLabel(score: number): string {
  const s = Math.min(Math.max(score, 0), 1);
  return s > RISK_DISPLAY_CAP ? `${Math.round(RISK_DISPLAY_CAP * 100)}%+` : `${Math.round(s * 100)}%`;
}
