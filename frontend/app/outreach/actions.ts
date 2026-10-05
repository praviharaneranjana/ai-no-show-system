"use server";

import { revalidatePath } from "next/cache";

import { draftOutreach, simulateAgent } from "@/lib/api";
import type { AgentSimulateResult, InterventionLanguage, OutreachDraft } from "@/lib/types";

export async function simulateAgentAction(
  appointmentId: string,
  message: string,
  language: InterventionLanguage
): Promise<AgentSimulateResult> {
  const result = await simulateAgent(appointmentId, message, language);
  revalidatePath("/outreach");
  return result;
}

export async function draftOutreachAction(
  appointmentId: string,
  language: InterventionLanguage,
  occasion = "reminder"
): Promise<OutreachDraft> {
  return draftOutreach(appointmentId, language, occasion);
}
