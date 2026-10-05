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

/**
 * Converts raw machine learning feature identifiers (e.g., "lead_days",
 * "payment_mode_Prepaid_Online", "department_Cardiology") into clean,
 * human-readable labels for UI presentation.
 */
export function formatDriverFeature(feature?: string, label?: string): string {
  if (label && !label.includes("_")) {
    return label;
  }
  if (!feature) return "Attendance Factor";

  const raw = feature.trim();

  if (raw.startsWith("payment_mode_")) {
    const mode = raw.replace(/^payment_mode_/i, "").replace(/_/g, " ");
    return `Payment: ${mode}`;
  }
  if (raw.startsWith("department_")) {
    const dept = raw.replace(/^department_/i, "").replace(/_/g, " ");
    return `Dept: ${dept}`;
  }
  if (raw.startsWith("booking_channel_")) {
    const ch = raw.replace(/^booking_channel_/i, "").replace(/_/g, " ");
    return `Channel: ${ch}`;
  }
  if (raw.startsWith("gender_")) {
    const g = raw.replace(/^gender_/i, "").toUpperCase();
    return `Gender: ${g === "M" ? "Male" : g === "F" ? "Female" : g}`;
  }

  const KNOWN: Record<string, string> = {
    lead_days: "Lead Time (Days)",
    daysahead: "Lead Time (Days)",
    distance_km: "Commute Distance",
    distance_missing: "Distance Not Provided",
    age: "Patient Age",
    chronic_count: "Chronic Conditions",
    prior_no_shows: "Prior Missed Visits",
    prior_appts: "Total Prior Visits",
    prior_no_show_rate: "Past No-Show Rate",
    is_first_visit: "First Visit (New Patient)",
    sms_sent: "SMS Reminder Sent",
    sms_received: "SMS Reminder Sent",
    appt_dow: "Clinic Day of Week",
    dayofweek: "Clinic Day of Week",
    appt_hour: "Appointment Hour",
    appt_month: "Appointment Month",
    month: "Appointment Month",
    is_poya: "Poya Holiday",
    is_weekend: "Weekend Appointment",
    isweekend: "Weekend Appointment",
    heavy_rain: "Heavy Monsoon Rain",
  };

  const norm = raw.toLowerCase();
  if (KNOWN[norm]) {
    return KNOWN[norm];
  }

  // Format any generic underscored string to Title Case
  return raw
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

