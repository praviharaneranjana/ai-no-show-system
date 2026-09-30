# Prompt for Antigravity — Design and build the SHAI dashboard (every screen)

> Copy everything below the line into Antigravity. Ask it to show a **UI design artifact for every screen first** (light + dark) and wait for approval before changing code.

---

## 0. Role and ground rules

You are a senior product designer and front-end engineer. Redesign the **SHAI** frontend in `frontend/` (Next.js 16 App Router, React 19, Tailwind v4, shadcn/ui on `@base-ui/react`, lucide-react; add `recharts`, `motion` and `maplibre-gl`).

**Read before you design:** `docs/SYSTEM_OVERVIEW.md` (architecture, every route, every endpoint), `frontend/AGENTS.md` and `frontend/CLAUDE.md` (this Next.js version has breaking changes — read `node_modules/next/dist/docs` before using APIs you are unsure about).

**Hard constraints**
- Do NOT change the backend, `lib/api.ts` contracts, auth (`proxy.ts`, server actions in `app/login`), or the Electron shell (`frontend/electron`). Visual and layout work only, plus the new Journey Map feature.
- Keep every existing feature working. Keep `npm test`, `npm run lint` and `npm run build` green; update tests only where markup changed.
- The browser never calls the backend; all data comes through Server Components and Server Actions. Keep it that way.
- The app also runs inside Electron at about **1280×800**. Every screen must look excellent at that size, on tablet, and on mobile.
- Work in small commits on the current branch.

**Honesty rules (this is a final-year thesis project; examiners will read the UI)**
- The data is **synthetic** (Sri Lanka-shaped). Show a small, unobtrusive "Synthetic data · simulation" chip in the sidebar promo card or footer, not in every card.
- NEVER show a headline "accuracy %". The model's real metrics are: **ROC-AUC 0.672, PR-AUC 0.266, Brier 0.124, lift@top-20% 1.8×**, base no-show rate **15.9%**, simulation ceiling (oracle AUC) **0.77**. Where you show model quality, show AUC and lift, and label the score "calibrated risk".
- Money is **LKR** ("Rs."), never `$`. Dates and numbers use Sri Lankan conventions (`en-LK`).
- No lorem ipsum and no invented patients. Use API data. If a card has no data, show a proper empty state. Mock data only behind a clearly named `mock*` helper, never in production paths.

## 1. Visual direction (references: Dropify, Peymen, and the "Bento Dashboard Preview" mockup)

**Shell.** Soft lavender/grey page background. One large floating white container (radius 28–32px, diffuse shadow, margin around it). Inside: slim left sidebar + main area on a slightly tinted surface (`#F7F7F8` / `#F1F4FF`) so white cards stand out.

**Cards.** Bento grid (CSS grid, 12 columns, mixed spans). Radius 20–24px, no hard borders, very soft shadow or tinted fill, 20–24px padding, 16–20px gaps. Card header: bold title left, "View more ›" or small pill tabs (Day / Week / Month) right. Hover: lift 2px.

**Typography.** Inter or Manrope. Big bold numbers (32–40px) with small muted labels; tiny delta chips (↑25%, ↓12%).

**Palette (CSS variables in `globals.css`, with dark-mode equivalents).**
- Primary gradient violet → indigo `#8B7CF6 → #5B7CFA`; text/dark-icon near-black `#1A1A1F`; soft greys.
- Risk semantics (always with text, never colour alone): High = red on tinted red, Medium = amber on tinted amber, Low = green on tinted green.
- Dark mode: deep navy/charcoal with the same card-on-surface layering, same primary accent.

**Motion** (CSS or `motion`; respect `prefers-reduced-motion`): cards fade+rise 8–12px with ~40ms stagger; numbers count up (~600ms); bars/rings/sparklines animate from 0; chart lines draw in (stroke-dashoffset); sidebar active pill slides between items (shared `layoutId`); button press scale 0.98; short route fade. No looping or heavy animation.

## 2. Reusable components to build (extend existing `components/ui/card.tsx`, don't fork it)

`StatCard` (dark round icon, big number, delta chip, mini bar/sparkline) · `Sparkline` · `RingProgress` (centre number) · `DotRingGauge` (segmented dot ring for risk %) · `PillTabs` · `ChipDelta` · `AvatarRow` (avatar + name + meta + risk pill + round action button) · `RiskPill` (text + colour + icon) · `ShapDriverBars` (compact horizontal ± bars) · `SkeletonCard` (shimmer) · `EmptyState` · `ErrorCard` (reuse `backend-unreachable.tsx` copy) · `SectionHeader` · `ThemePill` (Light | Dark segmented pill, replaces the dropdown).

Charts: `recharts` for area/line/bar (smooth area with a single highlighted point + vertical drop-line for the trend). Ring and dot-ring stay as small SVG components.

## 3. Shell (all authenticated screens)

**Sidebar** (collapses to icons on tablet, drawer on mobile)
- Top: hexagon/rounded-square logo + "SHAI" + tiny "HOSPITAL INTELLIGENCE".
- Nav with lucide icons: **Dashboard, Appointments, Capacity, Outreach Hub, ROI Simulator, Analytics**. Active = filled primary pill, white text, chevron. Badges: Capacity = waitlist count, Outreach = pending conversations (real counts from the API; hide the badge at 0).
- Promo card at the bottom: "Risk model · shai-lk-synth-v1", AUC, "Active" dot, and the synthetic-data chip.
- Profile block: avatar with green online dot, **real logged-in name**, role and branch (e.g. "Front Desk · Colombo"); sign-out icon. Below: `ThemePill`.

**Header** (every page): left "Welcome back, {first name}!" + muted live subline (e.g. "12 high-risk appointments today"); right: circular icon buttons — notifications (red dot when there are high-risk unactioned items), search (command-palette style, searches patients/appointments), messages (→ Outreach) — and the gradient pill CTA **New appointment** (→ `/new`). On inner pages the title/subline change to the page's meaning.

## 4. Every screen (design all of them, light and dark)

For each screen: layout, cards, states (loading skeleton, empty, error, populated), responsive behaviour, and which existing component/data it uses.

### 4.1 Login — `/login`
Split layout: left = brand panel with the hospital-network background (`public/hospital-network-bg.svg`), product name, one-line value proposition, 3 tiny proof points (risk triage · capacity · outreach). Right = white card: email, password with show/hide, submit. States: invalid credentials, locked out (with countdown/message), inactive account, server error, inactivity-logout notice, and the forced-change-password branch. Keep the `?redirect=` behaviour. No bento here, but the same palette, radius and motion.

### 4.2 Desktop first-run setup — `/setup`
Centered card: "Connect to your SHAI server", host:port field, optional API key, "Test connection" (calls `/health`, show success/failure/timeout states with icons), Save. Show a short explainer of what the server is. Electron-friendly (no scrolling at 1280×800).

### 4.3 Dashboard (Command Center) — `/`
- **Row 1, three stat cards:** Today's appointments (+ delta, sparkline) · Predicted no-shows (count and % of upcoming) · Revenue at risk in LKR (from the ROI logic/defaults). Real data: appointments list + predictions.
- **Row 2:**
  - **Priority Worklist** (wide): upcoming High (then Medium) risk patients, `AvatarRow` with department, time, risk pill, and call / SMS icon buttons; "Showing top N of M", "View all ›". Reuse `priority-worklist.tsx` logic. Clicking a row selects it for the next card.
  - **Patient triage card** (centre): the selected appointment — chips for age, prior no-shows, lead time; `DotRingGauge` with the calibrated risk % and tier; top 3 SHAP drivers as `ShapDriverBars`; recommended action text. Reuse `risk-gauge.tsx`, `contribution-list.tsx`.
  - **Patient Journey Map** (tall, see §5).
- **Row 3:** No-show trend (area chart, Day/Week/Month tabs, observed no-show rate from recorded outcomes) · Capacity ring (today's utilisation, slots, waitlist buffer) · Outreach status mini-feed (latest interventions with channel icon, language badge, status).
- **Below the bento:** the full **Appointments table** as a card — tabs (All / High risk / Today / Pending outcome), department and risk filters, search, sort, relative dates, risk pills. Keep all current behaviour; make it pleasant on narrow screens (row → stacked card).
- **Consultant punctuality strip** (delay badges per doctor) sits under the header as a slim card.

### 4.4 Appointments list
The table from 4.3 may also live at `/appointments` if you want a dedicated full-height view; if you add it, keep one shared component. Include bulk-friendly density toggle (comfortable / compact).

### 4.5 Appointment detail — `/appointments/[id]`
Bento: **Risk hero** (large `DotRingGauge`, tier pill, recommendation, model version) · **SHAP drivers** (full tornado/bars of the top 6, labelled in plain language — see §6) · **Patient profile** (age, gender, conditions as chips, city, distance) · **Logistics** (doctor, time, queue number, channel, payment, AI action status) · **Journey map** (§5) · **Outreach history** for this appointment · **Outcome actions** (Mark attended / Mark no-show — only after the appointment date and only if no outcome yet; confirm state + toast). Breadcrumb back to the list.

### 4.6 New appointment — `/new`
Two-section form card(s): (1) Patient (name, DOB, gender, phone, email, city, distance km, conditions) (2) Appointment (department, doctor, date, time, channel, payment, SMS reminder). One submit creates patient → appointment → prediction and shows the result **inline on the right** (risk ring, tier, top drivers, recommendation) with a link to the detail page. Validation states, pending state on the button, and a friendly error card. Keep the Server Action and field names.

### 4.7 Capacity — `/capacity`
- Stat row: total capacity, booked, predicted no-shows, recommended overbooks, revenue recovery (LKR).
- **Session cards** (one per doctor session): doctor, specialty, room, start time, status pill (on time / delayed / in progress / completed), utilisation `RingProgress`, recommendation text, wait-time impact, risk level (Safe / Moderate / Caution). **Doctor delay editor** as a popover/inline stepper (minutes → status).
- **Waitlist backfill** card: rows with urgency pills (High / Normal / Routine), preferred days, "Offer slot" button with offered/accepted/expired states.
- Optional compact bar chart of overbook recommendations per session.

### 4.8 Outreach Hub — `/outreach`
- Status summary chips (confirmed / rescheduled / telehealth / pending) with counts.
- **Conversation log**: channel icon (WhatsApp / SMS / IVR), language badge (EN / SI / TA), patient, intent detected, status, offered slot; click opens a chat-style transcript drawer.
- **Live agent simulator** card: pick an appointment, pick language, type a message or tap a quick-reply chip (5 per language), show the agent reply bubble, detected intent, and action taken as a timeline. Make it feel like a WhatsApp conversation. Make it clear this is a **simulated, rule-based agent** (small label).

### 4.9 ROI Simulator — `/simulator`
Boardroom view. Left: slider card (clinics/day, consultation fee, baseline no-show rate, AI coverage, reachability, reschedule success; "Advanced" toggle for overbooking fill). Right: big result cards — annual leakage, annual recovered revenue (LKR, count-up), doctor hours recovered, nurse phone hours saved, **ROI multiple** as a hero number, with a small comparison bar (leakage vs recovered vs system cost). Instant client-side updates. Add a "Assumptions" collapsible that lists the constants used, so examiners see the model is an assumption, not a measurement.

### 4.10 Analytics — `/analytics`
Bento: totals (appointments, unpredicted), observed no-show rate ("—" until outcomes exist), attended vs no-show donut, predicted risk distribution (Low/Medium/High bars), **department risk exposure** (horizontal bars), no-show trend, upcoming high-risk outreach list. Optional: a "Model quality" card with AUC, lift@20%, base rate, and a small calibration-style note ("Top 20% of bookings contain ~36% of no-shows" — from `backend/models/shai_bundle/metrics.json`: recall@top20 = 0.363).

### 4.11 System states
Backend unreachable / 500 / 401 / 404 / empty database: polished full-page and in-card states (reuse the troubleshooting checklist copy in `backend-unreachable.tsx`, link to `/setup` on desktop). Global loading skeleton for route transitions. A toast system for actions (outcome recorded, slot offered, appointment created).

## 5. NEW feature — Patient Journey Map (distance → risk)

- Use **MapLibre GL** (`maplibre-gl`, no API key) with a light, minimal basemap (Carto Positron style) in the look of the Dropify map: pale grey roads, one purple route line, dark circular pin with label.
- Hospital location from `NEXT_PUBLIC_HOSPITAL_LAT` / `NEXT_PUBLIC_HOSPITAL_LNG` / `NEXT_PUBLIC_HOSPITAL_NAME`, defaulting to a Colombo location.
- When an appointment is selected: **Hospital** pin (dark) and **Patient home** pin (primary). The API gives `distance_km` per patient (not lat/lng): place the home pin `distance_km` away along a **stable pseudo-random bearing seeded by the patient id**, and label the map "approximate location". Draw a purple route line with a draw-in animation and fit bounds with padding.
- Bottom-left overlay: **"{distance_km} km"** and an estimated travel time (assume ~25 km/h average urban speed, clearly an estimate). Bottom-right: zoom +/− and fullscreen round buttons.
- Under the map: "Distance impact" chip row — distance, travel time, and the **SHAP contribution of `distance_km`** from the prediction (`explanation` array) as a red/green pill (e.g. "+6.2% risk"). If `distance_km` isn't in the top-6 contributions, show "Low impact".
- Client-only (`dynamic(..., { ssr: false })`), lazy-loaded; skeleton while loading; if tiles fail (offline/Electron), fall back to a static SVG with the two pins and a straight line. The dashboard must never break because of the map.

## 6. Data contract (what is real today)

**Prediction** (`POST /predict` response, and `GET /appointments/{id}/prediction`): `risk_score` (0–1, **calibrated probability**), `risk_category` (`High` / `Medium` / `Low`, rank-based tiers: High ≈ top 10%, Medium ≈ next 20% of bookings), `explanation` = up to 6 `{feature, contribution, value}` (SHAP, log-odds; positive pushes risk up), `recommendation` (string). `contextual_adjustment` is now always `null` — **remove or hide the Contextual Adjustment panel** (`contextual-adjustment-panel.tsx`) and its use in the detail page.

**SHAP feature names are now snake_case.** Update `formatFeature` in `components/shap-tornado-chart.tsx` with plain-English labels and value formatting:
`age` (years) · `distance_km` ("18.4 km from hospital") · `lead_days` ("booked N days ahead") · `appt_dow` (weekday name) · `appt_hour` ("5 PM slot") · `appt_month` · `prior_appts` · `prior_no_shows` ("N previous no-shows") · `prior_no_show_rate` · `is_first_visit` · `chronic_count` ("N chronic conditions") · `sms_sent` ("reminder SMS sent") · `heavy_rain` · `is_poya` ("Poya day") · `is_weekend` · `distance_missing` · one-hot columns `gender_*`, `booking_channel_*` ("booked via Doc990"), `payment_mode_*` ("paid by card / prepaid online / cash / corporate / insurance"), `department_*`. Fall back gracefully for unknown names.

**Other existing data:** patients (name, DOB, gender, phone, email, city, `distance_km`, conditions), appointments (dates, department, doctor, channel, payment, time, queue number, AI action status, status, `no_show`), doctor sessions, waitlist, interventions (channel, language, status, reply, intent, offered slot). See `lib/types.ts`.

## 7. Implementation rules

- Responsive: bento grid 12 cols → 2 on tablet → 1 on mobile; sidebar → icons → drawer.
- Accessibility: contrast ≥ 4.5:1, visible focus rings, `aria-label` on every icon-only button, risk shown with text + icon + colour, reduced-motion respected, keyboard operable sliders and tabs.
- Performance: no layout shift, lazy-load the map and charts, small client bundle. Server Components by default; `"use client"` only where needed.
- Every card has loading (shimmer), empty and error states.
- Dark mode is first-class, not an afterthought — design and screenshot both.

## 8. Deliverables

1. **First:** one UI design artifact per screen in §4 (light + dark), plus the component sheet from §2. Stop and wait for approval.
2. After approval: implement in this order — tokens & dark mode → shell (sidebar, header, ThemePill) → reusable components → Dashboard → Journey Map → Appointment detail & New → Capacity & Outreach → Simulator & Analytics → Login/Setup/System states → motion polish.
3. After each step run `npm run lint`, `npm test`, `npm run build`.
4. Finish with screenshots of Dashboard, Appointment detail, New, Capacity, Outreach, Simulator, Analytics, Login in light and dark at 1280×800 and mobile width, and a summary: changed files, new files, new env vars (`NEXT_PUBLIC_HOSPITAL_LAT/LNG/NAME`), follow-ups.
