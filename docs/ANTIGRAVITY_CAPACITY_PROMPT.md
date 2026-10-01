# Capacity & Smart Overbooking v2: Antigravity prompt

Everything below the line is the prompt to paste into Antigravity.

---

## ROLE AND GROUND RULES

You are working in an existing full-stack repo: **SHAI**, a hospital appointment no-show prediction system.
- Backend: FastAPI + SQLAlchemy + Alembic in `backend/app/` (`main.py`, `models.py`, `schemas.py`, `shai_model.py`, `auth.py`).
- Frontend: Next.js (App Router, React 19) + Tailwind + Recharts in `frontend/`. Existing chart components are in `frontend/components/charts/`.
- Currency is LKR. Time zone is **Asia/Colombo** (never use UTC `toISOString()` for "today").
- Read the repo first. Match the existing code style, comment density, naming and dark/light theme tokens. Do not add a new UI library if an existing component does the job.

### STOP GATE (mandatory)

**Do NOT write any implementation code until I approve a UI design.**
1. Read the code (list the files you inspected).
2. Produce a **UI design Artifact** (an HTML mockup using realistic Sri Lankan sample data) for every new or changed screen listed in section 5, in both dark and light mode, at desktop and phone width.
3. Add a short written plan: DB tables, endpoints, build order.
4. Stop and ask me to approve or change the design. Only after I say "approved" start building.

## 1. CURRENT BEHAVIOUR (what exists today)

The page `frontend/app/capacity/page.tsx` calls `POST /capacity/optimize` (`backend/app/main.py`, `optimize_capacity`). Per doctor session it:
1. Looks up appointments by `doctor_name == session.doctor_name OR department == session.specialty`.
2. Counts predicted no-shows from `Prediction.risk_category`: High = 1, Medium = 0.5, Low = 0.
3. `rec_overbook = max(1, min(int(predicted * 0.75), 3))`.
4. `est_extra_wait = rec_overbook * avg_consultation_mins * 0.35`. If it exceeds the tolerance, overbook is reduced by 1.
5. Risk badge: Safe if wait <= 8, Moderate if <= 15, otherwise Caution.
6. `revenue = rec_overbook * 4500` (hard-coded LKR fee).

The page also shows a Consultant Session Status list (on time / +Nm late) from `DoctorSession.delay_minutes`, and a waitlist panel (`/capacity/waitlist`, `/capacity/waitlist/{id}/assign`).

## 2. KNOWN GAPS TO FIX (all in scope)

| # | Gap | Fix required |
|---|-----|--------------|
| G1 | Appointments matched by doctor name **OR** department, so doctors in the same department share one pool and show identical numbers | Match by doctor id (FK) only. Appointments need a proper `doctor_id` / `session_id` link; add an Alembic migration plus a backfill |
| G2 | `booked_count = max(len(appts), 14)` fakes a baseline; sessions with no appointments get an invented 5 no-shows | Remove all fabricated baselines. A session with no data shows an honest empty state, not made-up numbers |
| G3 | Risk buckets (High=1, Medium=0.5) throw away the model's probability | Use the per-appointment calibrated **probability**. Expected no-shows = sum of probabilities. Also compute a variance / 80% interval (Poisson-binomial: variance = sum p(1-p)) and show it as a range |
| G4 | `DoctorSession.delay_minutes` is displayed but **ignored** by the optimizer, although the page text claims it "scales delay tolerance" | Late doctors must reduce the allowed overbook. Effective tolerance = max(0, base tolerance - delay_minutes) (document the formula) |
| G5 | "93% UTIL" ring is `booked / (booked + overbook)`, which is not utilisation | Utilisation = booked / capacity. Add a second figure, expected attendance = (booked - expected no-shows) / capacity |
| G6 | Magic numbers (0.75 safety factor, 0.35 wait factor, 3 max overbook, 8 / 15 minute badges, LKR 4500 fee) are hard-coded | Move to a settings table (per hospital, per department override) with an admin UI. Fee comes from the doctor / department, not a constant |
| G7 | The wait estimate is a linear guess | Replace with a small queue simulation (see section 4.F). Keep the old formula only as a labelled fallback |
| G8 | Overbook is per whole session only | See feature A (per time slot) |
| G9 | UI label shows "Room Room 250" | Fix the duplicated word |
| G10 | Sidebar badges "2 wait" and "4" are hard-coded | Drive from real counts (open waitlist entries; unread outreach replies) |
| G11 | Waitlist assignment is fully manual, and the waitlist has no ranking | See feature C |
| G12 | No record of what was recommended, so no accuracy check | Persist every recommendation (feature E) |
| G13 | `optimize_capacity` runs everything in Python loops over all appointments | Do it with SQL aggregation / one query per request, and cache for a short time. Add indexes you need |
| G14 | Revenue "recovery" is shown as certain | Label it "expected", and base it on expected filled gaps (see 4.F) |

## 3. NEW FEATURES (build all five)

### A. Overbook by time slot
- Recommend overbooking **per slot** (for example 16:00, 16:15, 16:30 ...), not only per session.
- Slot risk = sum of no-show probabilities of the patients booked in that slot (plus a small adjustment for slot position, for example first and last slots of a session).
- Output per slot: booked, expected no-shows, recommended extra, and a heat colour.
- UI: a **heatmap grid** (doctors as rows, time slots as columns) with a click-through drawer for the slot detail.

### B. What-if input
- A panel where the manager chooses: date, department, doctor(s), max wait tolerance (slider), safety factor (slider), max overbook per slot, consultation fee, and optionally "assume doctor is N minutes late".
- Results update live (debounced) via a **non-persisting** endpoint, `POST /capacity/what-if`. It must never write recommendations.
- Show a side-by-side compare: "Current settings" vs "What-if" (extra patients, expected wait, expected revenue, risk of overcrowding).
- Allow "Save scenario" (name it, store it, reload it, compare up to 3).

### C. Auto-fill from waitlist
- When a slot becomes free (cancellation, reschedule, confirmed no-show, or a predicted very-high-risk patient who has not confirmed after reminders), the system **proposes** the best waitlisted patient.
- Rank candidates by: matching department / doctor, patient's own no-show probability (lower = better), waiting time, urgency flag, travel distance, preferred time.
- Default mode: **suggest, staff one-click approve**. Add a manager setting for full auto-assign, off by default.
- Every action is written to an audit log (who / what / when / why). Include undo within a time window.
- Notify the chosen patient through the existing outreach flow (draft only; do not send real messages in dev).
- UI: a "Slot opened" queue with the ranked candidates and a score breakdown.

### D. Forecast view
- Next 7 / 14 / 30 days: expected no-shows, expected overbook, expected revenue at risk, per department and per doctor.
- Use stored predictions for booked appointments, and a baseline (historical no-show rate by department x weekday) for days not yet booked. Show the interval, not only the point value.
- UI: line chart with a confidence band, a stacked bar by department, and a calendar heat strip.

### E. Actual vs predicted
- When an appointment is marked attended / no-show, compare it with the stored prediction and recommendation.
- Metrics: predicted vs actual no-shows per day, per doctor, per department; calibration curve; Brier score; precision / recall at the High-risk threshold; overbook outcomes (extra patients added, how many were absorbed by no-shows, how many caused a wait over tolerance, "overbook regret" = patients who waited too long).
- UI: calibration plot, predicted-vs-actual line chart, a confusion-matrix tile, and a weekly accuracy trend.
- Feed these into the existing feedback-loop plan (`docs/MODEL_FEEDBACK_LOOP_PLAN.md`). Read that file, and do not duplicate work it already specifies.

## 4. DATA MODEL, LOGIC, BACKEND

Inspect `backend/app/models.py` first (existing: `Department`, `Doctor`, `DoctorClinicSession`, `DoctorSession`, `Appointment`, `Prediction`, `WaitlistEntry`, `Intervention`, `AppointmentEvent`, `PredictionLog`, `PredictionRun`). Reuse tables where they fit. Propose only what is missing. Likely additions (names are suggestions):

- `capacity_settings` (scope = global / department / doctor; safety_factor, max_overbook, wait_tolerance_mins, consultation_fee_lkr, badge thresholds)
- `capacity_recommendations` (run id, session / slot, date, booked, expected_no_shows, interval low / high, recommended_overbook, expected_wait, expected_revenue, settings snapshot, model version, created_at)
- `capacity_scenarios` (name, params JSON, results JSON, created_by)
- `slot_offers` (freed slot, candidate waitlist entry, score, score breakdown JSON, status = proposed / approved / declined / expired, acted_by, acted_at)
- `daily_accuracy` (date, scope, predicted, actual, brier, etc.), or compute on read with SQL if cheap enough
- Add `doctor_id`, `session_id` and `slot_start` to `Appointment` if not already usable. Use an Alembic migration with a safe backfill, and make it reversible.

### Logic specs
- **4.A Expected no-shows** = sum of calibrated probabilities. Interval from Poisson-binomial (normal approximation is fine for n >= 10, exact DP otherwise).
- **4.B Recommended overbook** = the largest k such that P(overcrowding) <= risk budget, where overcrowding means more than (capacity - booked + k) patients actually arrive, and simulated wait <= effective tolerance. Do not force a minimum of 1.
- **4.C Lateness**: effective tolerance = base tolerance minus current delay (floor 0).
- **4.D Simulation endpoint**: Monte Carlo, for example 2,000 runs: sample each patient's attendance ~ Bernoulli(p), run a simple single-server queue with per-doctor consultation time (mean and std from history), and return the distribution of added wait, patients over tolerance, and filled gaps. Seed it so tests are deterministic. Keep it under ~300 ms per request (vectorise with numpy).
- **4.E Revenue**: expected revenue = expected filled gaps x fee, not recommended x fee.
- **Auth**: manager role for settings, what-if save, auto-assign setting. Staff can approve slot offers. Keep existing `auth.require_role` patterns.
- **Endpoints** (suggested): `GET /capacity/overview`, `GET /capacity/slots`, `POST /capacity/what-if`, `CRUD /capacity/scenarios`, `GET/PUT /capacity/settings`, `GET /capacity/forecast`, `GET /capacity/accuracy`, `GET /capacity/slot-offers`, `POST /capacity/slot-offers/{id}/approve|decline`. Add Pydantic schemas, pagination where lists can grow, and OpenAPI descriptions.
- **Tests**: pytest for every formula (known inputs -> known outputs), the simulator (seeded), the ranking, the migration, and role checks. Vitest for any new frontend utility. Do not weaken existing tests.
- **Seed data**: extend `seed.py` / `seed_bulk.py` so a fresh DB shows realistic slots, past outcomes (for the accuracy charts), waitlist entries and a few scenarios. Never use fabricated values in production code paths; demo data lives only in seed scripts.

## 5. FRONTEND: SCREENS AND CHARTS

Use Recharts (already installed) and the existing `components/charts/`. All charts must work in dark and light mode, be keyboard / screen-reader labelled, have tooltips, empty states, loading skeletons and error cards (`error-card.tsx`, `empty-state.tsx`). Layout must hold at phone width.

Screens (route suggestions under `frontend/app/capacity/`):
1. **Overview** (existing page, upgraded): KPI cards (capacity, booked, expected no-shows with interval, recommended extra, expected revenue, utilisation, expected attendance), session status list, session cards with corrected utilisation ring and the interval.
   - Charts: **donut** (booked vs free vs expected no-show capacity), **bar** (expected no-shows by department), **stacked bar** (booked / expected attend / expected no-show per doctor).
2. **Slot heatmap** (feature A): doctor x time grid, drawer with the slot's patients and their risk.
   - Charts: heatmap, **bar** of recommended extra per slot, a small **sparkline** per doctor.
3. **What-if studio** (feature B): left controls, right results.
   - Charts: **histogram** of simulated added wait with the tolerance line, **line** of overbook level vs P(overcrowding) vs expected revenue (the trade-off curve), scenario compare **bars**.
4. **Slot offers / auto-fill** (feature C): queue of freed slots, ranked candidates with score-breakdown **stacked bar**, approve / decline, audit trail.
   - Chart: **funnel** (freed -> offered -> accepted -> filled) and **pie / donut** of reasons slots were freed.
5. **Forecast** (feature D): **line with confidence band**, **stacked bar** by department, **calendar heat strip**, a toggle for 7 / 14 / 30 days.
6. **Accuracy** (feature E): **calibration curve** (predicted vs observed with the diagonal), **line** of predicted vs actual no-shows, **bar** of Brier score by department, **confusion-matrix tile**, **pie** of overbook outcomes (absorbed / waited too long / unused).
7. **Settings** (manager only): the capacity settings with preview of the effect.

Also: fix "Room Room", real sidebar badges, Sri Lanka time zone for all dates, LKR formatting through `formatLkr`.

## 6. COLAB / MODEL NOTES (out of the runtime path)

Do **not** call Colab from the app. If useful, add a notebook or script under `backend/` (for example `backend/notebooks/overbooking_simulation.ipynb`) that:
- backtests the overbooking rule on historical data across safety factors and tolerances,
- estimates per-doctor consultation-time mean / std and slot-position effects,
- writes the learned defaults to the `capacity_settings` seed values.

## 7. ORDER OF WORK AFTER I APPROVE THE DESIGN

1. Migration + models + settings table + backfill (fixes G1, G2, G6).
2. Optimizer rewrite with probabilities, lateness, utilisation, simulation (G3 to G5, G7, G13, G14) + tests.
3. Persist recommendations (G12) and the accuracy job (E).
4. Slot-level endpoints (A), what-if (B), forecast (D), slot offers (C).
5. Frontend screens in the order 1 -> 7 above.
6. Seed data, docs (`docs/MODEL_CHANGELOG.md` entry, a short `docs/CAPACITY_V2.md`), and a final checklist mapping every gap G1-G14 and features A-E to where it was done.

## 8. DEFINITION OF DONE

- Backend and frontend tests pass; lint and type-check are clean.
- No fabricated numbers in runtime code; empty data shows empty states.
- Every gap G1-G14 and every feature A-E is demonstrably done (list file paths).
- Screenshots of each screen in dark and light, desktop and phone.
- Nothing is sent to real patients; auto-assign is off by default.
