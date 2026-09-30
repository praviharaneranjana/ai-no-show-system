import { describe, expect, it } from "vitest";

import { cn, formatLkr, formatOddsMultiplier } from "@/lib/utils";

describe("formatLkr", () => {
  it("formats millions with 2 decimal places", () => {
    expect(formatLkr(241_056_000)).toBe("LKR 241.06M");
    expect(formatLkr(1_800_000)).toBe("LKR 1.80M");
  });

  it("formats thousands with 1 decimal place", () => {
    expect(formatLkr(36_000)).toBe("LKR 36.0K");
    expect(formatLkr(4_500)).toBe("LKR 4.5K");
  });

  it("formats sub-thousand amounts as whole LKR", () => {
    expect(formatLkr(999)).toBe("LKR 999");
    expect(formatLkr(0)).toBe("LKR 0");
  });

  it("uses the million boundary at exactly 1,000,000", () => {
    expect(formatLkr(1_000_000)).toBe("LKR 1.00M");
  });

  it("uses the thousand boundary at exactly 1,000", () => {
    expect(formatLkr(1_000)).toBe("LKR 1.0K");
  });
});

describe("cn", () => {
  it("merges class names and resolves Tailwind conflicts (last one wins)", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("drops falsy values", () => {
    expect(cn("a", false, null, undefined, "b")).toBe("a b");
  });
});

describe("formatOddsMultiplier", () => {
  it("turns SHAP log-odds into an odds multiplier", () => {
    expect(formatOddsMultiplier(0)).toBe("×1.00");
    expect(formatOddsMultiplier(Math.log(2))).toBe("×2.00");
    expect(formatOddsMultiplier(-Math.log(2))).toBe("×0.50");
  });
});
