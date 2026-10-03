# Known gaps

## Single-hospital scoping
Every new appointment, patient, waitlist entry, expense, intervention, capacity recommendation and prediction run is written with the
signed-in user's `hospital_id`. Lookups by id and list endpoints for those tables filter by it and answer 404 for another hospital's rows.
Platform owners (no hospital) see everything. NULL-hospital rows are **not** visible to hospital users (except shared reference data below).

Still unfiltered or only partly filtered:

| Endpoint / data | Why |
|---|---|
| `GET /departments`, `/doctors`, `/doctors/{id}/availability`, `/locations*` | Reference data. Departments and doctors with a NULL `hospital_id` are shared by all hospitals by design. |
| `GET /his/status`, `his_appointments`, `his_sync_runs` | The HIS tables have no `hospital_id`; there is one connector. `POST /his/sync` does tag the appointments / patients it creates with the caller's hospital. |
| `prediction_log`, `appointment_events` | No `hospital_id` column; only reachable through an appointment that is itself scoped. |
| `GET /predictions/today` HIS freshness badge | Reads the latest HIS sync run, which is global. |
| `GET /model/info` | The bundle is global (one model for the deployment). Only the `data_sources` counts are scoped. |
| `POST /predict/preview`, `/distance`, `/locations/geocode` | Stateless computations. |
| Frontend session cookie | `proxy.ts` decodes but does not verify the cookie; the backend verifies the HMAC on every call (see audit section 8b). |

## Other
* The agent simulator (`/outreach/simulate-agent`) is keyword based and offers a canned slot; nothing is ever sent to a patient (no SMS/WhatsApp gateway).
* `heavy_rain` is a manual toggle stored per appointment; there is no weather feed.
* Waitlist assignment ignores the free-text `preferred_days` and books the earliest free seat in the next 28 days.
* Capacity treats the average booked patient's reliability as the show probability of extra bookings.
* Imported data is synthetic (`appointments.data_source = 'synthetic'`); the UI shows a SYNTHETIC DATA strip while it is present.
