# SHAI — Smart Hospital AI Operations Platform

Predicts which outpatients are likely to miss their appointment and turns that into action:
risk triage, capacity/overbooking planning, waitlist backfill, AI-drafted reminders (English /
Sinhala / Tamil) and an ROI simulator. Built for a Sri Lankan private-hospital setting.

```
Next.js 16 frontend ──HTTP + X-API-Key──▶ FastAPI ──SQL──▶ PostgreSQL
 (server-side calls only)                 │  XGBoost + isotonic calibration + SHAP
                                          └─ optional Gemini for outreach drafting
```

## Quick start (Docker)
```bash
cp .env.example .env            # then set API_KEY, SECRET_KEY (openssl rand -hex 32) and the bootstrap admin
docker compose up --build
```
- App: http://localhost:3000 — API docs: http://localhost:8000/docs
- Sign in with the bootstrap admin from `.env` (you must choose a new password at first login).
  Create more staff with `docker compose exec backend python create_user.py --email ... --name ... --role front_desk|manager|admin`.
- Migrations run automatically on backend start.
- Load the synthetic dataset (needs reference data first):
  `docker compose exec backend python seed_reference.py && docker compose exec backend python seed.py && docker compose exec backend python import_synthetic.py`
- Public server with HTTPS, backups and operations: [`deploy/DEPLOY.md`](deploy/DEPLOY.md).

## Local development (no Docker)
```bash
# Backend (needs Postgres)
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements-dev.txt
cp ../.env.example .env         # set DATABASE_URL and API_KEY (the API refuses to start without API_KEY)
alembic upgrade head
python seed_reference.py        # departments, doctors, weekly clinic sessions, locations
python seed.py                  # hospitals + staff accounts (SEED_STAFF_PASSWORD / SEED_OWNER_PASSWORD, or random and printed once)
python seed_his.py              # simulated HIS appointments for the HIS-sync demo (optional)
python import_synthetic.py      # appointments from data/appointments_synthetic.csv: history + 45 days ahead, scored with the model
uvicorn app.main:app --reload

# Frontend
cd frontend
npm ci
BACKEND_API_URL=http://localhost:8000 BACKEND_API_KEY=<your key> npm run dev
```

### Data and model facts
* `import_synthetic.py` replaces the appointments / predictions / interventions with the generator CSV (`data_source='synthetic'`), shifts the dates so the last ~45 days are future bookings, groups them into the doctors' real clinic sessions, re-scores everything with the active bundle and prints AUC, PR-AUC, Brier, recall@top-20% and observed no-show rate per tier. It is idempotent. `seed_bulk.py` is the older random generator and is not used for the model numbers.
* The model is **XGBoost** (native JSON), calibrated with isotonic regression and explained with SHAP (TreeExplainer). `scikit-learn` is only used when training (`train_shai.py`, and for the comparison models in the notebook). Retrain: `python train_shai.py --input models/shai_bundle/appointments_synthetic.csv --version <name> --verify`.
* Overbooking is the exact Poisson-binomial optimum (no simulation); ROI is a replay on recorded history. See [`docs/CAPACITY_V2.md`](docs/CAPACITY_V2.md), [`docs/ROLES.md`](docs/ROLES.md) and [`docs/KNOWN_GAPS.md`](docs/KNOWN_GAPS.md).

## Tests and CI
```bash
cd backend && python -m pytest -q      # needs a Postgres database `noshow_test_db`
cd frontend && npm run lint && npm test
```
GitHub Actions (`.github/workflows/ci.yml`) runs both suites, the frontend build and the
Docker build on every PR.

## Is the model legit? How it's validated
```bash
cd backend && python validate_model.py    # ~4 min, writes backend/reports/
```
Run on the real Kaggle no-show data (110k appointments) with stratified CV, patient-grouped CV,
a train-on-past / test-on-future split, a label-shuffle control, calibration and lift:

| Check | ROC-AUC |
|---|---|
| Stratified 5-fold CV | 0.731 ± 0.001 |
| Patient-grouped 5-fold CV | 0.730 ± 0.002 |
| Temporal hold-out (future appointments) | 0.719 |
| Shuffled labels (control, should be 0.5) | 0.495 |

On future appointments, contacting the top-20% riskiest patients catches ~36% of no-shows
(1.8× better than random), and calibrated risks are within ~1.7 points of observed rates.
Full tables and plots: [`backend/reports/validation_report.md`](backend/reports/validation_report.md).

**Limits, stated plainly:** Kaggle is Brazilian public-hospital data and uses the 11 basic
Kaggle features, so this checks the *method*, not the deployed model. The deployed SHAI model
(`backend/models/shai_bundle`, 40 features incl. channel, payment, distance, prior no-shows) is
trained on a synthetic Sri Lankan dataset generated from rules we wrote (oracle AUC 0.77, model
AUC 0.67), so its scores are simulation-based validation only. Real accuracy at a local hospital
is unproven until it is tested on that hospital's own history — [`docs/VALIDATION_ON_LOCAL_DATA.md`](docs/VALIDATION_ON_LOCAL_DATA.md) is the plan.

## Deployment
Suggested: backend + Postgres on Render/Railway/Fly (use `backend/Dockerfile`; set `DATABASE_URL`,
`API_KEY`, `CORS_ORIGINS`, optional `GEMINI_API_KEY`), frontend on Vercel or as `frontend/Dockerfile`
(set `BACKEND_API_URL`, `BACKEND_API_KEY`). Use the HTTPS overlay (`docker-compose.prod.yml`, see [`deploy/DEPLOY.md`](deploy/DEPLOY.md)). Staff sign in with real
accounts (scrypt-hashed passwords, signed expiring sessions, roles, lockout); the remaining
pre-production checklist is in [`docs/SYSTEM_OVERVIEW.md`](docs/SYSTEM_OVERVIEW.md) §12.

## More
[`docs/SYSTEM_OVERVIEW.md`](docs/SYSTEM_OVERVIEW.md) — full developer guide · [`PLAN.md`](PLAN.md) — roadmap · MIT licence.
