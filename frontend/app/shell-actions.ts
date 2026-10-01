"use server";

// Thin server-action wrappers so client components (header search, notifications,
// messages drawer, trend tabs) can reach the backend without exposing the API key.
import {
  getNoShowTrend,
  getNotifications,
  getOutreachActivity,
  searchAll,
} from "@/lib/api";
import type {
  ActivityResponse,
  NotificationItem,
  SearchHit,
  TrendGranularity,
  TrendResponse,
} from "@/lib/types";

export async function searchAction(q: string): Promise<SearchHit[]> {
  if (q.trim().length < 2) return [];
  try {
    return await searchAll(q.trim());
  } catch {
    return [];
  }
}

export async function notificationsAction(): Promise<NotificationItem[] | null> {
  try {
    return (await getNotifications(50)).items;
  } catch {
    return null;
  }
}

export async function activityAction(limit: number): Promise<ActivityResponse | null> {
  try {
    return await getOutreachActivity(limit);
  } catch {
    return null;
  }
}

export async function trendAction(
  granularity: TrendGranularity,
  department?: string,
  doctor?: string
): Promise<TrendResponse | null> {
  try {
    return await getNoShowTrend(granularity, department, doctor);
  } catch {
    return null;
  }
}
