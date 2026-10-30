"use client";

import * as React from "react";
import { Phone, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PhoneInputProps {
  value?: string; // Stored as standard e.g. "+94771234567"
  onChange: (e164Value: string) => void;
  disabled?: boolean;
  error?: boolean;
  placeholder?: string;
  className?: string;
}

const VALID_LK_PREFIXES = new Set(["70", "71", "72", "74", "75", "76", "77", "78", "11", "21", "25", "31", "81", "91"]);

export function PhoneInput({
  value = "",
  onChange,
  disabled = false,
  error = false,
  placeholder = "7X XXX XXXX",
  className,
}: PhoneInputProps) {
  // Extract the local part after +94
  const extractLocalDigits = (raw: string): string => {
    let cleaned = raw.replace(/\D/g, "");
    if (cleaned.startsWith("94")) {
      cleaned = cleaned.slice(2);
    } else if (cleaned.startsWith("0")) {
      cleaned = cleaned.slice(1);
    }
    return cleaned.slice(0, 9); // Max 9 local digits in Sri Lanka
  };

  const localDigits = extractLocalDigits(value);

  // Format local digits into "7X XXX XXXX"
  const formatDisplay = (digits: string): string => {
    if (!digits) return "";
    let formatted = digits.slice(0, 2);
    if (digits.length > 2) {
      formatted += " " + digits.slice(2, 5);
    }
    if (digits.length > 5) {
      formatted += " " + digits.slice(5, 9);
    }
    return formatted;
  };

  const displayValue = formatDisplay(localDigits);

  const prefix = localDigits.slice(0, 2);
  const isValidPrefix = localDigits.length < 2 || VALID_LK_PREFIXES.has(prefix);
  const isComplete = localDigits.length === 9 && isValidPrefix;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const digits = extractLocalDigits(raw);
    const e164 = digits ? `+94${digits}` : "";
    onChange(e164);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text");
    const digits = extractLocalDigits(pasted);
    const e164 = digits ? `+94${digits}` : "";
    onChange(e164);
  };

  return (
    <div className={cn("relative w-full", className)}>
      <div
        className={cn(
          "flex h-10 w-full items-center rounded-lg border bg-background px-3 py-2 text-sm ring-offset-background transition-colors",
          "focus-within:ring-2 focus-within:ring-emerald-500 focus-within:border-emerald-500",
          error || (!isValidPrefix && localDigits.length >= 2)
            ? "border-destructive ring-destructive/20"
            : "border-input",
          disabled && "cursor-not-allowed opacity-50 bg-muted/40"
        )}
      >
        {/* Country Badge */}
        <div className="flex items-center gap-1.5 pr-2.5 mr-2.5 border-r border-border select-none shrink-0 text-muted-foreground font-medium">
          <span className="text-base leading-none">🇱🇰</span>
          <span className="text-xs font-semibold text-foreground">+94</span>
        </div>

        {/* Input Field */}
        <input
          type="tel"
          disabled={disabled}
          value={displayValue}
          onChange={handleChange}
          onPaste={handlePaste}
          placeholder={placeholder}
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground tracking-wider font-mono"
        />

        {/* Status indicator */}
        <div className="flex items-center ml-2 shrink-0">
          {isComplete ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          ) : !isValidPrefix && localDigits.length >= 2 ? (
            <span title="Invalid Sri Lankan mobile prefix (expected 70, 71, 72, 74, 75, 76, 77, 78)">
              <AlertCircle className="h-4 w-4 text-destructive" />
            </span>
          ) : (
            <Phone className="h-4 w-4 text-muted-foreground/60" />
          )}
        </div>
      </div>

      {!isValidPrefix && localDigits.length >= 2 && (
        <p className="mt-1 text-[11px] text-destructive">
          Invalid SL operator code &apos;{prefix}&apos;. Use 70, 71, 72, 74, 75, 76, 77, 78.
        </p>
      )}
    </div>
  );
}
