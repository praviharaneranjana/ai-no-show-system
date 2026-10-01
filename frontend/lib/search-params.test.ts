import { describe, expect, it } from "vitest";

import { parseRegisterParams, registerHref } from "@/lib/search-params";

describe("parseRegisterParams", () => {
  it("parses the dashboard deep links", () => {
    const q = parseRegisterParams({ view: "upcoming", window_days: "7", risk: "High" });
    expect(q).toMatchObject({ view: "upcoming", window_days: 7, risk: "High", page: 1 });
  });

  it("ignores unknown or malicious values", () => {
    const q = parseRegisterParams({ view: "drop table", risk: "Extreme", window_days: "-3", page: "abc", sort: "x" });
    expect(q.view).toBeUndefined();
    expect(q.risk).toBeUndefined();
    expect(q.window_days).toBeUndefined();
    expect(q.sort).toBeUndefined();
    expect(q.page).toBe(1);
  });

  it("takes the first value of repeated params and trims search", () => {
    expect(parseRegisterParams({ q: ["  silva ", "x"] }).q).toBe("silva");
  });
});

describe("registerHref", () => {
  it("round-trips filters and only emits page > 1", () => {
    const q = parseRegisterParams({ view: "today", q: "perera" });
    expect(registerHref("/appointments", q)).toBe("/appointments?view=today&q=perera");
    expect(registerHref("/appointments", q, 3)).toBe("/appointments?view=today&q=perera&page=3");
  });
});
