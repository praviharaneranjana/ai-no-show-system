"use server";

import { revalidatePath } from "next/cache";

import { assignWaitlistSlot, updateDoctorDelay } from "@/lib/api";

export async function assignWaitlistSlotAction(waitlistId: string) {
  await assignWaitlistSlot(waitlistId);
  revalidatePath("/capacity");
}

export async function updateDoctorDelayAction(sessionId: string, delayMinutes: number) {
  await updateDoctorDelay(sessionId, delayMinutes, delayMinutes > 0 ? "delayed" : "on_time");
  revalidatePath("/capacity");
  revalidatePath("/");
}
