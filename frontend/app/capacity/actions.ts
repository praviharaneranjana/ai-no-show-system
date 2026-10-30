"use server";

import { revalidatePath } from "next/cache";

import {
  assignWaitlistSlot,
  updateDoctorDelay,
  getCapacityOverview,
  getCapacitySlots,
  evaluateWhatIf,
  getCapacityScenarios,
  saveCapacityScenario,
  deleteCapacityScenario,
  getSlotOffers,
  actOnSlotOffer,
  getCapacityForecast,
  getCapacityAccuracy,
  getCapacitySettings,
  updateCapacitySettings,
  getCapacityNavCounts,
  isRedirectError,
} from "@/lib/api";
import type {
  CapacityOptimizeResult,
  CapacitySlotsResponse,
  WhatIfRequest,
  WhatIfResponse,
  CapacityScenario,
  SlotOffer,
  ForecastResponse,
  AccuracyResponse,
  CapacitySetting,
  CapacityNavCounts,
  WaitlistAssignResult,
} from "@/lib/types";

export async function assignWaitlistSlotAction(
  waitlistId: string
): Promise<{ ok: true; result: WaitlistAssignResult } | { ok: false; message: string }> {
  try {
    const result = await assignWaitlistSlot(waitlistId);
    revalidatePath("/capacity");
    return { ok: true, result };
  } catch (err) {
    if (isRedirectError(err)) throw err;
    return { ok: false, message: err instanceof Error ? err.message : "Could not book a slot" };
  }
}

export async function updateDoctorDelayAction(sessionId: string, delayMinutes: number) {
  await updateDoctorDelay(sessionId, delayMinutes, delayMinutes > 0 ? "delayed" : "on_time");
  revalidatePath("/capacity");
  revalidatePath("/");
}

export async function getCapacityOverviewAction(date?: string): Promise<CapacityOptimizeResult | null> {
  try {
    return await getCapacityOverview(date);
  } catch (err) {
    console.error("getCapacityOverviewAction error:", err);
    return null;
  }
}

export async function getCapacitySlotsAction(
  date?: string,
  doctorId?: string
): Promise<CapacitySlotsResponse | null> {
  try {
    return await getCapacitySlots(date, doctorId);
  } catch (err) {
    console.error("getCapacitySlotsAction error:", err);
    return null;
  }
}

export async function evaluateWhatIfAction(params: WhatIfRequest): Promise<WhatIfResponse | null> {
  try {
    return await evaluateWhatIf(params);
  } catch (err) {
    console.error("evaluateWhatIfAction error:", err);
    return null;
  }
}

export async function getCapacityScenariosAction(): Promise<CapacityScenario[]> {
  try {
    return await getCapacityScenarios();
  } catch (err) {
    console.error("getCapacityScenariosAction error:", err);
    return [];
  }
}

export async function saveCapacityScenarioAction(scenario: {
  name: string;
  notes?: string;
  department?: string;
  params: Record<string, unknown>;
  results: Record<string, unknown>;
}): Promise<CapacityScenario | null> {
  try {
    const res = await saveCapacityScenario(scenario);
    revalidatePath("/capacity");
    return res;
  } catch (err) {
    console.error("saveCapacityScenarioAction error:", err);
    return null;
  }
}

export async function deleteCapacityScenarioAction(id: string): Promise<boolean> {
  try {
    await deleteCapacityScenario(id);
    revalidatePath("/capacity");
    return true;
  } catch (err) {
    console.error("deleteCapacityScenarioAction error:", err);
    return false;
  }
}

export async function getSlotOffersAction(status?: string): Promise<SlotOffer[]> {
  try {
    return await getSlotOffers(status);
  } catch (err) {
    console.error("getSlotOffersAction error:", err);
    return [];
  }
}

export async function actOnSlotOfferAction(
  id: string,
  action: "approve" | "decline" | "undo"
): Promise<SlotOffer | null> {
  try {
    const res = await actOnSlotOffer(id, action);
    revalidatePath("/capacity");
    return res;
  } catch (err) {
    console.error("actOnSlotOfferAction error:", err);
    return null;
  }
}

export async function getCapacityForecastAction(
  days = 14,
  department?: string
): Promise<ForecastResponse | null> {
  try {
    return await getCapacityForecast(days, department);
  } catch (err) {
    console.error("getCapacityForecastAction error:", err);
    return null;
  }
}

export async function getCapacityAccuracyAction(
  days = 30,
  department?: string,
  doctorId?: string
): Promise<AccuracyResponse | null> {
  try {
    return await getCapacityAccuracy(days, department, doctorId);
  } catch (err) {
    console.error("getCapacityAccuracyAction error:", err);
    return null;
  }
}

export async function getCapacitySettingsAction(scope = "global"): Promise<CapacitySetting | null> {
  try {
    return await getCapacitySettings(scope);
  } catch (err) {
    console.error("getCapacitySettingsAction error:", err);
    return null;
  }
}

export async function updateCapacitySettingsAction(
  scope: string,
  data: Partial<CapacitySetting>
): Promise<CapacitySetting | null> {
  try {
    const res = await updateCapacitySettings(scope, data);
    revalidatePath("/capacity");
    return res;
  } catch (err) {
    console.error("updateCapacitySettingsAction error:", err);
    return null;
  }
}

export async function getCapacityNavCountsAction(): Promise<CapacityNavCounts | null> {
  try {
    return await getCapacityNavCounts();
  } catch (err) {
    console.error("getCapacityNavCountsAction error:", err);
    return null;
  }
}
