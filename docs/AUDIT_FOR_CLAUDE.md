# SHAI — Read-only audit for viva defence

Audit date: 2026-10-02 (system date). Branch `feature/frontend-dashboard`. Nothing was modified except this file. Only read-only commands were run (SQL in `SET TRANSACTION READ ONLY`, scoring with `persist=False`, pytest on the separate `noshow_test_db`, `npm test`, `npm run lint`). Secrets are `[REDACTED]`.
Tags: REAL / PARTIAL / MOCK / MISSING.

---------------------------------------------------------------------
## 1. MODEL

**1a. Files loaded at startup — REAL**
- `backend/models/shai_bundle/` (resolved by `resolve_bundle_dir`, `backend/app/shai_model.py:40-52`, default `models/shai_bundle` `:33`): `model.json` (XGBoost native JSON, 170 KB), `feature_schema.json`, `calibration.json`, `thresholds.json`, `metrics.json`. Loaded in `ShaiModel.__init__` (`shai_model.py:61-86`).
- Library: **xgboost 3.4.1** (`xgb.XGBClassifier().load_model("model.json")`, `:84-85`) + **shap 0.52.0** `TreeExplainer` (`:86`). scikit-learn 1.9.0 is used only in training (`train_shai.py:50`, IsotonicRegression) — not at inference. numpy `np.interp` does calibration.
- **The README does NOT say scikit-learn** (it says "XGBoost + isotonic calibration + SHAP", README.md line 8). Only the `model.json` attribute `scikit_learn` shows XGBClassifier is the sklearn-API wrapper. Don't claim "scikit-learn model"; say "XGBoost, calibrated with scikit-learn's IsotonicRegression at training time".
- Stale leftovers (not loaded): `backend/models/xgboost_model.pkl`, `shap_explainer.pkl` (old Kaggle model, produced by `backend/train.py:41-48`, still copied into the Docker image by `Dockerfile` `COPY models`), and `models/shai_bundle_v1-reproduced/` (alternate bundle, loaded only if `SHAI_BUNDLE_DIR` set).

**1b. Bundle contents** (`backend/models/shai_bundle/`)
- `version` (feature_schema.json last key): **`shai-lk-synth-v1`**
- feature_schema.json: numeric = age, distance_km, lead_days, appt_dow, appt_hour, appt_month, prior_appts, prior_no_shows, prior_no_show_rate, is_first_visit, chronic_count, sms_sent, heavy_rain, is_poya, is_weekend (15); categorical gender{F,M}, booking_channel{Counter,Doc990,MyHealth,Phone,eChannelling}, payment_mode{Card,Cash,Corporate,Insurance,Prepaid_Online}, department{Cardiology,Dermatology,ENT,Endocrinology,Gastroenterology,General Medicine,Gynecology,Neurology,Orthopedics,Pediatrics,Psychiatry,Urology}; 40 `columns` (the 15 numeric + `distance_missing` + 24 one-hots); `distance_median` 6.0; `distance_missing_flag` true.
- thresholds.json: `{"high": 0.27222222089767456, "medium": 0.16545189917087555, "rule": "High = top 10% / Medium = next 20% of validation-set calibrated risk"}`
- metrics.json (full): test_metrics_tuned ROC_AUC 0.67249, PR_AUC 0.26591, Brier 0.12373, Recall_top20 0.36301, Precision_top20 0.28023, Lift_top20 1.81504; **oracle_auc 0.76803**; n_rows 64444; base_rate 0.15902; split train 42693 / val 12366 / test 9385; top_shap lead_days .3003, prior_no_show_rate .1824, payment_mode_Prepaid_Online .1323, sms_sent .1184, chronic_count .087, booking_channel_Counter .0856, heavy_rain .0703, appt_hour .0682, age .0663, distance_km .0653; optuna_best {lr .1001, depth 2, mcw 28, sub .5493, col .5114, l2 .6207}. comparison_table (5 rows, test): LogReg AUC .664 / PR .267 / Brier .219 / R@20 .36; DecisionTree .643/.237/.222/.343; RandomForest .659/.268/.192/.371; XGB plain .668/.275/.124/.373; XGB scale_pos_weight .668/.274/.214/.375.
- calibration.json: keys `x`,`y`, 68 points each. First 20 x: 0.02394, 0.03136, 0.03196, 0.04557, 0.04559, 0.04915, 0.04918, 0.05350, 0.05354, 0.05501, 0.05504, 0.06531, 0.06532, 0.06876, 0.06877, 0.08253, 0.08253, 0.09378, 0.09379, 0.09695. First 20 y: 0.005, 0.005, 0.01124, 0.01124, 0.01515, 0.01515, 0.01835, 0.01835, 0.02439, 0.02439, 0.03421, 0.03421, 0.05594, 0.05594, 0.05734, 0.05734, 0.07311, 0.07311, 0.07851, 0.07851.
- Note: metrics.json has no `data_source`/`date_range`/`created_at`, so `info()` falls back to hard-coded `"appointments_synthetic.csv"` (`shai_model.py:158`).

**1c. Load + encode + calibrate + tier code — REAL**
- Load: `shai_model.py:68-86`. Encode: `frame()` `:107-120` (one-hot by building `f"{cat}_{value}"`; missing key → stays 0). Calibrate: `calibrate()` `:89-91` = `np.interp(raw, cal_x, cal_y)` (**yes, np.interp on calibration.json**). Tier: `category()` `:93-98` uses `self.high_threshold`/`self.medium_threshold` read from thresholds.json (`:81-82`) — **not hard-coded**. Score = `score()` `:122-124`.
- Grep for cut-offs (backend+frontend, excluding tests): only these risk-cut-offs outside the bundle:
  - `backend/app/services/capacity_service.py:201` `p >= 0.40` counts as high-risk (in addition to tier) — hard-coded.
  - `capacity_service.py:466` heat colour amber if slot expected no-shows ≥ 0.40; `:457` slot overbook if sum ≥ 0.70.
  - `frontend/app/model/page.tsx:29-45` shows "> 0.23", "0.13 – 0.23", "< 0.13" — **wrong vs thresholds.json (0.272 / 0.165)**.
  - `schemas.py:953` `reschedule_success_rate` default 0.65 (ROI slider, not a risk cut-off).
  - `train_shai.py:349-350` computes thresholds (percentile 90 / 70 of validation calibrated risk).

**1d. Pickle / contextual leftovers — PARTIAL (dead code + UI text remain)**
- Pickle: `backend/train.py:2,41-48` (old trainer, writes .pkl), `backend/models/xgboost_model.pkl`, `shap_explainer.pkl`, `backend/requirements.txt:6,11` cloudpickle/joblib, `.claude/skills/implement-plan/SKILL.md:35,70` (docs only). The live path uses no pickle (`shai_model.py:4` says so).
- Contextual: `backend/app/contextual.py` (whole file, `apply_contextual_adjustment` `:73`) + `backend/tests/test_contextual.py` (still passes; module is not imported by the app); response field kept as always-`None`: `schemas.py:335,357`, `main.py:184,666,853-867`, `services/scoring.py:28,96`, `frontend/lib/types.ts:88,106,895`. **UI text still claims it**: `frontend/app/model/page.tsx:86` ("Sri Lankan contextual layer"), `:214-235` card "Contextual Multipliers Layer" with 1.25x/0.75x/1.15x multipliers that do not exist in the code; `frontend/app/new/new-appointment-form.tsx:1039` ("monsoon contextual attendance penalty") and `:1158` ("Sri Lankan contextual multipliers"). Test `test_shai_endpoints.py:304` asserts it is None.

**1e. Model Hub (`frontend/app/model/page.tsx`) — MOCK (100% hard-coded, partly wrong)**
It calls no endpoint (a `/model/info` endpoint exists, `main.py:237`, but the page doesn't use it). Every number is a literal:
| Shown | Line | Truth |
|---|---|---|
| "Prediction Skill 0.672" | :20 | matches metrics.json (0.6725) but typed by hand |
| "High-Risk Detection 0.266" | :21 | is PR-AUC 0.2659, mislabelled "accuracy" |
| "Prediction Accuracy 0.124" | :22 | is Brier, mislabelled |
| Baseline 15.9% | :23 | matches base_rate (hand-typed) |
| Tier cut-offs >0.23 / 0.13–0.23 / <0.13 | :29-45 | **wrong** (0.272 / 0.165) |
| SHAP bars (85, 78, 55, 40, 35, 28 %) incl. "Elderly 60+ ↓ risk" and "Distance >20 km" | :50-57 | invented; metrics.json top_shap shows prepaid payment, sms_sent, chronic_count above distance/age |
| "110,527 outpatient records from Colombo General Hospital" | :157,:200 | **false**: 110,527 is the Brazilian Kaggle set; deployed model trained on 64,444 synthetic rows |
| "Out-of-time 80/20 split" | :203 | actual: chronological 42,693/12,366/9,385 (66/19/15 %) |
| "Production v1.0", "Fairness & Guardrails Active", "Ethnicity… strictly excluded" | :82,:93,:209 | no fairness code exists (see §10) |
| Contextual Multipliers card | :214-235 | feature removed |
Also hard-coded elsewhere: `app-sidebar.tsx:307,319` ("ROC-AUC 0.672 · 1.8× Lift", "15.9% base"), `appointments/[id]/page.tsx:128`, `login/page.tsx:358`, `analytics/page.tsx:348,380`.

---------------------------------------------------------------------
## 2. FEATURES

**2a. Feature provenance** (all built server-side by `shai_model.engineer()` `shai_model.py:217-259`, called from `services/scoring.py:68-84`)
| Feature | Source | Evidence |
|---|---|---|
| age | DERIVED from patient.date_of_birth and appointment_day | scoring.py:44-51 |
| gender | DB patient.gender (non-"M" → "F") | shai_model.py:237,255 |
| distance_km / distance_missing | DB patient.distance_km (entered/geocoded earlier); None → median 6.0 + flag | scoring.py:72; shai_model.py:240-241 |
| lead_days | COMPUTED appointment_day − scheduled_day, ≥0 | shai_model.py:236 |
| appt_dow, appt_month, is_weekend | COMPUTED from date | :243,:245,:254 |
| appt_hour | from appointment.scheduled_time string, fallback 17 | parse_hour :200-210 |
| is_poya | COMPUTED astronomical full-moon (Meeus), SL UTC+5:30 | :262-310 |
| prior_appts, prior_no_shows, prior_no_show_rate, is_first_visit | DERIVED from DB history | scoring.py:35-48; shai_model.py:213-214,246-249 |
| chronic_count | hypertension + diabetes flags from patient row (entered by staff) | :250 |
| sms_sent | `appointment.sms_received or sms_reminder_opt_in` (staff-entered/DB) | scoring.py:76 |
| heavy_rain | **USER toggle** (see 2d) | scoring.py:82 |
| booking_channel, payment_mode | staff-entered, mapped by `map_channel/map_payment` (keyword matching; defaults Phone/Cash) | shai_model.py:165-189 |
| department | doctor.department.model_category (DB) mapped to 12 categories; default General Medicine | scoring.py:58-61; shai_model.py:192-197 |

**2b. prior_appts / prior_no_shows / rate — REAL, server-side**
```python
# services/scoring.py:35-48 (identical helper main.py:~140 _patient_history)
prior = db.query(Appointment.no_show).filter(
    Appointment.patient_id == appointment.patient_id,
    Appointment.id != appointment.id,
    Appointment.appointment_day < appointment.appointment_day,   # strictly earlier day
    Appointment.no_show.isnot(None)).all()                      # only appointments with a recorded outcome
prior_appts = len(prior); prior_no_shows = sum(ns for (ns,) in prior if ns)
# shai_model.py:213-214, constants :36-37
rate = (prior_no_shows + 2*0.16) / (prior_appts + 2)
```
Rule: earlier-dated appointments of the same patient with a non-null `no_show`. Cancelled are excluded **only if** `no_show` is NULL; `PATCH /appointments/{id}/outcome` (`main.py:820-846`) sets status="cancelled" but writes `no_show=data.no_show` (could be False → counted as attended) — PARTIAL. No hospital filter, no check that the outcome was recorded before the scoring date. Client never sends these.

**2c. Other derivations — REAL** (see table above; code `shai_model.py:236-254`). `is_first_visit = prior_appts==0`; `distance_missing = 1 if distance_km is None`.

**2d. heavy_rain — MANUAL toggle, no weather API — REAL (manual)**
Checkbox `useState(false)` in `frontend/app/new/new-appointment-form.tsx:124,1045` and Prediction Hub `prediction-hub-client.tsx:58`; sent as `heavy_rain` to `/appointments/intake` (`main.py:645`), `/predict` (`main.py:162,253`), `/predictions/runs` (`main.py:1349`). Default 0. Searched `weather|open-meteo|rain` in backend/frontend: no external API, no key. "Offline" is irrelevant — nothing calls out. Caveat: training data's heavy_rain came from the synthetic generator, so the model has never seen real rainfall.

**2e. Does /predict trust the client? — NO (derives from DB) — REAL**
`POST /predict` (`main.py:242-263`) takes `appointment_id` + `heavy_rain`; legacy Kaggle fields (Age, Scholarship, …) are accepted but ignored (`main.py:155-170`). `/predict/preview` (`:266-328`) builds a transient appointment from patient+doctor ids (not persisted, `persist=False`). Batch re-score: `POST /predictions/runs` (`main.py:1311`) → `prediction_runner.run_predictions` (§4b). Caveat: `/predict` has no hospital check (any logged-in user, any role, can rescore any appointment id).

**2f. Unknown categories — silent fallback, no error/warning — PARTIAL**
`map_channel` → "Phone" (`shai_model.py:176`); `map_payment` → "Cash" (`:189`); `map_department` → "General Medicine" (`:197`); gender anything not "M" → "F" (`:255`); in `frame()` any unmatched key is simply left 0 (`:116-118`). Nothing is logged.

---------------------------------------------------------------------
## 3. DATA

**3a. Tables** (live DB, `information_schema`): alembic_version, appointment_events, appointments, capacity_recommendations, capacity_scenarios, capacity_settings, departments, doctor_clinic_sessions, doctor_sessions, doctors, expense_categories, his_appointments, his_sync_runs, hospital_audit_logs, hospital_contacts, hospital_email_domains, hospital_expenses, hospital_management_members, hospital_memberships, hospital_partners, hospitals, interventions, locations, patients, prediction_log, prediction_runs, predictions, slot_offers, staff_invitations, stored_files, users, waitlist. Alembic head `a1b2c3d4e5f6` = DB current.
Key columns (ORM `backend/app/models.py`):
- **appointments**: id uuid, patient_id, scheduled_day date, appointment_day date, department, sms_received bool, status, no_show bool, created_at, doctor_name, booking_channel, payment_mode, scheduled_time varchar, queue_number int, ai_action_status, doctor_id, clinic_session_id, source text, external_ref, his_synced_at, booked_by, booking_notes, sms_reminder_opt_in, reminder_sent_at, cancelled_at, cancel_reason, late_cancel, rescheduled_from_id, checked_in_at, no_show_reason, outcome_recorded_at, outcome_recorded_by, outcome_source, slot_start time, hospital_id.
- **patients**: id, full_name, date_of_birth, gender, phone, email, scholarship, hypertension, diabetes, alcoholism, handicap int, created_at, uhid, city, distance_km numeric, latitude, longitude, nic, district, address_line, location_id, distance_source, preferred_language, his_patient_ref, hospital_id.
- **predictions**: id, appointment_id (unique), risk_score numeric(5,4), risk_category, explanation jsonb, recommendation, created_at, hospital_id. (**No model_version column** — it lives inside `explanation.model_version`.)
- **prediction_log** (audit): id, appointment_id, stage, features jsonb, risk_score, risk_category, model_version, prediction_run_id, created_at. (no hospital_id)
- **prediction_runs**: id, run_date, doctor_id, status, stage, with_sync, total, scored, failed, high, medium, low, expected_no_shows, model_version, error, triggered_by, started_at, finished_at, hospital_id.
- **interventions**: id, appointment_id, channel, language, status, patient_reply, intent_detected, offered_slot, created_at, hospital_id.
- **waitlist**: id, patient_name, patient_phone, specialty, doctor_name, urgency_level, preferred_days, status, created_at, hospital_id.
- **doctor_sessions** (legacy): id, doctor_name, specialty, room_number, session_date, scheduled_start_time, status, delay_minutes, avg_consultation_mins, max_capacity, created_at, hospital_id.
- **users**: id, email, full_name, role, password_hash, is_active, must_change_password, failed_attempts, locked_until, last_login_at, created_at, phone, avatar_file_id. (role per hospital in hospital_memberships.)
- **hospitals**: id, slug, name, short_name, legal_name, logo_*, brand_color, established_date, hospital_type, registration_number, bed_count, address fields, lat/long, timezone, currency, website, phones, about, accreditations, go_live_date, is_active, created/updated.

**3b. Counts (run 2026-10-02, DB `noshow_db`)**
| Metric | Value |
|---|---|
| patients | 5,004 |
| appointments | 5,005 |
| by status | completed 4,266 · no_show 653 · scheduled 86 |
| by source | `manual` 5,005 (**0 `his_sync`**) |
| min / max appointment_day | 2025-08-28 / 2026-11-11 |
| future scheduled (status=scheduled, day ≥ today) | 83 (86 scheduled in total, 3 are today-or-earlier-but-unresolved on 10-01) |
| with recorded outcome (`no_show IS NOT NULL`) | 4,919 |
| with `outcome_recorded_at` | **0** (outcomes were seeded, not "recorded") |
| `outcome_source` | NULL for all 5,005 |
| predictions | 5,005 (2 with no model_version in explanation, 5,003 `shai-lk-synth-v1`) |
| prediction_log rows | **1** (model_version `shai-lk-synth-v1`) |
| prediction_runs | 3, **all stuck `status='running'`, scored=0** (see 4b) |
| interventions / waitlist / doctor_sessions / users / hospitals / his_appointments / doctors | 252 / 7 / 17 / 10 / 2 / 228 / 68 |
| appointments by hospital | Asiri (…0001) 5,002 · NHSL (…0002) 2 · **NULL 1** |

**3c. Origin of the data — SYNTHETIC — REAL (but disclosed only in small print)**
- Patients/appointments/outcomes/predictions were bulk-generated by `backend/seed_bulk.py` using `backend/fake_data_lk.py` (`generate_core_dataframe`, labels from a *different* logistic formula `fake_data_lk.py:~165-176`: lead>15, sms, age, weekend, handicap, scholarship, prepaid) — not the generator that produced the model's training CSV. Predictions were computed with `prior_appts = prior_no_shows = 0` for everyone (`seed_bulk.py:125-146`). Reference data: `seed_reference.py`; users/hospitals: `seed.py`; simulated HIS rows: `seed_his.py` (`random`, `seed_his.py:67-212`).
- UI badge: small text "Synthetic data · simulation" in sidebar footer (`components/app-sidebar.tsx:317`) and "Synthetic Simulation" on login (`login/page.tsx:386`). No per-page banner. PARTIAL.
- Seed-on-empty / fake-default logic still in the API (all write to DB on a GET):
  - `main.py:1795-1833` default waitlist (Sunil Jayawardena, Malini Dias, Chaminda Vaas) when table empty.
  - `main.py:1850-1890` seeds 3 canned Sinhala/English/Tamil conversations when no interventions.
  - `capacity_service.py:117-141` creates "Dr. Rohan Perera"/"Dr. Neluka Fernando" legacy sessions if no doctors; `:60-75` creates a global capacity setting on first read (the DB already has **two** `global` rows — one with fee 0.0 — `.first()` picks arbitrarily).
  - `capacity_service.py:573-603` demo slot offer "Patient UHID-88219 Cancelled via WhatsApp"; `:606-635` fake phone `+94770000000`, `SH-44021`, "Room 204".
  - `main.py:2092-2150` default expense categories + 3 default expenses.
  - Frontend: sidebar fallback names "Staff Member"/"Asiri Central Hospital"/"ACH" (`app-sidebar.tsx:~60`). `Math.random` in frontend: none.

**3d. Tier distribution and calibration on the live DB**
Scheduled appointments (n=86, stored predictions): High 27 (31.4 %, mean risk 0.372) · Medium 48 (55.8 %, 0.228) · Low 11 (12.8 %, 0.112); mean predicted risk **0.2585**. (Live recomputation with the current history gives High 27 / Med 48 / Low 11, mean 0.2525 — 3 of the first 20 stored scores differ from recomputed ones.)
All 5,005 stored predictions: High 864 (17.3 %), Medium 2,471 (49.4 %), Low 1,670 (33.4 %) — design target was 10/20/70.
Among appointments with outcomes (n=4,919, overall no-show 13.28 %):
| Tier | n | mean predicted | observed no-show |
|---|---|---|---|
| High | 837 | 0.3563 | **16.73 %** |
| Medium | 2,423 | 0.2119 | 12.67 % |
| Low | 1,659 | 0.1105 | 12.42 % |
Overall on live DB data: **AUC 0.526, Brier 0.126, recall@top20 24.8 %, lift 1.24; mean predicted 0.202 vs observed 0.133.** The model barely separates the DB's labels because labels come from a different synthetic rule-set (see 3c). Do not present the DB as evidence of model accuracy.

---------------------------------------------------------------------
## 4. HIS CONNECTOR AND PREDICTION HUB

**4a. Simulated HIS — REAL mechanics, MOCK content**
`HIS_CONNECTOR_TYPE` default "simulated" (`his/connector.py:302`). `SimulatedHISConnector` reads table `his_appointments` (`:64-160`), which is populated by `seed_his.py` with random Sri-Lankan names/phones/channels/payments/hypertension etc. (`seed_his.py:107-186`, `random.seed(42+date)`), including 10 past appointments with outcomes (7 attended, 3 no_show, `seed_his.py:191-233`). `his_sync.sync_day` (`services/his_sync.py:53-325`) idempotently upserts patients/doctors/appointments by `external_ref`, writes `his_sync_runs` and an `appointment_events` row. It does **not** create outcomes by itself, but it copies `his_status` ("completed"/"no_show") into `status` only (`map_his_status :41-50` maps completed→"attended", a value no other code uses) and **never sets `appointments.no_show`**, so synced outcomes never reach the prior-history feature. `POST /his/simulate/arrivals` (`main.py:1197`) randomly marks bookings "arrived" (dev-only). `HttpHISConnector` exists (`connector.py:173+`) but is untested against any real HIS. In the live DB: `source='his_sync'` appointments = 0.

**4b. Batch re-score — REAL code, NOT RUN here**
Steps (`services/prediction_runner.py:26-249`): create `prediction_runs` row → (optional) HIS sync → select appointments for `run_date` with status in (scheduled, booked) for the hospital (**or NULL hospital**, `:101-107`) + filters → for each: `scoring.score_appointment(stage="day_of", run_id=…, persist=True)` (computes features from DB, calibrates, SHAP, upserts `predictions`, appends `prediction_log`) → progress commit every 5 → finalise counts and `expected_no_shows = sum(score)`. Model version stamped: `shai.version` = `shai-lk-synth-v1` into `prediction_log.model_version` and `predictions.explanation.model_version` (`scoring.py:100,122-133`); `prediction_runs.model_version` is **never set** (NULL).
Duration: not executed (would write). Read-only timing of the same scoring+SHAP code: **86 scheduled appointments in 1.87 s (~22 ms each)**; model load 0.08 s; extrapolated ~110 s for 5,005. Tests: `tests/test_batch_prediction.py` pass (163/163 overall).
Audit log: table `prediction_log` (columns above). Only **1** row exists in the DB: appointment `898ceeb4-…`, stage `booking`, risk 0.0152, `Low`, `shai-lk-synth-v1`, `prediction_run_id` NULL, created 2026-10-02 01:10, features JSON begins `{"age": 63, "gender": "M", "is_poya": 0, "appt_dow": 4, "sms_sent": 1, "appt_hour": 9, "lead_days": 0, "appt_month": 10, "department": "Cardiology"…`. The 5,005 bulk predictions have no log row.
**Issue**: all 3 `prediction_runs` in the DB are stuck `running` with scored=0 (11, 1, 1 targets; 2026-10-01 20:59 … 2026-10-02 01:14). Likely background task killed (uvicorn `--reload`) — cause not proven. No timeout/reaper marks them failed. Also `main.py:1242` filters `models.Prediction.prediction_run_id`, an attribute that doesn't exist (it's on PredictionLog) → swallowed by `try/except`, so department breakdown is silently empty.

---------------------------------------------------------------------
## 5. CAPACITY, OVERBOOKING, WAITLIST

**5a. Overbooking logic — PARTIAL (Poisson-binomial for the expectation/interval, Monte-Carlo heuristic for the recommendation)**
- `services/capacity_math.py:14-79` `calculate_poisson_binomial_stats`: expected = Σp, variance = Σp(1−p); **exact DP distribution for n<10, normal approximation (z=1.28155, 80 %) for n≥10**.
- Recommendation: `queue_simulator.optimize_overbook_count` (`:147-223`): ceiling `k ≤ min(max_overbook_per_session, round(Σp × safety_factor))` (`:186-188`); for each k run `simulate_single_server_queue` (`:12-144`, Bernoulli arrivals, Normal service times, Lindley recursion); choose the largest k with `p_overcrowding ≤ risk_budget 0.08` (`:157,:213`). It is **not** a Poisson-binomial tail calculation, and `max_capacity` is accepted but **never used** — the recommendation ignores how many seats are actually free.
- Constants: `risk_budget 0.08` queue_simulator.py:157; overbooked patients attend with 0.85 `:66`; service std 3.5 min `capacity_service.py:223` / `queue_simulator.py:16`; min service 2 min `:88`; slot spacing max(5, avg) `:95`; seed 42 `:226`; sim_runs from settings (2000) ; default settings safety_factor 0.75, max_overbook/slot 2, /session 4, tolerance 15, fee 4500, badge 8/15, sim_runs 2000 (`capacity_service.py:60-71`); fee fallback `doc.consultation_fee_lkr or settings… or 4500` `:174`; capacity fallback 25 `:179`; avg consult = `slot_minutes` else 12 `:180`; missing-prediction fallback p = 0.16 `:204`; high-risk count `p ≥ 0.40` `:201`; filled gaps `k × ratio` where `0.85*ratio+0.15*min(1,ratio)` collapses to `ratio` (`capacity_math.py:128-129`); linear fallback wait `k × avg × 0.35` `queue_simulator.py:233`; badge thresholds delay ≤5 / ≤15 `capacity_service.py:241-246`; heat-map: slot overbook if Σp ≥ 0.70 and ≤ 2 booked `:457`, amber ≥ 0.40 `:466`, wait `k × 3.5` `:477`, fixed slots 16:00–18:30 `:391`, default distance 8.5 km `:424`, **age hard-coded 35** `:441`; what-if: `max_overbook_cap = min(6, 3×slot cap)` `:530`.
- Persistence: each GET `/capacity/overview` writes `capacity_recommendations` rows with `model_version="shai-lk-synth-v1"` hard-coded (`:330`).

**5b. Expected no-shows / capacity — REAL (with a defect)**
Expected no-shows = Σ stored calibrated `predictions.risk_score` for non-cancelled appointments on the date (`capacity_service.py:195-207`). Capacity = `doctor_clinic_sessions.max_patients` of **`doc.sessions[0]`** (first session of every active doctor, irrespective of weekday, `:177-179`) → total capacity 1,620 for all 68 doctors every day while 8–11 patients are booked (utilisation 0.5–0.7 %). The query has **no hospital filter** (`:102-153`).

**5c. Waitlist assign — MOCK**
`POST /capacity/waitlist/{id}/assign` (`main.py:1836-1847`) only sets `entry.status="offered"`. No appointment is created, no slot check, no "no free slot" branch, no hospital filter, no role restriction. Slot-offer approve (`capacity_service.py:647-683`) likewise only flips statuses. Candidate scoring weights exist (`candidate_ranker.py`: specialty 35, reliability 25, wait 15, urgency 15, distance 10) but are fed demo constants (`predicted_no_show_prob=0.08`, `distance_km=4.2`, `:584-587`).

**5d. What-if and Accuracy tabs**
- What-if (`capacity_service.py:499-562`): PARTIAL/MOCK — baseline from live overview, but the what-if branch uses `probs = [0.25] * booked` (`:522`) instead of real probabilities and falls back to literals (6.8, 0.021, 11.4, 0.048, histogram `[10,25,45,15,5,0,0,0]`).
- **Accuracy tab (`capacity_service.py:765-816`) — MOCK: every number is a literal** (deciles with 142 each, confusion matrix 1084/88/64/184, Brier 0.124, ROC 0.672, `total_evaluated_appointments=1420`, gap absorption 89.4 %, regret 2.1 %, daily trend). It never queries the DB; the real live-DB AUC is 0.526.
- Forecast (`:686-762`): PARTIAL — real sums when appointments exist; otherwise invented baseline `110 + (weekday%3)*15` bookings at p 0.14/0.18 (`:714-715`); department split hard-coded 32/24/22/14/8 % (`:750-754`); fee 4500, 0.70, 0.85 hard-coded (`:719-721`).
- Nav counts (`:819-846`): REAL queries; "unscored_today" actually counts unread outreach replies (mislabelled).

---------------------------------------------------------------------
## 6. ROI SIMULATOR AND ANALYTICS

**6a. Formulas — MOCK inputs (assumption model, nothing from the DB)**
`POST /simulator/evaluate`, `backend/app/main.py:2229-2309`:
```
daily_consultations = clinics × 20                               # 20 hard-coded, :2231
at_risk = daily_consultations × baseline_no_show_rate
effective_slot_value = fee × 1.6                                # 1.6 hard-coded, :2238
leakage = at_risk × days × slot_value
reached = at_risk × coverage × reachability
rescheduled = reached × reschedule_success
overbook_filled = (at_risk − rescheduled) × fill_rate × 0.6     # 0.6 hard-coded, :2248
recovered_daily = rescheduled + overbook_filled
revenue_recovered = recovered_daily × days × slot_value
doctor_hours = recovered_daily × days × 12 / 60                 # 12 min
labour = (daily_consultations×0.85×26 × 3.5 / 60) × 12 × staff_rate   # 0.85, 26, 3.5 hard-coded, :2257-2259
net_roi = revenue_recovered / max(expenses, 1);  payback = expenses / gross × 365
expenses = Σ custom_expenses (monthly×12, per_patient×intervened×days, annual/one-off) else 1,800,000   # :2279
```
Slider defaults (schemas.py:947-960 = `frontend/lib/roi.ts:3-15`): clinics 30, fee 4500, baseline no-show 0.18, coverage 0.25, reachability 0.85, reschedule 0.65, fill 0.70, days 310, staff rate 850. Accepted but **unused** in the maths: `hospital_retained_fee_pct 0.30`, `ancillary_revenue_per_attended_lkr 3500`, `telco_cost_per_msg_lkr 2.0`. DB-sourced inputs: only the stored `hospital_expenses` rows (2 rows, 380,000 + 1,800,000 LKR annual). **Nothing uses real no-show rate, real volumes, or model output.**
Default result (computed by calling the function with defaults, no custom expenses): daily at-risk 108.0; leakage LKR 241,056,000; recovered LKR 120,555,119/yr; doctor hours 3,348.8; nurse hours 773.5/mo; labour savings 7,889,700; **net ROI 67.0×; payback 5.1 days**; net profit 126,644,819. With the 2 stored expenses (2,180,000): ROI ≈ 55.3×, payback ≈ 6.2 days, expense drag ≈ 1.70 % (arithmetic from the same outputs). These magnitudes (LKR 120 M recovered from 30 clinics) will not survive scrutiny.
**6b. Replay-on-history / sensitivity table — MISSING** (grep: no replay, no top-K vs random, no sensitivity table in backend or frontend).
Other revenue constants: `insights.py:22-24` 4500 × 1.6; `hospital.py:18,186,201` `SLOT_VALUE_LKR=4500` (revenue_recovered = confirmed interventions × 4500; revenue_at_risk = Σ risk × 4500); `main.py:1463` 4500 fallback.
**6c. "Hospital expense data"**: table `hospital_expenses` (+ `expense_categories`), CRUD at `main.py:2157-2225` (manager+), seeded defaults `main.py:2113-2150`. Real rows in DB: "Dialog SMS & WhatsApp Gateway Package" 380,000 annual; "SHAI Core Platform & HIS Integration Run-rate" 1,800,000 annual (both default seed values, hospital_name "Default Hospital"). Endpoints do not filter by hospital_id.
**6d. Frontend duplicates backend formula — YES (documented):** `frontend/lib/roi.ts:28-117` "mirrors backend `evaluate_roi_simulation` exactly" (tested in `lib/roi.test.ts`); also `insights.py:22` comment "Same revenue assumptions as lib/roi.ts". Two copies must be kept in sync by hand.
Analytics (`insights.py`): trend/revenue-at-risk are REAL DB aggregates (tenant-filtered, role analyst+).

---------------------------------------------------------------------
## 7. OUTREACH AND GEMINI

**7a. Data sent to Gemini — REAL, minimised.** `outreach_drafter.py:_prompt` (`:~118-135`) sends only: first name, department, appointment date/time string, risk tier, coarse reason categories (from positive SHAP drivers), language. Docstring `:8-10`: no phone/email/UHID/full name/conditions/exact distance. Prompt template:
```
Write ONE short appointment-reminder message for a Sri Lankan private hospital to send by WhatsApp/SMS.
Language: {English|Sinhala|Tamil}.
Patient first name: {first_name}. Department: {department}. Appointment: {when}.
Priority: {tier}. Tailor the message to this: {guidance}.
Rules: at most 45 words; polite and warm; never scolding; do NOT mention risk scores, AI, predictions, the date being far away, or medical advice; do NOT invent phone numbers, links, prices or doctor names; end by telling the patient to reply 1 to CONFIRM, 2 to RESCHEDULE[, or 3 for a video consultation]. Output only the message text.
```
The first name is an identifier (personal data) leaving the system. Model default `gemini-3.1-flash-lite` (`:19`, env `GEMINI_MODEL`).
**7b. Fallback / sending — REAL fallback; NOTHING IS SENT.** No key / ImportError / 2 failed attempts → template draft (`outreach_drafter.py:149-188`, `_call_gemini :139-163`). `/outreach/draft` is "for staff to review (not sent)" (`main.py:1894`). No SMS/WhatsApp gateway code exists anywhere (grep twilio/smtp/dialog API: none). `outreach.send` permission exists only as a label.
**7c. Agent simulator — KEYWORD-BASED, canned.** `main.py:1921-2056`: lowercase substring matching for reschedule/telehealth/cancel/prep/confirm in English + romanised Sinhala/Tamil word lists (`:1931-1935`); responses are fixed templates in 3 languages offering "this Saturday 10:00 AM" (not a real slot); sets `appt.ai_action_status="Rescheduled via AI"` and inserts an `interventions` row; telehealth guarded by `is_telehealth_eligible` list. No LLM, no real rescheduling. Label: simulation.
**7d. Key storage — server only.** `GEMINI_API_KEY` in `backend/.env` / compose env [REDACTED]; read via `os.getenv` in `outreach_drafter.py:140`. Grep of `frontend/` for GEMINI: only the display string "Drafted by Gemini" — never in the browser bundle.

---------------------------------------------------------------------
## 8. AUTH, ROLES, SECURITY

**8a. Users — REAL.** Table `users` (+`hospital_memberships.role`); passwords hashed with **scrypt** (N=2^14, r=8, p=1, 16-byte salt, constant-time compare) `security.py:164-192`; unknown email still runs a dummy hash `:197`; min length 10 `:148`. No "accept any email" fallback found (`auth.py:448-478`). Hard-coded credentials: **`backend/seed.py:30-31` contain staff and owner passwords [REDACTED]** and the docstring `seed.py:5-18` lists them next to real-looking emails; these accounts exist in the live DB (10 users, all `scrypt$`). Bootstrap admin from env only (`auth.py:931-959`). Anyone who has the repo knows these logins → change before any demo on a network.
**8b. Session cookie — REAL, with the check on the backend.** Cookie `shai_session` = backend token `<b64 payload>.<b64 HMAC-SHA256>` (payload sub,email,name,role,hospital_id,iat,exp; TTL 8 h, `security.py:149,214-248`). Cookie flags: `httpOnly`, `SameSite=lax`, `path=/`, `secure` only if `SESSION_COOKIE_SECURE=true` (default false), `maxAge` = token exp (`frontend/lib/session.ts:42-51`). **`proxy.ts` does NOT verify the signature** — it only base64-decodes and checks `exp` and the role value (`proxy.ts:19-22`, `lib/session-token.ts:28-45`; the file says so explicitly). A made-up cookie with a valid-looking payload therefore passes the page shell (you'd see the layout and the role-gated navigation), but every data call goes to FastAPI which verifies the HMAC (`auth.py:49-66`, `security.verify_token`) and re-reads the user row, so it returns 401 and the UI redirects to login. Role pages `requireRole` (`lib/session.ts:33-38`) also trust the decoded cookie — a forged `role:"admin"` would render the admin page frame with no data. Sidebar role/name/hospital come from non-httpOnly `localStorage` keys `shai_user_*` (`app-sidebar.tsx:46`), cosmetic only. Local `backend/.env` has **no `API_KEY`** → the X-API-Key middleware is disabled on this machine (`main.py:62-67`).
**8c. Roles → pages → endpoints.** Rank: front_desk 1, analyst 2, manager 2, admin 3, platform_owner 4 (`security.py:22-28`; `require_role` is rank-based `auth.py:151-161`). **Analyst and manager have equal rank, so an analyst can reach every `require_role("manager")` endpoint (capacity, expenses write, simulator, hospital profile edit).** The `ROLE_PERMISSIONS` map (`security.py:31-142`) is defined but `require_permission` is not used on the routes inspected.
| Role | Frontend nav (`app-sidebar.tsx`) | Frontend guard | Backend |
|---|---|---|---|
| front_desk | all except Capacity, ROI Simulator, Analytics (`hideForFrontDesk`) | none on Analytics page; `requireRole("manager")` on /capacity, /simulator (`capacity/page.tsx:26`, `simulator/page.tsx:7`) | /capacity/slot-offers (front_desk+); everything else authenticated-only |
| analyst | as manager (nav hides only for front_desk) | passes `requireRole("manager")` | `/analytics/*` (`insights.py:74,166`, analyst+) and all manager endpoints |
| manager | all but Staff & Access | | `/capacity/*` (except slot-offers/waitlist/nav-counts), `/doctors/sessions/{id}/delay`, `/expenses*`, `/simulator/evaluate`, hospital profile PATCH/contacts/partners/management |
| admin | + Staff & Access (`adminOnly`) | | `/admin/*`, `/hospital/audit` (admin) |
| platform_owner | admin + platform | | all |
Endpoints with **authentication only (no role check)**: `/predict`, `/predict/preview`, `/appointments/*` incl. `PATCH …/outcome`, `/patients*`, `/his/sync`, `/his/simulate/arrivals`, `/predictions/runs`, `/capacity/waitlist*`, `/outreach/*`. The permission `his.sync` (admin) is not enforced on `/his/sync`.
**8d. Lockout — REAL, DB-backed.** 5 failed attempts (`MAX_FAILED_LOGINS`) → locked 15 min (`LOCKOUT_MINUTES`), counters `users.failed_attempts`, `users.locked_until` (`auth.py:36-37,456-476`); responds HTTP 423. Per-account only; no IP rate limit.
**8e. X-API-Key.** Shared secret checked in middleware (`main.py:125-133`) when `API_KEY` env set; the browser never sees it: only the Next.js server adds the header (`frontend/lib/api.ts:102`, value from server env `BACKEND_API_KEY`, `lib/backend-config.ts:37`; no `NEXT_PUBLIC_` use). **Global exception handler LEAKS** `f"{type(exc).__name__}: {str(exc)}"` in a 500 body (`main.py:143-149`); `/predict` also returns `str(e)` (`:262`), prediction-run `error` stores `str(err)` (`prediction_runner.py:245`). Health, docs and openapi are public (`auth.py:22-31`).
**8f. Multi-hospital tenancy — PARTIAL.** `hospital_id` column exists on most tables (not on `prediction_log`, `appointment_events`, `his_*`, `expense_categories`) and is nullable. Isolation is done by hand per endpoint (`request.state.hospital_id`), and the checks are lenient (`if hospital_id and row.hospital_id and row.hospital_id != hospital_id`, so NULL-hospital rows are open to everyone). Static scan of handler bodies for `hospital_id` — **endpoints with NO hospital reference**: `/predict`, `/predict/preview`, `/patients/search`, **`/appointments/intake`** (creates appointments/patients without setting hospital_id — one such NULL row exists), `/appointments/{id}/interventions`, `/appointments/{id}/prediction`, `/doctors/{id}/availability`, `/his/status`, `/his/sync`, `/predictions/runs/{id}`, `/predictions/today`, `/doctors/sessions`(+delay, +detail), all `/capacity/*`, `/outreach/conversations|draft|simulate-agent|activity`, all `/expenses*`, `/simulator/evaluate`, `/notifications`, `/search`, `/geo/patients`. A user of hospital B can therefore see/modify hospital A's capacity, waitlist, expenses, outreach, notifications and search results. `tests/test_tenant_isolation.py` passes but covers only the filtered endpoints.
**8g. Audit log — PARTIAL.** `hospital_audit_logs` (id, hospital_id, user_id, action, entity_type, entity_id, details jsonb, ip_address, created_at): only 2 rows, both `staff_approved` (staff-approval/profile actions). Outcome recording, predictions, logins, exports, role changes are not logged there. `prediction_log` (§4b) and `appointment_events` (booked / synced_from_his) are separate trails. `outcome_recorded_by/at/source` columns exist but are never set by code (`PATCH outcome` `main.py:820-846`).

---------------------------------------------------------------------
## 9. TESTS AND RUNNING

**9a. Results (run now)**
- `cd backend && venv/bin/python -m pytest -q` → **163 passed, 4 warnings in 119.12 s** (uses `noshow_test_db`, separate from `noshow_db`).
- `cd frontend && npm test` (vitest 4.1.11) → **6 files, 36 tests passed**.
- `cd frontend && npm run lint` → **FAILS: 109 problems (21 errors, 88 warnings)**. Errors: 18× `@typescript-eslint/no-explicit-any` (the `app/api/**/route.ts` handlers, e.g. `appointments/intake/route.ts`, `predictions/runs/route.ts`, `his/sync/route.ts`, `components/ui/textarea.tsx`…), 2× "setState synchronously within an effect", 1× empty interface. The CI workflow (`.github/workflows/ci.yml`) would fail at the lint step.
**9b. Clean-clone commands vs repo (checked against README / Dockerfile / compose)**
```
# Docker path (README) — correct as written
cp .env.example .env   # set API_KEY, SECRET_KEY, POSTGRES_PASSWORD, bootstrap admin
docker compose up --build            # backend CMD runs `alembic upgrade head` then uvicorn (Dockerfile last line)
docker compose exec backend python seed_bulk.py        # needs seeded reference data first!
docker compose exec backend python create_user.py --email … --name … --role manager

# Local path
createdb noshow_db; createdb noshow_test_db
cd backend && python -m venv venv && source venv/bin/activate
pip install -r requirements-dev.txt; cp .env.example .env     # NOTE: backend/.env.example not present in listing; only root .env.example and backend/.env exist
alembic upgrade head
python seed_reference.py     # departments, doctors, clinic sessions, locations  (MISSING from README)
python seed.py               # hospitals, users, demo records
python seed_his.py ; python seed_bulk.py --patients 5000 --truncate   # (not in README except seed_bulk via Docker)
uvicorn app.main:app --reload
cd frontend && npm ci && BACKEND_API_URL=http://localhost:8000 BACKEND_API_KEY=<key> npm run dev
npm run electron:dev          # next dev + wait-on + electron
npm run dist:mac | dist:win   # next build --webpack → copy-standalone-assets → electron-builder
```
Flags: (1) README local steps run only `alembic upgrade head` + `seed.py`; `seed_reference.py`/`seed_his.py` are required for doctors/sessions but are not mentioned (`seed.py` also calls `Base.metadata.create_all`, bypassing Alembic). (2) `backend/Dockerfile` copies only `seed.py seed_bulk.py fake_data_lk.py create_user.py`, so `seed_reference.py`/`seed_his.py` aren't in the image. (3) Scoring after import is part of `seed_bulk.py` (`build_predictions`); there is no standalone "score all" script except the Prediction Hub run (`backfill_hub.py` exists, undocumented). (4) Retraining: `python train_shai.py --input models/shai_bundle/appointments_synthetic.csv --version v1-reproduced --verify` (docs/MODEL_CHANGELOG.md) — not in README. (5) CI/Docker use Python 3.12; the system python is 3.14.7 (the venv is 3.12.14).
**9c. Electron.** It does **not** start the backend. `electron/main.js:44-60` spawns only the bundled Next.js standalone server (or uses `ELECTRON_START_URL` in dev). The backend URL/key are entered once on `/setup` and stored in the OS user-data dir (`lib/backend-config.ts`, `proxy.ts:11-14`). If the backend is down, server components show `BackendUnreachable` (`components/backend-unreachable.tsx`: 401 → "Session Expired", 403 → permission denied, else "Could not reach the backend API" with retry).
**9d. Versions.** Python 3.12.14 (venv; Docker 3.12-slim) · Node v26.7.0 locally (CI uses 22) · pinned in `backend/requirements.txt`: xgboost==3.4.1, shap==0.52.0, scikit-learn==1.9.0, numpy==2.3.5, pandas==3.0.5, fastapi==0.141.1, SQLAlchemy==2.0.52, alembic==1.19.1, google-genai==2.25.0 (dev: pytest 9.1.1, matplotlib 3.11.2). Frontend: next 16.3.1, react 19.2.8, vitest 4.1.11.

---------------------------------------------------------------------
## 10. WHAT IS STILL MISSING OR MOCK

| Item | Answer | Evidence |
|---|---|---|
| Poisson-binomial overbooking | PARTIAL | Expected value/interval yes (`capacity_math.py:14-79`); recommended k comes from Monte-Carlo + 0.75 factor + 8 % budget; capacity not used |
| Outreach budget ranking by p × fee | NO | grep: none; worklist ranks by tier/risk only |
| Fairness / subgroup page | NO | none in backend or frontend; Model Hub falsely says "Fairness & Guardrails Active" (`model/page.tsx:93`) |
| Monitoring (observed vs predicted by week) | NO | Accuracy tab is hard-coded (`capacity_service.py:765-816`) |
| Model card with 4-model comparison + oracle AUC | PARTIAL | Data exist in `metrics.json` (5-row table, `oracle_auc` 0.768) and `model_comparison_*.csv` + README; **not shown in the UI** |
| Limitation "trained on synthetic data" | PARTIAL | README 'Limits' paragraph, docs; UI only small badge; Model Hub claims Colombo General Hospital data |
| Export-for-retraining CSV | NO | no endpoint/button; `docs/MODEL_FEEDBACK_LOOP_PLAN.md` is a plan only |
| "SYNTHETIC DATA" badge | PARTIAL | sidebar footer + login only (`app-sidebar.tsx:317`, `login/page.tsx:386`) |
| Role-based nav enforcement | PARTIAL | nav hides items client-side; only /capacity and /simulator have page guards; backend enforces few routes; analyst==manager |
| Real password hashing | YES | scrypt (`security.py`) |
| Signed sessions | YES (backend) / frontend does not verify | HMAC-SHA256 token; `proxy.ts` decodes only |

Hard-coded business numbers:
| Value | Location | Should be |
|---|---|---|
| 4500 LKR fee (several copies) | `capacity_service.py:174,720`, `hospital.py:18`, `insights.py:22`, `main.py:1463`, `models.py:207,221,580`, `capacity-settings-view.tsx:36`, `what-if-view.tsx:59`, `roi.ts:5` | per-doctor/department fee from DB only |
| 1.6 ancillary multiplier | `main.py:2238`, `roi.ts:36`, `insights.py:23` | measured ancillary revenue or user input (an unused `ancillary_revenue_per_attended_lkr` field exists) |
| 20 patients/clinic, 0.6, 0.85, 26, 3.5, 12 | `main.py:2231,2248,2257-2258,2263` | inputs / hospital data |
| 1,800,000 LKR default OpEx | `main.py:2279`, `roi.ts:63` | hospital expense rows |
| 0.16 baseline prob | `capacity_service.py:204,420,710`, `shai_model.py:36` | training base rate 0.159 or error flag |
| 0.40 / 0.70 slot thresholds | `capacity_service.py:201,457,466` | derived from thresholds.json |
| 0.25 what-if prob | `capacity_service.py:522` | real per-patient probs |
| Accuracy tab numbers | `capacity_service.py:765-816` | computed from outcomes |
| Forecast baseline 110+…, dept shares | `capacity_service.py:714-754` | real or empty state |
| 25 default capacity, 12 min consult | `capacity_service.py:179-180` | DB values |
| age 35, distance 8.5, Room 204 | `capacity_service.py:441,424,82` | DB values |
| Model Hub literals, sidebar AUC | see 1e | read `/model/info` |
| 0.08 risk budget, 0.85 overbook attend, 3.5 std | `queue_simulator.py:157,66`, `capacity_service.py:223` | settings / measured |
| Demo waitlist/conversations/offer seeds | `main.py:1795,1850`, `capacity_service.py:573` | no seeding in API |
| 0.65 reschedule success etc. slider defaults | `schemas.py:947-960` | pilot data |

---------------------------------------------------------------------
## 11. NUMBERS FOR THE THESIS (computed 2026-10-02)

- Appointments: **5,005** (patients 5,004), all synthetic/`manual`; with outcomes 4,919 (completed 4,266, no-show 653); scheduled 86.
- Observed no-show rate (outcomes): **13.28 %** (653/4,919). Model training base rate 15.90 %.
- Tier distribution — scheduled (n=86): High 31.4 % / Medium 55.8 % / Low 12.8 %; mean predicted 0.2585. All stored predictions: 17.3 / 49.4 / 33.4 %.
- Model hold-out (synthetic, time split, `metrics.json`): **ROC-AUC 0.6725, PR-AUC 0.2659, Brier 0.1237, Recall@top20 36.3 %** (precision 28.0 %, lift 1.815×); oracle AUC 0.768; test n=9,385.
- Same model on this DB's stored labels: AUC 0.526, Brier 0.126, recall@top20 24.8 %, lift 1.24; observed per tier 16.7 / 12.7 / 12.4 %.
- Capacity page, target date 2026-10-02 (computed by `get_capacity_overview(persist_run=False)`): capacity **1,620** (68 doctors × first-session max_patients), booked **11**, predicted no-shows **2** (expected 2.2, 80 % interval 0.6–3.9), recommended overbooks **0**, revenue recovery **LKR 0**, utilisation 0.7 %, expected attendance 0.5 %. For 10-03: capacity 1,620, booked 9, no-shows 2 (2.1), overbooks 1, revenue LKR 3,960. For 10-05: booked 8, no-shows 2 (1.8), overbooks 0.
- ROI defaults (backend with no custom expenses): at-risk 108 slots/day; recovered LKR 120,555,119/yr; leakage LKR 241,056,000; ROI 67.0×; payback 5.1 days; net profit LKR 126,644,819 (with the stored 2.18 M expenses ≈ 55.3× and 6.2 days).

---------------------------------------------------------------------
## 12. TOP RISKS (ranked)

1. **Examiner asks how the model performs on the system's own data** → AUC 0.526 (≈random), mean predicted 20 % vs observed 13 %, High tier 16.7 % vs Low 12.4 %. Fix: regenerate DB outcomes from the same generator as the training CSV (or draw them from the stored risk) and state it, or present only the hold-out metrics and call the DB a UI demo.
2. **Model Hub states false facts** (110,527 Colombo General records, wrong thresholds, invented SHAP bars, contextual multipliers, "fairness active"). Fix: render from `/model/info` + `metrics.json`; delete the unsupported cards.
3. **Accuracy tab and forecast are fabricated numbers** (confusion matrix, AUC, 1,420 evaluated). Fix: compute from outcomes or hide until real data exist.
4. **ROI shows 67× / LKR 120 M with no data basis, unused inputs, and a duplicated frontend formula.** Fix: label as assumption model, remove dead fields, add a replay-on-history mode using stored risk and outcomes, keep a single formula source.
5. **Thesis vs code mismatch on overbooking**: recommendation is Monte-Carlo with safety factor 0.75, ignores free seats; capacity counts every doctor's first session every day (1,620 vs 11 booked). Fix: weekday-matched session capacity; use Poisson-binomial tail P(no-shows ≥ k) with capacity headroom, or describe the method as simulation.
6. **Tenant isolation holes** (capacity, expenses, waitlist, outreach, search, notifications, predict; intake creates NULL-hospital rows; NULL rows open to all). Fix: central `hospital_id` filter dependency and `NOT NULL`.
7. **Weak role enforcement** (analyst == manager rank; most write endpoints auth-only; proxy trusts unsigned cookie for page shells). Fix: permission-based dependencies per route; verify HMAC in middleware or document the design.
8. **Hard-coded seed credentials in repo and in the live DB; exception handler leaks exception text; API key disabled locally.** Fix: rotate/remove seed passwords, return generic 500s, set API_KEY.
9. **Waitlist assign / agent simulator are fake** (status flip only; canned "Saturday 10:00"; nothing is ever sent). Fix: label "simulation" in UI and viva script, or implement slot creation.
10. **Operational rough edges**: lint fails (21 errors), 3 prediction runs stuck "running", batch audit log nearly empty, `no_show` never written by HIS sync/outcome metadata, README misses seed_reference/seed_his, dead `contextual.py`/pickles remain. Fix: clean lint, add stuck-run reaper, set outcome_* fields, update README, delete dead files.

---------------------------------------------------------------------
Report path: `docs/AUDIT_FOR_CLAUDE.md` · Branch `feature/frontend-dashboard` · Last 5 commits: 2241112 M9: Detail page, outcome reconciliation, model hub, profile, and outcome logic · a8c97c1 M8: Prediction Hub screen and New Appointment intake redesign · 5ee0d7f M7: Design system primitives (progress-stages, combobox, date-picker, phone-input, segmented-cards) · 53888dd M6: Batch prediction runner, Hub today endpoint, Next.js polling route handler, and tests · edde169 M5: Simulated HIS connector, seed script, idempotent sync engine, and tests.
