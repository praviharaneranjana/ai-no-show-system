import type { Appointment, Patient, PredictFeatures } from "@/lib/types";

// Mirrors the feature engineering in backend/preprocess.py — must stay in
// sync with it, since the trained model was fit on that exact derivation.
export function deriveFeatures(
  patient: Patient,
  appointment: Appointment
): PredictFeatures {
  const dob = new Date(patient.date_of_birth);
  const scheduledDay = new Date(appointment.scheduled_day);
  const appointmentDay = new Date(appointment.appointment_day);

  const daysAhead = Math.max(0, diffInDays(scheduledDay, appointmentDay));
  const dayOfWeek = (appointmentDay.getUTCDay() + 6) % 7; // 0=Monday .. 6=Sunday, matches pandas .dt.weekday

  return {
    Age: calculateAge(dob, appointmentDay),
    Scholarship: patient.scholarship ? 1 : 0,
    Hipertension: patient.hypertension ? 1 : 0,
    Diabetes: patient.diabetes ? 1 : 0,
    Alcoholism: patient.alcoholism ? 1 : 0,
    Handcap: patient.handicap,
    SMS_received: appointment.sms_received ? 1 : 0,
    DaysAhead: daysAhead,
    DayOfWeek: dayOfWeek,
    IsWeekend: dayOfWeek >= 5 ? 1 : 0,
    Month: appointmentDay.getUTCMonth() + 1,
  };
}

function diffInDays(from: Date, to: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round((to.getTime() - from.getTime()) / msPerDay);
}

function calculateAge(dob: Date, at: Date): number {
  let age = at.getUTCFullYear() - dob.getUTCFullYear();
  const hadBirthdayThisYear =
    at.getUTCMonth() > dob.getUTCMonth() ||
    (at.getUTCMonth() === dob.getUTCMonth() && at.getUTCDate() >= dob.getUTCDate());
  if (!hadBirthdayThisYear) age -= 1;
  return Math.max(0, age);
}
