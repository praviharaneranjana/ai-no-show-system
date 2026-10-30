"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

const CLASS =
  "h-9 rounded-lg border border-input bg-card px-2.5 text-xs text-foreground outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20";

// A <select> whose value lives in the URL (?param=value) so server pages re-render with it.
export function UrlSelect({
  param,
  options,
  allLabel,
  resetParams = ["page"],
}: {
  param: string;
  options: { value: string; label: string }[];
  /** Label for the empty value; omit when one option must always be chosen. */
  allLabel?: string;
  resetParams?: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  return (
    <select
      aria-label={param}
      value={params.get(param) ?? ""}
      onChange={(e) => {
        const next = new URLSearchParams(params.toString());
        if (e.target.value) next.set(param, e.target.value);
        else next.delete(param);
        for (const p of resetParams) next.delete(p);
        const qs = next.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname);
      }}
      className={CLASS}
    >
      {allLabel !== undefined && <option value="">{allLabel}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
