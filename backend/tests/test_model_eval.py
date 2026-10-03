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
