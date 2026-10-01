"use server";

import { revalidatePath } from "next/cache";
import { updateAppointmentOutcome } from "@/lib/api";

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
