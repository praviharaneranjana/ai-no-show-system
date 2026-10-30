# Intake & Appointment-detail redesign: findings, plan, and Antigravity prompt

Sections 1–2 are for the project owner. **Section 3 (from the line down) is the prompt to paste into Antigravity.**
Model/ML changes are deliberately NOT in the prompt; they are listed in the chat reply only.

---

## 1. Bugs found (screenshots + code)

| # | Bug | Evidence |
|---|-----|----------|
| B1 | "Scheduled On" defaults to **yesterday** early in the day (UTC, not Sri Lanka time) | Screenshot shows `2026-09-30` on 2026-10-01. `today()` in `new-appointment-form.tsx` uses `toISOString()` |
| B2 | Every new appointment gets **Queue #1** | `AppointmentCreate.queue_number = 1` default in `schemas.py`; nothing assigns a real token |
| B3 | **UHID blank** in Patient Profile for newly registered patients | Screenshot 7 (`patient.uhid` is null). User wants it auto-generated |
| B4 | **Every booking creates a brand-new Patient**; returning patients are duplicated, so `_patient_history` never finds prior visits and `is_first_visit` is always 1 | `actions.ts` always calls `createPatient` |
| B5 | Form dropdown values don't match the model's categories. Oncology and Ophthalmology are offered but silently fall back to General Medicine. ENT, Endocrinology, Gastroenterology, Psychiatry and Urology exist in the model but can't be picked. **Phone** (the real channel for this workflow) is missing from channels | `feature_schema.json` vs `DEPARTMENTS`/`BOOKING_CHANNELS` |
| B6 | "Send SMS Reminder" is stored as `sms_received`, so the detail page says **"Reminder SMS Delivered"** when nothing has been sent | Screenshot 7 |
| B7 | Fabricated fallbacks on the detail page: `risk_score \|\| 0.15`, "Western Province", "Colombo", "Morning Session", "Cash at desk", "Standard Private Care". The **journey-map route is invented** (bearing seeded by a hash of patient id, so it's not where the patient lives) | `appointments/[id]/page.tsx`, `journey-map.tsx` |
| B8 | City is free text and unnormalised ("nugegoda"); distance is typed by hand | Screenshots 5–7 |
| B9 | SHAP row says "Chronic Conditions (1 conditions)" while the profile shows Diabetes and Alcohol use. The model counts only hypertension and diabetes, and the plural is wrong | Screenshot 6 vs 7 |
| B10 | Mark Attended / Mark No-Show is enabled for **future** appointments, with no confirm and no undo. `SYSTEM_OVERVIEW.md` claims it is date-gated, but the page code isn't | `outcome-actions.tsx` |
| B11 | Sidebar badges "2 wait" and "4" are hard-coded | `app-sidebar.tsx:74-83` |
| B12 | Booking is 3 non-atomic calls (patient → appointment → predict), so a failure leaves orphan patients. React 19 resets uncontrolled forms after a server action, so a validation error likely wipes everything typed (verify). "Schedule Another" uses `window.location.reload()` | `actions.ts` |
| B13 | Phone placeholder is US (`+1 (555)…`); no Sri Lankan validation or normalisation (`0710192005` accepted as-is). Schema silently defaults doctor to "Dr. Rohan Perera" if omitted | form, `schemas.py` |
| B14 | Native `<select>`, date and time inputs: unthemed OS popups (screenshots 4–5), no search, no icons | whole app |
| B15 | Brazil leftovers from the Kaggle data: "Bolsa Família / Scholarship" | form |
| B16 | Detail page header shows only `#DDF5BD7D`. It never shows **who** the patient is, **when** they come, or which doctor, and no real actions are offered for High risk | Screenshots 1 and 7 |
| B17 | **The outcome buttons appear to do nothing.** The click does call the server action, but there is no confirmation, no toast, no error handling, and the only visible change is the small "Current Appointment Status" text at the bottom of the page. The buttons stay active, so a second click silently overwrites the first. Nothing happens afterwards (no slot freed, no follow-up, no patient history update). The outcome is also never captured in a form a model could learn from | `outcome-actions.tsx`, `actions.ts`, `main.py:421` (sets only `no_show` and `status`) |
| B18 | `/predict` **overwrites** the stored prediction on every re-score (`existing.risk_score = …`). Once outcomes exist, the booking-time score (the one we must evaluate the model on) is lost, and features are not stored, so training data can't be rebuilt later | `main.py:302-311` |

## 2. Plan (phases, in order)

**Phase A: Data foundation (backend, one Alembic migration)**
- `patients`: add `nic`, `district`, `address_line`, `latitude`, `longitude`, `preferred_language` (en/si/ta). Make `uhid` server-generated, unique and non-null. Add indexes on `phone`, `nic`, `lower(full_name)`.
- New `doctors` (name, title, department_id, active), `departments` (name, `model_category` = one of the 12 model labels or null, icon), `doctor_clinic_sessions` (doctor_id, weekday, start_time, end_time, room, max_patients, label Morning/Evening), `locations` (name, district, province, lat, lng, seeded from GeoNames LK, CC-BY).
- `appointments`: add `doctor_id` FK, `clinic_session_id` FK, `booked_by`, `booking_notes`, `sms_reminder_opt_in`, `reminder_sent_at`, `cancelled_at`, `cancel_reason`, `rescheduled_from_id`. `sms_received` keeps its meaning "reminder actually delivered". Remove the `queue_number=1`, doctor and channel schema defaults.
- Backfill script: create `doctors` and sessions from existing `doctor_name`/`doctor_sessions`/seed rows; merge duplicate patients by phone + DOB + name.

**Phase B: New/changed endpoints**
`GET /patients/search?q=` · `GET /locations?q=` · `GET /departments` · `GET /doctors?department_id=&q=` · `GET /doctors/{id}/availability?from=&days=` · `POST /appointments/intake` (atomic: upsert patient → validate slot → assign token → create → predict) · `POST /predict/preview` (no persistence) · `GET /appointments/{id}/detail` (joined) · `PATCH /appointments/{id}` (reschedule/cancel) · `POST /appointments/{id}/actions` (log call/SMS/WhatsApp/telehealth/waitlist as an intervention) · `GET /nav/counts` (real sidebar badges).

**Phase C: Design system primitives** (replace every native control): `Combobox` (searchable, async, icons/logos, keyboard nav, grouped), `DatePicker` (calendar popover + quick chips), `TimeSlotPicker`, `SegmentedCards`, `PhoneInput` (+94).

**Phase D: New Appointment screen**: phone-call-first flow, doctor-first scheduling, sticky live "booking slip", returning-patient autofill.

**Phase E: Appointment detail screen**: patient-first header, action centre for High/Medium risk, timeline, real map, reschedule/cancel.

**Phase G: Outcome workflow and feedback loop (see §10 of the prompt and `docs/MODEL_FEEDBACK_LOOP_PLAN.md`)**: confirmed Attended / No-show / Cancelled with reasons, audit events, follow-up automation, end-of-clinic reconciliation screen, immutable booking-time prediction snapshots, and a training-ready export. Retraining itself is a separate, gated model task.

**Phase F: Tests and docs**: pytest for every endpoint, vitest for helpers, update `docs/SYSTEM_OVERVIEW.md`.

---

# ===== PROMPT FOR ANTIGRAVITY (copy everything below) =====

## 0. Role and scope

You are a senior product designer and full-stack engineer working on **SHAI**, a no-show prediction system for a Sri Lankan hospital. Read first: `docs/SYSTEM_OVERVIEW.md`, `docs/ANTIGRAVITY_DESIGN_PROMPT.md` (visual language, which still applies), `frontend/AGENTS.md` and `frontend/CLAUDE.md` (this Next.js version has breaking changes; read `node_modules/next/dist/docs` before using unfamiliar APIs).

**This task overrides the earlier "do not change the backend" rule for the scope below only.** You may add backend endpoints, models and **one new Alembic migration** for intake/appointments. Still do NOT touch: the ML model files in `backend/models/`, `backend/app/shai_model.py`, `backend/train.py`, `preprocess.py`, `contextual.py`, auth/login, or the Electron shell. The browser never calls the backend directly; all data flows through Server Components and Server Actions.

Keep `pytest`, `npm test`, `npm run lint`, `npm run build` green. Work in small commits. **Before writing code, show a design artifact (light + dark) for the two redesigned screens and wait for approval.**

Honesty rules still apply: no fabricated fallback values in production paths, LKR for money, `en-LK` formatting, synthetic-data chip only in the sidebar. When data is missing, show an explicit empty state, never a made-up default.

## 1. The real-world workflow we are designing for

A patient **phones** the hospital. The front-desk nurse, on the call, asks for: name, phone (often the caller ID), NIC or date of birth, where they live, which doctor or specialty. The nurse then **tells the patient a date, time and token number**. The nurse is typing while talking, so the form must be fast, mostly pick-lists, forgiving, and never ask the nurse to type something the system can compute or look up. Target: a returning patient booked in under 20 seconds, a new patient in under 60.

## 2. Bugs to fix (all must be closed; add a test where feasible)

- **B1** Default booking date uses UTC. Create `lib/dates.ts` with `todayLK()` (Asia/Colombo) and use it everywhere dates default.
- **B2** Queue number is always 1. The server assigns it: `max(queue_number)+1` per (doctor, appointment_day, session), inside a transaction with a row lock. Remove the schema default.
- **B3/B13** UHID is **never user-entered**. Server generates `SHAI-{YY}-{6-digit sequence}` (DB sequence, unique index). Show it read-only ("Assigned on save") on the new-patient form and in the booking slip.
- **B4** Stop creating duplicate patients. Search before create (phone, NIC, UHID, name). Match on NIC, or phone + DOB → reuse the existing patient and update changed fields. If only a fuzzy match exists, show "Is this the same person?" with the candidate's last visit and let the nurse choose.
- **B5** Department list comes from the `departments` table and covers exactly what the system can predict for, with a `model_category` column. Add **Phone** as a booking channel and make it the default. Channel and payment values stored in the DB must be canonical strings. Display names and logos are UI-only.
- **B6** Split the meanings: `sms_reminder_opt_in` (nurse ticked "send confirmation SMS") vs `sms_received` (actually delivered, set by the messaging layer or a manual "Mark reminder sent" action). The detail page must show "Reminder queued / Sent at 14:32 / Not requested", never "Delivered" unless `reminder_sent_at` is set.
- **B7** Remove every fabricated fallback on the detail page (`|| 0.15`, "Western Province", "Colombo", "Morning Session", "Cash at desk", "Standard Private Care"). Missing prediction means an empty-state card with a "Run prediction" button. The journey map uses the patient's **real stored lat/lng** (from the location picker). No coordinates means the empty state "Add location" with a button. **Delete the hash-seeded random-bearing logic.**
- **B8** City/area is picked from the `locations` table, never typed freely.
- **B9** Fix the plural ("1 condition"). In the profile, show only what the model uses as "Used by risk model" and the rest under "Other recorded notes". Read the used fields from `feature_schema.json` via a tiny backend helper, don't hard-code.
- **B10/B17/B18** Replaced by the full outcome workflow in **§10**. Reproduce B17 first (click the button, watch the network/server log) and confirm the root cause before rewriting.
- **B11** Sidebar badges read from `GET /nav/counts` (waitlist waiting count, unresolved high-risk outreach count). Hide the badge at 0.
- **B12** Booking is one atomic backend call (`POST /appointments/intake`); no orphan patients on failure. Preserve all typed values when the server returns an error (use controlled state or `useActionState` with returned values). Replace `window.location.reload()` with a state reset.
- **B14** No native `<select>`, `<input type=date>` or `<input type=time>` anywhere in the app. Grep for them in `app/` and `components/` and replace all.
- **B15** Replace "Bolsa Família / Scholarship" with "Samurdhi / welfare subsidy".
- **B16** See the detail-page redesign below.

## 3. New shared primitives (`frontend/components/ui/`)

Build on `@base-ui/react` (Combobox/Popover/Select primitives) and shadcn conventions already in the repo. Every one must work in light and dark, with full keyboard support (arrows, Enter, Esc, type-ahead), visible focus rings, and proper ARIA.

1. **`Combobox`**: searchable dropdown. Props: `options | loadOptions(query)` (async, debounced 200ms, abortable), `renderOption`, `icon`/`logo`, `groupBy`, `clearable`, `emptyText`, `creatable` (off by default). Popup is themed (radius 16px, same surface tokens as cards, max-height with scroll, highlighted/selected states, check icon). This replaces every select in the system (capacity, outreach, simulator, analytics, forms).
2. **`DatePicker`**: calendar popover (use `react-day-picker`), plus a row of quick chips: Today · Tomorrow · +1 week · +2 weeks · +1 month. Supports `disabledDays`, `availableDays` (highlighted dots) and `min`. Typing a date (`2026-10-14` or `14/10/2026`) also works. The input shows a long readable label ("Wed, 14 Oct 2026") with relative text ("in 13 days").
3. **`SegmentedCards`**: 2–4 large selectable cards (used for Morning/Evening sessions and for Low/Med/High actions). Each card can show a title, subtitle, icon and a capacity bar.
4. **`PhoneInput`**: fixed `+94` prefix chip, accepts `0710192005`, `710192005`, `+94710192005`, `071 019 2005`; normalises to E.164 on blur; shows an inline validation message. Sri Lankan mobiles are 9 digits after +94.

## 4. Backend additions

**Migration** (single Alembic revision, reversible):
- `departments(id, name unique, model_category nullable, icon, active)`; seed the 12 model categories plus any others the hospital has (mark `model_category = NULL` for unmodelled ones such as Oncology/Ophthalmology. See the UI rule in §5 step 3).
- `doctors(id, name, title, department_id FK, active)`.
- `doctor_clinic_sessions(id, doctor_id FK, weekday 0–6, label, start_time "HH:MM", end_time, room, max_patients)`.
- `locations(id, name, district, province, latitude, longitude)` seeded from a committed JSON of Sri Lankan towns/suburbs (GeoNames LK cities, CC-BY 4.0: add attribution to README). Put the seed loader in `backend/seed_reference.py`; idempotent.
- `patients`: `nic`, `district`, `address_line`, `latitude`, `longitude`, `preferred_language`; `uhid` backfilled and then `NOT NULL UNIQUE` with a sequence. Indexes on `phone`, `nic`, `lower(full_name)`.
- `appointments`: `doctor_id`, `clinic_session_id`, `booked_by`, `booking_notes`, `sms_reminder_opt_in`, `reminder_sent_at`, `cancelled_at`, `cancel_reason`, `rescheduled_from_id`. Keep `doctor_name` (denormalised display copy) for backwards compatibility.
- A backfill step (in the migration or `backend/backfill_intake.py`) that builds doctors and sessions from existing data, and merges duplicate patients (same phone + DOB) by repointing their appointments.

**Endpoints** (Pydantic schemas in `schemas.py`, tests in `backend/tests/`):
- `GET /patients/search?q=`: matches name prefix, phone (any format, normalised), NIC, UHID. Returns up to 8 with `last_visit`, `visit_count`, `prior_no_shows`, and every field needed to autofill the form.
- `GET /locations?q=&limit=15`: prefix/trigram search, ordered by relevance then population.
- `GET /departments`, `GET /doctors?department_id=&q=`: doctors include their weekly sessions.
- `GET /doctors/{id}/availability?from=YYYY-MM-DD&days=21`: per day → per session: `{label, start_time, booked, max_patients, remaining, next_token}`. Days with no clinic are omitted. (Use this for both the date-picker highlights and session cards.)
- `POST /appointments/intake`: body = patient (existing `patient_id` **or** new patient fields) + appointment fields (`doctor_id`, `clinic_session_id`, `appointment_day`, `booking_channel`, `payment_mode`, `sms_reminder_opt_in`, `notes`). In ONE transaction: upsert patient (generate UHID, compute `distance_km` from the chosen location using haversine to the hospital coordinates (`HOSPITAL_LAT/LNG` env, already used by the map) × 1.3 road factor, rounded to 0.1, stored together with lat/lng), validate the doctor works that weekday/session, appointment day is not in the past, and the session is not full (409 with the next available slot), reject a duplicate (same patient + doctor + day → 409), assign `queue_number`, insert, then run the existing prediction code path and persist the `Prediction`. Returns `{patient, appointment, prediction, slot: {start_time, room, token}}`. Stamp `booked_by` from the session cookie name.
- `POST /predict/preview`: same inputs as above but nothing persisted. Used for the live risk hint on the form (debounce 400ms; if it fails, hide the hint silently).
- `GET /appointments/{id}/detail`: appointment + patient + doctor + session + prediction + interventions + patient history (`visit_count`, `prior_no_shows`, `last_visit`) in one response.
- `PATCH /appointments/{id}`: reschedule (new day/session → new token, `rescheduled_from_id` set, prediction recomputed) and cancel (`cancel_reason`). `PATCH .../outcome` accepts `no_show: null` (undo).
- `POST /appointments/{id}/actions`: `{type: "call" | "sms" | "whatsapp" | "telehealth" | "waitlist" | "note", outcome?, note?}`. Persist as an `Intervention` (add nullable `actor`, `note` columns if needed). `sms/whatsapp` may reuse `/outreach/draft` for text.
- `GET /nav/counts`: `{waitlist_waiting, high_risk_open}` where `high_risk_open` counts upcoming High-risk appointments with no intervention yet.

Existing `/patients`, `/appointments`, `/predict` contracts must keep working (other screens and tests use them).

## 5. Screen 1: New Appointment (`/new`), redesign

Layout at 1280×800: a **two-column** page. Left (≈62%): the form as three numbered, collapsible step cards that follow the phone-call order. Right (≈38%, `sticky top-6`): the **Booking Slip**, a live summary card. Mobile: slip collapses into a bottom sheet bar showing doctor/date/time with a "Review" button. Page title: "New appointment" with a one-line subtitle. Remove the long subtitle about SHAP.

**Step 1: Patient.** One large search box at the top, autofocused: "Search by phone, name, NIC or UHID". As you type, results appear in a `Combobox`-style list with avatar initials, name, age·gender, phone, last visit and a red "2 previous no-shows" chip if applicable. Selecting one fills the patient block (read-only summary card with an "Edit" link) and skips to Step 2. If nothing matches, the list's last row is "➕ New patient: use '<query>'", which reveals the compact new-patient form:
- Full name (required), Phone (`PhoneInput`, required), Date of birth **or** age (a two-way toggle: entering age sets DOB to Jan 1 of the computed year, marked "approximate"), Gender (`SegmentedCards` with 3 small options: Female / Male / Other; no default, required), NIC (optional; validate old 9-digit+V/X and new 12-digit), Preferred language (en / සිංහල / தமிழ், default en, drives outreach language).
- **Location**: a `Combobox` with async search over `/locations` ("Search town or area: Nugegoda, Kandy, Jaffna…"), showing `name · district`. On selection, auto-fill a read-only **Distance** chip ("≈ 11.4 km from hospital · estimated road distance") and store lat/lng. A small MapLibre thumbnail is optional; skip if slow at 1280px.
- UHID shown as a disabled field with placeholder "Auto-generated on save".
- Collapsed accordion **"Clinical flags (optional)"**: Hypertension, Diabetes, Alcohol use, Mobility impairment (0–4 via `SegmentedCards`), Samurdhi/welfare. Add a tiny "Used by risk model" badge on the two the model uses (see B9). The others get "Recorded only".

**Step 2: Doctor and slot.** Order matters; the nurse usually hears the doctor's name or the specialty first:
1. **Department** `Combobox` (search, icon per department). If the chosen department has `model_category = NULL`, show a subtle inline note: "Risk estimated with the General Medicine baseline: this specialty isn't modelled yet."
2. **Doctor** `Combobox` (search, filtered by the department; also usable on its own. If a doctor is picked first, the department auto-fills). Options show avatar initials, name, department, and "Next: Tue 14 Oct".
3. **Date** `DatePicker` defaulting to the doctor's **next available clinic day**, with available days dotted, non-clinic days disabled, quick chips "Next available · +1 week · +2 weeks". Changing the date must take one click.
4. **Session** `SegmentedCards`: Morning / Evening cards (only those the doctor holds that weekday), each with time range, room, and a capacity bar "14 / 25 booked". Auto-select the only option, or the one with most capacity. Full sessions are disabled with "Full". **Clinic time is derived from the session, so there is no time input.**
5. A read-only **Token** line: "Token #15 (assigned when you confirm)".
6. **Booked on** shows today's date (`todayLK()`), read-only, with a small "edit" for back-dating.

**Step 3: Booking details.** **Booking channel** `SegmentedCards` with logos/icons: Phone (default, handset icon), Counter, Doc990, eChannelling, MyHealth (put logo files in `public/channels/`, fall back to a lucide icon; do not hotlink). **Payment mode** `SegmentedCards` with icons: Cash, Card, Prepaid online (NSR), Corporate, Insurance. **Confirmation SMS** toggle switch: "Send confirmation SMS to +94 71 ... " with the number shown, disabled if no phone. Notes (optional, single line, expands).

**Booking Slip (right column).** Live-updating card styled like a hospital appointment slip: Patient name, UHID (or "Assigned on save"), age·gender, phone; Doctor, department, room; **Date and time in large type** plus relative text; Token; channel and payment; SMS status. Below it, a **Live risk hint** (from `/predict/preview`): small ring plus tier word ("Low risk" / "Medium" / "High") and, if High, one line: "Consider offering an earlier slot." Plus an "Offer earlier slot" link that focuses the date picker. The primary button **"Confirm booking"** sits at the bottom of the slip, disabled with a tooltip listing exactly what's missing. Enter submits when valid. Loading state: "Saving and scoring…" (never say "Running XGBoost").

**Validation and errors.** Inline per-field, on blur. Server errors (409 slot full, duplicate booking, phone invalid) render in a banner above the slip, with a one-click fix where possible ("Session just filled. Switch to Evening?"). Never lose typed state.

**After confirm:** `router.push('/appointments/{id}?booked=1')`. No separate result card on `/new`. The detail page shows a dismissible "Booking confirmed" banner with "Copy slip text" (plain text for reading back or SMS: "SHAI Hospital. Dr X, Tue 14 Oct 2026, 5:30 PM, Room 204, Token 15") and "Book another" (goes to `/new`, clean state).

## 6. Screen 2: Appointment detail (`/appointments/[id]`), redesign

Use `GET /appointments/{id}/detail`. Keep the bento language and the 1280px layout rules from the earlier prompt.

**Header band (patient-first).** Left: avatar initials, **patient name** (H1), UHID chip, age·gender, tap-to-call phone. Under it: `Appointment #DDF5BD7D` in small mono type. Right: status pill (Scheduled / Completed / No-show / Cancelled / Rescheduled) and outcome controls. Below, a **key facts strip** of 4 large tiles: **Date and time** (big; relative "in 41 days"; Poya/weekend badge if applicable), **Doctor** (name, department, room), **Token #**, **Booked via** (channel logo, payment mode, "booked by Nurse K. Perera on 29 Sep"). All values real; missing ones say "Not recorded".

**Outcome controls:** Mark Attended / Mark No-Show per B10 (disabled with tooltip before the appointment day, confirm dialog, 10-minute Undo toast). Add overflow menu: Reschedule, Cancel appointment (reason required), Copy slip text.

**Risk hero + SHAP + profile** (existing three cards): keep, with these fixes: no fabricated fallbacks (B7); condition label plural (B9); profile shows UHID always, real residence (`location name, district`) and distance, preferred language, "Patient history: N visits · M no-shows · last seen …", a "Used by risk model" grouping for flags; hide rows with no data instead of inventing values.

**Action Centre (new, full-width card directly under the risk row).** Content depends on the tier; every action writes an intervention via `POST /appointments/{id}/actions`, then appears in the timeline:
- **High:** ordered "Recommended actions" as large buttons with one-line reasons taken from the top SHAP drivers ("Long lead time (45 d) → confirm by phone"):
  1. **Call patient**: `tel:` link, then a "Log call outcome" popover (Reached-confirmed / Reached-wants-to-reschedule / No answer / Wrong number) that saves the outcome.
  2. **Send reminder**: choose SMS or WhatsApp, language preselected from the patient, **AI draft** pre-filled from `/outreach/draft`, editable, "Send" (simulated send still logs an intervention).
  3. **Offer reschedule**: opens the same doctor/date/session pickers in a side sheet (availability from the endpoint), confirming calls `PATCH /appointments/{id}`.
  4. **Offer telehealth** (only for departments where it makes sense: make this a boolean on `departments`, default false; hide otherwise).
  5. **Add to waitlist swap / overbook flag**: marks the slot so the Capacity screen can backfill (reuse waitlist endpoints, don't invent new capacity logic).
- **Medium:** same buttons but "Send reminder" is primary, and suggest a second reminder 24 h before.
- **Low:** a calm card: "Standard confirmation SMS is enough." with a single "Send confirmation SMS" button if not yet sent.
Completed/cancelled appointments hide the Action Centre.

**Timeline (replaces the current Outreach History card).** Vertical list: Booked → confirmation SMS → each intervention (who, when, channel, outcome) → reschedules → final outcome. Empty state when only "Booked" exists.

**Patient Journey Map + Logistics.** Logistics card becomes compact (channel, payment, reminder status, queue) since the key facts strip now carries date/doctor. The map uses real coordinates only (B7); show "≈ X km · est. road distance". No coordinates → empty state with "Add location" that opens an inline location `Combobox` and saves via `PATCH /patients/{id}`. Add that endpoint if missing.

## 7. App-wide replacement of native controls

Grep `frontend/app` and `frontend/components` for `<select`, `type="date"`, `type="time"`, `<datalist`. Replace with the new primitives. Screens affected include at least Capacity, Outreach, Simulator, Analytics and the forms. Keep server-action form compatibility (render hidden inputs so `FormData` still works where actions read it).

## 8. Cleanup

- Delete `frontend/lib/features.ts` (`deriveFeatures`) and its test **only if** `/predict` no longer receives its output (the backend builds features itself; verify, then remove the dead call in `actions.ts` and `lib/api.ts` types).
- Update `docs/SYSTEM_OVERVIEW.md` with the new tables, endpoints and screens.
- Update seed scripts so `python seed.py` produces doctors, sessions and locations and every seeded appointment has `doctor_id`, a real queue number and a UHID.

## 10. Outcome workflow: what happens when the patient shows or doesn't

### 10.1 Outcomes and their meaning
| Outcome | `status` | `no_show` | Counts as model label? |
|---|---|---|---|
| Attended (checked in / seen) | `completed` | `false` | Yes, 0 |
| No-show (didn't come, no notice) | `no_show` | `true` | Yes, 1 |
| Cancelled ≥ 24 h before | `cancelled` | `null` | No (slot was refillable) |
| Cancelled < 24 h before (late cancel) | `cancelled` | `null`, `late_cancel = true` | No by default, tracked separately |
| Rescheduled | old row `rescheduled`, new row created | `null` | No |

### 10.2 Buttons: Mark Attended / Mark No-Show (rewrite `outcome-actions.tsx`)
1. **Rules.** Enabled only on or after the appointment day, only while `no_show IS NULL` and status is `scheduled`. Before that day they are disabled with a tooltip ("Available on 14 Oct"). Add env `NEXT_PUBLIC_DEMO_MODE=true` that lets staff record outcomes on future appointments, with a visible amber "Demo override" label on the dialog, so the thesis demo works with synthetic future data. Default off.
2. **Confirm dialog** (not `window.confirm`): title "Mark {patient} as attended?" / "…as no-show?", a one-line consequence text ("This updates their history and can be undone for 10 minutes"), for No-show a **reason** `Combobox` (optional: Couldn't be reached · Transport · Illness · Forgot · Booked elsewhere · Unknown), Confirm + Cancel. For Attended an optional "Checked-in time" (defaults to now).
3. **Feedback.** While saving, the clicked button shows a spinner and both are disabled. On success: a toast ("Marked as attended · Undo") and the page **updates visibly at once**: the status pill in the header changes, the outcome buttons are replaced by an **Outcome card** ("Attended · recorded by Nurse K. Perera · 14 Oct 17:42 · Undo"), the timeline gets the event. On failure: an error toast with the backend message and the buttons re-enabled. Never fail silently. Use `useActionState` or return `{ok, error}` from the action instead of ignoring the result.
4. **Undo** for 10 minutes by the same user (restores `scheduled`, `no_show = NULL`, logs an `outcome_undone` event, reverses the side effects below that are reversible). After 10 minutes only an admin-role user can change it, with a required reason.
5. **Idempotent and race-safe.** The backend rejects a second different outcome with 409 unless it is an undo or an admin correction.

### 10.3 Backend: one endpoint, one transaction
`POST /appointments/{id}/outcome` (keep the old `PATCH .../outcome` working and have it call the same service function):
body `{outcome: "attended"|"no_show"|"cancelled", reason?, checked_in_at?, cancel_reason?}`. In ONE transaction:
1. Validate state/date rules (demo override allowed only when the server env `DEMO_MODE=true`).
2. Update `appointments`: `status`, `no_show`, `outcome_recorded_at`, `outcome_recorded_by`, `outcome_source` (`staff`|`system`), `no_show_reason`, `checked_in_at`, `late_cancel`.
3. Append a row to a new **`appointment_events`** table (`id, appointment_id, event_type, from_status, to_status, actor, note, payload JSONB, created_at`). This is the audit trail and powers the timeline and Undo. Also write booking, reschedule, reminder and intervention events here from now on.
4. Run the **side effects** for the outcome (10.4). Each side effect is best-effort and idempotent. A failed side effect is logged into `appointment_events` with `event_type = "side_effect_failed"` and does **not** roll back the outcome.
5. Return the updated appointment, the new event, and a list of `follow_ups` (what the UI should offer next).

### 10.4 Side effects
**On Attended**
- Patient history updates automatically (`visit_count`, `last_visit`), because history is computed from outcomes.
- **Re-score the patient's other future appointments** (their prior-visit features changed). Write the new score to the prediction log (§10.6), update the displayed `predictions` row, and create an `appointment_events` entry "Risk re-scored 23% → 18%".
- Close any open interventions/outreach tasks for this appointment (status `resolved`).
- Offer a **follow-up booking** shortcut (opens `/new` prefilled with the same patient, doctor and department, date picker on the doctor's next clinic).

**On No-show**
- Reason stored, appointment leaves the "pending outcome" list.
- **Free the slot:** if the session is still in progress or later today, call the existing waitlist logic to suggest the best-matching waiting patient (same doctor/specialty, urgency first) as a one-click "Offer slot to {name}" follow-up. Do not auto-assign.
- **Rebooking outreach:** create an outreach task "Call/SMS to rebook" in the Outreach Hub worklist with an AI-drafted "We missed you today" message (reuse `/outreach/draft`, language from the patient profile). Nothing is auto-sent. Staff must press Send.
- **Repeat no-show handling:** a patient with ≥ 2 no-shows in the last 12 months gets a `flags.repeat_no_show = true` (computed, not stored). Their new bookings show a badge and the Action Centre's first recommended action becomes "Confirmation call required". The New Appointment patient search already shows the "N previous no-shows" chip.
- **Re-score the patient's other future appointments**, as above.
- Counts in analytics and the no-show rate automatically (they already read recorded outcomes).

**On Cancelled / Rescheduled**: free the slot (same waitlist suggestion), compute `late_cancel = appointment_start - now < 24h`, rescheduled rows link via `rescheduled_from_id`.

### 10.5 End-of-clinic reconciliation screen (`/appointments/close-day`)
Staff must not open 25 detail pages to close a clinic. Add a screen reachable from the dashboard ("Close today's clinics"): choose date (default today) and doctor/session; a compact table of that session's appointments (token, patient, risk tier, scheduled time) each with a segmented control **Attended / No-show / Not recorded**, bulk actions "Mark selected attended", a required confirm summary ("18 attended, 5 no-show, 2 unrecorded") and **Submit**, which calls the outcome service for each row in one request (`POST /appointments/outcomes/bulk`, same validation and side effects, per-row result so one failure doesn't block the rest). Unrecorded rows stay "Pending outcome". The existing "pending outcome" table tab links here. Show a banner on the dashboard when appointments from previous days still have no outcome.

### 10.6 Capture training-ready data from now on (no model code)
- Add `features JSONB`, `model_version TEXT`, `raw_score NUMERIC`, `scored_at` to a new append-only **`prediction_log`** table (`id, appointment_id, stage 'booking'|'rescore', features, risk_score, risk_category, model_version, created_at`). The intake endpoint and every `/predict` call append a row. The existing `predictions` table keeps only the latest, for display (fixes B18). The first `booking` row per appointment is the one used to evaluate the model later and must never be modified or deleted.
- Expose the features the backend already builds (the dict returned by `shai_model.engineer`) so the log stores exactly what the model saw. Do not edit `shai_model.py`: have the endpoint code capture the returned dict.
- Add `backend/export_outcomes.py`: writes `backend/reports/outcomes_export_{date}.csv` joining the **booking-stage** `prediction_log` features with the final label (attended = 0, no-show = 1; exclude cancelled/rescheduled/unrecorded). Include `appointment_id`, `appointment_day`, `model_version`, `risk_score`, `label`. Print counts (rows, no-shows, rate, date range).
- Add `GET /analytics/model-performance`: once there are ≥ 30 labelled outcomes, return real AUC, calibration by decile and the observed no-show rate per risk tier from `prediction_log` (booking stage) vs outcomes; below 30 return `{ready: false, labelled: n, needed: 30}`. The Analytics page shows a "Live model check" card: an empty state "Needs 30 recorded outcomes (have 12)" until ready. **Label clearly that this is hospital-recorded outcomes, separate from the synthetic benchmark metrics**, and never mix the two numbers in one headline.
- Do not retrain or swap the model in this task. The retraining plan is handled separately.

### 10.7 Tests
Backend: attended and no-show happy paths, invalid date (403/409), double-submit 409, undo within/after 10 min, repeat-no-show flag, bulk partial failure, future-appointment re-score writes a `rescore` log row while the booking row stays untouched, export excludes cancelled/unrecorded. Frontend: dialog flow, visible status change, error toast on 500, demo-mode label.

## 9. Acceptance checklist (run and report each)

1. Book a **returning** patient by typing their phone number: autofilled, doctor and date default to the next available day, confirmed in ≤ 5 interactions.
2. Book a **new** patient: pick location → distance appears; UHID is generated; detail page shows patient name, UHID, date/time, doctor, token.
3. Two bookings for the same doctor/day/session get tokens N and N+1 (test with concurrent requests).
4. Booking a full session returns 409 and the UI offers the next slot.
5. Booking the same patient twice for the same doctor/day is blocked with a clear message.
6. At 00:30 Colombo time the default booking date is today's Colombo date (unit-test `todayLK` with a mocked clock).
7. Booking a previously-booked patient a second time produces `is_first_visit=0` features (assert via a backend test around the intake path, not a model change).
8. High-risk appointment shows the Action Centre with all actions; each logs an intervention visible in the timeline. Low-risk shows the calm card.
9. Mark No-Show is disabled for a future appointment; Undo restores `scheduled`.
10. No native select/date/time input remains (grep returns nothing). Keyboard-only booking works end to end.
11. No hard-coded fallbacks remain on the detail page (grep for `0.15`, `Western Province`, `Colombo"`, `Morning Session`, `Cash at desk`).
12. Click Mark No-Show on an appointment dated today: dialog appears → confirm → toast, status pill, Outcome card and timeline update immediately; waitlist suggestion and "rebook" outreach task appear; Undo within 10 min restores everything; a second different outcome is rejected.
13. Close a clinic via `/appointments/close-day` for 10 rows in one submit; dashboard "pending outcome" banner count drops accordingly.
14. After recording outcomes, `python backend/export_outcomes.py` produces a CSV whose features equal the booking-time features (not the rescored ones).
15. `pytest`, `npm test`, `npm run lint`, `npm run build` all pass; screenshots of both screens in light/dark at 1280×800 and 390×844 attached.
