# SHAI — System Overview (Developer Guide)

SHAI ("Smart Hospital AI Operations Platform", repo name `ai-no-show-system`) is a clinic-operations
platform for a Sri Lankan private-hospital outpatient setting. It started as a no-show
predictor and grew into five modules: risk triage, capacity/overbooking, waitlist backfill,
a trilingual outreach agent, and an executive ROI simulator.

This document is written for a developer who will extend the system. It describes what is
actually in the code today, including the parts that are demo-grade or simulated (see
[§12 Known limitations](#12-known-limitations--things-to-fix-before-scaling)).

> Snapshot: branch `feature/frontend-dashboard`, written 2026-09-30. `PLAN.md` is older (2026-08-20) and
> only covers Phases 1–3; several things below (SHAI modules, login, Electron) postdate it.

---

## 1. Architecture at a glance

```
┌──────────────────────────────┐        ┌───────────────────────────────┐        ┌──────────────┐
│  Frontend (Next.js 16)       │  HTTP  │  Backend (FastAPI)            │  SQL   │  PostgreSQL  │
│  - Server Components/Actions │ ─────▶ │  - REST endpoints             │ ─────▶ │  6 tables    │
│  - proxy.ts (auth gate)      │ X-API- │  - XGBoost + SHAP (in-proc)   │        │  (Alembic)   │
│  - Optional Electron wrapper │  Key   │  - Contextual risk layer      │        └──────────────┘
└──────────────────────────────┘        │  - Rule-based agent/optimizer │
        Browser never talks to          └───────────────────────────────┘
        the backend directly                     ▲
                                                 │ loads at startup
                                        backend/models/*.pkl  (trained by train.py)
```

Key design decisions:

1. **The browser never calls the backend.** All backend calls happen server-side in Next.js Server
   Components and Server Actions (`frontend/lib/api.ts`). Consequences: `BACKEND_API_URL` /
   `BACKEND_API_KEY` never reach the client bundle, and CORS is effectively irrelevant.
2. **The ML model runs inside the API process.** The pickled XGBoost model and SHAP explainer are
   loaded at import time of `backend/app/main.py`. The API refuses to start if they're missing.
3. **Two-stage risk score.** Final risk = XGBoost probability × rule-based contextual multipliers
   (distance, booking channel, payment mode). The raw ML score and every multiplier are stored and
   shown, so nothing heuristic is presented as "learned".
4. **The frontend derives model features itself** (`lib/features.ts`) from patient + appointment
   records, so the intake form asks only real-world fields.
5. **Business-logic mirrors.** The ROI formula exists in both Python and TypeScript; feature
   engineering exists in both `preprocess.py` and `lib/features.ts`. Each pair must be kept in sync
   by hand (see §11).

---

## 2. Repository layout

```
ai-no-show-system/
├── PLAN.md                     # Roadmap (stale after Phase 3)
├── LICENSE                     # MIT
├── .claude/skills/implement-plan/SKILL.md   # Claude Code skill for roadmap work
├── .github/workflows/desktop-release.yml    # Builds Electron installers on v* tags
├── docs/SYSTEM_OVERVIEW.md     # This file
├── backend/
│   ├── app/
│   │   ├── main.py             # FastAPI app: ALL endpoints, middleware, model loading (864 lines)
│   │   ├── models.py           # SQLAlchemy ORM (6 tables)
│   │   ├── schemas.py          # Pydantic request/response schemas
│   │   ├── database.py         # Engine, SessionLocal, Base, get_db dependency
│   │   └── contextual.py       # Rule-based contextual risk multipliers
│   ├── alembic/ + alembic.ini  # Migrations (2 revisions)
│   ├── data/                   # KaggleV2-May-2016.csv, X.csv, y.csv, sri_lanka_noshow.csv
│   ├── models/                 # xgboost_model.pkl, shap_explainer.pkl (tracked in git)
│   ├── preprocess.py           # Raw CSV → X.csv / y.csv (feature engineering)
│   ├── train.py                # Trains XGBoost, saves model + SHAP explainer
│   ├── generate_dataset.py     # Synthetic Sri Lankan Kaggle-shaped CSV
│   ├── fake_data_lk.py         # Shared synthetic-data generator (names, cities, doctors, labels)
│   ├── seed.py                 # Small demo seed (3 patients etc.)
│   ├── seed_bulk.py            # Large seed with real model predictions
│   ├── tests/                  # pytest suite (real Postgres)
│   ├── requirements.txt / requirements-dev.txt
│   └── .env.example
└── frontend/
    ├── app/                    # Next.js App Router pages (see §7)
    ├── components/             # App shell, tables, charts, risk widgets
    ├── components/ui/          # shadcn/ui primitives (base-nova style, on @base-ui/react)
    ├── lib/                    # api client, types, features, roi, backend-config, utils
    ├── electron/               # Desktop wrapper (main.js, preload.js, copy-standalone-assets.js)
    ├── proxy.ts                # Next 16 "proxy" (formerly middleware): setup + auth redirects
    ├── next.config.ts          # output: "standalone"
    ├── vitest.config.ts / vitest.setup.ts
    └── AGENTS.md / CLAUDE.md   # Warning: this Next.js version has breaking changes; read node_modules/next/dist/docs
```

---

## 3. Tech stack and dependencies

### Backend (Python)

| Package | Version | Role |
|---|---|---|
| FastAPI | 0.141.1 | Web framework (routing, DI, OpenAPI docs at `/docs`) |
| Starlette | 1.6.0 | ASGI toolkit under FastAPI |
| Uvicorn | 0.52.4 | ASGI server |
| Pydantic | 2.13.4 | Validation / serialization (`from_attributes` ORM mode) |
| SQLAlchemy | 2.0.52 | ORM (2.0 style `Mapped[]` / `mapped_column`) |
| psycopg (v3) + binary | 3.3.4 | Postgres driver (`postgresql+psycopg://`) |
| Alembic | 1.19.1 | Schema migrations |
| XGBoost | 3.4.1 | Gradient-boosted classifier |
| SHAP | 0.52.0 | `TreeExplainer` for per-prediction feature attribution (pulls numba/llvmlite) |
| scikit-learn | 1.9.0 | train/test split, metrics |
| pandas / numpy / scipy | 3.0.5 / 2.3.5 / 1.18.0 | Data handling |
| python-dotenv | 1.2.3 | Loads `.env` in `database.py` |
| pytest + httpx | 9.1.1 / 0.28.1 | Tests (`requirements-dev.txt`); httpx backs FastAPI's `TestClient` |

### Frontend (TypeScript)

| Package | Version | Role |
|---|---|---|
| Next.js | 16.3.1 | App Router, Server Components/Actions, `proxy.ts`, standalone output |
| React | 19.2.8 | UI |
| Tailwind CSS | 4 (+ `@tailwindcss/postcss`) | Styling; tokens in `app/globals.css` |
| shadcn (CLI) + `@base-ui/react` | 4.18 / 1.7 | Component primitives (`components.json`: style `base-nova`, icons `lucide`) |
| class-variance-authority, clsx, tailwind-merge | — | Variant + class utilities (`lib/utils.ts: cn`) |
| lucide-react | 1.32 | Icons |
| tw-animate-css | 1.4 | Animations |
| Electron / electron-builder | 33 / 25 | Optional desktop packaging (mac dmg, win nsis) |
| Vitest 4, Testing Library, jsdom | — | Unit/component tests |
| ESLint 9 + eslint-config-next | — | Lint |
| concurrently, wait-on, cross-env | — | Electron dev orchestration |

Notable: **no charting library.** Charts (SHAP tornado, risk gauge, distribution, department
breakdown) are hand-built with divs/SVG.

Infra: PostgreSQL (required — models use Postgres-only `UUID` and `JSONB`; SQLite will not work).
CI: only `desktop-release.yml` exists (no lint/test CI, no Docker).

---

## 4. The ML pipeline

### 4.1 Data
- **Source:** Kaggle "Medical Appointment No Shows" (`data/KaggleV2-May-2016.csv`, ~110k rows, Brazil).
- **Synthetic alternative:** `generate_dataset.py` builds `data/sri_lanka_noshow.csv` (default 50,000 rows)
  in the same column shape. Labels are drawn from a logistic model over lead time, SMS, age, weekend,
  handicap, scholarship, and prepaid channel plus noise (see `fake_data_lk.generate_core_dataframe`),
  so a model trained on it has learnable structure — but it only learns the relationships *we wrote in*.
  It is not real local data.

### 4.2 `preprocess.py`  (`python preprocess.py [--input path]`)
- Drops `AppointmentID`; maps `No-show` Yes/No → 1/0; clips `Age` to 0–100.
- Normalizes `ScheduledDay`/`AppointmentDay` to dates.
- Engineers: `DaysAhead` (≥0), `DayOfWeek` (0=Mon), `IsWeekend` (≥5), `Month`.
- Writes `data/X.csv` (11 features) and `data/y.csv`.

**The 11 model features, in order** (order matters — `FEATURE_COLUMNS` in `main.py` and `seed_bulk.py`):
`Age, Scholarship, Hipertension, Diabetes, Alcoholism, Handcap, SMS_received, DaysAhead, DayOfWeek, IsWeekend, Month`
(Spellings `Hipertension`/`Handcap` are inherited from the Kaggle data — keep them.)

### 4.3 `train.py`
- 80/20 stratified split, `random_state=42`.
- `XGBClassifier(n_estimators=200, max_depth=6, learning_rate=0.05, eval_metric='auc')`.
- Prints accuracy, AUC, classification report.
- Pickles the model to `models/xgboost_model.pkl` and a `shap.TreeExplainer` to `models/shap_explainer.pkl`.
- Paths are relative, so run everything from `backend/`.

Which dataset the currently committed `.pkl` files were trained on can't be determined from the repo
(both pickles show as modified in git). Retrain explicitly if it matters.

### 4.4 Inference (`POST /predict`)
1. Look up the appointment (404 if absent).
2. Build a one-row DataFrame in `FEATURE_COLUMNS` order → `model.predict_proba` → **ML score**.
3. `explainer.shap_values(df)` → sort by |SHAP| → keep **top 6** contributions.
4. `contextual.apply_contextual_adjustment(...)` → final score (see 4.5).
5. Category + recommendation from the final score.
6. Upsert into `predictions` (one row per appointment — re-predicting overwrites).

| Final score | Category | Recommendation text |
|---|---|---|
| ≥ 0.65 | High | Multiple reminders + offer rescheduling + consider phone call |
| ≥ 0.40 | Medium | SMS + Email reminder 48h before |
| < 0.40 | Low | Standard SMS reminder |

The thresholds are duplicated in `main.py` and `seed_bulk.py` (and only implicitly on the frontend).

### 4.5 Contextual Risk Adjustment Layer (`app/contextual.py`)
The model never saw distance/channel/payment, and there are no real local labels, so instead of
faking retraining these are **transparent heuristic multipliers** applied after the model:

- **Distance:** `1 + min(km / 5 × 0.015, 0.20)` (≈ +1.5% per 5 km, capped +20%).
- **Booking channel** (substring match, case-insensitive): doc990 / echannelling / myhealth → 0.95; counter → 1.08.
- **Payment mode** (substring match): nsr 0.88, insurance 1.03, corporate 1.03, cash 1.06, credit card 0.96.
  Matching is first-hit in dict order, so "Credit Card (NSR Protected)" matches `nsr` (0.88) before `credit card`.
- Unknown/None → 1.0. Final = `clamp(ml × d × c × p, 0.01, 0.99)`.
- Returned/stored payload includes ml score, each multiplier, combined, final, `method: "rule_based_heuristic"`, and a disclaimer note.

The UI shows this in `components/contextual-adjustment-panel.tsx`.

---

## 5. Backend in detail

### 5.1 Startup and cross-cutting behavior (`app/main.py`)
- Loads model + explainer, or raises `FileNotFoundError` (run `train.py` first).
- **CORS:** only `http://localhost:3000` (mostly moot since calls are server-side).
- **API key middleware:** if `API_KEY` env is set, every path except
  `/`, `/health`, `/docs`, `/redoc`, `/openapi.json`, `/auth/login` requires header `X-API-Key`.
  If unset → logs a warning and runs open.
- **Request logging:** `METHOD path -> status (ms)` on every request.
- **Global exception handler:** unhandled errors → 500 `{"detail": "<Type>: <msg>"}` (leaks internals; see §12).
- **DB session:** `get_db` dependency (`autocommit=False, autoflush=False`). Default URL
  `postgresql+psycopg://localhost/noshow_db`, override with `DATABASE_URL`.

### 5.2 Data model (`app/models.py`)

| Table | Purpose | Key columns |
|---|---|---|
| `patients` | Demographics + clinical flags | `uhid, full_name, date_of_birth, gender, phone, email, city, distance_km, scholarship, hypertension, diabetes, alcoholism, handicap(0–4)` |
| `appointments` | One visit | `patient_id (FK), scheduled_day, appointment_day, department, doctor_name, booking_channel, payment_mode, scheduled_time, queue_number, ai_action_status, sms_received, status, no_show (nullable)` |
| `predictions` | Stored model output | `appointment_id (FK, UNIQUE), risk_score Numeric(5,4), risk_category, explanation JSONB, recommendation` |
| `doctor_sessions` | A consultant's clinic session | `doctor_name, specialty, room_number, session_date, scheduled_start_time, status (on_time/delayed/in_progress/completed), delay_minutes, avg_consultation_mins, max_capacity` |
| `interventions` | Outreach message log | `appointment_id (FK), channel (WhatsApp/SMS/IVR_Voice), language (en/si/ta), status, patient_reply, intent_detected, offered_slot` |
| `waitlist` | Patients wanting earlier slots | `patient_name, patient_phone, specialty, doctor_name, urgency_level (High/Normal/Routine), preferred_days, status (waiting/offered/accepted/expired)` |

All PKs are UUIDs. `appointments.no_show` is `NULL` until an outcome is recorded — this three-state
(NULL / true / false) is used throughout the UI. Appointment `status` values seen in code:
`scheduled, completed, no_show, cancelled` (set by outcome/agent).

`predictions.explanation` is JSONB: `{"contributions": [...top6...], "contextual_adjustment": {...}}`.
`GET .../prediction` also tolerates a legacy plain-list shape.

Migrations (`backend/alembic/versions/`): `618fc68de27a` (patients, appointments, predictions) →
`02dff8fdd7b3` (doctor_sessions, waitlist, interventions + extra columns). Tests and `seed_bulk.py`
use `Base.metadata.create_all` instead of Alembic.

### 5.3 API reference

Auth column: **key** = requires `X-API-Key` when `API_KEY` is set.

| Method & path | Auth | What it does |
|---|---|---|
| `GET /` | public | Liveness + docs pointer |
| `GET /health` | public | `{status:"ok", database:"ok"|"unavailable"}` (runs `SELECT 1`). Desktop `/setup` uses this to validate a server |
| `POST /auth/login` | public | Staff login → sets `shai_session` cookie, returns `{role, name, mustChangePassword, access_token}` (see §8) |
| `POST /predict` | key | Body = `appointment_id` + 11 features. Returns `{risk_score, risk_category, explanation[], contextual_adjustment, recommendation}` and persists |
| `POST /patients` · `GET /patients` · `GET /patients/{id}` | key | Create / list (`skip`,`limit`≤ no cap enforced, default 100) / get |
| `POST /appointments` · `GET /appointments` (`patient_id`,`skip`,`limit`) · `GET /appointments/{id}` | key | Create (404 if patient missing) / list / get |
| `PATCH /appointments/{id}/outcome` | key | `{no_show: bool}` → sets `no_show` and `status` (`no_show`/`completed`) |
| `GET /appointments/{id}/prediction` | key | Stored prediction (404 if none) |
| `GET /doctors/sessions` | key | List sessions, newest first. **Auto-seeds 3 sessions if table is empty** |
| `PATCH /doctors/sessions/{id}/delay` | key | `{delay_minutes, status}` |
| `POST /capacity/optimize` | key | Overbooking recommendations (5.4) |
| `GET /capacity/waitlist` | key | List; **auto-seeds 3 entries if empty** |
| `POST /capacity/waitlist/{id}/assign` | key | Sets status `offered` |
| `GET /outreach/conversations` | key | Intervention log; **auto-seeds 3 examples if empty and appointments exist** |
| `POST /outreach/simulate-agent` | key | Rule-based trilingual agent (5.5) |
| `POST /simulator/evaluate` | key | ROI calculation (5.6) |

Interactive docs: `http://localhost:8000/docs`. Request/response models: `app/schemas.py`
(note the `/predict` request/response models live in `main.py`, not `schemas.py`).

Validation worth knowing: `Handcap` 0–4, binary flags 0/1, `Age` 0–120, `DayOfWeek` 0–6,
`Month` 1–12, simulator params have `ge/le` bounds. Violations → 422.

### 5.4 Capacity optimizer (`POST /capacity/optimize`)
For each doctor session, gather appointments on/after the target date whose `doctor_name` equals the
session's doctor **or** whose `department` equals the session's specialty.
- `booked = max(len(matches), 14)` (floor of 14 for realism).
- Predicted no-shows: each High prediction counts 1, each Medium counts 0.5. If no matching appointments: 4 high-risk, 5 predicted no-shows (baseline).
- `overbook = max(1, min(int(predicted × 0.75), 3))`; `extra_wait = overbook × avg_consult_mins × 0.35`.
- If `extra_wait` > `max_wait_time_tolerance_mins` (default 15) → drop one overbook and recompute.
- Revenue gain = overbook × LKR 4,500. Risk level: Safe ≤ 8 min, Moderate ≤ 15, else Caution.
- Response also totals capacity, booked, predicted no-shows, overbooks, revenue.

This is a heuristic, not an optimizer in the mathematical sense. `target_doctor` in the request schema is currently unused.

### 5.5 Outreach agent (`POST /outreach/simulate-agent`)
**Keyword matching, not an LLM.** Lower-cases the message and checks substring lists (English +
romanized Sinhala + romanized Tamil) in this priority order: reschedule → telehealth → cancel →
prep (fasting) → confirm (default). Each branch:
- picks a canned reply in `en` / `si` (Sinhala script) / `ta` (Tamil script),
- sets `appointment.ai_action_status` (e.g. "Rescheduled via AI"),
- cancel additionally sets `appointment.status = "cancelled"`,
- inserts an `interventions` row (channel hard-coded WhatsApp).

Nothing is actually sent, no slot is actually moved, and the telehealth link/times are hard-coded.
Because matching is substring-based, short tokens can misfire (e.g. "ok" inside another word, "call"
routing to telehealth).

### 5.6 ROI simulator (`POST /simulator/evaluate`)
Pure arithmetic, no DB. Constants: 20 patients/clinic/day, 310 operating days, ancillary multiplier
1.6, 12 min/consultation, 3.5 min per confirmation call, 26 working days/month, system cost
LKR 1.8M/year. Outputs: daily slots at risk, annual leakage, annual recovered revenue, doctor hours
recovered, nurse phone hours saved monthly, ROI multiple. The frontend re-implements the same math in
`lib/roi.ts` so sliders update instantly; the backend endpoint exists for the canonical calculation
and is tested against a formula.

### 5.7 Data tooling
- `python seed.py` — small hand-written demo set (3 patients, sessions, waitlist, interventions). Safe to re-run.
- `python seed_bulk.py --patients 50000 [--truncate] [--seed N] [--chunk-size N] [--intervention-fraction F]` —
  generates patients/appointments, runs the **real model + SHAP + contextual layer** in batch to create
  predictions, and seeds doctor sessions (one per doctor across 12 departments), waitlist, and ~5%
  interventions. Past appointments get a synthetic outcome; future ones stay `scheduled`/`no_show=NULL`.
  `--truncate` deletes from the tables it owns first. Note `fake_data_lk` dates are anchored to "today", so re-seeding shifts everything.

### 5.8 Tests (`backend/tests`, run `pytest` from `backend/`)
~40 tests across `test_api.py` (auth, CRUD, predict persistence, outcome), `test_contextual.py`
(multipliers, clamping), `test_predict_helpers.py` (thresholds), `test_shai_endpoints.py` (sessions,
optimizer, waitlist, agent intents in en/si/ta, simulator, contextual in /predict).
Needs a real Postgres database `noshow_test_db` (override with `TEST_DATABASE_URL`); each test runs
inside a rolled-back transaction; `API_KEY=test-api-key` is set by `conftest.py`.
Not covered: `/auth/login`.

---

## 6. Frontend architecture

- **App Router, server-first.** Pages are async Server Components that fetch via `lib/api.ts`
  (`cache: "no-store"`). Mutations are Server Actions (`"use server"`) that call the API and
  `revalidatePath(...)`.
- **`lib/api.ts`** — a single `apiFetch<T>` wrapper: resolves base URL/key from `getBackendConfig()`,
  sets `X-API-Key`, throws `ApiError(status, detail)`. One exported function per endpoint.
  (`window.location` redirect on 401 only fires client-side, which never happens here since calls are server-side.)
- **`lib/types.ts`** — TypeScript mirrors of backend schemas (`Patient`, `Appointment`,
  `StoredPrediction`, `PredictionResult`, `DoctorSession`, `WaitlistEntry`, `Intervention`,
  `SimulatorParams/Result`, `RiskCategory`, …). Keep in sync with `schemas.py` by hand.
- **`lib/appointments-with-predictions.ts`** — the shared "join": lists appointments and patients,
  then fetches a prediction *per appointment* (N+1) with a concurrency cap of 10 to avoid exhausting
  the backend's DB pool. Used by the dashboard, analytics and outreach pages.
- **`lib/backend-config.ts`** — backend URL resolution: `BACKEND_API_URL` env wins; otherwise (desktop
  app only) reads `server-config.json` from `SHAI_USER_DATA_DIR`. Writes are atomic (tmp + rename).
- **`lib/features.ts`** — `deriveFeatures(patient, appointment)` → the 11 model features
  (age at appointment date, DaysAhead clipped ≥ 0, Monday=0 weekday, etc.). Must mirror `preprocess.py`.
- **`lib/roi.ts`** — client copy of the ROI formula + `ROI_SIMULATOR_DEFAULTS`.
- **Shell:** `app/layout.tsx` (metadata, pre-hydration theme script) → `components/app-layout.tsx`
  (fixed sidebar on `lg+`, slide-in drawer on mobile; bare layout on `/login`) →
  `components/app-sidebar.tsx` (nav + sign-out) . `theme-toggle.tsx` persists `theme` in localStorage
  (class-based dark mode). `site-header.tsx` appears to be an older nav (the sidebar replaced it).
- **Error UX:** `components/backend-unreachable.tsx` is the standard failure card, with a Postgres/
  Alembic/seed troubleshooting checklist on 500s and a link to `/setup`.

---

## 7. What the app can do — page by page

| Route | File | Capabilities |
|---|---|---|
| `/login` | `app/login/` | Email + password form, show/hide password, distinct errors for bad credentials / locked / inactive / server, inactivity notice, `?redirect=` return path, forced-password-change branch. Server Action sets the session cookie |
| `/setup` | `app/setup/` | Desktop-only first-run screen: enter `host:port` (+ optional API key); it calls `<url>/health` (5 s timeout) to validate before saving |
| `/` Command Center | `app/page.tsx` | KPI cards (upcoming, high-risk upcoming, today's count, observed no-show rate, risk split %), consultant punctuality strip (delay badges), `PriorityWorklist` (upcoming High/Medium, High first then by date), and the full `AppointmentsTable` |
| Appointments table | `components/appointments-table.tsx` | Tabs (all / high risk / today / pending outcome), department + risk filters (incl. "unpredicted"), free-text search over name/phone/email/department, sort (risk asc/desc, date), relative date labels (Today, In 3d, 2d ago) |
| `/appointments/[id]` | `app/appointments/[id]/page.tsx` | Risk gauge + badge, recommendation, SHAP tornado chart, contextual-adjustment breakdown, logistics (doctor, time, queue #, channel, payment, AI action status), patient clinical profile (age, condition chips), and **Mark attended / Mark no-show** (only after the appointment date, only if no outcome yet) |
| `/new` | `app/new/` | 2-section intake form (demographics/conditions; scheduling/department/channel/payment/SMS). One submit: creates patient → creates appointment → derives features → `/predict` → renders the result inline with a link to the detail page. Always creates a **new** patient (no search/reuse) |
| `/capacity` | `app/capacity/` | KPI cards (capacity, booked, predicted no-shows, recommended overbooks, revenue recovery in LKR); per-session cards with recommendation, wait-time impact, risk level; **doctor delay editor** (sets delay minutes → status delayed/on_time); **waitlist backfill** with "Offer slot" per entry |
| `/outreach` | `app/outreach/` | Conversation log with language badges (EN/SI/TA) and status counts (confirmed / rescheduled / telehealth); **live agent simulator**: pick an appointment, language, type or click a quick message (5 canned per language), see the agent's reply, detected intent and the action taken |
| `/simulator` | `app/simulator/` | Boardroom ROI calculator: sliders for clinics/day, consultation fee, baseline no-show rate, AI coverage, reachability, reschedule success, overbooking fill (advanced toggle); instant client-side results |
| `/analytics` | `app/analytics/page.tsx` | Total/unpredicted counts, no-show rate from recorded outcomes ("—" until at least one), attended vs no-show, predicted risk distribution chart, department-level risk exposure, upcoming high-risk outreach list |

Client-side state is local `useState`/`useTransition`/`useActionState`; there's no global store or data-fetching library.

Component inventory: `risk-badge`, `risk-gauge`, `shap-tornado-chart`, `contribution-list`,
`contextual-adjustment-panel`, `priority-worklist`, `appointments-table`, `charts/risk-distribution-chart`,
`charts/department-breakdown`, plus `components/ui/*` (avatar, badge, button, card, dropdown-menu,
input, label, select, separator, skeleton, slider, table, tabs).

### Frontend tests (`npm test` → `vitest run`, jsdom)
`lib/features.test.ts`, `lib/roi.test.ts`, `lib/utils.test.ts`, `components/contextual-adjustment-panel.test.tsx`,
`app/login/page.test.tsx`. No tests for the other pages, Server Actions, `proxy.ts`, or Electron.

---

## 8. Authentication and access control (current state)

Real staff accounts replaced the earlier demo login.

**Accounts.** The `users` table (migration `7c1d9a4e52b0`) stores email, name, role, an scrypt password
hash (`app/security.py`, stdlib only), active flag, forced-password-change flag, failed-attempt counter
and lock time. The first admin is created from `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` when
the table is empty; more accounts come from `python create_user.py` or `POST /admin/users`. New and
admin-reset accounts must change their password at first login (10+ characters).

**Sign-in flow.** `/login` → `loginAction` (Server Action) → `POST /auth/login` → the backend checks the hash
(always, even for unknown emails, so timing doesn't reveal which exist), applies lockout (5 failures → 15 min,
stored in the DB so it survives restarts and multiple workers) and returns an HMAC-signed token
(`SECRET_KEY`, 8 h expiry) → the Server Action stores it in the **httpOnly** `shai_session` cookie.
Sign-out is a Server Action because page scripts cannot clear an httpOnly cookie.

**Every request.** `lib/api.ts` forwards the token as `Authorization: Bearer …` (plus the shared `X-API-Key`).
The backend's global `require_user` dependency verifies the signature and expiry and then **re-reads the user
row**, so deactivating an account or changing a role takes effect immediately and a token cannot grant
more than the database says. A 401 sends the browser to `/login?reason=session_expired`; a pending
password change redirects to `/change-password`.

**Frontend gate.** `proxy.ts` only decodes the cookie (it has no signing key) to skip the login screen and
detect expiry. A forged cookie can reach the page shell but never any data, because the backend verifies
every call.

**Roles** (`front_desk` < `manager` < `admin`):

| Role | Access |
|---|---|
| front_desk | appointments, patients, predictions, outreach, waitlist |
| manager | + capacity optimiser, doctor delays, ROI simulator (`/capacity`, `/simulator`) |
| admin | + `/admin/users` (create, change role, deactivate, reset password) |

The same rules are applied in the UI (links hidden, pages redirect via `requireRole`) and enforced by the
API (`require_role`). Public endpoints: `/`, `/health`, `/docs`, `/redoc`, `/openapi.json`, `/auth/login`.

---

## 9. Desktop app (Electron)

- `electron/main.js` opens a 1280×800 window (`contextIsolation`, `sandbox`, no node integration).
  In dev it loads `ELECTRON_START_URL`; when packaged it **spawns the bundled Next.js standalone
  server** (`.next/standalone/server.js`) on a free localhost port using Electron's own Node
  (`ELECTRON_RUN_AS_NODE=1`), waits up to 15 s for it, and kills it on quit.
- It passes `SHAI_USER_DATA_DIR` (Electron `userData`) so `backend-config.ts` can persist the server address.
- `copy-standalone-assets.js` copies `public/` and `.next/static` into the standalone bundle (Next doesn't) and
  **deletes any `.env*` files** there so a dev's `BACKEND_API_URL` never ships inside an installer.
- The desktop app is only a client. It still needs a reachable FastAPI + Postgres server.
- Build: `npm run dist:mac` / `npm run dist:win` (output `dist-electron/`). CI: `desktop-release.yml`
  builds both on `v*` tags or manual dispatch and attaches installers to the release. macOS builds are unsigned.

---

## 10. Setup and run

```bash
# 1. Database
createdb noshow_db && createdb noshow_test_db

# 2. Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env               # DATABASE_URL, optional API_KEY
alembic upgrade head
python preprocess.py               # or: python generate_dataset.py && python preprocess.py --input data/sri_lanka_noshow.csv
python train.py                    # writes models/*.pkl
python seed.py                     # small demo data   (or: python seed_bulk.py --patients 2000)
uvicorn app.main:app --reload      # http://localhost:8000/docs
pytest

# 3. Frontend
cd ../frontend
npm install
cp .env.example .env.local         # BACKEND_API_URL=http://localhost:8000, BACKEND_API_KEY (match API_KEY)
npm run dev                        # http://localhost:3000
npm test && npm run lint
# Desktop:  npm run electron:dev   |  npm run dist:mac / dist:win
```

Sign in: create an account first (there are no built-in users):
`BOOTSTRAP_ADMIN_EMAIL=you@hospital.org BOOTSTRAP_ADMIN_PASSWORD='a-long-password' uvicorn app.main:app`
creates the first admin on an empty database, or run `python create_user.py --email ... --name ... --role admin`.
The password must be changed at first login.

Environment variables:

| Var | Where | Meaning |
|---|---|---|
| `DATABASE_URL` | backend | SQLAlchemy URL (default `postgresql+psycopg://localhost/noshow_db`) |
| `API_KEY` | backend | Enables `X-API-Key` enforcement |
| `TEST_DATABASE_URL` | backend tests | Default `.../noshow_test_db` |
| `BACKEND_API_URL` | frontend (server-only) | Backend base URL; never prefix with `NEXT_PUBLIC_` |
| `BACKEND_API_KEY` | frontend (server-only) | Sent as `X-API-Key` |
| `SHAI_USER_DATA_DIR` | set by Electron | Where `server-config.json` lives |

`npm run build` uses `next build --webpack` (not Turbopack).

---

## 11. Extension guide — how to add things

**Add a new API endpoint end to end**
1. Model (if new data): add to `app/models.py`, then `alembic revision --autogenerate -m "..." && alembic upgrade head`.
2. Schemas in `app/schemas.py`; endpoint in `app/main.py` using `Depends(get_db)`.
3. Test in `backend/tests/` (uses the `client` fixture).
4. Frontend: add the type to `lib/types.ts`, a function to `lib/api.ts`, then a Server Component page and/or
   Server Action (`revalidatePath` the affected routes). Add a nav item in `components/app-sidebar.tsx`.

**Add or change a model feature** — touch all of: `preprocess.py`, `FEATURE_COLUMNS` in `main.py` and
`seed_bulk.py`, `AppointmentRequest` in `main.py`, `lib/features.ts` + `PredictFeatures` in `lib/types.ts`,
`lib/features.test.ts`, then retrain (`train.py`) and commit new pickles. Also update the `formatFeature` labels in `shap-tornado-chart.tsx`.

**Change risk thresholds** — `get_risk_category` / `get_recommendation` in `main.py` and `seed_bulk.py`, tests in
`test_predict_helpers.py`, and check UI colors in `risk-badge.tsx` / `risk-gauge.tsx`.

**Tune the contextual layer** — edit the tables in `contextual.py` and `test_contextual.py`. If you gain
real labelled local outcomes, the principled path is to add these fields as model features and retire the multipliers.

**Change the ROI formula** — update both `main.py:evaluate_roi_simulation` and `lib/roi.ts` (and both tests).

**Replace the outreach agent with a real one** — `simulate_patient_agent` is the seam. Keep the
`AgentSimulateResponse` contract; swap the keyword logic for an LLM/NLU call, add real WhatsApp/SMS
delivery (Twilio / WhatsApp Business API), and make rescheduling actually mutate slots.

**Sync-pairs to keep aligned:** `preprocess.py` ↔ `lib/features.ts`; `main.py` ROI ↔ `lib/roi.ts`;
`schemas.py` ↔ `lib/types.ts`; thresholds in `main.py` ↔ `seed_bulk.py`.

---

## 12. Known limitations / things to fix before scaling

Roughly ordered by importance for a production/large-scale path.

**Security**
1. ~~Login is a demo~~ **Fixed:** hashed passwords, signed expiring sessions, DB-backed lockout, roles, forced password change (§8).
2. **Remaining auth gaps:** no self-service "forgot password" (an admin resets it), no MFA, no audit log of who viewed which patient, tokens live 8 h and cannot be revoked individually before expiry (deactivating the user does revoke them).
3. **Role enforcement is coarse:** roles gate whole features (capacity, simulator, user management); all roles can see all patients. Per-department or per-branch visibility is not implemented.
4. **API is open if `API_KEY` is unset** (warning only). 500 responses echo exception text.
5. Patient data (names, phone, conditions) is health data — encryption at rest, audit logging and consent handling are not implemented.

**Correctness / data**
6. Synthetic data: the training labels and seed outcomes are generated from rules we wrote; reported model performance on it says nothing about real-world accuracy. Retrain on real local data when available and add calibration checks. No model versioning; pickles are in git.
7. Contextual multipliers are literature-informed guesses (documented as such in the payload).
8. Capacity optimizer uses floors/baselines (`max(len, 14)`, default 4/5 no-shows) that invent numbers for sessions with no data; `target_doctor` unused; the fixed LKR 4,500 fee is hard-coded.
9. Outreach agent is keyword-based and simulated; waitlist "assign" only flips a status — no slot is created and no patient is contacted; nothing enforces slot conflicts.
10. `/predict` trusts client-supplied features rather than deriving them from the stored records, so the stored prediction can disagree with the DB (the frontend derives them, but any caller can send anything).
11. Several read endpoints auto-seed demo rows when tables are empty — convenient for demos, surprising in production.

**Performance / scale**
12. The dashboard fetches every appointment, every patient and one prediction per appointment (N+1, capped at 10 concurrent). Listing endpoints have no server-side filtering by date/risk, no total count, and `limit` is unbounded. At tens of thousands of rows this needs a joined, paginated endpoint (e.g. `GET /appointments?include=patient,prediction&date_from=…`) and DB indexes on `appointments(patient_id, appointment_day)` and `predictions(appointment_id)` (only the unique constraint exists).
13. SHAP + model inference are synchronous in the request path; fine for single predictions, but consider batch endpoints/async workers for bulk scoring.
14. No Docker, no docker-compose, no CI for lint/tests, no deployment target chosen (PLAN.md Phase 4 is still open).

**Product gaps a next phase would likely address**
- Real user management and role-based views (front desk vs manager vs admin).
- Patient search/reuse in `/new`; edit/cancel/reschedule appointments; multi-hospital / branch model.
- Outcome feedback loop into retraining (the data is captured via `no_show`; the retraining pipeline is a stated non-goal so far).
- Real messaging integrations (WhatsApp/SMS/IVR), real telehealth links, and an audit trail of interventions.
- Observability beyond request logs (metrics, tracing, model-drift monitoring).
- Housekeeping: `PLAN.md` and the (missing) root `README` are out of date; unused/legacy `site-header.tsx`; `BackendUnreachable` copy assumes local Postgres via Homebrew.

---

## 13. Glossary

- **No-show:** patient did not attend a booked appointment. `appointments.no_show` NULL = outcome unknown.
- **Overbooking:** booking more patients than slots, expecting some no-shows.
- **SHAP:** method that attributes a single prediction to each input feature (positive = pushes risk up).
- **UHID:** Unique Hospital ID for a patient.
- **NSR:** No-Show Refund protection on online bookings (Doc990 / eChannelling).
- **Doc990 / eChannelling / Asiri MyHealth:** Sri Lankan online appointment channels (treated as prepaid).
- **Scholarship (Kaggle field):** enrolment in a Brazilian welfare program; here used as a proxy for subsidised care.
- **LKR:** Sri Lankan Rupee.
