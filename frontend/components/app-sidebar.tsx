"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  CalendarDays,
  BarChart3,
  PlusCircle,
  Gauge,
  MessagesSquare,
  Calculator,
  LogOut,
  ChevronRight,
  Sparkles,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { ShaiLogo } from "@/components/shai-logo";
import { ThemePill } from "@/components/theme-pill";

interface AppSidebarProps {
  onItemClick?: () => void;
  className?: string;
}

export function AppSidebar({ onItemClick, className }: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  // The snapshot must be a primitive: returning a fresh object each call makes
  // useSyncExternalStore loop forever ("getSnapshot should be cached").
  const userKey = useSyncExternalStore(
    (callback) => {
      window.addEventListener("storage", callback);
      return () => window.removeEventListener("storage", callback);
    },
    () => {
      try {
        return `${localStorage.getItem("shai_user_name") ?? ""}|${localStorage.getItem("shai_user_role") ?? ""}`;
      } catch {
        return "|";
      }
    },
    () => "|"
  );

  const [storedName, storedRole] = userKey.split("|");
  const userName = storedName || "Staff Member";
  const userRole =
    storedRole === "admin"
      ? "Administrator · Colombo"
      : storedRole === "manager"
      ? "Clinical Ops Manager"
      : "Front Desk · Colombo";

  const NAV_ITEMS = [
    {
      href: "/",
      label: "Dashboard",
      icon: CalendarDays,
      exact: true,
    },
    {
      href: "/appointments",
      label: "Appointments",
      icon: CalendarDays,
      exact: false,
    },
    {
      href: "/capacity",
      label: "Capacity",
      icon: Gauge,
      exact: false,
      badge: "2 wait",
      badgeVariant: "violet",
    },
    {
      href: "/outreach",
      label: "Outreach Hub",
      icon: MessagesSquare,
      exact: false,
      badge: "4",
      badgeVariant: "rose",
    },
    {
      href: "/simulator",
      label: "ROI Simulator",
      icon: Calculator,
      exact: false,
    },
    {
      href: "/analytics",
      label: "Analytics",
      icon: BarChart3,
      exact: false,
    },
    {
      href: "/new",
      label: "New Appointment",
      icon: PlusCircle,
      exact: false,
    },
  ];

  function handleSignOut() {
    document.cookie = "shai_session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    try {
      localStorage.removeItem("shai_user_role");
      localStorage.removeItem("shai_user_name");
    } catch {}
    router.push("/login");
  }

  // Get user initials
  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "SH";

  return (
    <aside
      className={cn(
        "flex h-full w-full flex-col justify-between border-r border-[#F0F0F4] bg-white p-5 text-[#171725] transition-colors dark:border-[#272738] dark:bg-[#171722] dark:text-[#F5F5FA]",
        className
      )}
    >
      <div className="flex flex-col gap-6">
        {/* Logo Brand Header */}
        <Link
          href="/"
          onClick={onItemClick}
          className="group flex items-center transition-opacity hover:opacity-95"
        >
          <ShaiLogo variant="horizontal" size="default" />
        </Link>

        {/* Navigation Items (Dropify-style active gradient pill with chevron) */}
        <nav className="flex flex-col gap-1.5" aria-label="Main Navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = item.exact
              ? pathname === item.href
              : pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onItemClick}
                className={cn(
                  "group relative flex items-center justify-between rounded-2xl px-3.5 py-2.5 text-[13px] font-semibold transition-all",
                  isActive
                    ? "bg-gradient-to-r from-[#8B7CF6] to-[#5B7CFA] text-white shadow-md shadow-[#8B7CF6]/25"
                    : "text-[#8C8CA1] hover:bg-[#F5F5F9] hover:text-[#171725] dark:hover:bg-[#222234] dark:hover:text-white"
                )}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={cn(
                      "size-4 shrink-0 transition-transform group-hover:scale-105",
                      isActive
                        ? "text-white"
                        : "text-[#8C8CA1] group-hover:text-[#171725] dark:group-hover:text-white"
                    )}
                  />
                  <span>{item.label}</span>
                </div>

                <div className="flex items-center gap-1.5">
                  {item.badge && !isActive && (
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-bold leading-none",
                        item.badgeVariant === "rose"
                          ? "bg-[#FFE4E6] text-[#E11D48] dark:bg-rose-950/60 dark:text-rose-300"
                          : "bg-[#EDE9FE] text-[#8B7CF6] dark:bg-[#8B7CF6]/20 dark:text-[#C4B5FD]"
                      )}
                    >
                      {item.badge}
                    </span>
                  )}
                  {isActive && (
                    <ChevronRight className="size-4 shrink-0 text-white/80" />
                  )}
                </div>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Bottom Area: Promo Card, Profile & Theme Toggle */}
      <div className="flex flex-col gap-4 pt-4 border-t border-[#F0F0F4] dark:border-[#272738]">
        {/* Model Promo Card (§0 Thesis Honesty Rule) */}
        <div className="relative overflow-hidden rounded-2xl border border-[#DDD6FE]/60 bg-gradient-to-br from-[#EDE9FE] to-[#F5F3FF] p-3.5 dark:border-[#383850] dark:from-[#252538] dark:to-[#1C1C2A]">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#8B7CF6] dark:text-[#C4B5FD]">
              Risk Model · v1.0
            </span>
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Active
            </span>
          </div>

          <div className="text-[13px] font-extrabold text-[#171725] dark:text-white">
            ROC-AUC 0.672 · 1.8× Lift
          </div>
          <p className="mt-0.5 text-[10px] text-[#78788C] dark:text-[#A0A0B8] leading-tight">
            XGBoost calibrated risk telemetry
          </p>

          <div className="mt-2.5 flex items-center justify-between pt-1.5 border-t border-[#DDD6FE]/40 text-[9px] text-[#8C8CA1] dark:border-[#383850]">
            <span className="flex items-center gap-1 font-medium">
              <Sparkles className="size-2.5 text-[#8B7CF6]" />
              Synthetic data · simulation
            </span>
            <span className="font-mono text-[9px]">15.9% base</span>
          </div>
        </div>

        {/* User Profile Block */}
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2.5">
            <div className="relative flex size-9 shrink-0 items-center justify-center rounded-full bg-[#EDE9FE] font-bold text-xs text-[#8B7CF6] ring-2 ring-white dark:bg-[#252538] dark:text-[#C4B5FD] dark:ring-[#171722]">
              {initials}
              <span className="absolute bottom-0 right-0 size-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-[#171722]" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-bold leading-tight text-[#171725] dark:text-white">
                {userName}
              </span>
              <span className="text-[10px] font-medium leading-tight text-[#8C8CA1]">
                {userRole}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSignOut}
            title="Sign out of shared workstation"
            className="rounded-lg p-1.5 text-[#8C8CA1] transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
          >
            <LogOut className="size-4" />
            <span className="sr-only">Sign out</span>
          </button>
        </div>

        {/* Segmented Light/Dark Pill Toggle */}
        <ThemePill size="default" />
      </div>
    </aside>
  );
}
