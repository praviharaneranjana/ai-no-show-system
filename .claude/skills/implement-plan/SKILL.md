---
name: implement-plan
description: Implement the next step(s) of the AI No-Show System roadmap in PLAN.md — connecting the DB to the API, hardening the backend, building the frontend dashboard, and deploy polish. Use when the user asks to "work on the plan", "continue the roadmap", "implement the next task/phase", or names one of PLAN.md's phases directly.
---

# Implement the AI No-Show System plan

`PLAN.md` at the repo root is the single source of truth for what's built and
what's next. It is organized into four ordered phases (DB wiring → backend
hardening → frontend dashboard → deploy polish), each a checklist of tasks.
Phases are sequential — later phases assume earlier ones are done — but tasks
within a phase can be reordered if one blocks another.

## Workflow

1. **Read `PLAN.md` first, every time.** Do not rely on memory of its
   contents from a previous session — re-read it, since it may have changed.
2. Find the first phase with unchecked (`- [ ]`) items. That's the active
   phase. Do not start a later phase while an earlier one has unchecked items,
   unless the user explicitly asks to jump ahead.
3. Unless the user names a specific task, work through the unchecked items in
   the active phase in the order they're listed.
4. Before writing code for a task, look at the current state of the relevant
   files — the plan describes intent, not implementation detail, and the
   codebase may have moved since the plan was written.
5. After completing a task, tick its box in `PLAN.md` (`- [ ]` → `- [x]`) in
   the same edit pass as the code change, not as an afterthought.
6. Stop and summarize at a natural boundary — one task done for a quick ask,
   a full phase for "implement phase N" — rather than plowing through the
   entire remaining roadmap unprompted.

## Project map (so you don't have to rediscover it)

- `backend/app/main.py` — FastAPI app, currently a single `POST /predict`
  endpoint that loads `models/xgboost_model.pkl` + `models/shap_explainer.pkl`
  directly from disk. This is the file that Phase 1 wires up to the database.
- `backend/app/database.py` — SQLAlchemy engine, `SessionLocal`, `Base`, and a
  `get_db()` generator dependency already written and ready to use with
  FastAPI's `Depends`.
- `backend/app/models.py` — SQLAlchemy ORM models: `Patient`, `Appointment`,
  `Prediction`. `Prediction.explanation` is a JSONB column meant to hold the
  SHAP contribution list that `/predict` already computes.
- `backend/alembic/` — one migration exists (`618fc68de27a`, creates all
  three tables). Run new migrations with
  `alembic revision --autogenerate -m "..."` after model changes, from
  `backend/`.
- `backend/train.py`, `backend/preprocess.py` — offline ML pipeline, not part
  of the request path. Leave alone unless the task is explicitly about the
  model.
- `frontend/` — Next.js 16 + React 19 + Tailwind 4, shadcn/ui initialized
  (`frontend/components/ui/` has button, card, input, select, badge, avatar,
  dropdown-menu, label, separator — add more via `npx shadcn@latest add …`
  rather than hand-rolling). `frontend/app/page.tsx` is still the unmodified
  `create-next-app` template; Phase 3 replaces it.
- Backend deps are pinned in `backend/requirements.txt`; there's a `venv/` at
  `backend/venv/` already set up.

## Conventions to follow

- Backend: FastAPI + Pydantic v2 style already in `main.py` (typed
  `BaseModel`s for request/response, `HTTPException` for errors). Keep new
  Pydantic schemas separate from the SQLAlchemy models in `models.py` — don't
  make the ORM models double as API schemas.
- Match the existing risk thresholds (`>= 0.65` High, `>= 0.40` Medium, else
  Low) and the `FEATURE_COLUMNS` order in `main.py` wherever risk scoring is
  touched — the trained model depends on exact column order.
- Frontend: use shadcn/ui primitives already installed before adding new
  ones; keep Tailwind utility classes consistent with the dark-mode-aware
  style already present in `page.tsx` (`dark:` variants throughout).
- Don't touch `backend/data/` or `backend/models/*.pkl` — those are generated
  artifacts from the ML pipeline, not something Phase 1–4 tasks modify.
- This is a healthcare-adjacent app (patient data) — flag any task that
  touches auth/PII handling loosely rather than silently shipping something
  permissive; Phase 2 explicitly calls out that the API is wide open today.
