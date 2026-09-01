"use server";

import { revalidatePath } from "next/cache";

import { ApiError, createAppointment, createPatient, predict } from "@/lib/api";
import { deriveFeatures } from "@/lib/features";
import type { Appointment, Patient, PredictionResult } from "@/lib/types";

export type NewAppointmentState = {
  error?: string;
  result?: {
    patient: Patient;
    appointment: Appointment;
    prediction: PredictionResult;
  };
};

function requiredField(formData: FormData, name: string): string | null {
  const value = formData.get(name);
  if (typeof value !== "string" || value.trim() === "") return null;
  return value.trim();
}

export async function createAppointmentAction(
  _prevState: NewAppointmentState,
  formData: FormData
): Promise<NewAppointmentState> {
  const fullName = requiredField(formData, "full_name");
  const dateOfBirth = requiredField(formData, "date_of_birth");
  const scheduledDay = requiredField(formData, "scheduled_day");
  const appointmentDay = requiredField(formData, "appointment_day");

  if (!fullName || !dateOfBirth || !scheduledDay || !appointmentDay) {
    return { error: "Patient name, date of birth, and both appointment dates are required." };
  }

  if (appointmentDay < scheduledDay) {
    return { error: "The appointment date can't be before the scheduled date." };
  }

  try {
    const distanceKmRaw = formData.get("distance_km") as string;

    const patient = await createPatient({
      full_name: fullName,
      date_of_birth: dateOfBirth,
      uhid: (formData.get("uhid") as string) || null,
      gender: (formData.get("gender") as string) || null,
      phone: (formData.get("phone") as string) || null,
      email: (formData.get("email") as string) || null,
      city: (formData.get("city") as string) || null,
      distance_km: distanceKmRaw ? Number(distanceKmRaw) : null,
      scholarship: formData.get("scholarship") === "on",
      hypertension: formData.get("hypertension") === "on",
      diabetes: formData.get("diabetes") === "on",
      alcoholism: formData.get("alcoholism") === "on",
      handicap: Number(formData.get("handicap") ?? 0),
    });

    const appointment = await createAppointment({
      patient_id: patient.id,
      scheduled_day: scheduledDay,
      appointment_day: appointmentDay,
      department: (formData.get("department") as string) || null,
      doctor_name: (formData.get("doctor_name") as string) || null,
      booking_channel: (formData.get("booking_channel") as string) || null,
      payment_mode: (formData.get("payment_mode") as string) || null,
      scheduled_time: (formData.get("scheduled_time") as string) || null,
      sms_received: formData.get("sms_received") === "on",
    });

    const features = deriveFeatures(patient, appointment);
    const prediction = await predict(appointment.id, features);

    revalidatePath("/");

    return { result: { patient, appointment, prediction } };
  } catch (err) {
    if (err instanceof ApiError) {
      return { error: `Backend error (${err.status}): ${err.message}` };
    }
    return { error: err instanceof Error ? err.message : "Something went wrong." };
  }
}
