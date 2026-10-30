"""Replace the DB's appointments with the Colab generator CSV, re-score everything and print verification metrics.

    python import_synthetic.py                       # data/appointments_synthetic.csv
    python import_synthetic.py --csv path.csv --future-days 45

Idempotent: previously imported (and legacy untagged) appointments, predictions and interventions are removed
first; users, doctors and sessions are kept.
"""
import argparse
import json

from app import shai_model
from app.database import Base, SessionLocal, engine
from app.services import model_eval, rescore, synthetic_import


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--csv", default="data/appointments_synthetic.csv")
    ap.add_argument("--future-days", type=int, default=45)
    args = ap.parse_args()

    Base.metadata.create_all(bind=engine)
    shai = shai_model.ShaiModel()
    db = SessionLocal()
    try:
        summary = synthetic_import.import_synthetic(db, args.csv, future_days=args.future_days)
        print("Import:", json.dumps(summary, indent=2))
        res = rescore.rescore_all(db, shai, data_source="synthetic", stage="import")
        print("Rescore:", res)
        report = verification_report(db, shai)
        print(json.dumps(report, indent=2))
    finally:
        db.close()


def verification_report(db, shai) -> dict:
    ev = model_eval.evaluate_db(db, data_source="synthetic")
    return {
        "model_version": shai.version,
        "thresholds": {"high": shai.high_threshold, "medium": shai.medium_threshold},
        "history_window": {k: ev.get(k) for k in (
            "n_evaluated", "observed_no_show_rate", "mean_predicted",
            "roc_auc", "pr_auc", "brier", "recall_top20", "precision_top20", "lift_top20")},
        "tiers_history": ev.get("tiers"),
        "scheduled_tier_shares": scheduled_tier_shares(db),
    }


def scheduled_tier_shares(db) -> dict:
    from sqlalchemy import func
    from app import models
    rows = (
        db.query(models.Prediction.risk_category, func.count())
        .join(models.Appointment, models.Appointment.id == models.Prediction.appointment_id)
        .filter(models.Appointment.status == "scheduled")
        .group_by(models.Prediction.risk_category)
        .all()
    )
    total = sum(n for _, n in rows) or 1
    return {k: {"n": n, "share": n / total} for k, n in rows}


if __name__ == "__main__":
    main()
