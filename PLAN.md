# AI No-Show System — Development Plan

Status snapshot as of 2026-08-20. This is the living roadmap for the project.
Update the checkboxes as work lands; keep phase order — each phase depends on
the one before it.

## Where things stand today

**Backend (`backend/`)**
- ML pipeline works standalone: `preprocess.py` cleans the Kaggle no-show
  dataset, `train.py` trains an XGBoost classifier and a SHAP explainer,
  both pickled to `models/`.
- `app/main.py` is a FastAPI service with a single `POST /predict` endpoint.
  It loads the pickled model directly from disk — it does **not** touch the
  database at all yet.
- `app/database.py` and `app/models.py` were just added: SQLAlchemy engine/
  session setup and three tables (`patients`, `appointments`, `predictions`),
  with one Alembic migration already generated (`618fc68de27a`). Nothing in
  the API reads or writes these tables yet — the DB layer is scaffolded but
  disconnected from the rest of the app.
- No tests, no auth, no Docker, no CI.

**Frontend (`frontend/`, branch `feature/frontend-dashboard`)**
- Fresh `create-next-app` scaffold (Next.js 16, React 19, Tailwind 4).
  shadcn/ui is initialized and a handful of primitives are installed
  (`button`, `card`, `input`, `select`, `badge`, `avatar`, `dropdown-menu`,
  `label`, `separator`) but `app/page.tsx` is still the default template —
  no dashboard UI has been built despite the branch name.
- No API client, no calls to the backend, no routing beyond the single page.

**Repo-level**
- No LICENSE (fixed — MIT added), no root README, no `.claude/` skills.

## Guiding principle

Wire the DB into the API before building UI against it — the frontend needs
real endpoints (list patients/appointments, trigger a prediction, read one
back) to build against, not just `/predict`. Build in this order:

## Phase 1 — Connect the database to the API ✅ done (2026-08-20)
- [x] Wire `app/database.py`'s `get_db` into FastAPI via `Depends`.
- [x] Add Pydantic schemas for `Patient`, `Appointment`, `Prediction` separate
      from the SQLAlchemy models (request/response shapes) — see
      `backend/app/schemas.py`.
- [x] Add CRUD endpoints: create/list patients, create/list appointments
      (plus get-by-id for both, and appointments can be filtered by
      `patient_id`).
- [x] On `POST /predict`, persist the result to the `predictions` table
      linked to an `appointment_id` (now a required field on the request;
      re-predicting an appointment updates its existing row instead of
      erroring on the unique constraint).
- [x] Add `GET /appointments/{id}/prediction` to read a stored prediction back.
- [x] Confirm the existing Alembic migration applies cleanly against a local
      Postgres instance (`alembic upgrade head` — already applied, tables
      verified via `psql \dt`); added `backend/seed.py` for local dev data
      (3 sample patients + appointments, safe to re-run — skips if patients
      already exist).

Verified end-to-end against a local Postgres instance: seeded data, called
`POST /predict` with a real `appointment_id`, confirmed the row landed in
`predictions` and round-tripped through `GET /appointments/{id}/prediction`,
and confirmed an unknown `appointment_id` 404s instead of predicting into
the void.

## Phase 2 — Backend hardening ✅ done (2026-08-20)
- [x] Add `pytest` + `httpx` test suite: unit tests for the risk/recommendation
      helpers, integration tests for the CRUD + predict endpoints against a
      test DB. Uses a real Postgres `noshow_test_db` (not SQLite — the models
      use Postgres-specific `UUID`/`JSONB` types), with each test wrapped in a
      transaction that's rolled back afterward for isolation. Run with
      `pytest` from `backend/` (11 tests, see `backend/tests/`).
- [x] Add request validation edge cases — `Handcap` (0-4) bounds already
      matched the trained feature range; added a test asserting out-of-range
      values 422 rather than silently reaching the model.
- [x] Add basic auth/API key middleware — `X-API-Key` header checked against
      `API_KEY` env var for all routes except `/`, `/health`, `/docs`,
      `/redoc`, `/openapi.json`. If `API_KEY` is unset the API logs a warning
      and runs open (local-dev convenience) — see `backend/.env.example`.
- [x] Add structured logging (method/path/status/duration on every request)
      and a `/health` endpoint that also checks DB connectivity.

## Phase 3 — Frontend dashboard (the actual `feature/frontend-dashboard` work) ✅ done (2026-08-20)
- [x] Add a typed API client (fetch wrapper) pointed at the FastAPI backend,
      with env-configurable base URL — `lib/api.ts` + `lib/types.ts`. Runs
      server-side only (Server Components/Actions), so `BACKEND_API_URL` /
      `BACKEND_API_KEY` never reach the browser bundle and CORS is a non-issue.
- [x] Build the dashboard shell: layout, nav, and an appointments list view
      pulling from `GET /appointments` — `components/site-header.tsx`,
      `app/page.tsx`.
- [x] Build an appointment detail view showing the stored prediction: risk
      score, category badge, top SHAP feature contributions (bar/list), and
      the recommendation text — `app/appointments/[id]/page.tsx`,
      `components/contribution-list.tsx`, `components/risk-badge.tsx`.
- [x] Build a "new appointment" form that submits to the backend and shows
      the resulting prediction inline — `app/new/page.tsx` +
      `new-appointment-form.tsx` (client) + `actions.ts` (Server Action).
      Feature engineering (Age/DaysAhead/DayOfWeek/IsWeekend/Month) is derived
      from the created patient + appointment in `lib/features.ts`, mirroring
      `backend/preprocess.py` exactly — the form only asks for real-world
      fields, not the model's engineered ones.
- [x] Replace the default `page.tsx` scaffold content entirely.

**Known simplification:** "new appointment" always creates a new patient
rather than offering search-and-select against existing patients. Fine for
now; revisit if/when patient reuse matters.

Verified with a real headless-Chromium run (Playwright) against the live
dev server + backend: submitted the new-appointment form end to end,
confirmed the prediction card rendered (risk badge, %, recommendation, SHAP
bars), followed the link to the detail page, and confirmed the appointment
appeared on the dashboard with its risk badge — zero console/network errors.

### Phase 3 addition — Analytics overview ✅ done (2026-08-20)
Requested after Phase 3 shipped: an aggregate view alongside the appointments
list, not just per-appointment detail.
- [x] Backend: `PATCH /appointments/{id}/outcome` (`schemas.AppointmentOutcomeUpdate`)
      records whether a patient actually showed up, setting `no_show` and
      `status` together. This closes the loop the model needs — `no_show` was
      in the schema from Phase 1 but nothing ever set it. Covered by 3 new
      tests (14 total, see `backend/tests/test_api.py`).
- [x] Frontend: `app/analytics/page.tsx` — total appointments, not-yet-predicted
      count, no-show rate (from recorded outcomes only, shows "—" until at
      least one exists), predicted risk distribution bar (Low/Medium/High),
      and an upcoming-high-risk list for prioritizing outreach.
- [x] `app/appointments/[id]/outcome-actions.tsx` + `actions.ts` — "Mark
      attended" / "Mark no-show" buttons on the detail page, shown only once
      the appointment date has passed and no outcome is recorded yet;
      revalidates `/`, `/analytics`, and the detail page on submit.
- [x] Extracted `lib/appointments-with-predictions.ts` so the dashboard list
      and analytics page share one appointment+patient+prediction join
      instead of duplicating it.
- [x] Added "Analytics" to the nav in `components/site-header.tsx`.

Verified live via Playwright: recorded a real outcome on a past appointment
through the UI, confirmed the badge updated in place, and confirmed the
analytics page's no-show rate and outcome count updated to match — zero
console/network errors.

## Phase 4 — Polish & deploy (2026-10-01)
- [x] Dockerize backend and frontend; `docker-compose.yml` with Postgres
      (`docker compose up --build`; migrations run on backend start).
- [x] CI (GitHub Actions, `.github/workflows/ci.yml`): backend pytest against a
      Postgres service; frontend lint + test + build; Docker build.
- [x] Root `README.md` (architecture, quick start, validation summary, limits).
- [x] Real-data validation on Kaggle: `backend/validate_model.py` →
      `backend/reports/` (stratified + patient-grouped CV, temporal hold-out,
      label-shuffle control, calibration, lift, baselines).
- [ ] Deployment target decision and secrets (suggested split in README; needs
      an account on the chosen host).
- [ ] **Validate on real local hospital data** — the main remaining gap. Plan in
      `docs/VALIDATION_ON_LOCAL_DATA.md`; blocked on getting a de-identified export.
- [ ] Replace the demo login (see `docs/SYSTEM_OVERVIEW.md` §12) before any real PHI.

## Non-goals for now
- Retraining pipeline automation / MLOps — out of scope until the core
  product loop (predict → store → display) works end to end.
- Multi-tenant auth / roles — single shared API key is enough until there's
  a real user model.
