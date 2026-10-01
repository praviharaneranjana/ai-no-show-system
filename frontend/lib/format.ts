// Small shared formatters for the dashboard screens.

export function timeAgo(iso: string, now: number = Date.now()): string {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function formatLkr(value: number): string {
  if (value >= 1_000_000) return `Rs. ${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `Rs. ${(value / 1_000).toFixed(0)}k`;
  return `Rs. ${Math.round(value)}`;
}

export const LANGUAGE_LABEL: Record<string, string> = { en: "English", si: "Sinhala", ta: "Tamil" };

export const INTERVENTION_STATUS_LABEL: Record<string, string> = {
  sent: "Reminder sent",
  confirmed: "Confirmed",
  rescheduled: "Reschedule requested",
  telehealth_requested: "Telehealth requested",
};
