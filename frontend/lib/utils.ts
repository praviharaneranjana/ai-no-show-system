import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatLkr(amount: number) {
  if (amount >= 1_000_000) {
    return `LKR ${(amount / 1_000_000).toFixed(2)}M`;
  }
  if (amount >= 1_000) {
    return `LKR ${(amount / 1_000).toFixed(1)}K`;
  }
  return `LKR ${amount.toFixed(0)}`;
}

/**
 * SHAP contributions are log-odds. Exponentiating one gives the multiplier a factor applies to
 * the odds of a no-show (x1.50 = 50% higher odds, x0.80 = 20% lower), which is easier to read
 * than a raw log-odds value and is not a percentage-point change in risk.
 */
export function formatOddsMultiplier(contribution: number): string {
  return `×${Math.exp(contribution).toFixed(2)}`;
}
