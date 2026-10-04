"use client";

import { useSyncExternalStore } from "react";
import { Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";

function subscribe(callback: () => void) {
  if (typeof document === "undefined") return () => {};
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}

function getSnapshot() {
  if (typeof document === "undefined") return false;
  return document.documentElement.classList.contains("dark");
}

function getServerSnapshot() {
  return false;
}

interface ThemePillProps {
  className?: string;
  size?: "sm" | "default";
  /** Single icon button that flips the theme (collapsed sidebar). */
  compact?: boolean;
}

export function ThemePill({ className, size = "default", compact = false }: ThemePillProps) {
  const isDark = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function setTheme(dark: boolean) {
    if (dark) {
      document.documentElement.classList.add("dark");
      try {
        localStorage.setItem("theme", "dark");
      } catch {}
    } else {
      document.documentElement.classList.remove("dark");
      try {
        localStorage.setItem("theme", "light");
      } catch {}
    }
  }

  const isSmall = size === "sm";

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => setTheme(!isDark)}
        aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
        title={isDark ? "Switch to light theme" : "Switch to dark theme"}
        className={cn(
          "flex size-10 items-center justify-center rounded-full bg-[#F3F3F7] text-[#8C8CA1] transition-colors hover:text-[#171725] dark:bg-[#12121C] dark:hover:text-white",
          className
        )}
      >
        {isDark ? <Moon className="size-4 text-[#C4B5FD]" /> : <Sun className="size-4 text-amber-500" />}
      </button>
    );
  }

  return (
    <div
      role="radiogroup"
      aria-label="Theme selection"
      className={cn(
        "flex w-full items-center rounded-full bg-[#F3F3F7] p-1 text-xs font-semibold text-[#8C8CA1] transition-colors dark:bg-[#12121C]",
        className
      )}
    >
      <button
        type="button"
        role="radio"
        aria-checked={!isDark}
        onClick={() => setTheme(false)}
        className={cn(
          "flex flex-1 items-center justify-center gap-1.5 rounded-full text-center transition-all",
          isSmall ? "py-1 text-[11px]" : "py-1.5 text-xs",
          !isDark
            ? "bg-[#171725] text-white shadow-xs"
            : "text-[#8C8CA1] hover:text-[#171725] dark:hover:text-white"
        )}
      >
        <Sun className={cn("size-3.5", !isDark && "text-amber-400")} />
        <span>Light</span>
      </button>

      <button
        type="button"
        role="radio"
        aria-checked={isDark}
        onClick={() => setTheme(true)}
        className={cn(
          "flex flex-1 items-center justify-center gap-1.5 rounded-full text-center transition-all",
          isSmall ? "py-1 text-[11px]" : "py-1.5 text-xs",
          isDark
            ? "bg-[#8B7CF6] text-white shadow-xs"
            : "text-[#8C8CA1] hover:text-[#171725] dark:hover:text-white"
        )}
      >
        <Moon className={cn("size-3.5", isDark && "text-white")} />
        <span>Dark</span>
      </button>
    </div>
  );
}
