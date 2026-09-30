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
- Load demo data: `docker compose exec backend python seed_bulk.py`
- Public server with HTTPS, backups and operations: [`deploy/DEPLOY.md`](deploy/DEPLOY.md).

## Local development (no Docker)
```bash
# Backend (needs Postgres)
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env            # edit DATABASE_URL / API_KEY
alembic upgrade head
python seed.py
uvicorn app.main:app --reload

# Frontend
cd frontend
npm ci
BACKEND_API_URL=http://localhost:8000 BACKEND_API_KEY=<your key> npm run dev
```

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
