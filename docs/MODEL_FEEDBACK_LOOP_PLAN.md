# Model feedback loop: how recorded outcomes update the model

Model-side plan. **Not part of the Antigravity prompt.** The app-side capture (outcome workflow, `prediction_log`, export script, live performance card) is in `ANTIGRAVITY_INTAKE_REDESIGN_PROMPT.md` §10. This document covers what we do with that data.

## 0. Ground truth first

- The shipped model (`shai-lk-synth-v1`, ROC-AUC 0.672, lift 1.8×) was trained on **synthetic** data. Nothing it has learned comes from your hospital.
- **No script in `backend/` produces `models/shai_bundle/`** (no `.py` file references `shai_bundle` or `calibration.json`). `train.py` is the old Kaggle pickle path. Before any retraining, the bundle build must be reproducible in the repo (see step 1).
- A model cannot be "updated" by one click of Mark Attended. One outcome is one label. The honest loop is: **capture → accumulate → evaluate → retrain offline → compare → promote by hand.**

## 1. Make training reproducible (do first, before any real data exists)

Add `backend/train_shai.py` that rebuilds the whole bundle from a CSV of features + label:
- fits the XGBoost model, then the calibration (`calibration.json`), the capacity-based tier thresholds (`thresholds.json`: High = top 10%, Medium = next 20%), and `feature_schema.json` and `metrics.json`;
- writes to a **new versioned directory** (`models/shai_bundle_<version>/`), never over the live one;
- logs the data source, row count, date range and random seed into `metrics.json`;
- runs on the synthetic CSV and **reproduces the current metrics within tolerance**. That is the acceptance test that proves the pipeline matches what is deployed.

`shai_model.py` should load a bundle path from an env var (`SHAI_BUNDLE_DIR`, default the current one) so a new version can be promoted by changing config, with no code change. `prediction_log.model_version` already records which version scored each booking.

## 2. What the data can and cannot teach

| Signal | Usable for training? |
|---|---|
| Attended (0) and no-show (1) with booking-time features | **Yes**, the core label |
| Cancelled ≥ 24 h ahead | No. The slot was refillable, so this is a different outcome |
| Late cancel < 24 h | Decision needed: treat as no-show-equivalent (operationally the slot is lost) or exclude. **Recommend exclude from the label, report separately**, and revisit with staff |
| Rescheduled, unrecorded | No |
| Rescored later features | **Never.** Only the booking-stage snapshot (leakage otherwise) |

Watch for **intervention bias**: once staff call high-risk patients, those patients attend more, so the model's own warnings change the labels it later learns from. Keep `interventions` joined to the export so you can (a) evaluate on the un-contacted subset, and (b) later add "was contacted" as a feature or stratify. Do not skip this, or retraining will learn that "High risk" is safer than it is and gradually erase its own signal.

## 3. Gates before retraining (suggested numbers, tune with your supervisor)

1. **Volume:** ≥ 1,000 labelled outcomes and ≥ 100 no-shows, over at least 8 weeks (weekday/Poya/rain seasonality).
2. **Monitoring first:** the Analytics "Live model check" must show real AUC, per-tier observed rates and calibration. If the synthetic model already does about as well on real outcomes, retraining may be unnecessary. If it is near 0.5, the synthetic assumptions don't match your hospital and retraining (or recalibration) is justified.
3. **Cheapest fix first: recalibrate, don't retrain.** If ranking (AUC) is acceptable but probabilities are off (e.g. predicted 16% vs real 11%), refit only the calibration layer and thresholds on real outcomes. Low risk, needs far less data.
4. **Full retrain** only when ranking itself is weak.

## 4. Retrain procedure

1. `python export_outcomes.py` → CSV of booking-stage features + label.
2. **Time-based split**, not random: train on the older weeks, validate on the newest (random splits inflate AUC on scheduling data).
3. Options, in order: (a) recalibrate only; (b) continue training from the synthetic model with real data at higher weight; (c) retrain from scratch on real data, optionally blended with the synthetic set. Start with (a) and (b). (c) needs the most real data.
4. Produce the new bundle in a new directory via `train_shai.py`, with the same metric set as today (ROC-AUC, PR-AUC, Brier, lift@top-20%).
5. **Champion vs challenger:** score the same held-out real outcomes with both the current bundle and the new one. Promote only if the challenger is better on AUC/lift **and** calibrated (Brier) with a confidence interval (bootstrap 1,000 draws) that doesn't overlap a regression.
6. Fairness check by slice: department, age band, gender, distance band, booking channel. No slice should degrade materially.
7. Promote by setting `SHAI_BUNDLE_DIR`, restart, and keep the old bundle for rollback. The UI "ROC-AUC 0.672 · 1.8×" labels must then come from the active bundle's `metrics.json`, not be hard-coded (currently hard-coded in the sidebar and detail page). Note this when switching to real-data metrics, and keep "synthetic benchmark" vs "hospital outcomes" visibly separate.
8. **Never auto-retrain or auto-promote.** A person reviews the comparison report and promotes. Keep a short `docs/MODEL_CHANGELOG.md` (version, date, data source, n, metrics).

## 5. Model-side fixes found while reviewing intake (independent of retraining)

1. **Gender:** empty gender is scored as Female (`"M" if g == "M" else "F"` in `engineer`). Either require gender at intake, or add an `unknown` category and retrain.
2. **Unmodelled inputs:** alcoholism, handicap and scholarship are not features, and `chronic_count` counts only hypertension and diabetes. Keep them as recorded-only (UI says so) or add features in the next training run.
3. **Unmodelled departments:** anything not in the 12 trained departments (e.g. Oncology, Ophthalmology) falls back to General Medicine. Add them to training data, or keep the UI note.
4. **SMS feature semantics:** trained as "reminder was sent". At booking we only know opt-in. The app re-scores when a reminder is really sent (logged by the outcome/intervention events); confirm that re-score happens in the backend.
5. **Distance:** confirm how `fake_data_lk.py` generated `distance_km` (straight-line vs road). The intake estimate (haversine × 1.3) should match that definition.
6. **Rain:** `heavy_rain` is always 0 today. A weather lookup by appointment date (Open-Meteo, backend-side) would feed it. Only useful after retraining with real rain-labelled outcomes.
7. **First-visit and history features** only work once patients are de-duplicated (Phase A backfill), with no model change needed.

## 6. Timeline

- **Now (no data):** `train_shai.py` reproducibility + `SHAI_BUNDLE_DIR` + changelog.
- **Weeks 1–8 of real use:** outcomes accumulate via the new workflow; watch the Live model check.
- **When gates are met:** recalibrate → evaluate → (only if needed) retrain → champion/challenger → manual promote.
- **For the thesis:** report the synthetic benchmark and the live hospital-outcome check as two separate results. If there are not enough real outcomes by submission, say so plainly and present the pipeline and the capture design as the contribution.
