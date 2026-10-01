# Capacity & Smart Overbooking v2 Specification & Architecture

## 1. Executive Summary

**SHAI Capacity & Smart Overbooking v2** upgrades the hospital appointment management engine from heuristic session-level guesses to a mathematically grounded, queue-simulated prescriptive capacity system tailored for Sri Lankan healthcare delivery (National Hospital of Sri Lanka, Colombo; Timezone: `Asia/Colombo`; Currency: `LKR`).

The v2 system addresses all 14 identified architectural and clinical gaps (G1–G14) and delivers 5 enterprise operational features (Features A through E).

---

## 2. Gap Resolution Matrix (G1–G14)

| # | Gap Identified in v1 | Solution Implemented in v2 | Files / Artifacts |
|---|---|---|---|
| **G1** | Appointments matched by `doctor_name OR department`, conflating doctors in the same department | Matched exclusively by Foreign Key (`appointments.doctor_id`). Backfill migration added to Alembic. | `alembic/versions/c8f4e2b0d1a5_*.py`, `backend/app/models.py`, `backend/app/services/capacity_service.py` |
| **G2** | Fabricated baselines (`max(len(appts), 14)`) and fake 5 no-shows on empty sessions | Completely eliminated all synthetic baseline fabrications. Honest empty state displayed when sessions have zero bookings. | `backend/app/services/capacity_service.py`, `frontend/app/capacity/capacity-overview-view.tsx` |
| **G3** | Categorical risk buckets (High=1, Med=0.5, Low=0) discarded calibrated probabilities | Sums per-appointment calibrated probabilities ($p_i \in [0, 1]$). Calculates Poisson-binomial variance $\sum p_i(1-p_i)$ and 80% confidence interval $[q_{0.10}, q_{0.90}]$. | `backend/app/services/capacity_math.py`, `frontend/app/capacity/capacity-overview-view.tsx` |
| **G4** | Doctor delay was displayed in UI but ignored by optimizer | Lateness actively curtails queue delay budget: $\tau_{\text{eff}} = \max(0, \tau_{\text{base}} - \text{delay\_minutes})$. Documented and tested. | `backend/app/services/capacity_math.py`, `backend/tests/test_capacity_v2.py` |
| **G5** | "93% UTIL" ring was calculated as `booked / (booked + overbook)` | Dual metric implemented: Booked Utilisation ($\text{booked} / \text{capacity}$) and Expected Attendance Rate ($(\text{booked} - \mu) / \text{capacity}$). | `backend/app/services/capacity_math.py`, `frontend/app/capacity/capacity-overview-view.tsx` |
| **G6** | Magic numbers (0.75 safety factor, 20m tolerance, LKR 4,500 fee) were hard-coded | Relocated to `capacity_settings` database table supporting hospital-wide defaults and department overrides with manager UI. | `backend/app/models.py`, `frontend/app/capacity/capacity-settings-view.tsx` |
| **G7** | Linear wait time guess | Replaced with vectorized NumPy Monte Carlo single-server queue simulation (2,000 runs, $<40$ ms execution). Old linear formula preserved only as a fallback. | `backend/app/services/queue_simulator.py`, `backend/tests/test_capacity_v2.py` |
| **G8** | Overbooking only calculated at whole session level | Time-slot overbooking matrix introduced (Feature A) evaluating 15-minute slot windows based on booked patient risk and session position. | `backend/app/services/capacity_service.py`, `frontend/app/capacity/slot-heatmap-view.tsx` |
| **G9** | UI string showed duplicate "Room Room 250" | Room string normalization helper `clean_room_name` strips duplicate prefixes across backend and frontend. | `backend/app/services/capacity_service.py`, `frontend/app/capacity/capacity-overview-view.tsx` |
| **G10** | Hard-coded sidebar badges ("2 wait", "4") | Nav badges dynamically driven by `GET /capacity/nav-counts` reporting live active waitlist entries and unhandled slot offers. | `frontend/components/app-sidebar.tsx`, `backend/app/services/capacity_service.py` |
| **G11** | Manual waitlist assignment without ranking | Multi-attribute utility candidate ranker (Feature C) scoring standby patients on specialty match, reliability, wait time, urgency, and distance. | `backend/app/services/candidate_ranker.py`, `frontend/app/capacity/slot-offers-view.tsx` |
| **G12** | Unpersisted optimizer recommendations | Persistent recommendation audit trail (`capacity_recommendations` table) storing inputs, Poisson bounds, and settings snapshot. | `backend/app/models.py`, `backend/app/services/capacity_service.py` |
| **G13** | N+1 Python loops over appointments | Single query aggregation per request with index optimizations and cached read paths. | `backend/app/services/capacity_service.py` |
| **G14** | Revenue recovery claimed as certain | Labeled "Expected Upside" and calculated as $\text{Expected Filled Gaps} \times \text{Consultation Fee}$ from queue simulation. | `backend/app/services/capacity_math.py`, `backend/app/services/queue_simulator.py` |

---

## 3. Mathematical Formulations

### 3.1 Poisson-Binomial Distribution
For an appointment schedule with $n$ booked patients having calibrated no-show probabilities $p_1, p_2, \dots, p_n$:
- **Expected No-Shows ($\mu$):**
  $$\mu = \sum_{i=1}^n p_i$$
- **Variance ($\sigma^2$):**
  $$\sigma^2 = \sum_{i=1}^n p_i (1 - p_i)$$
- **Confidence Interval (80%):**
  - For $n < 10$: Exact dynamic programming convolution:
    $$P(S_k = j) = P(S_{k-1} = j)(1 - p_k) + P(S_{k-1} = j - 1)p_k$$
  - For $n \ge 10$: Refined normal approximation:
    $$[q_{0.10}, q_{0.90}] = [\max(0, \lfloor \mu - 1.2816 \cdot \sigma \rfloor), \lceil \mu + 1.2816 \cdot \sigma \rceil]$$

### 3.2 Effective Delay Tolerance
Doctor tardiness actively penalizes the queue delay budget:
$$\tau_{\text{eff}} = \max\left(0, \tau_{\text{base}} - \text{delay\_minutes}\right)$$
When a consultant is delayed by more than $\tau_{\text{base}}$, $\tau_{\text{eff}} = 0$, restricting recommended overbooking to 0 to prevent runaway clinic crowding.

### 3.3 Utilisation Metrics
- **Booked Utilisation:**
  $$\text{Util}_{\text{booked}} = \min\left(100\%, \frac{\text{total\_booked}}{\text{capacity}} \times 100\right)$$
- **Expected Attendance Rate:**
  $$\text{Attend}_{\text{exp}} = \max\left(0\%, \min\left(100\%, \frac{\text{total\_booked} - \mu}{\text{capacity}} \times 100\right)\right)$$

### 3.4 Single-Server Monte Carlo Queue Simulation
The simulation runs 2,000 independent trials with deterministic seeding:
1. Patient attendance is sampled: $A_i \sim \text{Bernoulli}(1 - p_i)$.
2. Consultation times are sampled from log-normal or Gaussian distribution per doctor $(\mu_{\text{consult}}, \sigma_{\text{consult}})$.
3. Patient waiting times $W_i$ are simulated:
   $$W_{i} = \max(0, W_{i-1} + S_{i-1} - (T_i - T_{i-1}))$$
4. Overcrowding probability:
   $$P(\text{overcrowding}) = P(W_{\text{max}} > \tau_{\text{eff}})$$
5. The optimal overbook count $k^*$ is the maximum integer $k \le k_{\text{max}}$ such that $P(\text{overcrowding}) \le \alpha_{\text{risk}}$ and simulated mean wait $\le \tau_{\text{eff}}$.

---

## 4. Multi-Attribute Standby Candidate Ranking

When a slot opens, waitlist candidates are ranked by a composite utility score $U \in [0, 100]$:
$$U = 30 \cdot M_{\text{specialty}} + 30 \cdot R_{\text{reliability}} + 20 \cdot W_{\text{wait}} + 15 \cdot C_{\text{urgency}} + 5 \cdot P_{\text{distance}}$$

Where:
- $M_{\text{specialty}} = 1.0$ if doctor matches, $0.8$ if specialty matches.
- $R_{\text{reliability}} = (1.0 - p_{\text{no\_show}})$.
- $W_{\text{wait}} = \min(1.0, \text{days\_waiting} / 14)$.
- $C_{\text{urgency}} = 1.0$ (High/Urgent), $0.6$ (Medium), $0.3$ (Routine).
- $P_{\text{distance}} = \max(0.1, 1.0 - \text{distance\_km} / 50)$.

---

## 5. API Endpoints Reference

| HTTP Method | Path | Description | Access |
|---|---|---|---|
| `GET` | `/capacity/overview` | Main dashboard summary & consultant session cards | Staff / Manager |
| `POST` | `/capacity/optimize` | Prescriptive session-level optimizer | Staff / Manager |
| `GET` | `/capacity/slots` | 15-minute slot overbooking heatmap grid & patient details | Staff / Manager |
| `POST` | `/capacity/what-if` | Non-persisting Monte Carlo simulation endpoint | Staff / Manager |
| `GET` | `/capacity/scenarios` | List saved what-if simulation scenarios | Staff / Manager |
| `POST` | `/capacity/scenarios` | Save a new what-if simulation scenario | Manager |
| `DELETE` | `/capacity/scenarios/{id}` | Delete a saved what-if scenario | Manager |
| `GET` | `/capacity/slot-offers` | Active and historical standby slot backfill offers | Staff / Manager |
| `POST` | `/capacity/slot-offers/{id}/act` | Approve, decline, or undo a slot offer (15-min window) | Staff / Manager |
| `GET` | `/capacity/forecast` | Multi-horizon (7, 14, 30 days) capacity forecast | Staff / Manager |
| `GET` | `/capacity/accuracy` | Calibration curve, Brier scores, regret telemetry | Staff / Manager |
| `GET` | `/capacity/settings` | Retrieve active policy settings (global or department) | Staff / Manager |
| `PUT` | `/capacity/settings` | Update policy settings (tolerance, safety factor, fee) | Manager |
| `GET` | `/capacity/nav-counts` | Dynamic navigation badges for sidebar | Authenticated |

---

## 6. Frontend Architecture

The frontend is implemented in Next.js (App Router, React 19) in `frontend/app/capacity/` with Recharts and Tailwind CSS tokens:
1. `page.tsx`: Server Component enforcing `manager` role and loading all initial datasets concurrently via `Promise.allSettled`.
2. `capacity-client.tsx`: Interactive client wrapper hosting tab navigation across the 7 screens.
3. `capacity-overview-view.tsx`: KPI cards, session status bar, Recharts bar charts, dual utilisation rings, and honest empty states.
4. `slot-heatmap-view.tsx` (**Feature A**): Doctor $\times$ 15-minute slot grid with slide-over drawer showing patient calibrated risk and prescriptive logic.
5. `what-if-view.tsx` (**Feature B**): Debounced parameter sliders, side-by-side comparison tiles, trade-off curve, and scenario persistence.
6. `slot-offers-view.tsx` (**Feature C**): Freed slot queue, candidate score breakdown bar, 1-click approval, 15-minute undo audit trail, and draft outreach preview.
7. `forecast-view.tsx` (**Feature D**): 7/14/30 day toggle, Poisson-binomial confidence band area chart, department risk bar chart, and calendar heat strip.
8. `accuracy-view.tsx` (**Feature E**): 10-decile calibration curve with 45° reference line, actual vs. predicted trend, confusion matrix, and Brier breakdown.
9. `capacity-settings-view.tsx`: Manager settings form with live impact preview tile.
10. `app-sidebar.tsx`: Live dynamic badges for Capacity (`X wait`) and Outreach (`Y`).
