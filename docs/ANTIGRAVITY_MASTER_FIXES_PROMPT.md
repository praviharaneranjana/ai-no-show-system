# SHAI Master Fix & Build List: Antigravity prompt

Everything below the line is the prompt to paste into Antigravity. It consolidates my full hands-on test of the app, page by page, into one prioritised plan. It supersedes nothing in the earlier prompts; where one already covers a topic (`ANTIGRAVITY_HOSPITAL_ROLES_PROMPT.md`, `ANTIGRAVITY_CAPACITY_PROMPT.md`, `ANTIGRAVITY_PREDICTION_HUB_PROMPT.md`, `ANTIGRAVITY_INTAKE_REDESIGN_PROMPT.md`, `CAPACITY_V2.md`, `MODEL_FEEDBACK_LOOP_PLAN.md`) read it and build on it instead of duplicating.

---

## ROLE AND GROUND RULES

You are working in the existing full-stack repo **SHAI**, a hospital appointment no-show prediction system.
- Backend: FastAPI + SQLAlchemy + Alembic in `backend/app/`. Frontend: Next.js (App Router) + Tailwind + Recharts in `frontend/`, Electron wrapper in `frontend/electron/`.
- Currency is LKR. Time zone is **Asia/Colombo** (never use UTC `toISOString()` for "today").
- Read the repo first. Match the existing code style, comment density, naming and theme tokens (dark and light). Do not add a new UI library if an existing component does the job.
- **Nothing hard-coded or mocked.** Every figure, name, list, hospital detail, role and permission comes from the database through the API. Everything is backend connected and database connected, with Alembic migrations (plus backfill), Pydantic schemas, endpoints, types in `frontend/lib/types.ts`, client functions in `frontend/lib/api.ts`, and tests.
- Fix root causes. Several symptoms below (pages "Could not reach the backend", filters that do nothing, empty charts) likely share a cause. Find it before patching individual screens.
- Plain language everywhere (see item P3).

### STOP GATE (mandatory)

**Do NOT write any implementation code until I approve a UI design.**
1. Read the code. List the files you inspected and your diagnosis of the root causes in Phase 0.
2. Produce a **UI design Artifact** (HTML mockups with realistic Sri Lankan sample data) listing **every screen and component you will build or change**, using the screen list in section 5. Show dark and light mode, desktop and phone width, and show each screen once per role where the role changes what is visible.
3. Add a short written plan: DB tables and migrations, endpoints, permission matrix, build order, risks.
4. All product decisions are already made (section 6). **Do not ask me questions about them.** If something is genuinely not covered, state your assumption in the plan and continue.
5. Stop and ask me to approve or change the design. Start building only after I say "approved".

---

## 1. PRIORITISED BUILD ORDER

Build in this order. Each phase must leave the app working and tested before the next starts.

### Phase 0: Stability (everything depends on it)
**P0-1. Backend unreachable / pages will not load.** Dashboard, Appointments and Analytics show "Can't load this page: Could not reach the backend API". Find out why (backend not running, wrong `BACKEND_API_URL`, session or auth failure, a failing endpoint) and fix it. Give a clear, accurate error state that distinguishes "backend down" from "session expired" from "no data".
**P0-2. The three Next.js overlay errors.** All three are `NEXT_REDIRECT` console errors from `frontend/lib/api.ts` (`apiFetch`, the line `if (res.status === 401) redirect("/login?reason=session_expired")`). They come from server components (`SimulatorPage` via `fetchExpenseDataAction`, and `PredictionHubPage` twice). Fix so a 401 redirect is handled cleanly and does not surface as an error, and find out why the session is being rejected (expiry, token handling, cookie, backend restart). Also check the "Next.js 16.3.1 (stale)" warning.
**P0-3. Slow navigation.** Moving between screens is too slow. Profile it (blocking server fetches, dev-mode Turbopack, no loading states, no prefetch, large bundles). Add `loading.tsx` skeletons, parallelise fetches, cache what is safe to cache, and make transitions and animations snappy.
**P0-4. Shared KPI card component.** KPI cards on Capacity (Overview, Forecast, Predicted vs Actual) and Analytics have tags, fields and values overlapping or overflowing, and a literal `undefined` appears in text. Build one responsive, aligned KPI card component and use it everywhere. Fix the `undefined` data bug at its source.

### Phase 1: Hospitals, accounts and roles (foundation for everything after)
Read `docs/ANTIGRAVITY_HOSPITAL_ROLES_PROMPT.md` and build on it.
**P1-1. Multi-hospital data model.** A `hospitals` table; users linked to a hospital; every tenant-owned table scoped by `hospital_id` (patients, appointments, doctors, departments, sessions, predictions, capacity settings, waitlist, expenses, outreach, ROI baseline). Remove hard-coded hospital constants. Tests proving hospital A can never read or write hospital B data.
**P1-2. Hospital identified by work email.** The **platform owner** creates hospitals and registers their email domains in a platform-admin screen (hospital name, logo, location, domains, first admin). A person's work email domain decides their hospital. Sign-up is refused for unregistered domains. No hospital self-registration.
**P1-3. Registration, verification and approval.**
- Sign-up with work email.
- Email verification step.
- After verification the account is **"Approval pending"**: the user sees an approval-pending screen and no hospital data until their **hospital administrator** approves them and assigns a role.
- An approval queue screen for the hospital admin, with approve, reject, role assignment and an audit log.
- Only the first admin of each hospital is approved by the platform owner (see P1-2).
**P1-4. Role-based access, from the database.** Roles: `front_desk`, `manager`, `analyst`, `admin`, plus a platform-owner role. Manager and analyst are separate roles in the database with identical access for now, so permissions can diverge later.
- **Front desk:** does not see Analytics or the ROI Simulator (hidden in the sidebar and blocked on the backend).
- **Manager and analyst:** see Analytics and the ROI Simulator.
- Roles and permissions live in the database, not hard-coded in the frontend. The frontend reads role and permissions from `GET /auth/me`.
**P1-5. Seed real users.** Create **two hospitals**, each with its own email domain. For each hospital create one **front desk** user and one **manager/analyst** user: four real accounts, created through the same flow as everyone else (verified email, approved by the hospital, correct hospital and role), not placeholders. Give me the credentials after seeding, and use them to demonstrate data isolation between the hospitals.
**P1-6. Hospital identity in the UI.**
- A hospital tab in the sidebar near the Risk Model card showing hospital name, location and logo.
- Clicking it opens a **Hospital Profile page** with the hospital's details and financial summary, including how much money it has recovered through SHAI and how much it avoids losing, from real data.
- The hospital name or tag is shown on the ROI Simulator, Analytics and other relevant screens.
- Hospital name and logo are editable (by permitted roles) and come from the database.

### Phase 2: Appointment flow (the core product path)
**P2-1. New Appointment intake, step 2 (Location).**
- The City/Town dropdown (16,450 Sri Lankan locations) returns "No matches found" for "kandy" and "Colombo". Fix the search so it is searchable and matches correctly.
- Selecting a town auto-fills the town name and district, **auto-calculates the distance**, and shows a **map** (the map currently does not show).
**P2-2. Step 3 (Clinical and scheduling).** The Clinical Department dropdown renders empty, "No doctors available for this department" appears, and Continue is disabled. Fix department and doctor loading. Selecting a department such as Cardiology or ENT must list its doctors.
**P2-3. Step 4 (Booking and review) and "Clinic session ID is required".** Confirming a booking fails with this error. The Morning/Afternoon/Evening cards are clinic sessions and each needs a session ID. Find out why it is missing (likely empty doctor or department lists, or the session not being created for the doctor/date/slot) and fix it. Test the whole flow end to end: payment options (cash, card, hospital counter), the heavy-rain/monsoon warning, the SMS reminder option, and the live attendance-intelligence preview.
**P2-4. Appointment number.** Generate automatically at creation: the next number within that doctor's session (doctor + date + Morning/Afternoon/Evening). Backfill existing appointments. Show it in the Appointments list and the detail view.
**P2-5. Appointments detail, outcome updates.** Marking a patient **Attended** or **No-show** does not update the calibrated risk and the SHAP attribute drivers on the page. They must update live without a manual refresh. Decision: **recompute live.** After the outcome is saved, the patient's risk and SHAP drivers refresh on the page immediately, and the outcome also feeds the model feedback loop (`MODEL_FEEDBACK_LOOP_PLAN.md`). Build on the M9 outcome-reconciliation work.

### Phase 3: Prediction Hub
**P3-1. Real data.** The hub shows 0 appointments for today. Make the simulated HIS sync produce believable daily volumes so the hub, Appointments and Analytics have real data. The Sync button must work.
**P3-2. Layout.** The Run Predictions button must sit at the right edge of its card.
**P3-3. Patient pop-up.** Opens as a side panel today; make it a **centred modal**. It must connect to the shared outreach composer (P4-1) so I can message the patient from it.
**P3-4. Risk filters.** High/Medium/Low do not update the doctor cards. Make them filter the patients (and card totals) shown.
**P3-5. Run Predictions.** It is unclear what it does and it hangs on "Batch scoring in progress, 0 of 1 evaluated, 0%". Debug the batch runner, then redesign as a **customisation pop-up**: choose date range, department, doctor, session slot, and re-score all vs only unscored. Show real progress, then show results: scores, a summary and the charts that come from them.

### Phase 4: Outreach and messaging
**P4-1. One shared message composer, two entry points.**
- From the Analytics worklist, the Outreach Hub button must navigate to the Outreach Hub **and open the composer for that patient** (today nothing opens). Pass the patient through navigation.
- From the **header message icon**, open the same composer from anywhere in the app with a **patient picker** (high-risk patients) and filters for department, doctor and session slot (and date).
- The composer loads the patient's name, phone, language, appointment (doctor, department, date, slot, appointment number) and **why we are reaching out**: risk score and top drivers in plain language.
- Message templates per scenario (are you coming, reminder, reschedule offer, telehealth offer, weather or transport notice), **AI drafting with Gemini** (build on `backend/app/outreach_drafter.py`), editable before sending, Sinhala, Tamil and English.
- Send by **WhatsApp or SMS**, **one patient at a time** (no bulk send), logged and visible in the Outreach Hub conversation view. Build on the existing simulated/mock sending layer behind an interface so a real provider can be dropped in later. I have no credentials now; use Gemini for drafting only if a key is already configured, otherwise fall back to template drafts.
- Role access: front desk needs the composer even without Analytics access.

### Phase 5: Analytics
**P5-1.** KPI cards use the shared component (P0-4); show the hospital name; show the observed no-show rate.
**P5-2.** Move the "Model Calibration & Decision Benchmark" card to the **bottom**, below the Outreach Resolution Hub card, in plain language.
**P5-3.** Priority outreach worklist: add a **search bar**, page size of 10, numbered pagination, and keep its Outreach Hub button (P4-1).
**P5-4.** Department-level risk exposure currently links to the Outreach Hub for no clear reason. Link it somewhere relevant (Appointments or Prediction Hub filtered to that department).
**P5-5.** Add a **no-show rate by department** bar chart and make the page actionable, with each bar leading to an action (the filtered Appointments or Prediction Hub view).

### Phase 6: Capacity (read `ANTIGRAVITY_CAPACITY_PROMPT.md` and `CAPACITY_V2.md` first)
**P6-1. Overview.** KPI cards fixed (P0-4), including the "61 sessions active", "undefined booked capacity" and "position binomial sum" labels. Enlarge the doctor-card donut charts and fix the overlapping "5% booked" text. Slot heat map shows almost nothing: fix the empty state, colouring and data.
**P6-2. What-If Studio.**
- Remove it from the header navigation; add a **floating round button, fixed at the bottom-right** of every capacity screen, that opens it.
- Animate and align the department and consultant dropdowns (icons are misaligned).
- **The controls do nothing.** Base wait tolerance, safety factor and assumed doctor delay (10, 20, 50 minutes) change neither the "current settings" nor the "what-if scenario" panels, and the revenue vs overcrowding **trade-off curve is empty**. Everything must update live as inputs change.
- Saved scenarios: only the safety factor seems saved/loaded. Save and load every parameter.
- Waitlist autofill only says "all slots are filled". Add the details: candidates, slots, reasoning.
**P6-3. Forecast.** The 7/14/30 day filters and the department filters change nothing. Both must drive the KPI cards and charts.
**P6-4. Predicted vs Actual.** The 14/30/90 day filters change nothing; "Predicted vs actual daily outcomes" and "Brier score by clinical specialty" charts are empty; the confusion matrix is hard to read; check the calibration curve; redesign KPI cards.
**P6-5. Settings.** Live impact preview works; verify that per-department settings save and persist, and that edited tolerances are remembered separately for each department.

### Phase 7: ROI Simulator
**P7-1.** Verified working: baseline edits, expenses (add, save, remove across all categories). Re-test after the multi-hospital change; baseline and expenses become per-hospital.
**P7-2.** Hospital name and logo editable in the header card (links to P1-6).
**P7-3.** Slider ranges must support large hospitals: Daily Consultant Sessions up to about 150, and review the other ranges.
**P7-4.** The "Add Expense Item" button in the Hospital Expenses card is squeezed and overlaps the title; fix alignment.
**P7-5.** The waterfall says "All 0 active expenses" while still deducting LKR 1.80M; find and fix the mismatch.
**P7-6.** Add a **financial waterfall** chart near the top (reclaimed revenue, call-centre savings, expenses, net EBITDA), updating live as sliders and expenses change. Use the `dataviz` skill.

### Phase 8: Login and branding
**P8-1.** Make the SHAI logo smaller in the right-hand sign-in panel and in the sidebar, and align the sidebar logo perfectly.
**P8-2.** Animate the existing centre SHAI wordmark on the login hero (no separate elements): each letter shape animates, with emphasis on the purple shape inside the "S". Implement as SVG/CSS animation of the existing logo (generated assets such as Nano Banana are acceptable if I approve the output).

### Phase 9: Plain-language content across the whole system
Managers and analysts do not know terms like "binomial", "80% confidence band", "what-if" or "calibration". Write clear, non-technical copy for every metric, chart and tool on every page: short descriptions, tooltips or info popovers explaining what it means and how to read it. Do this page by page as part of each phase above, and finish with a sweep of the whole app. Put the copy in one place (a content module), not scattered.

---

## 2. CROSS-CUTTING REQUIREMENTS
- Respect roles on every new screen and endpoint (P1-4).
- Everything scoped to the signed-in user's hospital (P1-1).
- Dark and light mode, desktop and phone width, no overlapping text, no `undefined`, proper empty, loading and error states.
- Tests for every backend change and for the permission matrix. Run the existing test suites and report failures honestly.
- Do not commit; I will review first.

## 3. DEFINITION OF DONE
I can sign in as each of the four seeded users and see the correct hospital, sidebar and data; book an appointment end to end with an appointment number; mark outcomes and watch risk update; run a customised prediction; send a message from the Analytics worklist, the header icon and the Prediction Hub modal; use every filter on Capacity and see results change; and read every screen without needing to know the data science.

## 4. NOTHING IS OUT OF SCOPE
If you notice another bug while working, list it in your report rather than ignoring it.

## 5. SCREENS AND COMPONENTS TO SHOW IN THE DESIGN ARTIFACT
1. Login (smaller logos, animated hero wordmark) and Sign-up, Email verification, Approval-pending screens.
2. Approval queue and Staff and Access management.
3. Sidebar with hospital tab; Hospital Profile page (by role).
4. Shared KPI card component (all states).
5. New Appointment intake: all four steps (searchable town dropdown with auto-fill, distance and map; department/doctor/slot; booking review and payment); appointment number display.
6. Appointments list and detail (appointment number, live risk/SHAP update after outcome).
7. Prediction Hub (right-aligned Run button, centred patient modal, working filters, Run Predictions customisation pop-up, progress and results).
8. Shared outreach composer modal (both entry points, patient picker with filters, templates, AI draft, WhatsApp/SMS send) and the Outreach Hub.
9. Analytics (reordered, searchable paginated worklist, new chart, hospital tag).
10. Capacity: Overview, What-If Studio (floating button, live outputs, trade-off curve), Waitlist, Forecast, Predicted vs Actual, Settings.
11. ROI Simulator (hospital header, top chart, fixed expense button, larger ranges).
12. A sample of the plain-language copy (tooltips and info popovers) for each page.

## 6. DECISIONS ALREADY MADE (do not ask me about these)
1. **Account approval:** the hospital's own administrator approves its staff. The platform owner approves only each hospital's first admin.
2. **Hospital registration:** created by the platform owner, who registers the hospital and its email domains. No self-registration.
3. **Roles:** `front_desk`, `manager`, `analyst`, `admin`, platform owner. Manager and analyst are separate roles with the same access for now.
4. **Outcome marking:** recompute risk and SHAP live on the page, and feed the outcome into the model feedback loop.
5. **Outreach:** one patient at a time; simulated sending layer behind an interface; Gemini for drafting only if a key is already configured.
6. **Worklist page size:** 10.
7. **Charts:** ROI Simulator gets a financial waterfall; Analytics gets no-show rate by department.
