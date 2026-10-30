from datetime import date, timedelta
import os
import json
import numpy as np
import pandas as pd
import pytest

from app.shai_model import ShaiModel
from train_shai import train_and_bundle


@pytest.fixture
def mini_synthetic_csv(tmp_path):
    """Generate a valid mini dataset CSV for pipeline integration testing."""
    records = []
    base_date = date(2025, 1, 1)
    departments = ["Cardiology", "General Medicine", "Orthopaedics", "Paediatrics"]
    channels = ["Doc990", "Counter", "Phone", "eChannelling"]
    payments = ["Cash", "Card", "Corporate Insurance"]

    for i in range(120):
        appt_d = base_date + timedelta(days=i % 30)
        sched_d = appt_d - timedelta(days=(i % 7) + 1)
        records.append({
            "appointment_id": i + 1,
            "patient_id": f"P-{1000 + (i % 40)}",
            "scheduled_day": sched_d.isoformat(),
            "scheduled_time": "09:30 AM",
            "appointment_day": appt_d.isoformat(),
            "age": 20 + (i % 60),
            "gender": "Female" if i % 2 == 0 else "Male",
            "distance_km": float(2.0 + (i % 20)),
            "department": departments[i % len(departments)],
            "booking_channel": channels[i % len(channels)],
            "payment_mode": payments[i % len(payments)],
            "sms_sent": 1 if i % 2 == 0 else 0,
            "hypertension": 1 if i % 4 == 0 else 0,
            "diabetes": 1 if i % 5 == 0 else 0,
            "prior_appts": i % 5,
            "prior_no_shows": 1 if (i % 6 == 0 and (i % 5) > 0) else 0,
            "no_show": 1 if i % 4 == 0 else 0,
            "cancelled": 0,
        })

    csv_path = tmp_path / "mini_synth.csv"
    pd.DataFrame(records).to_csv(csv_path, index=False)
    return str(csv_path)


def test_safety_guard_prevents_live_bundle_overwrite(mini_synthetic_csv):
    """Training must never overwrite models/shai_bundle unless explicitly forced."""
    with pytest.raises(PermissionError) as exc_info:
        train_and_bundle(
            input_path=mini_synthetic_csv,
            output_dir="models/shai_bundle",
            version="guard-test",
            force=False,
        )
    assert "matches the live production bundle" in str(exc_info.value)


def test_train_and_bundle_generates_all_five_artifacts(mini_synthetic_csv, tmp_path):
    """Verifies that the reproducible training script produces all 5 bundle files."""
    output_dir = tmp_path / "bundle_test_v1"
    
    result = train_and_bundle(
        input_path=mini_synthetic_csv,
        output_dir=str(output_dir),
        version="v1-test",
        train_rows=70,
        val_rows=25,
        test_rows=25,
        seed=42,
        verify=False,
    )

    assert result["version"] == "v1-test"
    assert os.path.isdir(str(output_dir))

    # All 5 files must exist
    required_files = [
        "model.json",
        "calibration.json",
        "thresholds.json",
        "feature_schema.json",
        "metrics.json",
    ]
    for filename in required_files:
        p = output_dir / filename
        assert p.exists(), f"Missing artifact: {filename}"
        assert p.stat().st_size > 0, f"Artifact is empty: {filename}"

    # Verify schema version and distance median
    with open(output_dir / "feature_schema.json") as f:
        schema = json.load(f)
        assert schema["version"] == "v1-test"
        assert "distance_median" in schema
        assert len(schema["columns"]) == 40

    # Verify thresholds
    with open(output_dir / "thresholds.json") as f:
        thresholds = json.load(f)
        assert "high" in thresholds
        assert "medium" in thresholds
        assert thresholds["high"] >= thresholds["medium"]

    # Verify metrics provenance
    with open(output_dir / "metrics.json") as f:
        metrics = json.load(f)
        assert metrics["random_seed"] == 42
        assert "test_metrics" in metrics
        assert "split" in metrics
        assert metrics["split"]["train"] == 70


def test_shai_model_dynamic_loading_and_scoring(mini_synthetic_csv, tmp_path, monkeypatch):
    """Verifies that ShaiModel dynamically loads and scores using a custom bundle path."""
    output_dir = tmp_path / "bundle_dynamic"
    
    train_and_bundle(
        input_path=mini_synthetic_csv,
        output_dir=str(output_dir),
        version="v2-dynamic",
        train_rows=70,
        val_rows=25,
        test_rows=25,
        seed=123,
    )

    # 1. Direct bundle_dir parameter
    model_direct = ShaiModel(bundle_dir=str(output_dir))
    assert model_direct.version == "v2-dynamic"
    info = model_direct.info()
    assert info["version"] == "v2-dynamic"
    assert "roc_auc" in info["metrics"]
    assert "lift_top20" in info["metrics"]
    assert "high" in info["thresholds"]

    # 2. Env var dynamic promotion (SHAI_BUNDLE_DIR)
    monkeypatch.setenv("SHAI_BUNDLE_DIR", str(output_dir))
    model_env = ShaiModel()
    assert model_env.version == "v2-dynamic"
    assert model_env.bundle_dir == str(output_dir.resolve())

    # 3. Test scoring with the loaded bundle
    from app import shai_model
    features = shai_model.engineer(
        model=model_env,
        age=45,
        gender="Female",
        distance_km=8.5,
        scheduled_day=date(2025, 2, 1),
        appointment_day=date(2025, 2, 8),
        scheduled_time="10:00 AM",
        department="General Medicine",
        booking_channel="Doc990",
        payment_mode="Cash",
        sms_sent=True,
        hypertension=False,
        diabetes=False,
        prior_appts=2,
        prior_no_shows=0,
    )
    df = model_env.frame([features])
    raw, cal = model_env.score(df)
    assert len(raw) == 1 and len(cal) == 1
    assert 0.0 <= raw[0] <= 1.0
    assert 0.0 <= cal[0] <= 1.0
    category = model_env.category(cal[0])
    assert category in ["High", "Medium", "Low"]
