"use client";

import * as React from "react";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// 2026 Sri Lankan Poya Days (UTC+5:30) approximate calendar
const POYA_DATES_2026 = new Set([
  "2026-01-03", "2026-02-01", "2026-03-03", "2026-04-01", "2026-05-01", "2026-05-31",
  "2026-06-29", "2026-07-29", "2026-08-27", "2026-09-26", "2026-10-25", "2026-11-24", "2026-12-23"
]);

export interface DatePickerProps {
  value?: string; // YYYY-MM-DD
  onChange: (dateStr: string) => void;
  allowedWeekdays?: number[]; // 0 = Mon ... 6 = Sun
  doctorName?: string;
  disabled?: boolean;
  error?: boolean;
  minDate?: string;
  maxDate?: string;
  placeholder?: string;
  className?: string;
}

export function DatePicker({
  value,
  onChange,
  allowedWeekdays,
  doctorName,
  disabled = false,
  error = false,
  minDate,
  maxDate,
  placeholder = "Select appointment date",
  className,
}: DatePickerProps) {
  const [isOpen, setIsOpen] = React.useState(false);

  // Initialize viewing month from current value or today
  const todayStr = React.useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }, []);

  const effectiveMinDate = minDate || todayStr;

  const [viewDate, setViewDate] = React.useState(() => {
    const init = value || todayStr;
    const [y, m] = init.split("-").map(Number);
    return new Date(y, m - 1, 1);
  });

  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  // Calendar matrix calculation
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayWeekday = (new Date(year, month, 1).getDay() + 6) % 7; // Convert Sun=0..Sat=6 to Mon=0..Sun=6

  const prevMonth = () => {
    setViewDate(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    setViewDate(new Date(year, month + 1, 1));
  };

  const formatDateStr = (y: number, m: number, d: number) => {
    const mm = String(m + 1).padStart(2, "0");
    const dd = String(d).padStart(2, "0");
    return `${y}-${mm}-${dd}`;
  };

  // Quick select chip helpers
  const handleQuickSelect = (daysOffset: number, targetWeekday?: number) => {
    const now = new Date();
    if (targetWeekday !== undefined) {
      // Find next occurrence of weekday (0=Mon..6=Sun)
      let diff = (targetWeekday - ((now.getDay() + 6) % 7) + 7) % 7;
      if (diff === 0) diff = 7;
      now.setDate(now.getDate() + diff);
    } else {
      now.setDate(now.getDate() + daysOffset);
    }
    const str = formatDateStr(now.getFullYear(), now.getMonth(), now.getDate());
    onChange(str);
    setViewDate(new Date(now.getFullYear(), now.getMonth(), 1));
    setIsOpen(false);
  };

  const displayFormatted = React.useMemo(() => {
    if (!value) return null;
    const [y, m, d] = value.split("-").map(Number);
    const dateObj = new Date(y, m - 1, d);
    return dateObj.toLocaleDateString("en-US", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }, [value]);

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={cn(
          "flex h-10 w-full items-center justify-between rounded-lg border bg-background px-3 py-2 text-sm ring-offset-background transition-colors outline-none",
          "hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:border-emerald-500",
          error ? "border-destructive ring-destructive/20" : "border-input",
          disabled && "cursor-not-allowed opacity-50 bg-muted/40",
          isOpen && "ring-2 ring-emerald-500/20 border-emerald-500"
        )}
      >
        <span className={cn("truncate text-left", !value && "text-muted-foreground")}>
          {displayFormatted || placeholder}
        </span>
        <CalendarIcon className="h-4 w-4 text-muted-foreground ml-2 shrink-0" />
      </button>

      {isOpen && (
        <div className="absolute top-[calc(100%+4px)] left-0 z-50 w-72 sm:w-80 rounded-xl border border-border bg-popover text-popover-foreground shadow-xl p-3 animate-in fade-in-0 zoom-in-95 duration-100 select-none">
          {/* Quick select chips */}
          <div className="flex items-center gap-1.5 pb-2 mb-2 border-b border-border overflow-x-auto text-[11px]">
            <button
              type="button"
              onClick={() => handleQuickSelect(0)}
              className="px-2 py-1 rounded bg-secondary hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:text-emerald-600 transition-colors shrink-0"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => handleQuickSelect(1)}
              className="px-2 py-1 rounded bg-secondary hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:text-emerald-600 transition-colors shrink-0"
            >
              Tomorrow
            </button>
            <button
              type="button"
              onClick={() => handleQuickSelect(0, 0)} // next Monday
              className="px-2 py-1 rounded bg-secondary hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:text-emerald-600 transition-colors shrink-0"
            >
              Next Mon
            </button>
          </div>

          {/* Month & Year header */}
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-sm font-semibold tracking-tight">
              {monthNames[month]} {year}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={prevMonth}
                className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Previous month"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={nextMonth}
                className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Next month"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-muted-foreground mb-1">
            <span>Mo</span>
            <span>Tu</span>
            <span>We</span>
            <span>Th</span>
            <span>Fr</span>
            <span>Sa</span>
            <span>Su</span>
          </div>

          {/* Days matrix */}
          <div className="grid grid-cols-7 gap-1 text-xs">
            {/* Empty slots before first day */}
            {Array.from({ length: firstDayWeekday }).map((_, i) => (
              <div key={`empty-${i}`} className="h-8 w-8" />
            ))}

            {/* Days in month */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const dayNum = i + 1;
              const dateStr = formatDateStr(year, month, dayNum);
              const dateObj = new Date(year, month, dayNum);
              const dayOfWeek = (dateObj.getDay() + 6) % 7; // Mon=0..Sun=6

              const isPast = effectiveMinDate ? dateStr < effectiveMinDate : false;
              const isFutureLimit = maxDate ? dateStr > maxDate : false;
              const isWeekdayAllowed = allowedWeekdays ? allowedWeekdays.includes(dayOfWeek) : true;
              const isPoya = POYA_DATES_2026.has(dateStr);

              const isSelected = value === dateStr;
              const isToday = dateStr === todayStr;

              const isDayDisabled = isPast || isFutureLimit || !isWeekdayAllowed;

              let tooltip = "";
              if (isPast) tooltip = "Cannot select past date";
              else if (!isWeekdayAllowed && doctorName) tooltip = `${doctorName} has no clinic session on this weekday`;
              else if (isPoya) tooltip = "Poya Day (Full Moon Holiday)";

              return (
                <button
                  key={dateStr}
                  type="button"
                  disabled={isDayDisabled}
                  title={tooltip}
                  onClick={() => {
                    if (!isDayDisabled) {
                      onChange(dateStr);
                      setIsOpen(false);
                    }
                  }}
                  className={cn(
                    "relative h-8 w-8 flex items-center justify-center rounded-md text-xs font-medium transition-all outline-none",
                    isSelected &&
                      "bg-emerald-500 text-white font-semibold shadow-sm hover:bg-emerald-600",
                    !isSelected && !isDayDisabled &&
                      "hover:bg-accent text-foreground",
                    isToday && !isSelected && "border border-emerald-500 text-emerald-600 dark:text-emerald-400 font-semibold",
                    isDayDisabled &&
                      "text-muted-foreground/40 cursor-not-allowed bg-muted/20 line-through decoration-muted-foreground/20",
                    isPoya && !isSelected && "font-bold text-amber-600 dark:text-amber-400"
                  )}
                >
                  <span>{dayNum}</span>
                  {isPoya && (
                    <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-amber-500 shadow-sm" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center justify-between pt-2 mt-2 border-t border-border text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              Poya Day
            </span>
            {allowedWeekdays && (
              <span className="text-[10px] text-muted-foreground">
                Active clinic days highlighted
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
