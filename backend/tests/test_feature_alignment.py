"""The server derives model features from DB rows; they must equal the Colab notebook's CSV feature columns."""
import os
import uuid
from datetime import date, time

import pandas as pd
import pytest

from app import models, shai_model
from app.services import scoring, synthetic_import

CSV_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "appointments_synthetic.csv")

DEPTS = ["Cardiology", "Dermatology", "ENT", "Endocrinology", "Gastroenterology", "General Medicine",
         "Gynecology", "Neurology", "Orthopedics", "Pediatrics", "Psychiatry", "Urology"]
pytestmark = pytest.mark.skipif(not os.path.exists(CSV_PATH), reason="backend/data/appointments_synthetic.csv not present")

EXACT = ["distance_km", "lead_days", "appt_dow", "appt_hour", "appt_month", "prior_appts", "prior_no_shows",
         "is_first_visit", "chronic_count", "sms_sent", "heavy_rain", "is_poya", "is_weekend"]


@pytest.fixture(scope="module")
def shai():
    return shai_model.ShaiModel()


def _seed_reference(db):
    hospital = models.Hospital(id=synthetic_import.ASIRI_ID, slug=f"t-{uuid.uuid4().hex[:6]}", name="T", short_name="T")
    db.add(hospital)
    db.flush()
    for name in DEPTS:
        dept = models.Department(name=f"{name}-{uuid.uuid4().hex[:4]}", model_category=name, hospital_id=hospital.id)
        db.add(dept)
        db.flush()
        doc = models.Doctor(full_name=f"Dr {name}", department_id=dept.id, hospital_id=hospital.id)
        db.add(doc)
        db.flush()
        for wd in range(7):
            for label, hour in (("Morning", 9), ("Afternoon", 14), ("Evening", 17)):
                db.add(models.DoctorClinicSession(
                    doctor_id=doc.id, hospital_id=hospital.id, weekday=wd, label=label,
                    start_time=time(hour, 0), end_time=time(hour + 3, 0), room="R1", max_patients=20,
                ))
    db.flush()


def test_server_features_equal_csv_features(db_session, shai):
    df = synthetic_import.load_csv(CSV_PATH)
    sample = df[df["cancelled"] == 0].sample(20, random_state=7)
    sub = df[df["patient_id"].isin(sample["patient_id"])]  # complete history of the sampled patients

    _seed_reference(db_session)
    # shift_days=0 / far-future "today": every row is history, dates equal the CSV's, so features are comparable
    synthetic_import.import_synthetic(db_session, df=sub, today=date(2035, 1, 1), shift_days=0, purge=False)

    checked = 0
    for _, row in sample.iterrows():
        appt = db_session.get(models.Appointment, uuid.uuid5(synthetic_import.NS, f"appt:{row['appointment_id']}"))
        assert appt is not None
        feats = scoring.score_appointment(db_session, appt, persist=False, shai_instance=shai)["features"]
        # The CSV blanks distance on ~4% of *rows*; the DB keeps one distance per *patient*, so a visit whose
        # distance was blank in the CSV uses the patient's known distance from another visit (if any).
        patient_known = df[(df["patient_id"] == row["patient_id"]) & df["distance_km"].notna()]
        distance_blank_but_known = pd.isna(row["distance_km"]) and len(patient_known) > 0
        for col in EXACT:
            if col == "distance_km" and distance_blank_but_known:
                assert feats[col] == pytest.approx(float(patient_known["distance_km"].iloc[0]))
                continue
            assert feats[col] == pytest.approx(float(row[col]), abs=1e-9), (row["appointment_id"], col)
        assert feats["prior_no_show_rate"] == pytest.approx(float(row["prior_no_show_rate"]), abs=0.01)
        # the CSV stores one static age per patient; the server derives age from date of birth, so a patient
        # who crosses a birthday inside the 2-year window can differ by a year
        assert abs(feats["age"] - int(row["age"])) <= 1, (row["appointment_id"], "age")
        assert feats["gender"] == row["gender"]
        assert feats["booking_channel"] == row["booking_channel"]
        assert feats["payment_mode"] == row["payment_mode"]
        assert feats["department"] == row["department"]
        assert feats["distance_missing"] == int(pd.isna(row["distance_km"]) and not distance_blank_but_known)
        checked += 1
    assert checked == 20


def test_import_is_idempotent_and_splits_future(db_session):
    df = synthetic_import.load_csv(CSV_PATH)
    recent = df[df["appointment_day"] >= "2026-08-20"]["patient_id"].unique()[:80]
    sub = df[df["patient_id"].isin(recent)]
    _seed_reference(db_session)
    today = date(2026, 10, 3)
    a = synthetic_import.import_synthetic(db_session, df=sub, today=today)
    n1 = db_session.query(models.Appointment).filter_by(data_source="synthetic").count()
    b = synthetic_import.import_synthetic(db_session, df=sub, today=today)
    n2 = db_session.query(models.Appointment).filter_by(data_source="synthetic").count()
    assert a["appointments"] == b["appointments"] == n1 == n2
    future = db_session.query(models.Appointment).filter(models.Appointment.appointment_day >= today).all()
    assert future and all(x.status == "scheduled" and x.no_show is None for x in future)
    assert all(x.scheduled_day <= today for x in future)
    past = db_session.query(models.Appointment).filter(models.Appointment.appointment_day < today).all()
    assert all(x.status in ("completed", "no_show", "cancelled") for x in past)
    assert all((x.no_show is None) == (x.status == "cancelled") for x in past)
    assert all(x.clinic_session_id is not None for x in db_session.query(models.Appointment).all())


def test_batch_rescore_matches_per_appointment_scoring(db_session, shai):
    from app.services import rescore

    df = synthetic_import.load_csv(CSV_PATH)
    recent = df[df["appointment_day"] >= "2026-06-01"]["patient_id"].unique()[:40]
    _seed_reference(db_session)
    synthetic_import.import_synthetic(db_session, df=df[df["patient_id"].isin(recent)], today=date(2026, 10, 3))
    out = rescore.rescore_all(db_session, shai, data_source="synthetic")
    assert out["scored"] > 0
    preds = db_session.query(models.Prediction).limit(60).all()
    assert preds and all(p.model_version == shai.version for p in preds)
    for p in preds:
        appt = db_session.get(models.Appointment, p.appointment_id)
        fresh = scoring.score_appointment(db_session, appt, persist=False, shai_instance=shai)
        assert float(p.risk_score) == pytest.approx(fresh["risk_score"], abs=1e-4)
        assert p.risk_category == fresh["risk_category"]
