import { listAppointmentsOverview } from "@/lib/api";
import type { Appointment, Patient, StoredPrediction } from "@/lib/types";

export type AppointmentRecord = {
  appointment: Appointment;
  patient: Patient | undefined;
  prediction: StoredPrediction | undefined;
};

// Default window: this many days back, plus every future appointment. The plain list
// endpoints are paginated and unordered, so joining them client-side drops patients and
// predictions once there are more rows than one page; the overview endpoint joins
// appointment + patient + prediction server-side in one query.
export const DEFAULT_DAYS_BACK = 45;

// Shared by the dashboard, appointments list, outreach and analytics pages.
export async function getAppointmentsWithPredictions(
  daysBack: number = DEFAULT_DAYS_BACK
): Promise<AppointmentRecord[]> {
  const rows = await listAppointmentsOverview(daysBack);
  return rows.map((row) => ({
    appointment: row.appointment,
    patient: row.patient ?? undefined,
    prediction: row.prediction ?? undefined,
  }));
}
