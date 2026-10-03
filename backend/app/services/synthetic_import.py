"""Import the Colab generator's CSV (``appointments_synthetic.csv``) as the system's database content.

* All rows are tagged ``data_source='synthetic'``.
* Dates are shifted by a whole number of weeks (so weekday patterns survive) such that the last
  ~``future_days`` days lie in the future: those appointments become ``scheduled`` with no outcome,
  and only those already booked as of "today" (``scheduled_day <= today``) are kept. Everything
  earlier is history with the CSV's outcome (attended / no_show / cancelled).
* Appointments are grouped into real doctor sessions (``doctor_clinic_sessions``) of the matching
  department / weekday / time-of-day, filling a session to its ``max_patients`` before opening the next.
* Idempotent: re-running purges previous synthetic (and legacy untagged) appointments and re-imports with
  deterministic ids.
"""
import uuid
from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone

import numpy as np
import pandas as pd
from sqlalchemy import insert, text
from sqlalchemy.orm import Session

from app import models
import fake_data_lk as fk

ASIRI_ID = uuid.UUID("a0000000-0000-0000-0000-000000000001")
NS = uuid.UUID("5a1c0de0-0000-4000-8000-00000000d474")
CHUNK = 5000

_LABEL_ORDER = ["Morning", "Afternoon", "Evening"]


def hour_label(hour: int) -> str:
    return "Morning" if hour < 12 else "Afternoon" if hour < 17 else "Evening"


def load_csv(path: str) -> pd.DataFrame:
    return pd.read_csv(path, parse_dates=["scheduled_day", "appointment_day"])


def compute_shift_days(max_day: date, today: date, future_days: int) -> int:
    """Smallest multiple of 7 putting ``max_day`` at least ``future_days`` after ``today``."""
    need = (today + timedelta(days=future_days) - max_day).days
    return int(np.ceil(need / 7.0)) * 7


def purge_synthetic(db: Session) -> None:
    """Delete previously imported / legacy seeded appointments and everything hanging off them (users are kept)."""
    scope = "SELECT id FROM appointments WHERE data_source = 'synthetic' OR data_source IS NULL"
    db.execute(text(f"UPDATE appointments SET rescheduled_from_id = NULL WHERE rescheduled_from_id IN ({scope})"))
    for table in ("interventions", "predictions", "prediction_log", "appointment_events"):
        db.execute(text(f"DELETE FROM {table} WHERE appointment_id IN ({scope})"))
    db.execute(text("DELETE FROM appointments WHERE data_source = 'synthetic' OR data_source IS NULL"))
    db.execute(text("DELETE FROM patients WHERE id NOT IN (SELECT patient_id FROM appointments)"))
    db.commit()


def _dob_for(first_day: date, last_day: date, age: int) -> date:
    """DOB such that the patient is ``age`` at their first appointment and stays ``age`` for as long as possible."""
    span = min((last_day - first_day).days, 364)
    turn_next = first_day + timedelta(days=span + 1)  # day the patient turns age+1
    try:
        return turn_next.replace(year=turn_next.year - (age + 1))
    except ValueError:  # 29 Feb
        return (turn_next - timedelta(days=1)).replace(year=turn_next.year - (age + 1))


def _name_pools(language: str, gender: str):
    pool = {"si": (fk.SINHALA_MALE_FIRST, fk.SINHALA_FEMALE_FIRST, fk.SINHALA_LAST),
            "ta": (fk.TAMIL_MALE_FIRST, fk.TAMIL_FEMALE_FIRST, fk.TAMIL_LAST)}.get(
        language, (fk.SINHALA_MALE_FIRST, fk.SINHALA_FEMALE_FIRST, fk.SINHALA_LAST))
    return (pool[0] if gender == "M" else pool[1]), pool[2]


def build_patient_rows(df: pd.DataFrame, hospital_id: uuid.UUID, uhid_prefix: str = "SYN") -> list[dict]:
    g = df.sort_values(["patient_id", "appointment_day"]).groupby("patient_id", sort=True)
    first = g.first()
    last_day = g["appointment_day"].last()
    rows = []
    for pid, r in first.iterrows():
        rng = np.random.default_rng(int(pid))
        firsts, lasts = _name_pools(r["preferred_language"], r["gender"])
        fday = r["appointment_day"].date()
        rows.append(dict(
            id=uuid.uuid5(NS, f"patient:{pid}"),
            hospital_id=hospital_id,
            uhid=f"{uhid_prefix}-{int(pid):06d}",
            full_name=f"{rng.choice(firsts)} {rng.choice(lasts)}",
            date_of_birth=_dob_for(fday, last_day[pid].date(), int(r["age"])),
            gender=r["gender"],
            distance_km=None if pd.isna(r["distance_km"]) else float(r["distance_km"]),
            hypertension=bool(r["hypertension"]),
            diabetes=bool(r["diabetes"]),
            preferred_language=r["preferred_language"],
            scholarship=False,
            alcoholism=False,
            handicap=0,
        ))
    return rows


_LABEL_TIMES = {"Morning": (time(9, 0), time(12, 0)), "Afternoon": (time(14, 0), time(17, 0)), "Evening": (time(17, 30), time(20, 30))}


def ensure_weekday_sessions(db: Session, df: pd.DataFrame, doctors: list[dict], sessions: list[dict], hospital_id) -> int:
    """A department with bookings on a weekday but no clinic session that day (e.g. Sundays) gets one for its
    first doctor, so every imported appointment belongs to a real session with a capacity."""
    doc_by_id = {d["id"]: d for d in doctors}
    have = {(doc_by_id[s["doctor_id"]]["model_category"], s["weekday"]) for s in sessions}
    first_doc: dict[str, dict] = {}
    for d in sorted(doctors, key=lambda d: d["full_name"]):
        first_doc.setdefault(d["model_category"], d)
    need = df.assign(wd=df["appointment_day"].dt.weekday)[["department", "wd", "appt_hour"]].drop_duplicates()
    created = 0
    for dept, wd, hr in need.itertuples(index=False):
        label = hour_label(int(hr))
        if (dept, int(wd)) in have or dept not in first_doc:
            continue
        have.add((dept, int(wd)))
        doc = first_doc[dept]
        start, end = _LABEL_TIMES[label]
        row = models.DoctorClinicSession(
            hospital_id=hospital_id, doctor_id=doc["id"], weekday=int(wd), label=label,
            start_time=start, end_time=end, room="Room 1", max_patients=20, slot_minutes=12,
        )
        db.add(row)
        db.flush()
        sessions.append(dict(id=row.id, doctor_id=doc["id"], weekday=int(wd), label=label, max_patients=20))
        created += 1
    return created


def assign_sessions(df: pd.DataFrame, doctors: list[dict], sessions: list[dict]) -> pd.DataFrame:
    """Adds doctor_id / clinic_session_id / doctor_name / queue_number to ``df`` (sorted in booking order).

    ``doctors``: dicts(id, full_name, model_category). ``sessions``: dicts(id, doctor_id, weekday, label, max_patients).
    A session is filled to ``max_patients`` before the next session of that department opens; if every
    candidate is full the least-loaded one is overbooked.
    """
    doc_by_id = {d["id"]: d for d in doctors}
    by_dept_wd: dict[tuple[str, int], list[dict]] = defaultdict(list)
    for s in sessions:
        dept = doc_by_id[s["doctor_id"]]["model_category"]
        by_dept_wd[(dept, s["weekday"])].append(s)
    for lst in by_dept_wd.values():
        lst.sort(key=lambda s: (doc_by_id[s["doctor_id"]]["full_name"], s["label"]))

    load: dict[tuple, int] = defaultdict(int)  # (session_id, date) -> booked
    out_doc, out_sess, out_name, out_q = [], [], [], []
    df = df.sort_values(["appointment_day", "scheduled_day", "appointment_id"]).reset_index(drop=True)
    for r in df.itertuples(index=False):
        wd = r.appointment_day.weekday()
        want = hour_label(int(r.appt_hour))
        cands = by_dept_wd.get((r.department, wd), [])
        same = [s for s in cands if s["label"] == want]
        if not same and cands:  # no session at that time of day on that weekday: nearest label
            order = {lab: abs(_LABEL_ORDER.index(lab) - _LABEL_ORDER.index(want)) for lab in _LABEL_ORDER}
            near = min(order[s["label"]] for s in cands)
            same = [s for s in cands if order[s["label"]] == near]
        day = r.appointment_day.date()
        chosen = None
        for s in same:
            if load[(s["id"], day)] < s["max_patients"]:
                chosen = s
                break
        if chosen is None and same:
            chosen = min(same, key=lambda s: load[(s["id"], day)])
        if chosen is None:  # department has no session that weekday at all
            out_doc.append(None); out_sess.append(None); out_name.append(None); out_q.append(None)
            continue
        load[(chosen["id"], day)] += 1
        out_doc.append(chosen["doctor_id"])
        out_sess.append(chosen["id"])
        out_name.append(doc_by_id[chosen["doctor_id"]]["full_name"])
        out_q.append(load[(chosen["id"], day)])
    df["doctor_id"], df["clinic_session_id"], df["doctor_name"], df["queue_number"] = out_doc, out_sess, out_name, out_q
    return df


def import_synthetic(
    db: Session,
    csv_path: str | None = None,
    *,
    df: pd.DataFrame | None = None,
    today: date | None = None,
    future_days: int = 45,
    shift_days: int | None = None,
    hospital_id: uuid.UUID = ASIRI_ID,
    purge: bool = True,
) -> dict:
    today = today or date.today()
    if df is None:
        df = load_csv(csv_path)
    df = df.copy()

    if shift_days is None:
        shift_days = compute_shift_days(df["appointment_day"].max().date(), today, future_days)
    delta = pd.Timedelta(days=shift_days)
    df["appointment_day"] = df["appointment_day"] + delta
    df["scheduled_day"] = df["scheduled_day"] + delta

    ts_today = pd.Timestamp(today)
    is_future = df["appointment_day"] >= ts_today
    # A future visit that is not yet booked as of today does not exist yet.
    df = df[~is_future | (df["scheduled_day"] <= ts_today)].copy()
    is_future = df["appointment_day"] >= ts_today

    if purge:
        purge_synthetic(db)

    # Reference data (doctors / recurring sessions of the hospital)
    doctors = [
        dict(id=d.id, full_name=d.full_name, model_category=(d.department.model_category or d.department.name))
        for d in db.query(models.Doctor).filter(models.Doctor.hospital_id == hospital_id, models.Doctor.active.is_(True)).all()
    ]
    ids = {d["id"] for d in doctors}
    sessions = [
        dict(id=s.id, doctor_id=s.doctor_id, weekday=s.weekday, label=s.label, max_patients=s.max_patients)
        for s in db.query(models.DoctorClinicSession).filter(models.DoctorClinicSession.active.is_(True)).all()
        if s.doctor_id in ids
    ]
    if not sessions:
        raise RuntimeError("No doctor_clinic_sessions found - run seed_reference.py first.")

    created_sessions = ensure_weekday_sessions(db, df, doctors, sessions, hospital_id)
    df = assign_sessions(df, doctors, sessions)
    unassigned = int(df["clinic_session_id"].isna().sum())

    patient_rows = build_patient_rows(df, hospital_id)
    for i in range(0, len(patient_rows), CHUNK):
        db.execute(insert(models.Patient), patient_rows[i:i + CHUNK])

    tz = timezone(timedelta(hours=5, minutes=30))
    appts = []
    for r in df.itertuples(index=False):
        future = r.appointment_day >= ts_today
        day = r.appointment_day.date()
        if future:
            status, no_show = "scheduled", None
        elif r.cancelled == 1:
            status, no_show = "cancelled", None
        else:
            status, no_show = ("no_show", True) if r.no_show == 1 else ("completed", False)
        appts.append(dict(
            id=uuid.uuid5(NS, f"appt:{r.appointment_id}"),
            hospital_id=hospital_id,
            patient_id=uuid.uuid5(NS, f"patient:{r.patient_id}"),
            scheduled_day=r.scheduled_day.date(),
            appointment_day=day,
            department=r.department,
            doctor_id=r.doctor_id if pd.notna(r.doctor_id) else None,
            clinic_session_id=r.clinic_session_id if pd.notna(r.clinic_session_id) else None,
            doctor_name=r.doctor_name if pd.notna(r.doctor_name) else None,
            booking_channel=r.booking_channel,
            payment_mode=r.payment_mode,
            scheduled_time=f"{int(r.appt_hour):02d}:00",
            slot_start=time(int(r.appt_hour), 0),
            queue_number=int(r.queue_number) if pd.notna(r.queue_number) else None,
            sms_received=bool(r.sms_sent),
            sms_reminder_opt_in=False,
            heavy_rain=bool(r.heavy_rain),
            fee_lkr=float(r.consult_fee_lkr),
            status=status,
            no_show=no_show,
            late_cancel=False,
            source="manual",
            data_source="synthetic",
            booked_by="synthetic-import",
            outcome_source=None if future else "system",
            outcome_recorded_at=None if future else datetime.combine(day, time(20, 0), tzinfo=tz),
            cancelled_at=None if (future or status != "cancelled") else datetime.combine(day, time(8, 0), tzinfo=tz),
        ))
    for i in range(0, len(appts), CHUNK):
        db.execute(insert(models.Appointment), appts[i:i + CHUNK])
    db.commit()

    return {
        "shift_days": shift_days,
        "today": today.isoformat(),
        "patients": len(patient_rows),
        "appointments": len(appts),
        "future_scheduled": int(is_future.sum()),
        "history": int((~is_future).sum()),
        "unassigned_session": unassigned,
        "sessions_created": created_sessions,
    }
