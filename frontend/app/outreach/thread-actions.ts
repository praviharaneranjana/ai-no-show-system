"use server";

import { revalidatePath } from "next/cache";

import {
  approveConversation,
  bookConversation,
  getAppointmentConversation,
  getAppointmentHistory,
  getAttention,
  getThread,
  listThreads,
  rejectConversation,
  resumeConversation,
  sendIncoming,
  sendStaffMessage,
  startConversation,
  takeOverConversation,
} from "@/lib/api";
import type {
  AttentionSummary,
  HistoryStep,
  RescheduleConversation,
  ThreadDetail,
  ThreadSummary,
} from "@/lib/types";

type Result<T> = { ok: true; data: T } | { ok: false; message: string };

async function run<T>(fn: () => Promise<T>, paths: string[] = ["/outreach"]): Promise<Result<T>> {
  try {
    const data = await fn();
    paths.forEach((p) => revalidatePath(p));
    return { ok: true, data };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Something went wrong" };
  }
}

async function quiet<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

export async function listThreadsAction(q: string, status: string): Promise<ThreadSummary[] | null> {
  return quiet(() => listThreads(q, status));
}
export async function getThreadAction(patientId: string): Promise<ThreadDetail | null> {
  return quiet(() => getThread(patientId));
}
export async function attentionAction(): Promise<AttentionSummary | null> {
  return quiet(getAttention);
}
export async function appointmentConversationAction(id: string): Promise<RescheduleConversation | null> {
  return quiet(() => getAppointmentConversation(id));
}
export async function appointmentHistoryAction(id: string): Promise<HistoryStep[] | null> {
  return quiet(() => getAppointmentHistory(id));
}

export async function startConversationAction(appointmentId: string, language?: string) {
  return run(() => startConversation(appointmentId, language), ["/outreach", "/"]);
}
export async function sendIncomingAction(id: string, text: string) {
  return run(() => sendIncoming(id, text));
}
export async function sendStaffMessageAction(id: string, text: string) {
  return run(() => sendStaffMessage(id, text));
}
export async function approveConversationAction(id: string) {
  return run(() => approveConversation(id), ["/outreach", "/", "/capacity", "/predictions"]);
}
export async function rejectConversationAction(id: string, note?: string) {
  return run(() => rejectConversation(id, note));
}
export async function takeOverAction(id: string) {
  return run(() => takeOverConversation(id));
}
export async function resumeAction(id: string) {
  return run(() => resumeConversation(id));
}
export async function bookConversationAction(
  id: string,
  body: { clinic_session_id: string; appointment_day: string; doctor_id?: string; notify?: boolean; language?: string }
) {
  return run(() => bookConversation(id, body), ["/outreach", "/", "/capacity", "/predictions"]);
}
