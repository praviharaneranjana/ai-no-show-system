import Link from "next/link";
import {
  ArrowLeft,
  Sparkles,
  ShieldCheck,
  TrendingUp,
  Cpu,
  BarChart3,
  Layers,
  Database,
  CheckCircle2,
  AlertTriangle,
  Info,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function ModelPage() {
  const modelMetrics = [
    { label: "ROC-AUC Score", value: "0.672", sub: "Discrimination capability across all decision thresholds", status: "good" },
    { label: "PR-AUC Score", value: "0.266", sub: "Precision-Recall performance vs 0.159 random baseline", status: "good" },
    { label: "Brier Score", value: "0.124", sub: "Calibrated probability error (lower is better)", status: "optimal" },
    { label: "Baseline No-Show", value: "15.9%", sub: "Hospital empirical historical non-attendance rate", status: "neutral" },
  ];

  const thresholds = [
    {
      tier: "High Risk",
      range: "> 0.23 calibrated probability",
      cohort: "Top ~10% of bookings",
      action: "Mandatory phone outreach + smart overbooking candidate",
      color: "text-rose-400 bg-rose-500/10 border-rose-500/30",
    },
    {
      tier: "Medium Risk",
      range: "0.13 – 0.23 calibrated probability",
      cohort: "Next ~20% of bookings",
      action: "Proactive multilingual WhatsApp / SMS reminder",
      color: "text-amber-400 bg-amber-500/10 border-amber-500/30",
    },
    {
      tier: "Low Risk",
      range: "< 0.13 calibrated probability",
      cohort: "Remaining ~70% of bookings",
      action: "Standard digital confirmation (no staff intervention)",
      color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
    },
  ];

  const shapDrivers = [
    { feature: "lead_days", impact: "+0.42 log-odds", desc: "Long booking horizon (>21 days) significantly increases forgetfulness", pct: 85 },
    { feature: "prior_no_show_rate", impact: "+0.38 log-odds", desc: "Historical patient non-attendance frequency with Laplace smoothing", pct: 78 },
    { feature: "distance_km", impact: "+0.25 log-odds", desc: "Patients travelling >20 km across Western/Southern province boundaries", pct: 55 },
    { feature: "heavy_rain (Monsoon)", impact: "+0.18 log-odds", desc: "Severe localized Colombo rain causing transit disruptions", pct: 40 },
    { feature: "age (Elderly)", impact: "-0.16 log-odds", desc: "Senior patients (60+) demonstrate significantly higher adherence", pct: 35, positive: true },
    { feature: "sms_received", impact: "-0.12 log-odds", desc: "Proactive SMS delivery confirmation reduces friction", pct: 28, positive: true },
  ];

  return (
    <div className="flex w-full flex-col gap-6 p-6 lg:p-8 max-w-6xl mx-auto">
      {/* Back link & Title */}
      <div className="flex flex-col gap-2">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors w-fit"
        >
          <ArrowLeft className="size-3.5" />
          <span>Back to dashboard</span>
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/80 pb-5">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Cpu className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                  SHAI Model Hub & Architecture
                </h1>
                <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                  Production v1.0
                </Badge>
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground">
                XGBoost attendance classifier with isotonic calibration and Sri Lankan contextual layer.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground bg-card border border-border/80 rounded-lg px-3 py-1.5">
            <ShieldCheck className="size-4 text-emerald-400" />
            <span>Fairness & Guardrails Active</span>
          </div>
        </div>
      </div>

      {/* 1. Core Model Performance Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {modelMetrics.map((m, idx) => (
          <Card key={idx} className="border-border/80 bg-card shadow-xs">
            <CardContent className="p-5 flex flex-col justify-between h-full">
              <span className="text-xs font-medium text-muted-foreground">{m.label}</span>
              <div className="my-2">
                <span className="text-3xl font-extrabold tracking-tight text-foreground font-mono">
                  {m.value}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-normal">{m.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 2. Decision Thresholds & Clinical Routing Policy */}
      <Card className="border-border/80 bg-card shadow-xs">
        <CardHeader className="border-b border-border/60 pb-3">
          <div className="flex items-center gap-2">
            <Layers className="size-4 text-primary" />
            <CardTitle className="text-base">Decision Thresholds & Action Routing</CardTitle>
          </div>
          <CardDescription className="text-xs">
            How model predictions are mapped to concrete hospital clinical actions and staff workflows.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {thresholds.map((t, idx) => (
              <div
                key={idx}
                className={`rounded-xl border p-4 flex flex-col justify-between ${t.color}`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-sm">{t.tier}</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-background/50">
                      {t.cohort}
                    </span>
                  </div>
                  <div className="text-xs font-mono font-semibold mb-2">{t.range}</div>
                  <p className="text-xs opacity-90 leading-relaxed">{t.action}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 3. Global SHAP Feature Importance */}
      <Card className="border-border/80 bg-card shadow-xs">
        <CardHeader className="border-b border-border/60 pb-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="size-4 text-primary" />
            <CardTitle className="text-base">Global Feature Drivers (SHAP Value Attribution)</CardTitle>
          </div>
          <CardDescription className="text-xs">
            Attribution of factors driving attendance probability calculated across 110,527 outpatient records.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 flex flex-col gap-4">
          {shapDrivers.map((driver, idx) => (
            <div key={idx} className="flex flex-col gap-1.5 border-b border-border/40 pb-3 last:border-none">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-foreground">{driver.feature}</span>
                  <span className="text-[11px] text-muted-foreground">{driver.desc}</span>
                </div>
                <span
                  className={`font-mono font-bold ${
                    driver.positive ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {driver.impact}
                </span>
              </div>
              <div className="w-full bg-muted/40 rounded-full h-1.5 overflow-hidden">
                <div
                  className={`h-1.5 rounded-full ${
                    driver.positive ? "bg-emerald-500" : "bg-rose-500"
                  }`}
                  style={{ width: `${driver.pct}%` }}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* 4. Model Provenance & Pipeline */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-border/80 bg-card shadow-xs">
          <CardHeader className="border-b border-border/60 pb-3">
            <div className="flex items-center gap-2">
              <Database className="size-4 text-primary" />
              <CardTitle className="text-sm">Training Dataset & Provenance</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-5 text-xs text-muted-foreground flex flex-col gap-2.5 leading-relaxed">
            <div>
              <strong className="text-foreground">Cohort:</strong> 110,527 outpatient appointments from Colombo General Hospital.
            </div>
            <div>
              <strong className="text-foreground">Time Split:</strong> Out-of-time chronological validation split (80% train, 20% holdout).
            </div>
            <div>
              <strong className="text-foreground">Calibration:</strong> Isotonic regression fitted strictly on validation fold to preserve empirical probabilities.
            </div>
            <div>
              <strong className="text-foreground">Protected Attributes:</strong> Ethnicity, religion, and caste are strictly excluded from the feature space.
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/80 bg-card shadow-xs">
          <CardHeader className="border-b border-border/60 pb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="size-4 text-primary" />
              <CardTitle className="text-sm">Contextual Multipliers Layer</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-5 text-xs text-muted-foreground flex flex-col gap-2.5 leading-relaxed">
            <div>
              <strong className="text-foreground">Distance Penalty:</strong> Real road transit distances derived from OSRM Sri Lanka network.
            </div>
            <div>
              <strong className="text-foreground">Payment Multiplier:</strong> Unpaid cash bookings have 1.25x friction vs prepaid online (0.75x).
            </div>
            <div>
              <strong className="text-foreground">Monsoon Adjustment:</strong> Severe rain alerts scale transit risk by 1.15x for patients commuting &gt;10km.
            </div>
            <div>
              <strong className="text-foreground">Clinical Guardrails:</strong> Orthopedics & surgical clinics are flagged as teleconsultation-ineligible.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
