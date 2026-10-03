# Roles, pages and endpoints

Ranks (`backend/app/security.py`, mirrored in `frontend/lib/session-token.ts`):

| Role | Rank | Purpose |
|---|---|---|
| front_desk | 1 | Books, records outcomes, works the waitlist, drafts outreach |
| analyst | 2 | **Read-only** analytics. Ranks below manager; cannot write anything |
| manager | 3 | Capacity, ROI, expenses, settings, hospital profile |
| admin | 4 | Staff and access, audit, HIS sync, dev tools |
| platform_owner | 5 | Cross-hospital administration |

Two kinds of gate are used because a rank alone cannot express "analyst can read but not write":

* `require_role(x)` – rank >= x (reads and manager/admin features).
* `require_any_role(*FRONT_LINE)` – exactly front_desk, manager, admin, platform_owner. Used on every front-line **write**. An analyst outranks front_desk, so rank alone would let them write.

## Pages (frontend nav; the server re-checks every call)

| Page | front_desk | analyst | manager | admin |
|---|---|---|---|---|
| Dashboard, Appointments, Prediction Hub (view), Outreach Hub, Model Hub | yes | yes | yes | yes |
| New Appointment | yes | no | yes | yes |
| Analytics | no | yes | yes | yes |
| Capacity, Outreach ROI | no | no | yes | yes |
| Staff & Access | no | no | no | yes |

## Endpoints

| Endpoint | Gate |
|---|---|
| `GET /health` | public |
| `GET /model/info`, `/meta/data-source`, `/departments`, `/doctors`, `/locations*`, `/distance`, `/predict/preview` | any signed-in user |
| `GET /patients*`, `/appointments*` (read), `/patients/search`, `/predictions/today`, `/predictions/runs/{id}`, `/search`, `/notifications`, `/geo/patients`, `/doctors/sessions*` (read), `/outreach/conversations`, `/outreach/activity`, `/capacity/nav-counts` | any signed-in user, scoped to the user's hospital |
| `POST /patients`, `POST /appointments`, `POST /appointments/intake`, `PATCH /appointments/{id}/outcome` | FRONT_LINE |
| `POST /predict` | any signed-in user (re-scores one appointment deterministically) |
| `GET/POST /capacity/waitlist`, `POST /capacity/waitlist/{id}/assign`, `GET /capacity/slot-offers`, `POST /capacity/slot-offers/{id}/act` | FRONT_LINE |
| `POST /outreach/draft`, `POST /outreach/simulate-agent` | FRONT_LINE |
| `POST /predictions/runs` (batch scoring) | rank >= analyst |
| `GET /analytics/*` | rank >= analyst |
| `PATCH /doctors/sessions/{id}/delay`, `/capacity/*` (overview, slots, what-if, scenarios, settings, forecast, accuracy, optimize) | rank >= manager |
| `/expenses*`, `POST /simulator/evaluate` | rank >= manager |
| `PATCH /hospital`, contacts / partners / management writes | manager (as in `hospital.py`) |
| `POST /his/sync` | permission `his.sync` (admin, platform_owner) |
| `POST /his/simulate/arrivals` | rank >= admin (development tool) |
| `GET /hospital/audit`, `/admin/*` | admin |

Tests: `backend/tests/test_scope_and_roles.py`.
