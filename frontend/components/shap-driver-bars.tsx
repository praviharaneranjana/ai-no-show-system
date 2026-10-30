import { cn, formatOddsMultiplier } from "@/lib/utils";
import type { FeatureContribution } from "@/lib/types";

export function formatFeatureLabel(feature: string, value?: number | string | boolean): { label: string; formattedVal: string } {
  const normKey = feature.toLowerCase().trim();

  const DOW_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  if (normKey === "age") {
    return { label: "Patient Age", formattedVal: `${value ?? "—"} yrs` };
  }
  if (normKey === "distance_km") {
    const valNum = typeof value === "number" ? value.toFixed(1) : value;
    return { label: "Distance from Hospital", formattedVal: `${valNum ?? "—"} km away` };
  }
  if (normKey === "lead_days" || normKey === "daysahead") {
    return { label: "Booking Lead Time", formattedVal: `Booked ${value ?? "—"}d ahead` };
  }
  if (normKey === "prior_no_shows") {
    return { label: "Prior Missed Visits", formattedVal: `${value ?? 0} previous no-shows` };
  }
  if (normKey === "prior_appts") {
    return { label: "Total Prior Visits", formattedVal: `${value ?? 0} bookings` };
  }
  if (normKey === "prior_no_show_rate") {
    const pct = typeof value === "number" ? Math.round(value * 100) : value;
    return { label: "Historical No-Show Rate", formattedVal: `${pct}% rate` };
  }
  if (normKey === "is_first_visit") {
    return { label: "First Hospital Visit", formattedVal: value ? "New Patient" : "Returning" };
  }
  if (normKey === "chronic_count") {
    return { label: "Chronic Conditions", formattedVal: `${value ?? 0} conditions` };
  }
  if (normKey === "sms_sent" || normKey === "sms_received") {
    return { label: "Reminder SMS Status", formattedVal: value ? "SMS Reminder Sent" : "No SMS Sent" };
  }
  if (normKey === "appt_dow" || normKey === "dayofweek") {
    const dayName = typeof value === "number" && value >= 0 && value < 7 ? DOW_NAMES[value] : `${value}`;
    return { label: "Clinic Day of Week", formattedVal: `${dayName} appointment` };
  }
  if (normKey === "appt_hour") {
    const hour = typeof value === "number" ? `${value % 12 || 12} ${value >= 12 ? "PM" : "AM"}` : `${value}`;
    return { label: "Appointment Slot Time", formattedVal: `${hour} slot` };
  }
  if (normKey === "appt_month" || normKey === "month") {
    const mName = typeof value === "number" && value >= 1 && value <= 12 ? MONTH_NAMES[value - 1] : `${value}`;
    return { label: "Appointment Month", formattedVal: `${mName}` };
  }
  if (normKey === "is_poya") {
    return { label: "Sri Lankan Poya Holiday", formattedVal: value ? "Poya Day" : "Regular Day" };
  }
  if (normKey === "is_weekend" || normKey === "isweekend") {
    return { label: "Weekend Appointment", formattedVal: value ? "Weekend Slot" : "Weekday Slot" };
  }
  if (normKey === "heavy_rain") {
    return { label: "Monsoon Weather", formattedVal: value ? "Heavy Rain Forecast" : "Clear Weather" };
  }
  if (normKey === "distance_missing") {
    return { label: "Address Information", formattedVal: value ? "Distance Not Provided" : "Address Verified" };
  }
  if (normKey.startsWith("booking_channel_") || normKey === "booking_channel") {
    const ch = normKey.replace("booking_channel_", "").toUpperCase();
    return { label: "Booking Channel", formattedVal: `Booked via ${ch || value}` };
  }
  if (normKey.startsWith("payment_mode_") || normKey === "payment_mode") {
    const pm = normKey.replace("payment_mode_", "").replace(/_/g, " ").toUpperCase();
    return { label: "Payment Mode", formattedVal: `${pm || value}` };
  }
  if (normKey.startsWith("department_") || normKey === "department") {
    const dept = normKey.replace("department_", "").replace(/_/g, " ");
    return { label: "Specialty Clinic", formattedVal: `${dept || value}` };
  }
  if (normKey.startsWith("gender_") || normKey === "gender") {
    return { label: "Patient Gender", formattedVal: `${value || normKey.replace("gender_", "")}` };
  }

  // Fallback
  const cleanName = feature.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return { label: cleanName, formattedVal: value !== undefined ? `${value}` : "" };
}

interface ShapDriverBarsProps {
  contributions: FeatureContribution[];
  limit?: number;
  className?: string;
}

export function ShapDriverBars({
  contributions,
  limit = 3,
  className,
}: ShapDriverBarsProps) {
  if (!contributions || contributions.length === 0) {
    return (
      <div className="py-2 text-center text-xs text-muted-foreground">
        No feature driver telemetry recorded
      </div>
    );
  }

  const items = contributions.slice(0, limit);
  // Find max magnitude for relative bar width
  const maxMag = Math.max(...items.map((i) => Math.abs(i.contribution)), 0.05);

  return (
    <div className={cn("space-y-2.5", className)}>
      {items.map((item, idx) => {
        const isPushUp = item.contribution > 0;
        const barWidth = Math.max(Math.min((Math.abs(item.contribution) / maxMag) * 100, 100), 12);
        const { label, formattedVal } = formatFeatureLabel(item.feature, item.value);

        return (
          <div key={idx} className="flex flex-col text-xs">
            <div className="flex items-center justify-between pb-1">
              <span className="font-medium text-foreground truncate max-w-[200px]" title={label}>
                {formattedVal || label}
              </span>
              <span
                className={cn(
                  "font-bold font-mono text-[11px] shrink-0",
                  isPushUp ? "text-[#E11D48]" : "text-[#16A34A]"
                )}
              >
                {formatOddsMultiplier(item.contribution)}
              </span>
            </div>

            <div className="h-1.5 w-full rounded-full bg-[#F0F0F5] dark:bg-[#252538] overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  isPushUp ? "bg-[#E11D48]" : "bg-[#16A34A]"
                )}
                style={{ width: `${barWidth}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
