"use server";

import { revalidatePath } from "next/cache";

import { simulateAgent } from "@/lib/api";
import type { AgentSimulateResult, InterventionLanguage } from "@/lib/types";

export async function simulateAgentAction(
  appointmentId: string,
  message: string,
  language: InterventionLanguage
): Promise<AgentSimulateResult> {
  const result = await simulateAgent(appointmentId, message, language);
  revalidatePath("/outreach");
  return result;
}
