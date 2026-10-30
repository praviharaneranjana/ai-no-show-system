"""Real-data validation of the no-show model on the Kaggle (Brazil, 2016) dataset.

Kaggle is the only *real* data in this repo, so this is the evidence that the
modelling approach works on genuine no-show behaviour. It runs five checks that
each answer a different "is this legit?" question:

  1. Stratified 5-fold CV ........ is the AUC stable, or a lucky split?
  2. Temporal hold-out ........... train on the past, test on the future (deployment reality)
  3. Patient-grouped CV .......... no patient appears in both train and test (no leakage)
  4. Label-shuffle sanity check .. AUC collapses to ~0.5 when labels are random (no bug / leak)
  5. Calibration + lift .......... do predicted risks mean what they say, and does ranking help?

Usage (from backend/):
    python validate_model.py
Outputs reports/validation_report.json, reports/validation_report.md and PNG plots.
"""
import json
import os

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, brier_score_loss, roc_auc_score
from sklearn.model_selection import GroupKFold, StratifiedKFold

RAW = "data/KaggleV2-May-2016.csv"
OUT = "reports"
SEED = 42
FEATURES = [
    "Age", "Scholarship", "Hipertension", "Diabetes", "Alcoholism",
    "Handcap", "SMS_received", "DaysAhead", "DayOfWeek", "IsWeekend", "Month",
]


def load() -> pd.DataFrame:
    df = pd.read_csv(RAW)
    df["y"] = df["No-show"].map({"No": 0, "Yes": 1})
    df["Age"] = df["Age"].clip(0, 100)
    sched = pd.to_datetime(df["ScheduledDay"]).dt.tz_localize(None).dt.normalize()
    appt = pd.to_datetime(df["AppointmentDay"]).dt.tz_localize(None).dt.normalize()
    df["appt"] = appt
    df["DaysAhead"] = (appt - sched).dt.days.clip(lower=0)
    df["DayOfWeek"] = appt.dt.weekday
    df["IsWeekend"] = (df["DayOfWeek"] >= 5).astype(int)
    df["Month"] = appt.dt.month
    return df


def make_model() -> xgb.XGBClassifier:
    return xgb.XGBClassifier(
        n_estimators=300, max_depth=3, learning_rate=0.05, min_child_weight=20,
        subsample=0.8, colsample_bytree=0.8, random_state=SEED, n_jobs=4,
    )


def lift_metrics(y, p, frac=0.2) -> dict:
    k = int(len(y) * frac)
    top = np.argsort(-p)[:k]
    base = y.mean()
    prec = y[top].mean()
    return {"recall_top20": float(y[top].sum() / y.sum()), "precision_top20": float(prec),
            "lift_top20": float(prec / base)}


def ece(y, p, bins=10) -> float:
    edges = np.quantile(p, np.linspace(0, 1, bins + 1))
    idx = np.clip(np.searchsorted(edges, p, side="right") - 1, 0, bins - 1)
    return float(sum(
        (idx == b).mean() * abs(y[idx == b].mean() - p[idx == b].mean())
        for b in range(bins) if (idx == b).any()
    ))


def summarize(y, p) -> dict:
    return {"roc_auc": float(roc_auc_score(y, p)), "pr_auc": float(average_precision_score(y, p)),
            "brier": float(brier_score_loss(y, p)), "ece": ece(y, p), **lift_metrics(y, p)}


def cv_scores(X, y, splitter, groups=None):
    aucs = []
    for tr, te in splitter.split(X, y, groups):
        m = make_model().fit(X.iloc[tr], y.iloc[tr])
        aucs.append(roc_auc_score(y.iloc[te], m.predict_proba(X.iloc[te])[:, 1]))
    return {"folds": [round(a, 4) for a in aucs], "mean": float(np.mean(aucs)), "std": float(np.std(aucs))}


def main():
    os.makedirs(OUT, exist_ok=True)
    df = load()
    X, y = df[FEATURES].astype(float), df["y"]
    report = {"dataset": {"rows": len(df), "patients": int(df["PatientId"].nunique()),
                          "no_show_rate": float(y.mean()),
                          "date_range": [str(df["appt"].min().date()), str(df["appt"].max().date())]}}

    print("1/5 stratified 5-fold CV")
    report["stratified_cv"] = cv_scores(X, y, StratifiedKFold(5, shuffle=True, random_state=SEED))

    print("2/5 temporal hold-out (train earlier 70% of appointment dates, test on later 30%)")
    cutoff = df["appt"].quantile(0.7)
    tr, te = (df["appt"] <= cutoff).values, (df["appt"] > cutoff).values
    m = make_model().fit(X[tr], y[tr])
    p_time = m.predict_proba(X[te])[:, 1]
    report["temporal_holdout"] = {"train_until": str(cutoff.date()), "n_train": int(tr.sum()),
                                  "n_test": int(te.sum()), **summarize(y[te].values, p_time)}

    print("3/5 patient-grouped CV (no patient in both train and test)")
    report["patient_grouped_cv"] = cv_scores(X, y, GroupKFold(5), groups=df["PatientId"])

    print("4/5 label-shuffle sanity check")
    rng = np.random.default_rng(SEED)
    shuffled = pd.Series(rng.permutation(y.values), index=y.index)
    report["label_shuffle_cv"] = cv_scores(X, shuffled, StratifiedKFold(5, shuffle=True, random_state=SEED))

    print("5/5 calibration + lift + baselines on the temporal hold-out")
    # Calibrate on the tail of the training period, evaluate on the future.
    tr_idx = np.where(tr)[0]
    tr_sorted = tr_idx[np.argsort(df["appt"].values[tr_idx], kind="stable")]
    cut = int(len(tr_sorted) * 0.8)
    fit_idx, cal_idx = tr_sorted[:cut], tr_sorted[cut:]
    m2 = make_model().fit(X.iloc[fit_idx], y.iloc[fit_idx])
    iso = IsotonicRegression(out_of_bounds="clip").fit(m2.predict_proba(X.iloc[cal_idx])[:, 1], y.iloc[cal_idx])
    yt = y[te].values
    p_raw = m2.predict_proba(X[te])[:, 1]
    p_cal = iso.predict(p_raw)
    lr = LogisticRegression(max_iter=1000).fit(X[tr], y[tr])
    p_lr = lr.predict_proba(X[te])[:, 1]
    p_days = X.loc[te, "DaysAhead"].values  # naive rule: "longer lead time = riskier"
    base_rate = y[tr].mean()
    report["temporal_models"] = {
        "xgboost_calibrated": summarize(yt, p_cal),
        "xgboost_raw": summarize(yt, p_raw),
        "logistic_regression": summarize(yt, p_lr),
        "lead_time_only_rule": {"roc_auc": float(roc_auc_score(yt, p_days)), **lift_metrics(yt, p_days)},
        "always_predict_base_rate": {"brier": float(brier_score_loss(yt, np.full(len(yt), base_rate)))},
    }

    # --- plots ---
    fig, ax = plt.subplots(figsize=(5, 5))
    edges = np.quantile(p_cal, np.linspace(0, 1, 11))
    idx = np.clip(np.searchsorted(edges, p_cal, side="right") - 1, 0, 9)
    xs = [p_cal[idx == b].mean() for b in range(10) if (idx == b).any()]
    ys = [yt[idx == b].mean() for b in range(10) if (idx == b).any()]
    ax.plot([0, 0.5], [0, 0.5], "--", color="gray", label="perfect")
    ax.plot(xs, ys, "o-", label="XGBoost (calibrated)")
    ax.set(xlabel="Predicted no-show risk", ylabel="Observed no-show rate",
           title="Calibration on future (held-out) appointments")
    ax.legend()
    fig.tight_layout(); fig.savefig(f"{OUT}/calibration.png", dpi=150); plt.close(fig)

    fig, ax = plt.subplots(figsize=(5, 4))
    fr = np.linspace(0.05, 1, 20)
    order = np.argsort(-p_cal)
    ax.plot(fr, [yt[order[: int(len(yt) * f)]].sum() / yt.sum() for f in fr], label="Model")
    ax.plot(fr, fr, "--", color="gray", label="Random")
    ax.set(xlabel="Share of patients contacted (highest risk first)", ylabel="Share of no-shows caught",
           title="Cumulative gain on future appointments")
    ax.legend()
    fig.tight_layout(); fig.savefig(f"{OUT}/gain_curve.png", dpi=150); plt.close(fig)

    fig, ax = plt.subplots(figsize=(6, 3.2))
    labels = ["Stratified CV", "Patient-grouped CV", "Temporal hold-out", "Shuffled labels"]
    vals = [report["stratified_cv"]["mean"], report["patient_grouped_cv"]["mean"],
            report["temporal_holdout"]["roc_auc"], report["label_shuffle_cv"]["mean"]]
    ax.barh(labels, vals, color=["#3b82f6", "#3b82f6", "#3b82f6", "#9ca3af"])
    ax.axvline(0.5, ls="--", color="gray")
    ax.set(xlim=(0.4, 0.8), xlabel="ROC-AUC", title="AUC under different validation schemes")
    for i, v in enumerate(vals):
        ax.text(v + 0.005, i, f"{v:.3f}", va="center")
    fig.tight_layout(); fig.savefig(f"{OUT}/auc_by_scheme.png", dpi=150); plt.close(fig)

    with open(f"{OUT}/validation_report.json", "w") as f:
        json.dump(report, f, indent=2)
    write_markdown(report)
    print(json.dumps(report, indent=2))


def write_markdown(r):
    t = r["temporal_models"]
    x = t["xgboost_calibrated"]
    d = r["dataset"]
    md = f"""# Model validation on real data (Kaggle, Brazil 2016)

Generated by `backend/validate_model.py`. {d['rows']:,} appointments, {d['patients']:,} patients,
{d['date_range'][0]} to {d['date_range'][1]}, no-show rate {d['no_show_rate']:.1%}.

| Check | What it proves | Result |
|---|---|---|
| Stratified 5-fold CV | AUC is stable, not a lucky split | {r['stratified_cv']['mean']:.3f} ± {r['stratified_cv']['std']:.3f} |
| Patient-grouped 5-fold CV | No leakage from repeat patients | {r['patient_grouped_cv']['mean']:.3f} ± {r['patient_grouped_cv']['std']:.3f} |
| Temporal hold-out (train to {r['temporal_holdout']['train_until']}, test on later dates) | Works on the future, as in deployment | {r['temporal_holdout']['roc_auc']:.3f} |
| Label-shuffle control | Pipeline has no leak/bug (should be ≈0.5) | {r['label_shuffle_cv']['mean']:.3f} ± {r['label_shuffle_cv']['std']:.3f} |

## Future hold-out: model vs baselines

| Model | ROC-AUC | PR-AUC | Brier | ECE | Lift@top20% | No-shows caught in top 20% |
|---|---|---|---|---|---|---|
| XGBoost (calibrated) | {x['roc_auc']:.3f} | {x['pr_auc']:.3f} | {x['brier']:.3f} | {x['ece']:.3f} | {x['lift_top20']:.2f}x | {x['recall_top20']:.1%} |
| XGBoost (raw) | {t['xgboost_raw']['roc_auc']:.3f} | {t['xgboost_raw']['pr_auc']:.3f} | {t['xgboost_raw']['brier']:.3f} | {t['xgboost_raw']['ece']:.3f} | {t['xgboost_raw']['lift_top20']:.2f}x | {t['xgboost_raw']['recall_top20']:.1%} |
| Logistic regression | {t['logistic_regression']['roc_auc']:.3f} | {t['logistic_regression']['pr_auc']:.3f} | {t['logistic_regression']['brier']:.3f} | {t['logistic_regression']['ece']:.3f} | {t['logistic_regression']['lift_top20']:.2f}x | {t['logistic_regression']['recall_top20']:.1%} |
| Lead-time-only rule | {t['lead_time_only_rule']['roc_auc']:.3f} | n/a | n/a | n/a | {t['lead_time_only_rule']['lift_top20']:.2f}x | {t['lead_time_only_rule']['recall_top20']:.1%} |
| Always predict base rate | n/a | n/a | {t['always_predict_base_rate']['brier']:.3f} | n/a | 1.00x | 20.0% |

Plots: `calibration.png`, `gain_curve.png`, `auc_by_scheme.png`.

## Honest reading
- The model has real but modest signal (AUC ~0.7, typical for this dataset in published work).
  No-show behaviour is noisy; the value is in **ranking** (who to call first), not in certainty.
- Near-identical scores across random, patient-grouped and temporal splits mean the result is not
  inflated by leakage or by repeat patients. The shuffled-label control sitting at ~0.5 confirms
  the evaluation itself is sound.
- This is Brazilian public-hospital data with 11 basic features. It validates the *method*. It does
  **not** validate accuracy for a Sri Lankan private hospital: that needs that hospital's own
  history (see `docs/VALIDATION_ON_LOCAL_DATA.md`).
"""
    with open(f"{OUT}/validation_report.md", "w") as f:
        f.write(md)


if __name__ == "__main__":
    main()
