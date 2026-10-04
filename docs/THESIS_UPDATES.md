# SHAI: Updates After the Viva-Fixes Review (thesis notes)

Scope: changes made in this working session on branch `viva-fixes`, on top of the state described in `docs/THESIS_FACTS.md` (pinned at `ac655bc`).
Status words: **REAL** = implemented and covered by tests or by a type/lint check; **PARTIAL** = works with a stated limit; **SIMULATED** = no external delivery.
Not yet done: a browser walk-through of the new screens, and the migrations have been applied only to the local development database.

## 1. Summary

| # | Update | Type | Status |
|---|---|---|---|
| 1 | Appointment page: action bar with a patient-specific recommended action | Feature | REAL |
| 2 | Telehealth offered only when the doctor's department allows it | Rule fix | REAL |
| 3 | Rescheduling to a real open session, same doctor or a colleague in the department | Feature | REAL |
| 4 | Ask-first rescheduling conversation (state machine) with staff approval before booking | Feature | REAL (simulated channel) |
| 5 | 24-hour no-reply flag, staff attention banner, bell notifications | Feature | REAL |
| 6 | Outreach Hub redesigned as patient threads with search and a chat view | UI | REAL |
| 7 | Booking-history card on the appointment page | UI + API | REAL |
| 8 | ROI page fixes (duplicate currency prefix, KPI cards, 1-unit sliders) | Bug fixes | REAL |
| 9 | Prediction Hub empty-row layout fix | Bug fix | REAL |
| 10 | What-If Studio: typeable date, slider levers, highlighted comparison | UI | REAL |
| 11 | Model Hub KPI cards with tone, icons and tag pills | UI | REAL |
| 12 | Collapsible icon-only sidebar, smaller centred logo, compact theme toggle | UI | REAL |

## 2. Recommended action on the appointment page (update 1)

- **Where:** `frontend/lib/recommend-action.ts`, `frontend/components/appointment-action-bar.tsx`, `frontend/components/appointment-action-card.tsx`.
- **Method:** a rule-based ranking, not a trained policy. Inputs are the stored calibrated risk, the tier, and the positive SHAP drivers of that appointment. Candidate actions: phone call, SMS reminder, offer a new slot, offer telehealth, standard protocol.
- **Rules (examples):** prior no-shows among the top drivers raise the call action; a long booking lead time raises the new-slot action; a large travel distance raises telehealth, only if the department allows it; a low risk with a reminder already sent selects the standard protocol.
- **Result:** the recommended action differs between patients, and its explanation names that patient's own top drivers. This answers the review point that "the best action must change patient to patient".
- **Thesis wording:** describe it as a transparent heuristic layer on top of the calibrated model, not as a learned intervention model.

## 3. Telehealth rule (update 2)

- **Finding:** two rules existed and disagreed: the per-department `telehealth_ok` setting in the database, and a hard-coded specialty keyword list in `outreach_drafter.py`.
- **Change:** the department setting is now the single rule. It governs the action bar, the AI reminder drafts and the chat simulator. The keyword list remains only as a fallback when no setting is known (`is_telehealth_eligible(department, telehealth_ok)`).
- **Also removed:** a fabricated video-room link in the simulator. A link is built only when `TELEHEALTH_BASE_URL` is configured; otherwise the message says the team will send it.

## 4. Real rescheduling (update 3)

- **Finding:** the earlier simulator offered a fixed "Saturday 10:00 AM" slot and changed nothing in the database.
- **Model of a slot:** a doctor's clinic session on a date, with a capacity (`max_patients`) and a token queue.
- **Service:** `backend/app/services/rescheduling.py`.
  - `find_options` lists open sessions of the same department over 28 days, soonest first, with the same doctor listed before colleagues on the same day. It excludes full sessions, sessions already finished today and the current booking.
  - `reschedule_booking` re-checks capacity under a row lock on the session, rejects duplicate bookings and wrong weekdays, creates a new appointment linked through `rescheduled_from_id`, cancels the old one (which frees its place for the waitlist), writes `appointment_events` for both, and re-scores the new appointment because lead time changed.
- **Endpoints:** `GET /appointments/{id}/reschedule-options`, `POST /appointments/{id}/reschedule` (optional patient message in one transaction), `GET /appointments/{id}/history`.
- **Limit:** moves stay within one department.

## 5. Ask-first conversation with staff approval (update 4)

**Design decision (from the review):** for high-risk patients the system asks the patient before offering anything, and a person approves the final booking.

**Engine:** `backend/app/services/reschedule_flow.py`. Table `reschedule_conversations`; each message is an `interventions` row linked by `conversation_id`.

State machine:

```
awaiting_reply --1/yes--> kept
awaiting_reply --2/change/date--> offering | choosing_doctor | needs_staff
offering --1/yes--> pending_approval
offering --2/no--> next slot (same doctor, up to 2 declines) then colleague list
choosing_doctor --n--> pending_approval ;  --0--> needs_staff
pending_approval --staff approve--> booked ;  --staff decline--> needs_staff
any waiting state --24 h silence--> no_reply
unclear reply x3 --> needs_staff
```

**Slot search order:** same doctor on the requested date; otherwise up to three colleagues on that date; otherwise the nearest later date, same doctor first; otherwise hand to staff. Requested dates are parsed from "tomorrow", weekday names, "10 Oct", ISO dates and "next week".

**Approval:** the patient's agreement stops at `pending_approval`. Front desk, manager and admin (and platform owner) can approve; analysts are read-only. On approval the engine re-checks the slot. If it was taken meanwhile, the patient is offered the next option instead of failing. On success it books, sends the confirmation with the token, and stores the approver in `approved_by`. A setting (`RESCHEDULE_REQUIRE_APPROVAL=false`) turns approval off for hospitals that want fully automatic booking.

**Staff control at every step:** take over (automation pauses), resume, send a message, or book manually from the same slot picker.

**Languages:** all patient messages exist in English, Sinhala and Tamil. The Sinhala and Tamil wording was written during development and has not been reviewed by a native speaker.

**Single entry point:** `POST /outreach/conversations/{id}/incoming`. Today the simulator calls it. A WhatsApp or SMS webhook would call the same function.

## 6. Attention banner and notifications (update 5)

- **24-hour limit:** each outbound question sets a deadline. When it passes, the conversation becomes `no_reply`. There is no scheduler; this is evaluated whenever the banner, hub or notifications are read (`expire_stale`).
- **Banner:** `frontend/components/attention-banner.tsx`, shown under the header on every page. It shows counts for awaiting approval, needs a call, no reply in 24 h and in progress, and expands into a patient list.
- **Notifications:** three new types (`approval`, `needs_staff`, `no_reply`) added to `/notifications`, each linking to the patient's conversation.

## 7. Outreach Hub (update 6)

- Replaces the flat message log with one row per patient (`GET /outreach/threads`), searchable by name, phone, UHID and message text, with filters for all, needs you, approval, in progress and booked.
- Right pane: WhatsApp-style chat with slot cards inside bubbles, an approval bar, take over / resume, manual booking, and a "test as patient" switch for demonstrations.
- The earlier single-message simulator remains behind a toggle.

## 8. Booking history (update 7)

A card shows the full chain of moves of a booking (original, each move, latest) with doctor, date, time and token. It takes the place of the SHAP card while a chain exists; SHAP moves below at full width.

## 9. Bug fixes and UI updates (updates 8 to 12)

- **ROI:** removed the doubled "LKR" (the formatter already adds it); the four annual figures became coloured KPI cards; all five sliders step by 1 (1 %, LKR 1, 0.01x, 1 day) within backend limits (window 14 to 730 days).
- **Prediction Hub:** the empty first row was caused by `justify-between` in stretched grid cards; cards now keep their own height with the patient list at the top.
- **What-If Studio:** typeable date with automatic dashes plus a calendar picker; cost, overbooking cap and fee as sliders with number boxes starting from saved settings; the "saved policy vs what-if" card is highlighted.
- **Model Hub:** nine KPI cards with tone, icon and tag pills.
- **Sidebar:** collapsible icon-only rail with animated width, remembered between visits; smaller centred logo; compact theme toggle.

## 10. Data model and API changes

| Change | Detail |
|---|---|
| Migration `a7b8c9d0e1f2` | `interventions.offer` (JSONB), `interventions.message_text` |
| Migration `b8c9d0e1f2a3` | table `reschedule_conversations`; `interventions.conversation_id` |
| New endpoints | `/appointments/{id}/reschedule-options`, `/reschedule`, `/history`, `/conversation`; `/outreach/threads`, `/threads/{patient_id}`, `/attention`; `/outreach/conversations` (start, `incoming`, `staff-message`, `approve`, `reject`, `take-over`, `resume`, `book`) |
| Changed | `/outreach/simulate-agent` now routes rescheduling through the conversation engine; `/notifications` adds three types |

## 11. Evidence

- **Backend tests:** 212 passed at the last full run. New file `backend/tests/test_reschedule.py` covers same-doctor and cross-doctor moves, department restriction, capacity and duplicate rules, ask-first flow, approval, decline, take-over, manual booking, the 24-hour flag, history chain and the telehealth rule. After the approver-role change only the reschedule tests were re-run (12 passed).
- **Frontend:** 31 unit tests pass; `tsc` and `eslint` report no errors.
- **Not covered by automated tests:** the visual layouts and animations, and the front-end role gating.

## 12. Limitations to state in the thesis

1. **No real messaging channel.** There is no SMS or WhatsApp gateway. "Sent" means the text is logged to the outreach history and the reminder flag is set. Patient replies come from the simulator; a provider webhook would call the existing `incoming` endpoint.
2. **All data remain synthetic**, and the recommendation layer and conversation engine have not been evaluated on real patient behaviour.
3. **The 24-hour flag is evaluated on read**, not by a background job.
4. **Reply understanding is rule-based** (numbers, keywords, date patterns), not a language model.
5. **Moves are limited to the same department.**
6. **Sinhala and Tamil message text** needs native-speaker review.
7. The unscoped-endpoint and role findings in `THESIS_FACTS.md` section 18 were not addressed here. The new endpoints do filter by hospital.
8. **Forecast interval is a sampling range only.** The 80% range is an exact Poisson-binomial interval over the stored risk scores. It assumes the scores are calibrated and patients act independently, so it excludes model error and shared shocks (weather, outbreaks) and is narrower than real day-to-day variation. The Forecast page previously showed a made-up ±2 band; it now shows the computed range for the whole window.
9. **Risk scores above about 60% are thinly supported.** About 230 of roughly 69,000 scored appointments score above 0.5, and observed no-show rates there are about 45-50% (the highest raw score, 0.95, was seen in only 3 outcomes). The UI now displays "60%+" instead of the raw figure; stored scores and expected-count maths are unchanged.
10. **Cost of an overflow patient (LKR 10,000, 4× the fee) is an assumption**, not a measured figure. The earlier facts report used LKR 2,000. Overbooking advice depends on it, so report results with a sensitivity range.
11. **Revenue from filling free seats** (Capacity Overview) is not a no-show effect; it is fee × extra patients expected to be seen from free seats plus any overbooking, so it can be non-zero when the overbook count is +0.
12. **Cancelled appointments are now excluded** from the dashboard 7-day figures and from the register's upcoming, high-risk and pending-outcome views. Before, they inflated the dashboard counts (366 vs 350 on the Forecast page) and Pending Outcome.
