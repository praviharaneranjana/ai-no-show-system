# Prediction Hub + Intake fixes: findings and Antigravity prompt

Part A is for the project owner. **Part B (from the line down) is the prompt to paste into Antigravity.**
It extends `docs/ANTIGRAVITY_INTAKE_REDESIGN_PROMPT.md`. Where the two disagree, **this document wins**.
Model/ML changes are not in the prompt.

---

## Part A: What I found in the code (why your earlier requests did not show up)

| # | Finding | Where |
|---|---------|-------|
| F1 | **Consultant is a free-text box** pre-filled with "Dr. Rohan Perera". There is no doctors table, so no dropdown can ever filter by department. This is why only Rohan appears. | `frontend/app/new/new-appointment-form.tsx`, `AppointmentCreate.doctor_name` default in `schemas.py` |
| F2 | UHID is a text field the user types (or stays blank). No generator exists. | `Patient.uhid` nullable, no sequence |
| F3 | City is free text; distance is typed by hand. A small hard-coded `TOWNS` dict exists only for the map. | `backend/app/geo.py` |
| F4 | The system only knows appointments typed into the New Appointment form. There is **no concept of "today's appointments coming from the hospital's own system"**, so nothing to batch-score. | whole backend |
| F5 | Doctor and time slot are not shown on the appointment detail page. | `appointments/[id]/page.tsx` |
| F6 | The earlier intake prompt was never applied (the form is still the old one), so it is folded into this one with an evidence-based acceptance list. |  |

**Product framing decided in this prompt:** SHAI is a **prediction layer that sits beside the hospital's main system (HIS)**, not the system of record. Its main job is: *pull today's appointments from the HIS, score every one, show who is likely to no-show, and let staff act.* Manual booking stays for phone/walk-in capture. Since you have no real HIS, we **simulate it** with a separate mock table behind a connector interface, so a real HIS can be plugged in later without touching the screens.

---

# ===== PROMPT FOR ANTIGRAVITY (copy everything below) =====

## 0. Role, scope, ground rules

You are a senior product designer and full-stack engineer on **SHAI**, a no-show prediction system for a Sri Lankan hospital (Colombo General Hospital, Asia/Colombo timezone, LKR). Stack: FastAPI + SQLAlchemy + Alembic + PostgreSQL (`backend/`), Next.js App Router (`frontend/`). Read first: `docs/SYSTEM_OVERVIEW.md`, `docs/ANTIGRAVITY_DESIGN_PROMPT.md` (visual language, still applies), `docs/ANTIGRAVITY_INTAKE_REDESIGN_PROMPT.md` (UI primitives §3, outcome workflow §10, bug list §2: all still required), `frontend/AGENTS.md` and `frontend/CLAUDE.md` (this Next.js has breaking changes; read `node_modules/next/dist/docs` before using unfamiliar APIs).

**Scope override:** you may add backend models, endpoints, services, seed scripts and migrations for this task. Do NOT touch: ML files in `backend/models/`, `backend/app/shai_model.py`, `train*.py`, `preprocess.py`, `contextual.py`, auth/login, the Electron shell. The browser never talks to the backend directly; data flows through Server Components, Server Actions and (new, allowed) Next **Route Handlers** that attach the session token server-side.

**Product framing (must be reflected in copy and structure):** SHAI is a prediction layer next to the hospital's main system (HIS). It is not the system of record. Data flows HIS → SHAI (sync) → model → staff action.

### How you must work (the previous prompt was not applied; this time prove it)
1. **Milestone 0, verify the baseline.** Before changing anything, run `grep -n "doctor_name\|Consultant" frontend/app/new/new-appointment-form.tsx` and `git status`, and state what the current form does. Then work through milestones M1…M9 (§12) in order, **one commit per milestone**, running `pytest`, `npm test`, `npm run lint`, `npm run build` after each.
2. Produce a **design artifact (light + dark, 1280×800 and 390×844)** for the Prediction Hub (§7) and the New Appointment page (§6) while you build the backend. Backend milestones do not wait for design approval; screen milestones do.
3. **Finish with the evidence report in §13.** Every checklist item needs the command, the output or a screenshot. Do not write "done" for anything you did not run.
4. Honesty rules: no fabricated fallbacks (no `|| 0.15`, no invented provinces/doctors/times). Unknown data renders as "Not recorded" or an explicit empty state. A synthetic-data chip appears only in the sidebar.

---

## 1. Data model: exact migration

Create **one Alembic revision**: `backend/alembic/versions/b7e3f1a9c2d4_prediction_hub.py`, `down_revision = 'a4ef2ced0ada'` (current head). It must have a working `downgrade()`. Mirror every new table/column in `backend/app/models.py` and every API shape in `schemas.py`. All timestamps `timestamptz`. Primary keys `uuid` (`gen_random_uuid()`; `CREATE EXTENSION IF NOT EXISTS pgcrypto`) unless noted.

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SEQUENCE patient_uhid_seq START 1;

-- ---------- reference data ----------
CREATE TABLE departments (
  id            serial PRIMARY KEY,
  name          text NOT NULL UNIQUE,            -- display name
  model_category text,                            -- one of the 12 labels in feature_schema.json, or NULL if not modelled
  icon          text NOT NULL DEFAULT 'stethoscope',  -- lucide icon name
  telehealth_ok boolean NOT NULL DEFAULT false,
  active        boolean NOT NULL DEFAULT true
);

CREATE TABLE doctors (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title          text NOT NULL DEFAULT 'Dr.',
  full_name      text NOT NULL,                   -- without title, e.g. 'Rohan Perera'
  department_id  integer NOT NULL REFERENCES departments(id),
  his_doctor_code text UNIQUE,                    -- id in the hospital system, used by sync
  default_room   text,
  active         boolean NOT NULL DEFAULT true,
  needs_review   boolean NOT NULL DEFAULT false,  -- auto-created by sync from an unknown HIS doctor
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_doctors_department ON doctors(department_id) WHERE active;

CREATE TABLE doctor_clinic_sessions (            -- WEEKLY template, not dated rows
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id    uuid NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  weekday      smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),   -- 0 = Monday (Python weekday())
  label        text NOT NULL CHECK (label IN ('Morning','Afternoon','Evening')),
  start_time   time NOT NULL,
  end_time     time NOT NULL,
  room         text NOT NULL,
  max_patients integer NOT NULL DEFAULT 25,
  slot_minutes integer NOT NULL DEFAULT 12,
  active       boolean NOT NULL DEFAULT true,
  UNIQUE (doctor_id, weekday, label)
);

CREATE TABLE locations (
  id          serial PRIMARY KEY,
  name        text NOT NULL,
  name_norm   text NOT NULL,                     -- lower, unaccented, single spaces
  district    text,
  province    text,
  kind        text NOT NULL DEFAULT 'town',      -- town | suburb | city | district
  latitude    double precision NOT NULL,
  longitude   double precision NOT NULL,
  population  integer,
  aliases     text[] NOT NULL DEFAULT '{}',
  source      text NOT NULL DEFAULT 'geonames',  -- geonames | photon | manual
  UNIQUE (name_norm, district)
);
CREATE INDEX ix_locations_trgm ON locations USING gin (name_norm gin_trgm_ops);

-- ---------- patients ----------
ALTER TABLE patients
  ADD COLUMN nic text,
  ADD COLUMN district text,
  ADD COLUMN address_line text,
  ADD COLUMN location_id integer REFERENCES locations(id),
  ADD COLUMN distance_source text CHECK (distance_source IN ('road_osrm','estimated','manual')),
  ADD COLUMN preferred_language text NOT NULL DEFAULT 'en' CHECK (preferred_language IN ('en','si','ta')),
  ADD COLUMN his_patient_ref text;                -- patient id in the hospital system
-- Backfill: generate UHID for every row where uhid IS NULL, as 'SHAI-' || to_char(created_at,'YY') || '-' || lpad(nextval('patient_uhid_seq')::text, 6, '0').
-- Resolve duplicate existing uhids by regenerating the later row. Then:
ALTER TABLE patients ALTER COLUMN uhid SET NOT NULL;
CREATE UNIQUE INDEX uq_patients_uhid ON patients(uhid);
CREATE UNIQUE INDEX uq_patients_his_ref ON patients(his_patient_ref) WHERE his_patient_ref IS NOT NULL;
CREATE INDEX ix_patients_phone ON patients(phone);
CREATE INDEX ix_patients_nic ON patients(nic) WHERE nic IS NOT NULL;
CREATE INDEX ix_patients_name_trgm ON patients USING gin (lower(full_name) gin_trgm_ops);

-- ---------- appointments ----------
ALTER TABLE appointments
  ADD COLUMN doctor_id uuid REFERENCES doctors(id),
  ADD COLUMN clinic_session_id uuid REFERENCES doctor_clinic_sessions(id),
  ADD COLUMN source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','his_sync')),
  ADD COLUMN external_ref text,                   -- HIS appointment reference
  ADD COLUMN his_synced_at timestamptz,
  ADD COLUMN booked_by text,
  ADD COLUMN booking_notes text,
  ADD COLUMN sms_reminder_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN reminder_sent_at timestamptz,
  ADD COLUMN cancelled_at timestamptz,
  ADD COLUMN cancel_reason text,
  ADD COLUMN late_cancel boolean NOT NULL DEFAULT false,
  ADD COLUMN rescheduled_from_id uuid REFERENCES appointments(id),
  ADD COLUMN checked_in_at timestamptz,
  ADD COLUMN no_show_reason text,
  ADD COLUMN outcome_recorded_at timestamptz,
  ADD COLUMN outcome_recorded_by text,
  ADD COLUMN outcome_source text CHECK (outcome_source IN ('staff','system','his_sync'));
CREATE UNIQUE INDEX uq_appt_external ON appointments(source, external_ref) WHERE external_ref IS NOT NULL;
CREATE UNIQUE INDEX uq_appt_patient_doctor_day ON appointments(patient_id, doctor_id, appointment_day)
  WHERE status = 'scheduled' AND doctor_id IS NOT NULL;
CREATE UNIQUE INDEX uq_appt_token ON appointments(doctor_id, appointment_day, clinic_session_id, queue_number)
  WHERE source = 'manual' AND status <> 'cancelled' AND queue_number IS NOT NULL;
CREATE INDEX ix_appt_day_doctor ON appointments(appointment_day, doctor_id);
-- Keep doctor_name (denormalised display copy). Drop the python-side defaults for doctor, channel, payment, queue_number in schemas.py.

-- ---------- audit + training log (logic in the earlier prompt §10) ----------
CREATE TABLE appointment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  event_type text NOT NULL,        -- booked | synced | sms_queued | sms_sent | intervention | rescheduled | outcome | outcome_undone | rescored | side_effect_failed
  from_status text, to_status text, actor text, note text,
  payload jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_events_appt ON appointment_events(appointment_id, created_at);

CREATE TABLE prediction_log (      -- append-only; never UPDATE or DELETE
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  stage text NOT NULL CHECK (stage IN ('booking','import','rescore')),
  features jsonb NOT NULL,
  risk_score numeric(5,4) NOT NULL,
  risk_category text NOT NULL,
  model_version text NOT NULL,
  prediction_run_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_predlog_appt ON prediction_log(appointment_id, created_at);

-- ---------- simulated hospital system (the "HIS") ----------
CREATE TABLE his_appointments (    -- stands in for the hospital's own database. SHAI code reads it ONLY through the connector (§3).
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  his_ref text NOT NULL UNIQUE,                  -- e.g. 'HIS-20261001-0042'
  his_patient_ref text NOT NULL,                 -- e.g. 'HP-118203'
  patient_name text NOT NULL,
  date_of_birth date NOT NULL,
  gender text,                                   -- 'F' | 'M'
  phone text, nic text, city text,               -- city is free text exactly like a real HIS (resolved by SHAI)
  doctor_code text NOT NULL, doctor_name text NOT NULL, department text NOT NULL,
  appointment_date date NOT NULL,
  appointment_time time NOT NULL,
  booked_on date NOT NULL,
  booking_channel text, payment_mode text,
  token_no integer,
  his_status text NOT NULL DEFAULT 'booked' CHECK (his_status IN ('booked','arrived','completed','no_show','cancelled')),
  hypertension boolean, diabetes boolean, alcoholism boolean, handicap integer, scholarship boolean,
  sms_sent boolean,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_his_appt_date ON his_appointments(appointment_date);

CREATE TABLE his_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_date date NOT NULL,
  trigger text NOT NULL CHECK (trigger IN ('manual','auto','combined_run')),
  status text NOT NULL CHECK (status IN ('running','done','failed')),
  fetched int NOT NULL DEFAULT 0, created int NOT NULL DEFAULT 0, updated int NOT NULL DEFAULT 0,
  unchanged int NOT NULL DEFAULT 0, failed int NOT NULL DEFAULT 0,
  error text, triggered_by text,
  started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz
);

CREATE TABLE prediction_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_date date NOT NULL,
  doctor_id uuid REFERENCES doctors(id),         -- NULL = whole day
  status text NOT NULL CHECK (status IN ('queued','running','done','failed')),
  stage text NOT NULL DEFAULT 'queued',          -- queued | syncing | matching | features | scoring | finalising | done
  with_sync boolean NOT NULL DEFAULT false,
  total int NOT NULL DEFAULT 0, scored int NOT NULL DEFAULT 0, failed int NOT NULL DEFAULT 0,
  high int NOT NULL DEFAULT 0, medium int NOT NULL DEFAULT 0, low int NOT NULL DEFAULT 0,
  expected_no_shows numeric(6,2),                -- sum of risk_score
  model_version text, error text, triggered_by text,
  started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz
);
```

**Canonical value rules** (enforce in a pydantic validator + a data backfill for existing rows):
- `booking_channel ∈ {Phone, Counter, Doc990, eChannelling, MyHealth}` (matches the model). `payment_mode ∈ {Cash, Card, Prepaid_Online, Corporate, Insurance}`. Display names/logos are UI-only. Map legacy values ("Hospital Counter"→Counter, "Asiri MyHealth"→MyHealth, "Credit Card (NSR Protected)"→Card, etc.) in one function `normalise_channel/normalise_payment` used by intake, sync and backfill.
- `gender ∈ {F, M}` for the model; "Other/Prefer not to say" stores NULL (the model handles it).

**Backfill step** (in the migration or `backend/backfill_hub.py`, idempotent): create `doctors` + a weekly session from every distinct `doctor_name`/`specialty` in existing `appointments`/`doctor_sessions`; set `appointments.doctor_id`; merge duplicate patients (same phone + DOB), repointing appointments; fill `queue_number` where NULL or 1-duplicated by assigning sequentially per doctor/day.

---

## 2. Reference data seeding: `backend/seed_reference.py` (idempotent)

1. **Departments**: the 12 modelled ones with `model_category` equal to their name (Cardiology, Dermatology, ENT, Endocrinology, Gastroenterology, General Medicine, Gynecology, Neurology, Orthopedics, Pediatrics, Psychiatry, Urology) plus Oncology, Ophthalmology, Nephrology, Pulmonology, Radiology & X-ray with `model_category = NULL`. Icons from lucide. `telehealth_ok = true` for Endocrinology, Psychiatry, Dermatology, General Medicine, Neurology (follow-ups).
2. **Doctors: at least 3 per department** (≥ 2 for unmodelled ones), realistic Sri Lankan names (Sinhala, Tamil, Muslim mix), unique `his_doctor_code` (`D-001…`). Keep the existing demo doctors (Rohan Perera → Cardiology, Neluka Fernando → Neurology, Anura Jayasinghe → Orthopedics). **Rohan Perera must NOT be the default for anything and must appear only under his own department.**
3. **Weekly sessions**: every doctor 2–4 clinic days per week, a mix of Morning (08:30–12:30), Afternoon (13:30–16:30) and Evening (17:00–20:00), a room per session, `max_patients` 20–30. Ensure **every weekday including today (Thursday 2026-10-01)** has at least 8 doctors holding a clinic so the demo has data.
4. **Locations**: commit `backend/data/lk_locations.json` (~2,000+ Sri Lankan populated places) built from the GeoNames `LK.txt` dump (feature class P, CC-BY 4.0; add attribution to README). Fields per §1. Include Colombo 1–15, suburbs (Nugegoda, Maharagama, Kotte, Battaramulla, Mount Lavinia, Dehiwala, Kiribathgoda, Kadawatha…), all district capitals, `aliases` such as "Colombo 7" ↔ "Cinnamon Gardens", Sinhala/Tamil transliteration variants where GeoNames has them. Generate with a small script `backend/scripts/build_lk_locations.py` and commit its output; the loader only reads the JSON (no network at seed time). Replace the hard-coded `TOWNS` dict in `geo.py` by lookups into this table (keep `TOWNS` as a fallback for unit tests only).

---

## 3. HIS connector (the simulated hospital system)

`backend/app/his/` package:

```python
class HISConnector(Protocol):
    name: str                                  # "simulated" | "http"
    def ping(self) -> HISHealth: ...           # {ok, latency_ms, mode, detail}
    def fetch_appointments(self, day: date) -> list[HISAppointment]: ...
```
- `SimulatedHISConnector` reads the `his_appointments` table (the stand-in HIS database). Add a deliberate **0.4–0.9 s artificial latency** so the loading UI is exercised, gated by env `HIS_SIM_LATENCY_MS` (default 600; 0 in tests).
- `HttpHISConnector` is a **stub with the real interface**: `GET {HIS_BASE_URL}/appointments?date=YYYY-MM-DD` with `Authorization: Bearer {HIS_API_KEY}`, timeout 10 s, maps JSON → `HISAppointment`. Not used by default; documented in `docs/HIS_INTEGRATION.md` with the expected JSON contract (same field names as `his_appointments`). This is the "connect to the main system through the cloud" seam.
- Env: `HIS_MODE=simulated|http` (default simulated), `HIS_BASE_URL`, `HIS_API_KEY`, `HIS_SIM_LATENCY_MS`.
- **`backend/seed_his.py`** (idempotent, re-runnable; `--day YYYY-MM-DD`, default today in Asia/Colombo): generates **70–95 appointments for the day** across **all doctors who hold a clinic that weekday** (use `doctor_clinic_sessions`), times spaced by `slot_minutes` inside each session, `token_no` sequential per doctor/session. Patient mix: ~60% returning patients that already exist in SHAI (same name/DOB/phone, so history and prior no-shows feed the model), ~40% new ones. Realistic Sri Lankan names, `+94` phones, `city` strings as a real HIS would hold them (some messy: "nugegoda", "Colombo 7", "Kandy ", "Mt Lavinia"), plausible `booked_on` (1–45 days earlier, producing varied lead times), channels and payment modes from the canonical lists. Statuses: all `booked` for today except a few `arrived`. **Never write any outcome/label for today.**
- **Dev-only** `POST /his/simulate/arrivals?count=5&day=` (HIS_MODE=simulated and role manager/admin only): inserts a few brand-new HIS bookings and changes one existing row's time and one to `cancelled`, so the demo shows what a re-sync detects ("3 new, 1 updated, 1 cancelled").
- Seed the DB the first time: `python seed.py` must call `seed_reference.py` then `seed_his.py`.

---

## 4. Sync logic (`backend/app/services/his_sync.py`)

`sync_day(db, day, trigger, actor) -> HISSyncRun`. One `his_sync_runs` row (`running` → `done|failed`). Everything per-appointment in its own savepoint so one bad row never aborts the run.

For each `HISAppointment`:
1. **Doctor:** match `doctors.his_doctor_code`; else exact `full_name`; else create `doctors` row with `needs_review = true`, `department_id` from the mapped department (create the department with `model_category NULL` if unknown). Count it as a warning in the run.
2. **Patient match, in this order:** `his_patient_ref` → `nic` → (`phone` normalised E.164 + `date_of_birth`) → (lower `full_name` + `date_of_birth`). If found: update empty fields only (never overwrite staff-entered data with blanks) and set `his_patient_ref`. If not found: create the patient, **generate the UHID** (§5.2), `preferred_language='en'`.
3. **Location:** if the patient has no `location_id`, resolve `city` text via `resolve_location(text)` (normalise, exact → alias → trigram similarity ≥ 0.6; ambiguous below threshold stays unresolved). On success store `location_id`, `district`, `latitude`, `longitude`, and compute `distance_km` (§5.3). Unresolved → leave NULL (model has `distance_missing` flag; the UI shows "Location not recognised"). Never invent a place.
4. **Appointment upsert on `(source='his_sync', external_ref=his_ref)`:**
   - create: map fields, `doctor_id`, `clinic_session_id` (match doctor's session for that weekday and time within start..end, else NULL), `scheduled_day = booked_on`, `scheduled_time = HH:MM`, `queue_number = token_no`, canonical channel/payment (§1), `sms_reminder_opt_in = coalesce(sms_sent, false)`, `status` mapped (`booked→scheduled`, `arrived→scheduled` + `checked_in_at=now()`, `completed→completed`+`no_show=false`, `no_show→no_show`+`no_show=true`, `cancelled→cancelled`, `cancelled_at=now()`), `his_synced_at = now()`. Write an `appointment_events` row `synced`.
   - update: only when a mapped field actually differs (time, doctor, status). **Never overwrite an outcome a staff member recorded in SHAI** (`outcome_source='staff'`). Event `synced` with a `payload.diff`.
   - unchanged: `his_synced_at = now()` only, counted as `unchanged`.
5. Return counts and the list of appointment ids that are new or changed (these are scored next).

Idempotent: running sync twice in a row yields `created=0, updated=0`.

---

## 5. Intake logic (New Appointment backend)

### 5.1 Doctors cascade (fixes F1)
- `GET /departments` → `[{id, name, icon, model_category, telehealth_ok, doctor_count}]`.
- `GET /doctors?department_id=&q=&active=true` → `[{id, display_name:"Dr. Rohan Perera", department:{id,name}, default_room, sessions:[{weekday,label,start_time,end_time,room,max_patients}], next_clinic_date}]`. **With `department_id`, return ONLY that department's doctors.** `q` matches name prefix/substring (trigram).
- `GET /doctors/{id}/availability?from=YYYY-MM-DD&days=21` → `{days:[{date, sessions:[{session_id,label,start_time,end_time,room,max_patients,booked,remaining,next_token}]}]}`. Days with no clinic are omitted. `booked` counts non-cancelled appointments for that doctor/day/session (manual and HIS).
- The free-text consultant field is **deleted**. Doctor is only ever chosen from the list. `doctor_name` is filled server-side from the doctor row.

### 5.2 UHID generation (fixes F2)
Server-side only, inside the patient-create transaction: `SELECT nextval('patient_uhid_seq')` → `SHAI-{YY}-{seq:06d}` (YY = year in Asia/Colombo). A single function `generate_uhid(db)` used by intake, sync, seeds and the backfill. **Never accepted from the client** (remove `uhid` from `PatientCreate`; return it in `PatientOut`). The form shows a disabled field "Auto-generated when you confirm" and the Booking Slip shows it after saving.

### 5.3 Location search and automatic distance (fixes F3)
- `GET /locations?q=&limit=8` ranking: (1) exact `name_norm`/alias match, (2) prefix match, (3) trigram similarity, tie-break by `population desc`. Response items: `{id, name, district, province, kind, latitude, longitude, label:"Nugegoda · Colombo District"}`. Debounce 200 ms on the client. Min 2 characters.
- `GET /locations/geocode?q=` (fallback when local results < 3): server-side proxy to **Photon** (`https://photon.komoot.io/api/?q={q}&limit=6&lang=en&bbox=79.4,5.8,82.0,9.9`), Sri Lanka bounding box only, 1 req/s throttle, 24 h in-memory cache, 3 s timeout, `User-Agent: SHAI/1.0`. Env `GEOCODER=local|photon` (default `photon`; `local` disables the call). Results the user selects are upserted into `locations` with `source='photon'` so the next search is local and instant. The frontend never calls Photon directly. (Google Places would need an API key and billing; keep the provider behind a small interface so it can be swapped.)
- `POST /distance` `{latitude, longitude}` → `{distance_km, source}`: `road_osrm` via OSRM `router.project-osrm.org/route/v1/driving/{lng},{lat};{HOSPITAL_LNG},{HOSPITAL_LAT}?overview=false` with 1.5 s timeout (env `ROUTING=osrm|estimate`, default `osrm`), else `estimated` = haversine × 1.3. Round to 0.1 km. Hospital coordinates come from `geo.py` (`HOSPITAL_LAT/LNG`). The same function is used by intake, sync and `PATCH /patients/{id}`.
- **Distance is never typed.** The field is a read-only chip: "≈ 11.4 km · road distance" / "≈ 11.4 km · estimated". A "Not accurate? Set manually" link switches `distance_source='manual'` and lets staff type a number.

### 5.4 Atomic booking: `POST /appointments/intake`
Body: `patient_id` **or** new `patient` object (name, phone, dob, gender, nic?, `location_id`, flags, language) + `doctor_id`, `clinic_session_id`, `appointment_day`, `booking_channel`, `payment_mode`, `sms_reminder_opt_in`, `notes`. ONE transaction:
1. Validate: doctor active; that doctor holds the chosen session on `appointment_day.weekday()`; day is not before today (Colombo); session not full (409 + `next_available`); no duplicate (same patient/doctor/day, status scheduled → 409).
2. Upsert patient (matching rules as in §4.2 + earlier prompt B4), generate UHID if new, resolve distance (§5.3).
3. `SELECT … FOR UPDATE` on the session's appointments for that day, assign `queue_number = coalesce(max,0)+1`; `scheduled_time = session.start_time + (queue_number-1)*slot_minutes` (capped at `end_time`).
4. Insert appointment (`source='manual'`, `booked_by` = session cookie user name), event `booked`.
5. Score through the existing prediction code path (shared service `services/scoring.py`, §8), append `prediction_log(stage='booking')`, upsert `predictions`.
6. Return `{patient, appointment, prediction, slot:{doctor, date, start_time, room, token}}` or a structured error `{code, message, fix?}`.

Other endpoints from the earlier prompt stay as specified there: `GET /patients/search`, `POST /predict/preview`, `GET /appointments/{id}/detail`, `PATCH /appointments/{id}`, `POST /appointments/{id}/outcome`, `POST /appointments/{id}/actions`, `GET /nav/counts`, `POST /appointments/outcomes/bulk`.

---

## 6. New Appointment screen (`/new`) — requirements for this round

Layout, step cards, Booking Slip, validation: as in the earlier prompt §5. In this round these behaviours are **mandatory and must be demonstrated**:

1. **Page title: "Add appointment"** with subtitle "For phone or walk-in bookings that are not yet in the hospital system." (Hospital-system appointments arrive via the Prediction Hub.) Remove the SHAP/ML sentence.
2. **UHID:** read-only, "Auto-generated when you confirm". Shown on the slip after saving.
3. **Location combobox (Google-Maps-style):** type "nug…" → dropdown with pin icons, `Nugegoda · Colombo District` etc., arrow-key navigation, highlighted matched text, "Searching…" spinner row, "No match. Try a nearby town" empty row. Selecting fills lat/lng and **automatically triggers the distance calculation**. A small non-interactive map thumbnail (MapLibre, reuse `patient-map.tsx` tiles) shows the pin and a dotted line to the hospital; if it is slow, skip the thumbnail rather than block.
4. **Distance chip states:** idle → "Pick a location" · loading → shimmer "Calculating distance…" · done → "≈ 11.4 km · road distance" · failed → "Estimated 11.4 km" with a retry icon.
5. **Doctor cascade:** Department combobox (searchable, icon per row) → Doctor combobox that shows **only that department's doctors**, with avatar initials, name and "Next clinic: Tue 6 Oct". Changing the department clears an incompatible doctor. Choosing a doctor first auto-fills the department. Selecting Radiology & X-ray lists only radiology doctors; Dermatology only dermatologists. No free-text consultant, no default doctor.
6. **Date and session:** as the earlier prompt (calendar with clinic days dotted, session cards with capacity bar). Time is derived from session + token, so **no time input**: the slip shows "Dr. Silva · Tue 6 Oct · Evening · ≈ 17:36 · Token 4 · Room 204".
7. **Submission loading (staged, on-theme):** on **Confirm booking** the slip replaces its button with the `ProgressStages` component (§9) cycling honestly through the real steps: *Checking doctor availability → Looking up patient → Calculating distance → Assigning token → Scoring no-show risk → Done*. Each step is ticked when the server confirms; the server may stream stage names (SSE) or the client may infer them from timing, but the UI must **never show a stage that did not run**. Min display 600 ms to avoid flicker.
8. All native `<select>`, `type=date`, `type=time` are gone from this page.
9. On success: navigate to the appointment detail with the "Booking confirmed" banner (earlier prompt §5).

---

## 7. New screen: No-Show Predictions (`/predictions`) — the Prediction Hub

Add a sidebar item **"No-Show Predictions"** (lucide `Radar` or `Activity`) directly under Appointments. This is the product's main daily screen. Server Component for the first render; client components for the run controls and live progress.

### 7.1 Layout (1280×800 first, responsive down to 390)
**Header:** title "Today's no-show predictions"; date chip (default today in Asia/Colombo; arrows to move ±1 day and a `DatePicker`); **HIS connection chip** (green dot "Hospital system · simulated · synced 09:12" / amber "Not synced yet" / red "Unreachable"); buttons: secondary **"Sync from hospital system"**, primary **"Run predictions"** (split button option: "Sync & run"). Primary is disabled with a tooltip when nothing is synced.

**KPI strip (6 tiles):** Appointments today · Scored · High risk · Medium · Low · **Expected no-shows** (sum of risk scores, one decimal) with sub-label "≈ 7% of today's slots". Before any run, tiles after "Appointments today" show "—", never zeros pretending to be results.

**Filters row:** department `Combobox`, doctor `Combobox` (cascade: doctor list narrows to the department), risk tier `SegmentedCards` (All / High / Medium / Low / Not scored), search box (patient, phone, UHID, token), view toggle **By doctor | Table**. State lives in the URL (reuse `search-params.ts`).

**By doctor view (default):** a responsive grid of **Doctor cards**, one per doctor with appointments in range, sorted by number of high-risk appointments desc, then by session start. Each card: avatar initials, name, department icon, room, session label and window ("Evening · 17:00–20:00"), capacity bar ("22 / 25"), a mini risk distribution bar (High/Med/Low segments, grey for unscored), and a **time-ordered list of appointments** (time, token, patient name, age, risk pill with percent, a tiny "first visit" / "2 prior no-shows" chip). Cards collapse to the top 5 rows with "Show all 22". Unscored rows show a neutral "Not scored" pill, never a fake number.

**Table view:** sortable columns: Time · Token · Patient · Doctor · Department · Distance · Lead days · Risk (bar + %) · Tier · Status · Source. Server-side pagination (reuse `pagination.tsx`). Default sort: risk desc if scored, else time asc.

**Row click → right-hand Sheet (no navigation):** patient header (name, UHID, age·gender, tap-to-call phone), appointment facts (doctor, date, time, room, token, source badge "From hospital system · HIS-20261001-0042"), risk gauge + tier, **top 3 drivers in plain words** (from the existing explanation; fix the "1 conditions" plural), the **recommended action** (from the earlier prompt Action Centre, same buttons: Call / SMS-WhatsApp draft / Offer reschedule / Waitlist swap), a mini map with the real route (only if coordinates exist) and "Open full detail →".

### 7.2 States (all required, all on-theme)
- **Never synced:** friendly empty state with the HIS illustration icon, "No appointments for Thu 1 Oct yet", primary button "Sync from hospital system".
- **Syncing / running:** the **Run panel** (§9 `ProgressStages`) expands above the cards: stages *Connecting to hospital system → Fetching today's appointments (n found) → Matching patients (k new) → Resolving locations & distances → Building features → Scoring risk (37 / 82) → Finalising*. Real counts from `prediction_runs` / `his_sync_runs`, a determinate progress bar for scoring. The doctor cards beneath stay visible with skeleton rows only where data is not yet present.
- **Scoring done:** rows reveal their risk pills with a short staggered fade (respect `prefers-reduced-motion`), cards re-sort, the KPI tiles count up, a toast "82 appointments scored · 9 high risk".
- **Partial failure:** banner "3 appointments could not be scored" with a "View" action listing reason per row and "Retry failed".
- **HIS unreachable:** error card with "Retry" and the last successful sync time; existing scored data stays visible.
- **No clinics today:** "No clinics scheduled for this day".

### 7.3 Backend for the hub
- `GET /his/status` → `{mode, ok, latency_ms, last_sync:{finished_at, created, updated, unchanged, failed}|null}`.
- `POST /his/sync` `{date}` → runs `sync_day` and returns the run (synchronous is fine; sim latency < 1 s). Rate-limit one concurrent sync per date (409 `sync_in_progress`).
- `GET /predictions/today?date=&department_id=&doctor_id=&tier=&q=&page=&view=doctors|table` → `{date, summary:{total, scored, high, medium, low, expected_no_shows, unscored}, doctors:[{doctor, session, capacity:{booked,max}, distribution, appointments:[…]}]}` or a paged table payload. Appointments include patient basics, doctor, time, token, source, distance, lead days, history chips, and `risk` (`null` when not scored).
- `POST /predictions/runs` `{date, doctor_id?, with_sync}` → **202** `{run_id}`; rejects a second concurrent run for the same date/doctor (409 returning the existing `run_id`). Executes in a FastAPI `BackgroundTask` (thread) and updates the `prediction_runs` row after each stage and every 5 appointments: `stage`, `scored`, `failed`.
- `GET /predictions/runs/{id}` → the row. The frontend polls through a **Next Route Handler** `app/api/predictions/runs/[id]/route.ts` (server-side token attach) every 700 ms until `done|failed`, stopping on unmount.
- `POST /predictions/runs/{id}/retry-failed`.
- Roles: `front_desk` may sync and run; `/his/simulate/arrivals` is manager/admin and dev-only.

---

## 8. Batch scoring logic (`backend/app/services/scoring.py`)

Extract the per-appointment body of the existing `/predict` handler into `score_appointment(db, appointment, stage, run_id=None) -> Prediction` and call it from `/predict`, intake, preview (with `persist=False`) and the batch runner. **Do not edit `shai_model.py`**; capture the feature dict it returns and store it in `prediction_log.features`.

`run_predictions(run_id)`:
1. `stage=syncing` (only if `with_sync`): `sync_day(...)`, linking its counts into the run.
2. `stage=matching` → load all `scheduled` appointments for `run_date` (and `doctor_id` if set), ordered by doctor then time.
3. `stage=features/scoring`: for each appointment compute features from stored data only (age, `distance_km`, `lead_days = appointment_day − scheduled_day`, hour/dow/month, department via `model_category` (unmodelled → the existing fallback, flagged in the explanation text), channel, payment, prior visits and prior no-shows computed from recorded outcomes **before** the appointment day, chronic count, `sms_sent`, Poya/weekend/rain via existing contextual helpers). Missing values stay missing (the model has missing flags); never impute silently in app code.
4. Per appointment, one savepoint: upsert `predictions` (latest, for display), append `prediction_log` (`stage='import'` for `source='his_sync'` first-time scores, `'booking'` for manual first scores, `'rescore'` otherwise). An exception marks `failed += 1`, stores the message in an `appointment_events` row `side_effect_failed`, and continues.
5. `stage=finalising`: counts per tier using the model's thresholds (High ≥ 0.2722, Medium ≥ 0.1655 for `shai-lk-synth-v1`; **read them from the model bundle metadata, do not hard-code**), `expected_no_shows = sum(risk_score)`, `finished_at`, `status=done`. Make the whole run idempotent: re-running re-scores and logs `rescore`.
6. Target performance: 100 appointments in under 5 s on a laptop; the model is loaded once per process, not per row.

---

## 9. Loading states and the on-theme progress component

- **`components/ui/progress-stages.tsx`**: props `stages: {key,label,detail?,status:'pending'|'active'|'done'|'error'}[]`, optional `progress {value,max}`. Vertical or compact-horizontal variants. Visuals follow the SHAI theme tokens (violet accent, rounded-2xl card, dark/light aware): active stage has a soft pulsing ring and a live detail ("Scoring 37 / 82"), done shows a check, error shows the message and a retry. `role="status"`, `aria-live="polite"`, reduced-motion safe.
- **`components/ui/skeleton.tsx`** shapes that mimic the real layout (doctor cards, KPI tiles, table rows, detail header). Add `loading.tsx` for `/predictions`, `/appointments`, `/appointments/[id]`, `/new`. No bare "Loading…" text, no layout shift when the real data arrives.
- Combobox async states: spinner row while fetching, empty row, error row with retry.
- Buttons that trigger server work show an inline spinner and are disabled; they never change width.

---

## 10. Appointments list and detail (fixes F5)

**List `/appointments`:** add columns/fields **Doctor, Date & time, Token, Source** (HIS badge vs Manual). Group-by-doctor toggle optional. Rows link to the detail page.

**Detail `/appointments/[id]`:** implement the earlier prompt §6 in full. Hard requirements for this round:
- Header is patient-first: name, UHID chip, age·gender, phone, status pill, source badge.
- **Key-facts strip with real values: Date & time (large, relative "in 3 days"), Doctor (name, department, room), Session ("Evening clinic, 17:00–20:00"), Token #, Booked via (channel + payment), "Booked on … by …"**. Missing → "Not recorded".
- **Map of the patient's journey** using the patient's stored coordinates and the hospital pin, route line, "≈ X km · road/estimated". No coordinates → empty state "Add location" with an inline location combobox (saves via `PATCH /patients/{id}`). Delete the hash-seeded random-bearing logic.
- Action Centre and Timeline per the earlier prompt, reading `appointment_events`.
- Outcome buttons per earlier §10.2 (confirm dialog, visible state change, undo).

---

## 11. Cross-cutting

- Replace **every** native `<select>`, `type="date"`, `type="time"` in the app (earlier prompt §3, §7). Grep must return nothing.
- Update `backend/seed.py` so a fresh `docker compose up` + `python seed.py` yields: departments, ≥ 40 doctors, sessions, locations, a few hundred historical appointments with outcomes (existing synthetic generator), **and today's HIS appointments** ready to sync. Update `docs/SYSTEM_OVERVIEW.md` (tables, endpoints, screens, HIS connector) and add `docs/HIS_INTEGRATION.md`.
- Sidebar badges read `GET /nav/counts`; add `unscored_today` and show a dot on "No-Show Predictions" when today has unscored appointments.
- Keep existing `/patients`, `/appointments`, `/predict` contracts working.

---

## 12. Milestones (one commit each, tests green at each)

| M | Deliverable |
|---|---|
| M0 | Baseline verification (grep + git status written up) |
| M1 | Migration `b7e3f1a9c2d4`, models, schemas, backfill; `alembic upgrade head` and `downgrade -1` both succeed on a seeded DB |
| M2 | `seed_reference.py` (departments, doctors, sessions, locations) + `generate_uhid` |
| M3 | Doctors/departments/availability/locations/geocode/distance endpoints + tests |
| M4 | `POST /appointments/intake` (+ preview, search) + `services/scoring.py` refactor + tests incl. concurrent token test |
| M5 | HIS connector, `seed_his.py`, `sync_day`, `/his/*` endpoints + tests |
| M6 | `run_predictions`, `/predictions/*` endpoints, polling Route Handler + tests |
| M7 | UI primitives (Combobox, DatePicker, SegmentedCards, PhoneInput, ProgressStages, Skeleton) |
| M8 | `/new` redesign (§6) and `/predictions` hub (§7), after design approval |
| M9 | Appointments list/detail (§10), outcome workflow (earlier §10), docs, cleanup, evidence report |

## 13. Tests and acceptance (report each with evidence)

**Backend tests (`backend/tests/`):** `generate_uhid` unique under 20 concurrent calls · `GET /doctors?department_id=` returns only that department · every department seeded has ≥ 3 doctors (≥ 2 unmodelled) · `GET /locations?q=nug` ranks Nugegoda first · distance for Nugegoda ≈ 8–14 km (estimate path, OSRM mocked) · intake: success, full session 409, duplicate 409, wrong weekday 400, past date 400, concurrent bookings get consecutive tokens, rollback leaves no orphan patient · sync: first run creates N, second run creates 0, changed time → updated, cancelled → cancelled, unknown doctor → `needs_review`, staff outcome never overwritten, unresolvable city leaves distance NULL · run: scores all scheduled rows, `prediction_log` rows stage `import`, tier counts match thresholds from the bundle, one bad row does not fail the run, concurrent run → 409 · migration up/down.

**Frontend tests (vitest):** cascade clears incompatible doctor · distance chip state machine · `ProgressStages` renders states · Hub empty/running/done/partial-failure states · `todayLK`.

**Acceptance checklist (each needs command output or a screenshot):**
1. `grep -n "Consultant" frontend/app/new/*.tsx` shows a combobox fed by `/doctors`, not a text input; no `Dr. Rohan Perera` string in frontend code.
2. Pick **Radiology & X-ray** → doctor list contains only radiology doctors; switch to **Dermatology** → only dermatologists. Screenshot both.
3. Create a new patient: UHID appears as `SHAI-26-00xxxx` on the slip and detail page; the form had no UHID input.
4. Type "nuge" in location → suggestions with district; select → distance chip goes shimmer → "≈ N km". Screenshot of the three chip states.
5. Booking shows the staged progress component with the real stage names; screenshot mid-run in light and dark.
6. `python seed.py` on an empty DB, then `/predictions` for today shows "Never synced". Click **Sync** → stage panel → 70–95 appointments grouped by doctor with times; none scored.
7. Click **Run predictions** → progress with live counts → tier counts, expected no-shows, rows revealed; numbers equal a direct SQL count (`SELECT risk_category, count(*) …`).
8. `POST /his/simulate/arrivals` then Sync again → "N new, 1 updated, 1 cancelled"; re-sync → all unchanged.
9. Open any appointment in the Hub's side sheet and the full detail page: doctor, session window, time, token, source, and a map with the real route are visible.
10. Switch `HIS_MODE=http` with an unreachable URL → Hub shows the unreachable state and keeps old data.
11. `alembic upgrade head`, `alembic downgrade -1`, `alembic upgrade head` all succeed.
12. `grep -rn "<select\|type=\"date\"\|type=\"time\"" frontend/app frontend/components` returns nothing.
13. `pytest`, `npm test`, `npm run lint`, `npm run build` all pass; screenshots of `/new`, `/predictions` (empty, running, done), `/appointments`, `/appointments/[id]` in light and dark at 1280×800 and 390×844.

Anything you could not complete or verify must be listed explicitly at the end of your report, not omitted.
