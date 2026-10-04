import { Cpu, Layers, BarChart3, Database, TriangleAlert, Rows3, Percent, Split, Target, TrendingUp, Gauge, Crosshair, Zap, type LucideIcon } from "lucide-react";

import { getModelInfo } from "@/lib/api";
import { BackendUnreachable } from "@/components/backend-unreachable";
import { PageHeader, Panel } from "@/components/page-header";
import { SyntheticBadge } from "@/components/synthetic-badge";
import type { ModelComparisonRow, ModelInfo } from "@/lib/types";

const num = (v: number | null | undefined, digits = 3) => (v == null ? "—" : v.toFixed(digits));
const pct = (v: number | null | undefined, digits = 1) => (v == null ? "—" : `${(v * 100).toFixed(digits)}%`);
const int = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("en-US"));

type Tone = "violet" | "rose" | "emerald" | "amber" | "sky" | "indigo";

const TONES: Record<Tone, { card: string; pill: string; value: string }> = {
  violet: { card: "border-violet-500/30 bg-gradient-to-br from-violet-500/10 to-card", pill: "bg-violet-500/15 text-violet-700 dark:text-violet-300", value: "text-violet-700 dark:text-violet-300" },
  rose: { card: "border-rose-500/30 bg-gradient-to-br from-rose-500/10 to-card", pill: "bg-rose-500/15 text-rose-700 dark:text-rose-300", value: "text-rose-700 dark:text-rose-300" },
  emerald: { card: "border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-card", pill: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", value: "text-emerald-700 dark:text-emerald-300" },
  amber: { card: "border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-card", pill: "bg-amber-500/15 text-amber-700 dark:text-amber-300", value: "text-amber-700 dark:text-amber-300" },
  sky: { card: "border-sky-500/30 bg-gradient-to-br from-sky-500/10 to-card", pill: "bg-sky-500/15 text-sky-700 dark:text-sky-300", value: "text-sky-700 dark:text-sky-300" },
  indigo: { card: "border-indigo-500/30 bg-gradient-to-br from-indigo-500/10 to-card", pill: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300", value: "text-indigo-700 dark:text-indigo-300" },
};

function Stat({
  label,
  value,
  sub,
  tone = "violet",
  tag,
  icon: Icon,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: Tone;
  tag?: string;
  icon?: LucideIcon;
}) {
  const t = TONES[tone];
  return (
    <div className={`rounded-2xl border p-4 shadow-xs ${t.card}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
          {Icon && (
            <span className={`flex size-5 items-center justify-center rounded-md ${t.pill}`}>
              <Icon className="size-3" />
            </span>
          )}
          {label}
        </div>
        {tag && <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${t.pill}`}>{tag}</span>}
      </div>
      <div className={`mt-2 font-mono text-2xl font-extrabold ${t.value}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

const TIER_STYLE: Record<string, string> = {
  High: "text-rose-500 bg-rose-500/10 border-rose-500/30",
  Medium: "text-amber-500 bg-amber-500/10 border-amber-500/30",
  Low: "text-emerald-500 bg-emerald-500/10 border-emerald-500/30",
};

function ciText(ci: Record<string, unknown>, key: string): string | null {
  const hit = Object.entries(ci).find(([k]) => k.toLowerCase().startsWith(key.toLowerCase()));
  if (!hit) return null;
  const v = hit[1];
  if (Array.isArray(v) && v.length === 2) return `95% CI ${num(Number(v[0]))} – ${num(Number(v[1]))}`;
  return null;
}

export default async function ModelPage() {
  let info: ModelInfo;
  try {
    info = await getModelInfo();
  } catch (err) {
    return <BackendUnreachable error={err} />;
  }

  const shap = Object.entries(info.top_shap).sort((a, b) => b[1] - a[1]);
  const shapMax = Math.max(...shap.map(([, v]) => v), 1e-9);
  const best = (col: keyof ModelComparisonRow, lower = false) => {
    const vals = info.comparison_table.map((r) => r[col]).filter((v): v is number => typeof v === "number");
    return vals.length ? (lower ? Math.min(...vals) : Math.max(...vals)) : null;
  };
  const synthetic = (info.data_sources?.synthetic ?? 0) > 0;
  const ci = info.confidence_intervals ?? {};

  const tiers = [
    { tier: "High" as const, range: `risk ≥ ${num(info.thresholds.high)}` },
    { tier: "Medium" as const, range: `${num(info.thresholds.medium)} ≤ risk < ${num(info.thresholds.high)}` },
    { tier: "Low" as const, range: `risk < ${num(info.thresholds.medium)}` },
  ];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        back={{ href: "/", label: "Dashboard" }}
        title="Model Hub"
        subtitle={`Active bundle ${info.version} — XGBoost with isotonic calibration and SHAP explanations`}
        actions={
          <div className="flex items-center gap-2">
            {synthetic && <SyntheticBadge />}
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 font-mono text-xs text-muted-foreground">
              <Cpu className="size-3.5" /> {info.version}
            </span>
          </div>
        }
      />

      <div role="note" className="flex items-start gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-200">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" />
        <div>
          <div className="font-bold">Limitation</div>
          <p>{info.limitation}</p>
        </div>
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat tone="violet" icon={Rows3} tag="Training" label="Training rows" value={int(info.n_rows)} sub={info.date_range.start ? `${info.date_range.start} → ${info.date_range.end}` : undefined} />
        <Stat tone="amber" icon={Percent} tag="Base rate" label="Base no-show rate" value={pct(info.base_rate)} sub="share of no-shows in the training data" />
        <Stat
          tone="sky"
          icon={Split}
          tag="Chronological"
          label="Split (train / val / test)"
          value={info.split ? `${int(info.split.train)} / ${int(info.split.val)} / ${int(info.split.test)}` : "—"}
          sub="oldest rows train, newest test"
        />
        <Stat tone="indigo" icon={Target} tag="Ceiling" label="Oracle AUC" value={num(info.oracle_auc)} sub="ceiling given the generator’s true probabilities" />
      </section>

      <Panel title="Test-set metrics" subtitle="Held-out test split, from metrics.json">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Stat tone="violet" icon={TrendingUp} tag="Ranking" label="ROC-AUC" value={num(info.metrics.roc_auc)} sub={ciText(ci, "roc") ?? "higher is better"} />
          <Stat tone="sky" icon={Crosshair} tag="Precision" label="PR-AUC" value={num(info.metrics.pr_auc)} sub={ciText(ci, "pr") ?? "higher is better"} />
          <Stat tone="emerald" icon={Gauge} tag="Calibration" label="Brier" value={num(info.metrics.brier)} sub={ciText(ci, "brier") ?? "lower is better"} />
          <Stat tone="amber" icon={Target} tag="Top 20%" label="Recall @ top 20%" value={pct(info.metrics.recall_top20)} sub={`precision ${pct(info.metrics.precision_top20)}`} />
          <Stat tone="rose" icon={Zap} tag="Lift" label="Lift @ top 20%" value={info.metrics.lift_top20 == null ? "—" : `${info.metrics.lift_top20.toFixed(2)}×`} sub="vs. contacting at random" />
        </div>
        {Object.keys(ci).length === 0 && (
          <p className="mt-3 text-[11px] text-muted-foreground">No confidence intervals are stored in this bundle’s metrics.json.</p>
        )}
      </Panel>

      <Panel title="Model comparison" subtitle="Same split, same features; test set">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="py-2 pr-4 font-semibold">Model</th>
                <th className="px-2 font-semibold">ROC-AUC</th>
                <th className="px-2 font-semibold">PR-AUC</th>
                <th className="px-2 font-semibold">Brier</th>
                <th className="px-2 font-semibold">Recall@20%</th>
                <th className="px-2 font-semibold">Lift@20%</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {info.comparison_table.map((r) => (
                <tr key={r.model} className="border-b border-border/50 last:border-none">
                  <td className="py-2 pr-4 font-sans font-semibold text-foreground">{r.model}</td>
                  <td className={`px-2 ${r.ROC_AUC === best("ROC_AUC") ? "font-bold text-foreground" : ""}`}>{num(r.ROC_AUC)}</td>
                  <td className={`px-2 ${r.PR_AUC === best("PR_AUC") ? "font-bold text-foreground" : ""}`}>{num(r.PR_AUC)}</td>
                  <td className={`px-2 ${r.Brier === best("Brier", true) ? "font-bold text-foreground" : ""}`}>{num(r.Brier)}</td>
                  <td className="px-2">{num(r.Recall_top20)}</td>
                  <td className="px-2">{num(r.Lift_top20, 2)}</td>
                </tr>
              ))}
              {info.comparison_table.length === 0 && (
                <tr><td colSpan={6} className="py-3 font-sans text-muted-foreground">No comparison table in this bundle.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel
        title="Risk tiers"
        subtitle={info.thresholds.rule ?? "Cut-offs from thresholds.json"}
        action={<Layers className="size-4 text-primary" />}
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {tiers.map((t) => (
            <div key={t.tier} className={`rounded-xl border p-4 ${TIER_STYLE[t.tier]}`}>
              <div className="text-sm font-bold">{t.tier}</div>
              <div className="my-1 font-mono text-xs font-semibold">{t.range}</div>
              <p className="text-xs opacity-90">{info.recommendations[t.tier]}</p>
            </div>
          ))}
        </div>
      </Panel>

      <Panel
        title="Top features by mean |SHAP|"
        subtitle="Global importance on the log-odds scale, from metrics.json"
        action={<BarChart3 className="size-4 text-primary" />}
      >
        <div className="flex flex-col gap-2.5">
          {shap.map(([feature, value]) => (
            <div key={feature} className="flex items-center gap-3 text-xs">
              <span className="w-56 shrink-0 truncate font-mono text-foreground">{feature}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted/50">
                <div className="h-2 rounded-full bg-primary" style={{ width: `${(value / shapMax) * 100}%` }} />
              </div>
              <span className="w-14 text-right font-mono text-muted-foreground">{value.toFixed(3)}</span>
            </div>
          ))}
          {shap.length === 0 && <p className="text-xs text-muted-foreground">No SHAP summary in this bundle.</p>}
        </div>
      </Panel>

      <Panel title="Provenance" action={<Database className="size-4 text-primary" />}>
        <dl className="grid grid-cols-1 gap-x-8 gap-y-2 text-xs sm:grid-cols-2">
          <div><dt className="text-muted-foreground">Data source</dt><dd className="font-mono text-foreground">{info.data_source ?? "not recorded in bundle"}</dd></div>
          <div><dt className="text-muted-foreground">Trained</dt><dd className="font-mono text-foreground">{info.created_at ?? "not recorded in bundle"}</dd></div>
          <div><dt className="text-muted-foreground">Numeric features</dt><dd className="font-mono text-foreground">{info.features.numeric.length}</dd></div>
          <div><dt className="text-muted-foreground">Categorical features</dt><dd className="font-mono text-foreground">{Object.keys(info.features.categorical).join(", ")}</dd></div>
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">Appointments in this system by data source</dt>
            <dd className="font-mono text-foreground">
              {info.data_sources && Object.keys(info.data_sources).length
                ? Object.entries(info.data_sources).map(([k, v]) => `${k}: ${int(v)}`).join(" · ")
                : "none"}
            </dd>
          </div>
        </dl>
      </Panel>
    </div>
  );
}
