# SHAI Model Changelog & Retraining Governance

This document records the version history, evaluation benchmarks, and governance rules for deploying and updating the SHAI patient no-show prediction model at the hospital.

---

## 1. Version History

### `shai-lk-synth-v1` (Active Production Baseline)
- **Release Date:** 2026-09-30
- **Model Type:** Gradient Boosted Trees (XGBoost 3.4.1 native format) + Isotonic Regression calibration
- **Tiers:** Capacity-based thresholds (High = top 10% risk, Medium = next 20% risk on validation set)
- **Data Source:** `appointments_synthetic.csv` (Simulated Sri Lankan healthcare appointments: 12 departments, Colombo Haversine geography, Poya calendar, lead days)
- **Total Outcomes:** 64,444 (Uncancelled outcomes; cancelled bookings excluded from label)
  - **Train:** 42,693 (2024-10-01 to 2025-11-29; 14 months)
  - **Validation:** 12,366 (2025-11-29 to 2026-03-31; 4 months)
  - **Test (Hold-out):** 9,385 (2026-03-31 to 2026-07-01; 3 months)
- **Base No-Show Rate:** 15.90%
- **Thresholds:**
  - High Risk: $\ge 0.2722$ (Top 10% capacity)
  - Medium Risk: $\ge 0.1655$ (Next 20% capacity)
  - Low Risk: $< 0.1655$ (Remaining 70%)
- **Held-Out Test Benchmark Metrics:**
  - **ROC-AUC:** 0.6725
  - **PR-AUC:** 0.2659
  - **Brier Score:** 0.1237
  - **Recall @ Top 20%:** 36.30%
  - **Precision @ Top 20%:** 28.02%
  - **Lift @ Top 20%:** 1.815×
  - **Oracle / Ceiling AUC:** 0.7680
- **Bundle Location:** `models/shai_bundle/`

---

### `shai-lk-synth-v1-reproduced` (Reproducibility Release)
- **Release Date:** 2026-10-01
- **Pipeline Script:** `backend/train_shai.py`
- **Model Type:** XGBoost (`depth=2, lr=0.1001, mcw=28, sub=0.5493, col=0.5114, l2=0.6207, n_estimators=224`) + Isotonic Regression
- **Data Source:** `backend/models/shai_bundle/appointments_synthetic.csv`
- **Total Outcomes:** 64,444 (Chronological time-based split: Train 42,693, Val 12,366, Test 9,385)
- **Random Seed:** 42
- **Thresholds:**
  - High Risk: $\ge 0.2556$
  - Medium Risk: $\ge 0.1739$
- **Held-Out Test Evaluation:**
  - **ROC-AUC:** 0.6788 (Target: 0.6725, Diff: +0.0063, **PASS**)
  - **PR-AUC:** 0.2710 (Target: 0.2659, Diff: +0.0051, **PASS**)
  - **Brier Score:** 0.1211 (Target: 0.1237, Diff: -0.0026, **PASS**)
  - **Recall @ Top 20%:** 37.32% (Target: 36.30%, Diff: +0.0102, **PASS**)
  - **Precision @ Top 20%:** 28.24% (Target: 28.02%, Diff: +0.0021, **PASS**)
  - **Lift @ Top 20%:** 1.866× (Target: 1.815×, Diff: +0.0512, **PASS**)
- **Bundle Location:** `models/shai_bundle_v1-reproduced/`
- **Verification Status:** Acceptance test passed within predefined tolerance ($\le 0.02$ probability metrics, $\le 0.08$ lift ratio).

---

## 2. Retraining Gates Before Touching Real Data

Do not retrain the model on real hospital data casually. Retraining without sufficient data or validation degrades ranking stability. The following gates must be met:

1. **Volume Gate:**
   - $\ge 1,000$ recorded outcomes (attended / no-show) with valid booking-stage feature snapshots.
   - $\ge 100$ confirmed no-shows.
   - Span of $\ge 8$ calendar weeks to capture weekday vs. weekend and Poya holiday cycles.
2. **Monitoring First:**
   - Inspect the Analytics **Live Model Check** card.
   - If real-world ROC-AUC is $\approx 0.65 - 0.70$ and tier separation is intact, the synthetic model is already generalising well and retraining is unnecessary.
   - If ROC-AUC drops near 0.50, synthetic assumptions do not fit the clinic and retraining/recalibration is justified.
3. **Cheapest Fix First (Recalibrate Before Retraining):**
   - If ranking (ROC-AUC) remains strong ($> 0.65$) but probability calibration has drifted (e.g. predicted 16% risk vs real observed 11%), refit **only** the isotonic calibration layer and thresholds (`calibration.json` and `thresholds.json`).
   - Recalibration requires far fewer outcomes ($\ge 300$) and carries minimal operational risk.
4. **Full Retrain:**
   - Fit XGBoost from scratch or warm-start only when ranking itself has degraded across slices.

---

## 3. Handling Data & Biases

| Signal / Scenario | Usable in Training? | Action / Rationale |
|---|---|---|
| Attended (0) & No-Show (1) | **Yes** | Primary binary training label. |
| Cancelled $\ge 24$ hours ahead | **No** | Slot was refillable; this is a distinct operational cancellation, not a lost slot. Excluded from training set. |
| Late cancel $< 24$ hours | **Decision required** | Exclude from primary binary label by default; track in separate reporting. Revisit with clinic staff. |
| Rescheduled | **No** | Old appointment is cancelled/superseded; new appointment will have its own outcome. |
| Post-booking feature updates | **Never** | **Leakage hazard.** Training must strictly use features known at the moment of booking. |

### Intervention Bias Guard
When clinic staff call high-risk patients, those patients attend more frequently. Over time, the model's own success would cause high-risk bookings to register as "Attended", gradually eroding the model's learned signal.
- The outcome export script joins the `interventions` table.
- Evaluate model calibration on the un-contacted baseline subset.
- Retraining must stratify by outreach status or include outreach as a conditioned feature.

---

## 4. Promotion & Operational Protocol

1. **New Bundles in Versioned Directories:**
   `train_shai.py` always writes to `models/shai_bundle_<version>/`. It refuses to overwrite the live `models/shai_bundle/` directory without `--force`.
2. **Champion vs. Challenger Testing:**
   Before promoting any new model bundle:
   - Score held-out real hospital outcomes with both the Champion (current live bundle) and Challenger (new bundle).
   - Require non-inferiority bootstrap test (1,000 draws) on ROC-AUC and Lift.
   - Slice checks: verify performance across departments, age bands, and distance bands. No critical slice may degrade significantly.
3. **Config-Driven Switch:**
   Promote by updating `SHAI_BUNDLE_DIR` in `.env` (or Docker configuration) and restarting the backend:
   ```bash
   SHAI_BUNDLE_DIR=models/shai_bundle_v2
   ```
   No application code changes are required. The `/model/info` endpoint dynamically reflects the new version and its metrics.
4. **Never Auto-Promote:**
   Promotion requires explicit staff and supervisor sign-off recorded in this changelog.

---

## 5. Capacity & Smart Overbooking v2 Release
- **Release Date:** 2026-10-01
- **Architecture Reference:** `docs/CAPACITY_V2.md`
- **Alembic Migration:** `c8f4e2b0d1a5_capacity_smart_overbooking_v2.py`
- **Scope:** Replaces legacy heuristic session optimizer with single-server queue simulation & Poisson-binomial calibrated bounds.

### Gap Fixes & Feature Mapping:
- **G1:** Appointment matching restricted to `appointments.doctor_id` FK (backfill migration applied).
- **G2:** Fabricated baselines (`max(len(appts), 14)`) eliminated; honest empty states rendered.
- **G3:** Continuous calibrated probabilities summed; Poisson-binomial variance $\sum p_i(1-p_i)$ and 80% interval computed.
- **G4:** Doctor delay curtails tolerance: $\tau_{\text{eff}} = \max(0, \tau_{\text{base}} - \text{delay\_minutes})$.
- **G5:** Booked utilisation ($\text{booked}/\text{capacity}$) and expected attendance rate ($(\text{booked}-\mu)/\text{capacity}$) split into dual metrics.
- **G6:** Magic numbers moved to `capacity_settings` database table with manager UI and department overrides.
- **G7:** Vectorized NumPy single-server queue simulation (2,000 runs, $<40$ ms) replaces linear guess.
- **G8 / Feature A:** 15-minute slot heatmap grid (`/capacity/slots`) with slide-over drawer and individual patient risk telemetry.
- **G9:** Duplicate room strings normalized (`clean_room_name`).
- **G10:** Dynamic nav counts endpoint (`GET /capacity/nav-counts`) drives live sidebar badges on Capacity and Outreach.
- **G11 / Feature C:** Multi-attribute utility ranker auto-fills freed slots from waitlist with 15-minute undo audit trail.
- **G12:** Prescriptive recommendations persisted to `capacity_recommendations`.
- **G13:** SQL aggregations with indexed foreign keys replace N+1 Python loops.
- **G14:** Revenue upside labeled "Expected Upside" based on $\text{expected filled gaps} \times \text{fee}$.
- **Feature B:** Live debounced What-If simulation studio with side-by-side comparison, trade-off curves, and scenario persistence.
- **Feature D:** Multi-horizon forecast (7, 14, 30 days) with confidence band area chart, department risk bars, and calendar heat strip.
- **Feature E:** 10-decile model calibration curve, Brier score tracking, confusion matrix, and overbook regret rate monitoring.
