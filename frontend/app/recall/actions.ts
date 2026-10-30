"use server";

import { revalidatePath } from "next/cache";

import { draftRecall, getRecallQueue, getRescheduleOptions, logRecallContact, rebookRecall } from "@/lib/api";
import type { RecallDraft, RecallQueue, SlotOption } from "@/lib/types";

type Result<T> = { ok: true; data: T } | { ok: false; message: string };

async function run<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    const data = await fn();
    revalidatePath("/recall");
    return { ok: true, data };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Something went wrong" };
  }
}

export const recallQueueAction = async (days: number): Promise<RecallQueue | null> => {
  try {
    return await getRecallQueue(days);
  } catch {
    return null;
  }
};

export const recallOptionsAction = async (appointmentId: string): Promise<SlotOption[] | null> => {
  try {
    return await getRescheduleOptions(appointmentId);
  } catch {
    return null;
  }
};

export const recallDraftAction = async (appointmentId: string, language: string): Promise<Result<RecallDraft>> =>
  run(() => draftRecall(appointmentId, language));

export const recallContactAction = async (appointmentId: string, channel: string, message?: string): Promise<Result<{ ok: boolean }>> =>
  run(() => logRecallContact(appointmentId, { channel, message_text: message }));

export const recallRebookAction = async (
  appointmentId: string,
  body: { clinic_session_id: string; appointment_day: string; doctor_id?: string; notify?: boolean; language?: string }
) => run(() => rebookRecall(appointmentId, body));
