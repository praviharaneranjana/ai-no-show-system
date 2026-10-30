import json
import os

from app import shai_model


def test_model_info_comes_from_bundle_files(client):
    r = client.get("/model/info")
    assert r.status_code == 200, r.text
    info = r.json()
    bundle = shai_model.resolve_bundle_dir()
    metrics = json.load(open(os.path.join(bundle, "metrics.json")))
    thr = json.load(open(os.path.join(bundle, "thresholds.json")))
    assert info["thresholds"]["high"] == thr["high"] and info["thresholds"]["medium"] == thr["medium"]
    assert info["n_rows"] == metrics["n_rows"]
    assert info["base_rate"] == metrics["base_rate"]
    assert info["oracle_auc"] == metrics["oracle_auc"]
    assert info["comparison_table"] == metrics["comparison_table"]
    assert info["top_shap"] == metrics["top_shap"]
    assert info["metrics"]["roc_auc"] == metrics["test_metrics_tuned"]["ROC_AUC"]
    assert "synthetic" in info["limitation"].lower() and "not validated" in info["limitation"].lower()
    assert "data_sources" in info


def test_data_source_endpoint(client):
    r = client.get("/meta/data-source")
    assert r.status_code == 200
    body = r.json()
    assert set(body) >= {"counts", "total", "synthetic", "is_synthetic", "synthetic_share"}
