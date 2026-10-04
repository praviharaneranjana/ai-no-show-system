"use server";

import { revalidatePath } from "next/cache";
import { getRescheduleOptions, rescheduleAppointment, updateAppointmentOutcome } from "@/lib/api";
import type { Appointment, SlotOption } from "@/lib/types";

export async function recordOutcomeAction(
  appointmentId: string,
  noShow: boolean | null,
  reason?: string,
  cancelled?: boolean
) {
  await updateAppointmentOutcome(appointmentId, noShow, reason, cancelled);
  revalidatePath(`/appointments/${appointmentId}`);
  revalidatePath("/");
  revalidatePath("/analytics");
  revalidatePath("/predictions");
  revalidatePath("/appointments/reconcile");
}

export async function getRescheduleOptionsAction(appointmentId: string): Promise<SlotOption[] | null> {
  try {
    return await getRescheduleOptions(appointmentId);
  } catch {
    return null;
  }
}

/** Moves the booking to an open session (any doctor of the department), optionally messaging the patient. */
export async function rescheduleAction(
  appointmentId: string,
  slot: { day: string; sessionId: string; doctorId: string },
  notify: boolean,
  language: string
): Promise<{ ok: true; newId: string; message: string | null; appointment: Appointment } | { ok: false; message: string }> {
  try {
    const moved = await rescheduleAppointment(appointmentId, {
      appointment_day: slot.day,
      clinic_session_id: slot.sessionId,
      doctor_id: slot.doctorId,
      notify,
      language,
    });
    revalidatePath(`/appointments/${appointmentId}`);
    revalidatePath("/");
    revalidatePath("/predictions");
    revalidatePath("/capacity");
    revalidatePath("/outreach");
    return { ok: true, newId: moved.appointment.id, message: moved.message, appointment: moved.appointment };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Could not reschedule" };
  }
}
