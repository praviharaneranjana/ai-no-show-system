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
