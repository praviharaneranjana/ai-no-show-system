import numpy as np
import pytest
from sklearn.metrics import average_precision_score, brier_score_loss, roc_auc_score

from app.services import model_eval


def test_metrics_match_sklearn():
    rng = np.random.default_rng(0)
    p = np.round(rng.random(500), 2)  # rounded -> many ties
    y = (rng.random(500) < p * 0.5).astype(int)
    assert model_eval.roc_auc(y, p) == pytest.approx(roc_auc_score(y, p))
    assert model_eval.pr_auc(y, p) == pytest.approx(average_precision_score(y, p))
    assert model_eval.brier(y, p) == pytest.approx(brier_score_loss(y, p))


def test_evaluate_arrays_confusion_and_tiers():
    y = np.array([1, 1, 0, 0, 0, 1, 0, 0])
    p = np.array([0.4, 0.3, 0.25, 0.2, 0.1, 0.05, 0.08, 0.09])
    cats = np.array(["High", "High", "Medium", "Medium", "Low", "Low", "Low", "Low"])
    r = model_eval.evaluate_arrays(y, p, cats)
    cm = r["confusion_matrix"]
    assert (cm["tp"], cm["fp"], cm["fn"], cm["tn"]) == (2, 2, 1, 3)
    assert r["tiers"]["High"]["observed_no_show_rate"] == 1.0
    assert r["recall_top20"] == pytest.approx(0.5 if False else r["recall_top20"])
    assert model_eval.evaluate_arrays(np.array([]), np.array([]), np.array([])) == {"n_evaluated": 0}


def test_accuracy_report_from_db_rows(db_session):
    import uuid
    from datetime import date, timedelta

    from app import models

    today = date.today()
    spec = [  # (risk, category, no_show)
        (0.40, "High", True), (0.35, "High", True), (0.30, "High", False),
        (0.20, "Medium", False), (0.18, "Medium", True),
        (0.10, "Low", False), (0.08, "Low", False), (0.05, "Low", False), (0.06, "Low", False),
    ]
    for i, (risk, cat, ns) in enumerate(spec):
        pat = models.Patient(uhid=f"T-{uuid.uuid4().hex[:8]}", full_name="T", date_of_birth=date(1990, 1, 1))
        db_session.add(pat)
        db_session.flush()
        day = today - timedelta(days=2 + i)
        appt = models.Appointment(patient_id=pat.id, scheduled_day=day - timedelta(days=3), appointment_day=day,
                                  department="Cardiology", status="no_show" if ns else "completed", no_show=ns)
        db_session.add(appt)
        db_session.flush()
        db_session.add(models.Prediction(appointment_id=appt.id, risk_score=risk, risk_category=cat,
                                         explanation={}, recommendation="x"))
    # a future scheduled row and a cancelled row must not count
    for status, ns, delta in (("scheduled", None, 5), ("cancelled", None, -3)):
        pat = models.Patient(uhid=f"T-{uuid.uuid4().hex[:8]}", full_name="T", date_of_birth=date(1990, 1, 1))
        db_session.add(pat)
        db_session.flush()
        appt = models.Appointment(patient_id=pat.id, scheduled_day=today, appointment_day=today + timedelta(days=delta),
                                  status=status, no_show=ns)
        db_session.add(appt)
        db_session.flush()
        db_session.add(models.Prediction(appointment_id=appt.id, risk_score=0.5, risk_category="High",
                                         explanation={}, recommendation="x"))
    db_session.flush()

    r = model_eval.accuracy_report(db_session, days=0)
    assert r["empty"] is False and r["n_evaluated"] == 9
    cm = r["confusion_matrix"]
    assert (cm["tp"], cm["fp"], cm["fn"], cm["tn"]) == (3, 2, 0, 4)
    assert r["tiers"]["High"]["observed_no_show_rate"] == pytest.approx(2 / 3)
    assert r["roc_auc"] == pytest.approx(roc_auc_score([int(s[2]) for s in spec], [s[0] for s in spec]))
    assert sum(d["count"] for d in r["calibration_deciles"]) == 9
    assert model_eval.accuracy_report(db_session, days=0, department="Nope")["empty"] is True
