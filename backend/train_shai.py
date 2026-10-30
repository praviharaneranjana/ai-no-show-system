"""Reproducible training pipeline for the SHAI no-show prediction model bundle.

Rebuilds the whole bundle from a CSV of features + label:
  1. Filters uncancelled appointments (attended=0, no_show=1).
  2. Partitions into train / validation / test using a chronological time split.
  3. Prepares feature matrices according to the 40-column schema.
  4. Fits XGBoost with the tuned hyperparameters and exports native ``model.json``.
  5. Fits IsotonicRegression on validation predictions and exports ``calibration.json``.
  6. Computes capacity-based thresholds (High = top 10%, Medium = next 20%) and exports ``thresholds.json``.
  7. Evaluates held-out test metrics (ROC-AUC, PR-AUC, Brier, Lift@top-20%) and exports ``metrics.json`` with provenance metadata.
  8. Exports ``feature_schema.json``.
  9. Never overwrites the live production bundle directory without explicit permission.

Usage:
  # Basic run on synthetic data, outputting to a versioned bundle:
  python train_shai.py --input models/shai_bundle/appointments_synthetic.csv --version v1-reproduced --verify

  # Custom version and seed:
  python train_shai.py --version v2 --seed 42
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

# Ensure matplotlib font cache doesn't stall in sandboxed environments
if "MPLCONFIGDIR" not in os.environ:
    os.environ["MPLCONFIGDIR"] = "/tmp/matplotlib_cache"
_mpl_cache = os.environ["MPLCONFIGDIR"]
os.makedirs(_mpl_cache, exist_ok=True)
_fontlist = os.path.join(_mpl_cache, "fontlist-v3.11.0.json")
if not os.path.exists(_fontlist):
    try:
        with open(_fontlist, "w") as _f:
            _f.write(
                '{"_version": "3.11.0", "default_size": null, "defaultWeight": "normal", '
                '"defaultFamily": {"ttf": "DejaVu Sans", "afm": "Helvetica"}, "ttflist": [], "afmlist": [], "__class__": "FontManager"}'
            )
    except OSError:
        pass

import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.isotonic import IsotonicRegression
from sklearn.metrics import average_precision_score, brier_score_loss, roc_auc_score

# Canonical baseline benchmarks for acceptance verification
BENCHMARK_METRICS = {
    "ROC_AUC": 0.672490,
    "PR_AUC": 0.265911,
    "Brier": 0.123730,
    "Recall_top20": 0.363009,
    "Precision_top20": 0.280234,
    "Lift_top20": 1.815045,
}

# Hyperparameters tuned by Optuna on synthetic Sri Lankan data
OPTUNA_BEST_PARAMS = {
    "lr": 0.1001154974349885,
    "depth": 2,
    "mcw": 28,
    "sub": 0.549297059562424,
    "col": 0.5113949721857537,
    "l2": 0.6207478546107209,
    "n_estimators": 224,
}

FEATURE_COLUMNS = [
    "age",
    "distance_km",
    "lead_days",
    "appt_dow",
    "appt_hour",
    "appt_month",
    "prior_appts",
    "prior_no_shows",
    "prior_no_show_rate",
    "is_first_visit",
    "chronic_count",
    "sms_sent",
    "heavy_rain",
    "is_poya",
    "is_weekend",
    "distance_missing",
    "gender_F",
    "gender_M",
    "booking_channel_Counter",
    "booking_channel_Doc990",
    "booking_channel_MyHealth",
    "booking_channel_Phone",
    "booking_channel_eChannelling",
    "payment_mode_Card",
    "payment_mode_Cash",
    "payment_mode_Corporate",
    "payment_mode_Insurance",
    "payment_mode_Prepaid_Online",
    "department_Cardiology",
    "department_Dermatology",
    "department_ENT",
    "department_Endocrinology",
    "department_Gastroenterology",
    "department_General Medicine",
    "department_Gynecology",
    "department_Neurology",
    "department_Orthopedics",
    "department_Pediatrics",
    "department_Psychiatry",
    "department_Urology",
]

NUMERIC_FEATURES = [
    "age",
    "distance_km",
    "lead_days",
    "appt_dow",
    "appt_hour",
    "appt_month",
    "prior_appts",
    "prior_no_shows",
    "prior_no_show_rate",
    "is_first_visit",
    "chronic_count",
    "sms_sent",
    "heavy_rain",
    "is_poya",
    "is_weekend",
]

CATEGORICAL_FEATURES = {
    "gender": ["F", "M"],
    "booking_channel": ["Counter", "Doc990", "MyHealth", "Phone", "eChannelling"],
    "payment_mode": ["Card", "Cash", "Corporate", "Insurance", "Prepaid_Online"],
    "department": [
        "Cardiology",
        "Dermatology",
        "ENT",
        "Endocrinology",
        "Gastroenterology",
        "General Medicine",
        "Gynecology",
        "Neurology",
        "Orthopedics",
        "Pediatrics",
        "Psychiatry",
        "Urology",
    ],
}


def resolve_file(path_str: str) -> Path:
    p = Path(path_str)
    if p.exists():
        return p
    # Try looking relative to current directory or backend directory
    script_dir = Path(__file__).resolve().parent
    candidates = [
        script_dir / path_str,
        script_dir.parent / path_str,
        script_dir / "models" / "shai_bundle" / Path(path_str).name,
    ]
    for c in candidates:
        if c.exists():
            return c
    return p


def build_feature_frame(
    df: pd.DataFrame,
    distance_median: float,
) -> pd.DataFrame:
    """Transform records into the fixed 40-column model schema."""
    rows = []
    records = df.to_dict(orient="records")
    for r in records:
        row: dict[str, float] = {c: 0.0 for c in FEATURE_COLUMNS}
        # Numeric features
        for num_col in NUMERIC_FEATURES:
            val = r.get(num_col)
            if num_col == "distance_km":
                if val is None or pd.isna(val):
                    row["distance_km"] = float(distance_median)
                    row["distance_missing"] = 1.0
                else:
                    row["distance_km"] = float(val)
                    row["distance_missing"] = 0.0
            else:
                row[num_col] = float(val) if (val is not None and not pd.isna(val)) else 0.0

        # Categoricals
        for cat_col, valid_vals in CATEGORICAL_FEATURES.items():
            cat_val = r.get(cat_col)
            key = f"{cat_col}_{cat_val}"
            if key in row:
                row[key] = 1.0

        rows.append(row)
    return pd.DataFrame(rows, columns=FEATURE_COLUMNS)


def compute_metrics(y_true: np.ndarray, y_pred_prob: np.ndarray) -> dict[str, float]:
    """Compute standard calibration and ranking metrics."""
    roc_auc = float(roc_auc_score(y_true, y_pred_prob))
    pr_auc = float(average_precision_score(y_true, y_pred_prob))
    brier = float(brier_score_loss(y_true, y_pred_prob))

    # Top 20% risk lift and recall
    n_top = max(int(len(y_true) * 0.2), 1)
    top_indices = np.argsort(y_pred_prob)[::-1][:n_top]
    precision_top20 = float(y_true[top_indices].mean())
    recall_top20 = float(y_true[top_indices].sum() / max(y_true.sum(), 1))
    base_rate = float(y_true.mean())
    lift_top20 = float(precision_top20 / base_rate) if base_rate > 0 else 1.0

    return {
        "ROC_AUC": roc_auc,
        "PR_AUC": pr_auc,
        "Brier": brier,
        "Recall_top20": recall_top20,
        "Precision_top20": precision_top20,
        "Lift_top20": lift_top20,
    }


def train_and_bundle(
    *,
    input_path: str,
    output_dir: str,
    version: str,
    seed: int = 42,
    train_rows: int | None = None,
    val_rows: int | None = None,
    test_rows: int | None = None,
    force: bool = False,
    verify: bool = False,
    tolerance: float = 0.02,
) -> dict[str, Any]:
    """Execute complete training pipeline and write versioned bundle artifacts."""
    csv_file = resolve_file(input_path)
    if not csv_file.exists():
        raise FileNotFoundError(f"Input dataset not found at {input_path}")

    out_path = Path(output_dir)
    # Protection: Never overwrite the live production bundle directory without explicit force
    if out_path.resolve() == (Path("models/shai_bundle").resolve()) and not force:
        raise PermissionError(
            f"Output directory '{output_dir}' matches the live production bundle. "
            "Retraining must write to a new versioned directory (e.g. models/shai_bundle_<version>/). "
            "Use --force only if you explicitly intend to overwrite."
        )

    out_path.mkdir(parents=True, exist_ok=True)

    print(f"Loading data from {csv_file}...")
    df = pd.read_csv(csv_file)
    n_raw = len(df)

    # 1. Outcome filtering: only uncancelled outcomes are valid for no-show prediction
    if "cancelled" in df.columns:
        uncancelled = df[df["cancelled"] == 0].copy()
    elif "status" in df.columns:
        uncancelled = df[df["status"] != "cancelled"].copy()
    else:
        uncancelled = df.copy()

    # Time-based ordering (earlier appointments first)
    if "appointment_day" in uncancelled.columns:
        uncancelled = uncancelled.sort_values("appointment_day").reset_index(drop=True)
    else:
        uncancelled = uncancelled.reset_index(drop=True)

    n_uncancelled = len(uncancelled)
    date_min = str(uncancelled["appointment_day"].min()) if "appointment_day" in uncancelled.columns else "unknown"
    date_max = str(uncancelled["appointment_day"].max()) if "appointment_day" in uncancelled.columns else "unknown"
    print(f"Dataset: {n_raw:,} raw rows -> {n_uncancelled:,} uncancelled outcomes ({date_min} to {date_max})")

    # 2. Split sizing (time-based split)
    if train_rows is not None and val_rows is not None and test_rows is not None:
        n_train, n_val, n_test = train_rows, val_rows, test_rows
    elif n_uncancelled >= 64444:
        # Standard benchmark partition (matches shai-lk-synth-v1 benchmark exact counts)
        n_train = 42693
        n_val = 12366
        n_test = 9385
    else:
        # Chronological ratio split (approx 66% train, 19% val, 15% test)
        n_train = int(n_uncancelled * 0.6625)
        n_val = int(n_uncancelled * 0.1919)
        n_test = n_uncancelled - n_train - n_val

    train_df = uncancelled.iloc[:n_train].copy()
    val_df = uncancelled.iloc[n_train : n_train + n_val].copy()
    test_df = uncancelled.iloc[n_train + n_val : n_train + n_val + n_test].copy()
    total_model_rows = n_train + n_val + n_test

    print(f"Split sizes: Train={n_train:,}, Val={n_val:,}, Test={n_test:,} (Total used: {total_model_rows:,})")

    # 3. Distance median from training set to prevent data leakage
    known_distances = train_df["distance_km"].dropna()
    distance_median = float(round(known_distances.median(), 1)) if len(known_distances) > 0 else 6.0
    print(f"Computed training distance median: {distance_median:.1f} km")

    # 4. Feature matrix construction
    X_train = build_feature_frame(train_df, distance_median)
    y_train = train_df["no_show"].values.astype(int)

    X_val = build_feature_frame(val_df, distance_median)
    y_val = val_df["no_show"].values.astype(int)

    X_test = build_feature_frame(test_df, distance_median)
    y_test = test_df["no_show"].values.astype(int)

    # 5. Model fitting with tuned hyperparameters
    print("Fitting XGBoost Classifier...")
    model = xgb.XGBClassifier(
        max_depth=OPTUNA_BEST_PARAMS["depth"],
        learning_rate=OPTUNA_BEST_PARAMS["lr"],
        min_child_weight=OPTUNA_BEST_PARAMS["mcw"],
        subsample=OPTUNA_BEST_PARAMS["sub"],
        colsample_bytree=OPTUNA_BEST_PARAMS["col"],
        reg_lambda=OPTUNA_BEST_PARAMS["l2"],
        n_estimators=OPTUNA_BEST_PARAMS["n_estimators"],
        random_state=seed,
        eval_metric="aucpr",
        n_jobs=4,
    )
    model.fit(X_train, y_train, eval_set=[(X_val, y_val)], verbose=False)

    # 6. Isotonic Calibration on held-out validation set
    print("Fitting Isotonic Calibration on validation set...")
    raw_val = model.predict_proba(X_val)[:, 1]
    raw_test = model.predict_proba(X_test)[:, 1]

    calibrator = IsotonicRegression(out_of_bounds="clip", y_min=0.0, y_max=1.0)
    calibrator.fit(raw_val, y_val)

    # Calibration points for piece-wise interpolation in shai_model
    cal_x = [float(x) for x in calibrator.X_thresholds_]
    cal_y = [float(y) for y in calibrator.y_thresholds_]
    cal_dict = {"x": cal_x, "y": cal_y}

    # 7. Capacity-based tier thresholds on validation calibrated probabilities
    cal_val = calibrator.predict(raw_val)
    high_threshold = float(np.percentile(cal_val, 90))  # Top 10%
    medium_threshold = float(np.percentile(cal_val, 70))  # Next 20%
    thresholds_dict = {
        "high": high_threshold,
        "medium": medium_threshold,
        "rule": "High = top 10% / Medium = next 20% of validation-set calibrated risk",
    }
    print(f"Risk thresholds: High >= {high_threshold:.4f}, Medium >= {medium_threshold:.4f}")

    # 8. Evaluation on held-out test set
    cal_test = calibrator.predict(raw_test)
    test_metrics = compute_metrics(y_test, cal_test)
    base_rate = float(y_train.mean())

    print("\n--- Test Set Evaluation ---")
    for k, v in test_metrics.items():
        print(f"  {k:15s}: {v:.6f}")

    # 9. Feature importances
    booster = model.get_booster()
    score_gain = booster.get_score(importance_type="gain")
    total_gain = sum(score_gain.values()) or 1.0
    top_features = {k: round(v / total_gain, 4) for k, v in sorted(score_gain.items(), key=lambda i: i[1], reverse=True)[:10]}

    # 10. Prepare and save artifacts
    schema_dict = {
        "numeric": NUMERIC_FEATURES,
        "categorical": CATEGORICAL_FEATURES,
        "columns": FEATURE_COLUMNS,
        "distance_median": distance_median,
        "distance_missing_flag": True,
        "positive_class": "no_show",
        "version": version,
    }

    metrics_dict = {
        "test_metrics_tuned": test_metrics,
        "test_metrics": test_metrics,
        "thresholds": thresholds_dict,
        "n_rows": total_model_rows,
        "base_rate": base_rate,
        "data_source": os.path.basename(str(csv_file)),
        "created_at": datetime.now().isoformat(),
        "random_seed": seed,
        "date_range": {
            "start": date_min,
            "end": date_max,
        },
        "split": {
            "train": n_train,
            "val": n_val,
            "test": n_test,
        },
        "top_features": top_features,
        "optuna_best": OPTUNA_BEST_PARAMS,
    }

    print(f"\nWriting bundle artifacts to {out_path}...")
    model.save_model(str(out_path / "model.json"))
    with open(out_path / "calibration.json", "w") as f:
        json.dump(cal_dict, f)
    with open(out_path / "thresholds.json", "w") as f:
        json.dump(thresholds_dict, f, indent=1)
    with open(out_path / "feature_schema.json", "w") as f:
        json.dump(schema_dict, f, indent=1)
    with open(out_path / "metrics.json", "w") as f:
        json.dump(metrics_dict, f, indent=1)

    print(f"Bundle successfully created in {out_path}")

    # 11. Acceptance test verification
    if verify:
        print("\n--- Running Acceptance Test vs Benchmark ---")
        discrepancies = []
        metric_tolerances = {
            "ROC_AUC": tolerance,
            "PR_AUC": tolerance,
            "Brier": tolerance,
            "Recall_top20": tolerance * 1.5,
            "Precision_top20": tolerance * 1.5,
            "Lift_top20": max(tolerance * 4.0, 0.08),  # Lift is on a ~1.8-2.0x scale
        }
        for key in ["ROC_AUC", "PR_AUC", "Lift_top20", "Brier"]:
            target = BENCHMARK_METRICS[key]
            actual = test_metrics[key]
            diff = abs(actual - target)
            tol = metric_tolerances[key]
            passed = diff <= tol
            status = "PASS" if passed else "FAIL"
            print(f"  [{status}] {key:12s} | Target: {target:.4f} | Actual: {actual:.4f} | Diff: {diff:.4f} (tol: {tol:.4f})")
            if not passed:
                discrepancies.append((key, target, actual, diff))

        if discrepancies:
            msg = f"Acceptance test failed on metrics: {discrepancies}"
            print(f"WARNING: {msg}")
            raise AssertionError(msg)
        print("Acceptance test PASSED: Pipeline reproduces shipped benchmark metrics within tolerance.")

    return {
        "bundle_dir": str(out_path),
        "version": version,
        "metrics": test_metrics,
        "thresholds": thresholds_dict,
    }


def main():
    parser = argparse.ArgumentParser(description="Train and package SHAI model bundle.")
    parser.add_argument(
        "--input",
        default="models/shai_bundle/appointments_synthetic.csv",
        help="Path to input features CSV.",
    )
    parser.add_argument(
        "--version",
        default=f"shai-lk-synth-v1-reproduced",
        help="Model bundle version string.",
    )
    parser.add_argument(
        "--output-dir",
        default=None,
        help="Destination directory. Defaults to models/shai_bundle_<version>/.",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=42,
        help="Random seed for reproducibility.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Force overwrite if destination exists.",
    )
    parser.add_argument(
        "--verify",
        action="store_true",
        help="Run acceptance test to assert metrics match benchmark within tolerance.",
    )
    parser.add_argument(
        "--tolerance",
        type=float,
        default=0.02,
        help="Maximum allowed difference from benchmark metrics.",
    )
    args = parser.parse_args()

    out_dir = args.output_dir or f"models/shai_bundle_{args.version}"
    try:
        train_and_bundle(
            input_path=args.input,
            output_dir=out_dir,
            version=args.version,
            seed=args.seed,
            force=args.force,
            verify=args.verify,
            tolerance=args.tolerance,
        )
    except Exception as exc:
        print(f"Error during training: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
