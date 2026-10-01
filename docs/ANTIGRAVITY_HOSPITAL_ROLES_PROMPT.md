# Hospital Profile, Multi-Hospital Accounts & Role-Based Access: Antigravity prompt

Everything below the line is the prompt to paste into Antigravity.

---

## ROLE AND GROUND RULES

You are working in an existing full-stack repo: **SHAI**, a hospital appointment no-show prediction system.
- Backend: FastAPI + SQLAlchemy + Alembic in `backend/app/` (`main.py`, `models.py`, `schemas.py`, `auth.py`, `security.py`, `geo.py`, `insights.py`).
- Frontend: Next.js (App Router, React 19) + Tailwind + Recharts in `frontend/`. Shared components are in `frontend/components/` (sidebar: `app-sidebar.tsx`, shell: `app-layout.tsx`, `top-bar.tsx`, `site-header.tsx`, charts in `components/charts/`). Electron wrapper in `frontend/electron/`.
- Currency is LKR. Time zone is **Asia/Colombo** (never use UTC `toISOString()` for "today").
- Read the repo first. Match the existing code style, comment density, naming and the dark/light theme tokens. Do not add a new UI library if an existing component does the job.
- **Nothing hard-coded.** Every hospital name, logo, address, figure, contact, staff member, role label and permission must come from the database through the API. No mock arrays in the frontend, no constants like `HOSPITAL_NAME` left behind (see section 2, gap H1).
- Everything must be backend connected and database connected, with Alembic migrations (plus backfill for existing rows), Pydantic schemas, API endpoints, frontend types in `frontend/lib/types.ts`, API client functions in `frontend/lib/api.ts`, and tests.

### STOP GATE (mandatory)

**Do NOT write any implementation code until I approve a UI design.**
1. Read the code and list the files you inspected.
2. Produce a **UI design Artifact** (HTML mockups with realistic Sri Lankan sample data) for **every new or changed screen listed in section 6**, in both dark and light mode, at desktop and phone width. Show each screen once per role where the role changes what is visible (front desk, analyst, manager, admin, platform owner).
3. Add a short written plan: DB tables and migrations, endpoints, permission matrix, build order, and risks.
4. List any assumption you had to make (see section 9) so I can confirm it.
5. Stop and ask me to approve or change the design. Only after I say "approved" start building.

## 1. WHAT I WANT (in plain words)

Today the system never shows **which hospital** the signed-in person works at. There is no hospital selector and no hospital page. I want this:

1. **The email decides the hospital.** When an employee signs in, their email identifies which hospital they belong to (and, if they belong to more than one, they can pick which one to work in). The whole app then runs in the context of that hospital.
2. **The hospital is visible everywhere it matters:** in the sidebar (bottom area, near the model-health indicator, or another place you recommend) and on a full **Hospital Profile page**.
3. **The Hospital Profile page** shows all the details of the hospital, with a **logo that comes from the database** (uploaded file, not hard-coded), name, date established, location, how many employees work there, how many of them have access to this system, revenue and financial summary, management summary, the money the hospital makes through our service, contact and administrator contacts, official partners, and management staff with names and profile photos.
4. **Roles.** Introduce proper roles, identified from the employee's email account: **front desk, administrator level, management level, data analysis level**. Each role sees and can do different things. Sidebar, pages, buttons and API endpoints must all respect the role.
5. **There are many screens to build and redesign.** Plan and design all of them. Do not skip any item in this document.

## 2. CURRENT BEHAVIOUR AND KNOWN GAPS (all in scope)

What exists today:
- `models.User` has `email`, `full_name`, `role` (`front_desk | manager | admin`), `is_active`, `must_change_password`, lockout fields. **No hospital link at all.** There is no `hospitals` table.
- `security.ROLE_RANK` is a single ladder (front_desk < manager < admin) and `auth.require_role("manager")` means "this rank or higher". A data analyst does not fit a linear ladder.
- `HospitalExpense.hospital_name` is a free-text string defaulting to `"Default Hospital"` (see `main.py` around the expense seeding and `schemas.py`). No foreign key.
- `geo.py` exposes `HOSPITAL_NAME`, `HOSPITAL_LAT`, `HOSPITAL_LNG` as constants, used by `insights.py` for the patient map and distance calculations.
- The frontend stores `shai_user_name` and `shai_user_role` in `localStorage` (`app-sidebar.tsx`, `use-staff-name.ts`) and shows no hospital.
- Login lives in `frontend/app/login/page.tsx` with `login-hero.tsx`; first-time setup in `frontend/app/setup/page.tsx`; password change in `frontend/app/change-password`.

| # | Gap | Fix required |
|---|-----|--------------|
| H1 | Hospital identity is hard-coded (`geo.HOSPITAL_*`, `"Default Hospital"` strings, logo files in `frontend/public`) | Create a `hospitals` table. Replace every constant and string with data read from the signed-in user's hospital. Remove the constants and the hard-coded logo usage for the hospital (the SHAI product logo stays, hospital logo is separate) |
| H2 | Users are not linked to a hospital | Add `hospital_id` (membership, see 3.B). Backfill existing users and data into one seeded default hospital |
| H3 | Business data (patients, appointments, doctors, departments, sessions, predictions, capacity settings, waitlist, expenses, interventions, outreach) is not scoped by hospital | Add `hospital_id` to every tenant-owned table, with index, FK and backfill. Every query must filter by the current user's active hospital. Add tests proving hospital A can never read or write hospital B data |
| H4 | Roles are a linear rank, only three of them | Replace with a role + permission model (section 4). Keep backwards compatibility for existing `front_desk`, `manager`, `admin` values during migration |
| H5 | Role is only enforced on some endpoints and the frontend just hides things by reading `localStorage` | Enforce on the backend for every route (global dependency plus per-route permission). The frontend reads role and permissions from `GET /auth/me`, never trusts `localStorage` for authorisation |
| H6 | `HospitalExpense.hospital_name` is a string | Convert to `hospital_id` FK with migration and backfill |
| H7 | No hospital switcher or context in the UI | Hospital chip in sidebar and top bar, switcher for multi-hospital users |
| H8 | No audit trail of who changed what | Add an audit log for hospital profile edits, role changes, staff invitations and deactivations |
| H9 | Staff cannot be managed in the app | Add a Staff and Access screen (section 6, S7) |

## 3. DATA MODEL (build with Alembic migrations, start from the latest revision `d9a5f1e8c3b2`)

Use UUID primary keys like the existing models. Propose exact columns in your plan; the list below is the minimum.

### A. `hospitals`
- `id`, `slug` (unique), `name`, `short_name`, `legal_name`
- `logo_file_id` or `logo_url` (the logo is an **uploaded file stored by the backend**, with a light and a dark variant if provided; serve through an endpoint; no hard-coded path), `brand_color`
- `established_date`, `hospital_type` (private, government, semi-government), `registration_number`, `bed_count`
- Address fields: `address_line1`, `address_line2`, `city`, `district`, `province`, `postal_code`, `country`, `latitude`, `longitude` (these replace `geo.HOSPITAL_LAT/LNG`), `timezone`, `currency`
- `website`, `main_phone`, `main_email`, `emergency_phone`, `about` (text), `accreditations` (JSON list, for example JCI, SLMC)
- `is_active`, `created_at`, `updated_at`

### B. Users and membership
- Keep `users` as the identity (email, password, name, avatar).
- New `hospital_memberships`: `user_id`, `hospital_id`, `role_id` (or role key), `is_active`, `job_title`, `department_id` (nullable), `employee_code`, `joined_at`. A user may have more than one membership (a consultant or analyst working across hospitals). Unique on (`user_id`, `hospital_id`).
- Add to `users`: `avatar_file_id` (profile photo, stored by the backend), `phone`.
- **How the email identifies the hospital:** add `hospital_email_domains` (`hospital_id`, `domain`, `is_primary`) so an address like `nimal@asiri.lk` maps to Asiri. Define the exact resolution rules in your plan: (1) an existing membership for that exact email wins, (2) an invitation for that email, (3) otherwise a domain match, which creates a pending account that an admin must approve (do not auto-grant roles from a domain match). Free mail domains (gmail.com etc.) must never be accepted as a hospital domain.
- Add `staff_invitations`: `email`, `hospital_id`, `role`, `invited_by`, `token_hash`, `expires_at`, `accepted_at`, `status`. Email verification: the account is only active after the emailed link is opened and the password is set. If email sending is not configured, log the link in dev and make the sender pluggable (SMTP via env vars). Do not invent a fake email service.

### C. Management profiles (shown on the Hospital Profile page)
- `hospital_management_members`: `hospital_id`, `user_id` (nullable, since a board member may not use the system), `full_name`, `position` (Director, CEO, Medical Director, COO, Head of Nursing...), `photo_file_id`, `bio`, `email`, `phone`, `display_order`, `is_public`.

### D. Contacts and partners
- `hospital_contacts`: `hospital_id`, `kind` (administrator, billing, IT, emergency, general), `name`, `title`, `email`, `phone`, `is_primary`.
- `hospital_partners`: `hospital_id`, `name`, `kind` (insurer, laboratory, pharmacy, university, NGO, technology vendor, government body), `logo_file_id`, `website`, `since_date`, `description`, `is_official`.

### E. Our service, contract and billing (the money side of the relationship with SHAI)
- `hospital_subscriptions` (plan name, start date, renewal date, seats, monthly fee LKR, status) and `hospital_invoices` (period, amount, status, paid_at). See assumption A2 in section 9.
- Value that SHAI delivered is **computed from real data**, not stored by hand: recovered revenue from slot offers filled and from interventions that prevented no-shows (reuse `slot_offers`, `capacity_recommendations`, `interventions`, `predictions`), no-show rate before versus after go-live (store `go_live_date` on the hospital).

### F. Files
- One generic `stored_files` table (id, hospital_id, kind, content_type, size, sha256, storage_path or blob, uploaded_by) plus `POST /files` (validated: image types only, size limit, content sniffing, no SVG with scripts) and `GET /files/{id}`. Logos, avatars and partner logos all go through it. Keep it simple, local disk behind an interface so S3 can replace it later.

### G. Seed
- Update `backend/seed.py` to seed two or three realistic hospitals (for example a private hospital in Colombo, one in Kandy, one government teaching hospital) with logos (generate simple placeholder PNGs into the file store at seed time, never referenced from `public/`), management members, partners, contacts, memberships for each role, domains, and the existing demo data assigned to hospital 1. Idempotent.

## 4. ROLES AND PERMISSIONS

Roles (per hospital membership). Use exactly these four hospital roles, plus a platform-level one:

| Role key | Label | Who | Summary of power |
|---|---|---|---|
| `front_desk` | Front Desk | Reception and booking staff | Day-to-day work: registrations, appointments, worklist, outreach actions, waitlist and slot offers, patient lookup. No money, no model internals, no settings, no staff management |
| `analyst` | Data Analysis | Data / quality analysts | Read-only analytics: dashboards, model health and explainability, accuracy, forecast, exports. Can run what-if simulations. Cannot edit operational data, cannot see staff management. Revenue figures aggregated only (no per-patient billing detail) |
| `manager` | Management | Department heads, hospital management | Everything front desk and analyst can see, plus capacity settings, financial and ROI pages, expenses, the Hospital Profile in full (financials, management), approve staff requests for their department, reports |
| `admin` | Administrator | Hospital IT / system administrator | Everything in the hospital: edit Hospital Profile, upload logo, manage staff, roles, invitations, domains, integration (HIS sync), audit log, security settings |
| `platform_owner` | SHAI platform | Our own support/owner staff | Cross-hospital: create hospitals, view all, billing. Not shown to hospital users. Hidden from the staff list |

Requirements:
- Replace `ROLE_RANK` with a **permission matrix** stored in the database (`roles`, `permissions`, `role_permissions`) or as a single typed source of truth in code that is also exposed to the frontend. Permissions are fine-grained, for example `patients.read`, `appointments.write`, `outreach.send`, `capacity.read`, `capacity.settings.write`, `analytics.read`, `model.read`, `finance.read`, `hospital.profile.read`, `hospital.profile.write`, `staff.read`, `staff.manage`, `audit.read`, `his.sync`. Show me the full matrix as a table in the plan.
- `require_permission("x")` dependency on every route, replacing `require_role`. Default deny. Add a test that fails if any route lacks a permission or is not in the public list.
- `GET /auth/me` returns user, active hospital (id, name, logo url, brand colour), role, the permission list, and the list of other hospitals the user can switch to.
- Hospital switching: `POST /auth/switch-hospital` issues a new token bound to that hospital; the hospital id is in the signed token and re-validated against membership on every request.
- Safety rules: an admin cannot remove or demote the last admin of a hospital; users cannot change their own role; every role change is audit-logged; deactivated membership takes effect on the next request; role change forces a token refresh.
- Frontend: a `usePermissions()` hook and a `<Can permission="...">` wrapper; sidebar items, page routes (redirect or a clean "No access" screen, not a blank page), buttons and tabs all driven by permissions. Never rely on hiding alone, the API must refuse.

## 5. BACKEND API (propose exact shapes in the plan)

- `GET /hospital` (current hospital profile, filtered by what the role may see), `PATCH /hospital` (admin), `POST /hospital/logo`, `GET /hospital/summary` (the numbers below)
- `GET/POST/PATCH/DELETE /hospital/contacts`, `/hospital/partners`, `/hospital/management`
- `GET /hospital/staff`, `POST /hospital/staff/invite`, `PATCH /hospital/staff/{membership_id}` (role, active, department, title), `DELETE` (deactivate, never hard delete), `POST /hospital/staff/{id}/resend-invite`
- `GET /hospital/roles` (roles and the permission matrix for the Roles screen)
- `GET /hospital/audit-log` (filters, pagination)
- `GET /hospital/service-value?from&to` (value delivered by SHAI, computed)
- `GET /hospital/finance?from&to` (revenue, expenses, net, trend; reuses existing revenue, ROI and expense logic, now filtered by `hospital_id`)
- `POST /auth/accept-invite`, `POST /auth/verify-email`, `POST /auth/resolve-email` (given an email on the login screen, return the hospital name and logo so the login page can show "Signing in to Asiri Hospital" before the password; do not reveal whether the account exists)
- `POST /files`, `GET /files/{id}`
- Platform owner only: `POST /platform/hospitals`, `GET /platform/hospitals`
- Update **every existing endpoint** (patients, appointments, doctors, departments, capacity, outreach, simulator, analytics, map, expenses, notifications, search) to scope by the active hospital. Replace `geo.HOSPITAL_*` with the hospital row. Add the right indexes (`hospital_id` first in composite indexes). Cache short-lived summaries, no Python loops over entire tables.

## 6. SCREENS TO DESIGN (show all of these in the Artifact, then build)

**S1. Login redesign** (`frontend/app/login/page.tsx`, `login-hero.tsx`)
- Step 1 email; on blur or continue call `resolve-email` and show the hospital logo and name ("Signing in to ...") plus a "Not your hospital?" link. Step 2 password. Show clear errors for unverified email, locked account, deactivated membership, and unknown domain (request access flow).
- If the user belongs to several hospitals, a hospital picker after password.
- Remove the hard-coded hero art that is tied to one hospital; the hero must use the resolved hospital branding when available and the SHAI brand otherwise.

**S2. Accept invitation and verify email** (new): set name, photo, password, confirm; role and hospital shown read-only.

**S3. Sidebar and shell changes** (`app-sidebar.tsx`, `app-layout.tsx`, `top-bar.tsx`)
- Hospital block in the sidebar bottom area, next to or above the **model health** indicator: logo (from DB), hospital name, city, and the user's role chip. Clicking it opens the Hospital Profile. If the user has several hospitals, it opens a switcher popover.
- Collapsed sidebar shows the logo only, with a tooltip.
- Top bar shows the active hospital short name. Replace the `localStorage` role logic with `/auth/me`.
- Sidebar items appear per permission. Show me the sidebar for each of the four roles side by side.
- Also fix: any sidebar badge counts must come from real data.

**S4. Hospital Profile page** (new, `frontend/app/hospital/page.tsx`, with tabs or well-organised sections)
- **Header card:** large logo, hospital name, type, established date and years of service, location with a small map pin (use existing map component), "Edit" for admin.
- **Key numbers row:** total employees, employees with system access (and by role), departments, doctors, beds, patients on record, appointments this month.
- **Overview:** about text, address, website, main phone, email, accreditations.
- **Revenue and financial summary:** revenue, expenses, net, month and year view with trend chart, revenue at risk versus recovered (existing logic, scoped per hospital). Visible to manager and admin only.
- **Management summary:** headline KPIs for management (no-show rate, utilisation, recovered revenue, ROI), compact and linked to the detailed pages.
- **Our service (SHAI) panel:** go-live date, plan, status, renewal date, seats used versus seats paid, **money generated for the hospital through our service** (recovered revenue from filled slots, prevented no-shows, overbooking gain, all computed), cost of the service, net benefit and ROI, month-by-month chart, and invoices list. See assumption A2.
- **Contacts:** administrator contact and other official contacts with click-to-call and click-to-mail.
- **Official partners:** logo grid with name, kind, since date, link.
- **Management staff:** cards with profile photo, name, position, short bio, contact. Ordered by `display_order`.
- **Staff access summary:** counts per role, last login activity, link to Staff and Access.
- Role-based visibility: front desk sees the identity, contacts, partners and management staff only; analyst adds aggregated numbers; manager adds financials and service value; admin sees and edits everything.
- Empty states for every section (new hospital with no data yet), loading skeletons, error states using the existing `empty-state.tsx` and `error-card.tsx`.

**S5. Hospital Profile editor** (admin): edit identity, address with map picker (lat/lng), logo upload with crop and preview in light and dark, contacts, partners, management members with photo upload, accreditations. Validation, unsaved-changes guard, audit logged.

**S6. User profile and account** (new, from the user menu): own photo, name, phone, job title, role (read-only), hospital(s), change password (existing flow), sessions and last login.

**S7. Staff and Access** (new, admin and manager-for-own-department): staff table with photo, name, email, role, department, status, last login; filters; invite dialog (email, role, department); change role, deactivate, resend invitation; pending domain-match requests queue for approval; the "last admin" guard.

**S8. Roles and permissions** (new, read-only for admin): the matrix of roles by permission in a clear grid, with plain-language descriptions of what each role can do.

**S9. Audit log** (new, admin): who, what, when, before and after, filters.

**S10. Hospital switcher** (popover and full dialog) for multi-hospital users.

**S11. Platform admin** (platform_owner only, can be minimal): create a hospital, set its domains and first admin invitation, see all hospitals.

**S12. Redesign of existing screens for role awareness:** Dashboard (per-role landing content: front desk sees today's worklist, analyst sees model and trends, manager sees revenue and capacity, admin sees system and staff health), Analytics, Revenue at Risk, Capacity, Outreach, Setup (`frontend/app/setup/page.tsx`), Notifications and the search palette (results limited to what the role may open). Replace every place that shows a hard-coded hospital name (map, simulator, expense screens, headers, report exports, outreach message signatures) with the active hospital.

**S13. "No access" and "Session expired" screens, plus a hospital deactivated screen.**

For each screen the Artifact must show: default state, empty state, loading, error, and the role variants. Also show the responsive phone layout.

## 7. BUILD ORDER (after I approve)

1. Migrations: `hospitals`, files, memberships, roles and permissions, contacts, partners, management, subscriptions, invoices, audit, invitations, domains; add `hospital_id` to all tenant tables with backfill into a default hospital; convert `HospitalExpense.hospital_name`.
2. Auth: permission model, `/auth/me`, hospital in token, resolve-email, invitations, verify, switch hospital, tests.
3. Tenant scoping of every existing endpoint, with isolation tests.
4. Hospital, contacts, partners, management, staff, audit, finance and service-value endpoints.
5. Seed data.
6. Frontend foundation: auth context from `/auth/me`, `usePermissions`, `<Can>`, hospital context, API client and types.
7. Screens in this order: sidebar and shell, login and invite flow, Hospital Profile, editor, Staff and Access, roles, audit, profile, switcher, role-aware redesign of existing pages, platform admin.
8. Tests (backend pytest, frontend vitest), plus a manual QA checklist per role.

Update `docs/` with a short `HOSPITAL_AND_ROLES.md` (data model, permission matrix, how email resolves to a hospital, how to add a hospital).

## 8. ACCEPTANCE CHECKLIST

- No hard-coded hospital name, logo, coordinates, contacts, staff, partner or figure anywhere in the frontend or backend code paths. `grep` for `Default Hospital` and `HOSPITAL_NAME` returns nothing in app code.
- Logo and all photos come from the database file store and render in light and dark mode.
- Signing in with an email from hospital A never shows or returns hospital B data (tested at API level).
- Each of the four roles sees only its allowed sidebar items, pages, buttons and API responses; direct URL access and direct API calls are refused with 403 and a friendly screen.
- The last admin cannot be removed; role changes and profile edits are audited.
- Every number on the Hospital Profile page is computed from real tables and respects the date range; empty hospital shows honest empty states, not invented values.
- All migrations run on a fresh database and on the existing one (with backfill), and are reversible where practical.
- Existing tests still pass; new tests cover permissions, tenancy isolation, invitations, email resolution and the profile endpoints.

## 9. ASSUMPTIONS TO CONFIRM WITH ME IN THE PLAN

- **A1.** "Data analysis level" is a read-only role with analytics and model access but no operational writes and no per-patient finance. Confirm or adjust.
- **A2.** "How much money this hospital sells from our service" is read as: **(a)** the value SHAI generated for the hospital (recovered revenue, prevented no-show loss, computed from real data) and **(b)** what the hospital pays SHAI (subscription and invoices). Tell me if you read it differently, and ask me if the billing side (b) should be built now or later.
- **A3.** A user can belong to multiple hospitals; the active hospital is chosen at login and can be switched.
- **A4.** A domain-matched stranger gets a pending request, never an automatic role.
- **A5.** "Employees who work here" (headcount) is a number the admin maintains on the hospital profile (HR headcount), while "employees with system access" is counted from memberships. Show both, and label the difference.
- **A6.** Management staff on the profile page may or may not be system users, hence the nullable `user_id`.

Remember: show me the screens first, wait for my approval, then implement.
