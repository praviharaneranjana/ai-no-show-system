import type { RegisterQuery, RegisterSort, RegisterView, RiskCategory } from "@/lib/types";

export type RawSearchParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

const VIEWS: RegisterView[] = ["all", "today", "high_risk", "pending_outcome", "upcoming"];
const SORTS: RegisterSort[] = ["risk", "date_desc", "date_asc", "name"];
const RISKS: RiskCategory[] = ["High", "Medium", "Low"];

/** Parses the register's URL filters defensively — anything unrecognised is ignored. */
export function parseRegisterParams(raw: RawSearchParams, pageSize = 25): RegisterQuery {
  const view = first(raw.view) as RegisterView | undefined;
  const sort = first(raw.sort) as RegisterSort | undefined;
  const risk = first(raw.risk) as RiskCategory | undefined;
  const page = Number.parseInt(first(raw.page) ?? "1", 10);
  const windowDays = Number.parseInt(first(raw.window_days) ?? "", 10);

  return {
    page: Number.isFinite(page) && page > 0 ? page : 1,
    page_size: pageSize,
    view: view && VIEWS.includes(view) ? view : undefined,
    sort: sort && SORTS.includes(sort) ? sort : undefined,
    risk: risk && RISKS.includes(risk) ? risk : undefined,
    window_days: Number.isFinite(windowDays) && windowDays > 0 && windowDays <= 365 ? windowDays : undefined,
    q: first(raw.q)?.trim() || undefined,
    department: first(raw.department) || undefined,
    doctor: first(raw.doctor) || undefined,
  };
}

/** Builds a query string from a RegisterQuery (omitting defaults), optionally overriding the page. */
export function registerHref(base: string, query: RegisterQuery, page?: number): string {
  const sp = new URLSearchParams();
  const set = (k: string, v: string | number | undefined) => v !== undefined && v !== "" && sp.set(k, String(v));
  set("view", query.view);
  set("risk", query.risk);
  set("window_days", query.window_days);
  set("q", query.q);
  set("department", query.department);
  set("doctor", query.doctor);
  set("sort", query.sort);
  const p = page ?? query.page;
  if (p && p > 1) sp.set("page", String(p));
  const s = sp.toString();
  return s ? `${base}?${s}` : base;
}
