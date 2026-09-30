import { getPrediction, listAppointments, listPatients } from "@/lib/api";
import type { Appointment, Patient, StoredPrediction } from "@/lib/types";

export type AppointmentRecord = {
  appointment: Appointment;
  patient: Patient | undefined;
  prediction: StoredPrediction | undefined;
};

// Fetching one prediction per appointment concurrently without a cap floods
// the backend's DB connection pool (default size 5 + overflow 10) once there
// are more than ~15 appointments, so requests queue up and time out.
const PREDICTION_FETCH_CONCURRENCY = 10;

async function settleWithConcurrencyLimit<T>(
  tasks: (() => Promise<T>)[],
  limit: number
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = new Array(tasks.length);
  let next = 0;

  async function worker() {
    while (next < tasks.length) {
      const index = next++;
      try {
        results[index] = { status: "fulfilled", value: await tasks[index]() };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, tasks.length) }, worker)
  );
  return results;
}

// Shared by the appointments list and the analytics overview — both need
// appointments joined against their patient and (if run) their prediction.
export async function getAppointmentsWithPredictions(): Promise<AppointmentRecord[]> {
  const [appointments, patients] = await Promise.all([listAppointments(), listPatients()]);

  const predictionResults = await settleWithConcurrencyLimit(
    appointments.map((appointment) => () => getPrediction(appointment.id)),
    PREDICTION_FETCH_CONCURRENCY
  );

  const patientById = new Map(patients.map((patient) => [patient.id, patient]));

  return appointments.map((appointment, index) => {
    const result = predictionResults[index];
    return {
      appointment,
      patient: patientById.get(appointment.patient_id),
      prediction: result.status === "fulfilled" ? result.value : undefined,
    };
  });
}
