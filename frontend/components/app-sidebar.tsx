"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
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
  ChevronsLeft,
  ChevronsRight,
  Sparkles,
  Building2,
  MapPin,
  ShieldCheck,
  RotateCcw,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { logoutAction } from "@/app/login/actions";
import { ShaiLogo } from "@/components/shai-logo";
import { ThemePill } from "@/components/theme-pill";
import { getCapacityNavCountsAction } from "@/app/capacity/actions";
import { hasRole, type SessionRole } from "@/lib/session-token";
import type { CapacityNavCounts, ModelInfo } from "@/lib/types";

interface AppSidebarProps {
  onItemClick?: () => void;
  className?: string;
  /** Icon-only rail (desktop). */
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}

export function AppSidebar({ onItemClick, className, collapsed = false, onToggleCollapsed }: AppSidebarProps) {
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
        return `${localStorage.getItem("shai_user_name") ?? ""}|${localStorage.getItem("shai_user_role") ?? ""}|${localStorage.getItem("shai_hospital_name") ?? ""}|${localStorage.getItem("shai_hospital_code") ?? ""}`;
      } catch {
        return "|||";
      }
    },
    () => "|||"
  );

  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/model/info", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: ModelInfo | null) => {
        if (!cancelled) setModelInfo(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const [storedName, storedRole, storedHospitalName, storedHospitalCode] = userKey.split("|");
  const userName = storedName || "Staff Member";
  const hospitalName = storedHospitalName || "Asiri Central Hospital";
  const hospitalCode = storedHospitalCode || "ACH";

  const userRole =
    storedRole === "platform_owner"
      ? "Platform Owner"
      : storedRole === "admin"
      ? `Hospital Admin · ${hospitalCode}`
      : storedRole === "manager"
      ? `Clinical Ops Manager · ${hospitalCode}`
      : storedRole === "analyst"
      ? `Data Analyst · ${hospitalCode}`
      : `Front Desk · ${hospitalCode}`;

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
      minRole: "manager",
    },
    {
      href: "/outreach",
      label: "Outreach Hub",
      icon: MessagesSquare,
      exact: false,
    },
    {
      href: "/recall",
      label: "Missed-visit Recall",
      icon: RotateCcw,
      exact: false,
      hideForAnalyst: true,
    },
    {
      href: "/simulator",
      label: "Outreach ROI",
      icon: Calculator,
      exact: false,
      minRole: "manager",
    },
    {
      href: "/analytics",
      label: "Analytics",
      icon: BarChart3,
      exact: false,
      minRole: "analyst",
    },
    {
      href: "/predictions",
      label: "Prediction Hub",
      icon: Sparkles,
      exact: false,
    },
    {
      href: "/new",
      label: "New Appointment",
      icon: PlusCircle,
      exact: false,
      hideForAnalyst: true,
    },
    {
      href: "/admin/staff",
      label: "Staff & Access",
      icon: ShieldCheck,
      exact: false,
      adminOnly: true,
    },
  ];

  const isAdminOrOwner = storedRole === "admin" || storedRole === "platform_owner";
  const [navCounts, setNavCounts] = useState<CapacityNavCounts | null>(null);

  useEffect(() => {
    let mounted = true;
    async function loadCounts() {
      try {
        const counts = await getCapacityNavCountsAction();
        if (mounted && counts) {
          setNavCounts(counts);
        }
      } catch {
        // Silently swallow network / auth error on sidebar
      }
    }
    loadCounts();
    const interval = setInterval(loadCounts, 30000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  async function handleSignOut() {
    // The session cookie is httpOnly, so it can only be cleared on the server.
    await logoutAction();
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
        "flex h-full w-full flex-col overflow-hidden border-r border-[#F0F0F4] bg-white text-[#171725] transition-[padding,background-color] duration-300 dark:border-[#272738] dark:bg-[#171722] dark:text-[#F5F5FA]",
        collapsed ? "p-3" : "p-5",
        className
      )}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto">
        {/* Logo Brand Header: centred, with the collapse arrow */}
        <div className={cn("flex items-center", collapsed ? "flex-col gap-3" : "justify-between")}>
          <Link
            href="/"
            onClick={onItemClick}
            aria-label="SHAI home"
            className={cn("group flex items-center transition-opacity hover:opacity-95", collapsed ? "justify-center" : "flex-1 justify-center")}
          >
            {collapsed ? <ShaiLogo variant="glyph" size="md" /> : <ShaiLogo size="default" />}
          </Link>
          {onToggleCollapsed && (
            <button
              type="button"
              onClick={onToggleCollapsed}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-[#F0F0F4] text-[#8C8CA1] transition-all hover:border-[#8B7CF6]/50 hover:text-[#8B7CF6] dark:border-[#272738]"
            >
              {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
            </button>
          )}
        </div>

        {/* Navigation Items (Dropify-style active gradient pill with chevron) */}
        <nav className="flex flex-col gap-1.5" aria-label="Main Navigation">
          {NAV_ITEMS.filter((item) => {
            if (item.adminOnly && !isAdminOrOwner) return false;
            if (item.minRole && !hasRole(storedRole as SessionRole, item.minRole as SessionRole)) return false;
            if (item.hideForAnalyst && storedRole === "analyst") return false;
            return true;
          }).map((item) => {
            const Icon = item.icon;
            const isActive = item.exact
              ? pathname === item.href
              : pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onItemClick}
                title={collapsed ? item.label : undefined}
                aria-label={item.label}
                className={cn(
                  "group relative flex items-center rounded-2xl text-[13px] font-semibold transition-all",
                  collapsed ? "justify-center px-0 py-3" : "justify-between px-3.5 py-2.5",
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
                  {!collapsed && <span className="animate-in fade-in duration-300 whitespace-nowrap">{item.label}</span>}
                </div>

                {collapsed && (item.href === "/capacity" ? (navCounts?.waitlist_waiting ?? 0) > 0 : item.href === "/outreach" ? (navCounts?.open_slot_offers ?? 0) > 0 : false) && (
                  <span className="absolute right-2 top-2 size-2 rounded-full bg-[#8B7CF6] ring-2 ring-white dark:ring-[#171722]" />
                )}
                <div className={cn("flex items-center gap-1.5", collapsed && "hidden")}>
                  {item.href === "/capacity" && (navCounts?.waitlist_waiting ?? 0) > 0 && (
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums",
                        isActive
                          ? "bg-white/20 text-white"
                          : "bg-[#8B7CF6]/15 text-[#8B7CF6] dark:bg-[#8B7CF6]/25 dark:text-[#C4B5FD]"
                      )}
                    >
                      {navCounts?.waitlist_waiting} wait
                    </span>
                  )}
                  {item.href === "/outreach" && (navCounts?.open_slot_offers ?? 0) > 0 && (
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums",
                        isActive
                          ? "bg-white/20 text-white"
                          : "bg-amber-500/15 text-amber-600 dark:bg-amber-500/25 dark:text-amber-400"
                      )}
                    >
                      {navCounts?.open_slot_offers}
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

      {/* Bottom Area: Hospital Tab, Promo Card, Profile & Theme Toggle */}
      <div className="flex shrink-0 flex-col gap-3 pt-3 border-t border-[#F0F0F4] dark:border-[#272738]">
        {collapsed ? (
        <div className="flex flex-col items-center gap-3 animate-in fade-in duration-300">
          <Link
            href="/hospital"
            onClick={onItemClick}
            title={`${hospitalName} · Connected`}
            aria-label={hospitalName}
            className="relative flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#8B7CF6] to-[#5B7CFA] text-white shadow-sm transition-transform hover:scale-105"
          >
            <Building2 className="size-4" />
            <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-[#171722]" />
          </Link>

          <Link
            href="/model"
            onClick={onItemClick}
            title={
              modelInfo?.metrics.roc_auc != null
                ? `Risk model active · ROC-AUC ${modelInfo.metrics.roc_auc.toFixed(3)}`
                : "Risk model"
            }
            aria-label="Risk model"
            className="relative flex size-10 items-center justify-center rounded-xl border border-[#DDD6FE]/60 bg-gradient-to-br from-[#EDE9FE] to-[#F5F3FF] text-[#8B7CF6] transition-transform hover:scale-105 dark:border-[#383850] dark:from-[#252538] dark:to-[#1C1C2A] dark:text-[#C4B5FD]"
          >
            <Sparkles className="size-4" />
            <span className="absolute -right-0.5 -top-0.5 size-2.5 animate-pulse rounded-full bg-emerald-500 ring-2 ring-white dark:ring-[#171722]" />
          </Link>

          <Link href="/profile" onClick={onItemClick} title={`${userName} · ${userRole}`} aria-label="Profile" className="relative">
            <div className="flex size-9 items-center justify-center rounded-full bg-[#EDE9FE] text-xs font-bold text-[#8B7CF6] ring-2 ring-white transition-all hover:ring-[#8B7CF6]/40 dark:bg-[#252538] dark:text-[#C4B5FD] dark:ring-[#171722]">
              {initials}
            </div>
            <span className="absolute bottom-0 right-0 size-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-[#171722]" />
          </Link>

          <ThemePill compact />

          <button
            type="button"
            onClick={handleSignOut}
            title="Sign out"
            className="rounded-lg p-1.5 text-[#8C8CA1] transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
          >
            <LogOut className="size-4" />
            <span className="sr-only">Sign out</span>
          </button>
        </div>
        ) : (
          <div className="flex flex-col gap-3 animate-in fade-in duration-300">
        {/* Hospital Identity Tab / Card (P1-6) - Clickable to /hospital */}
        <Link
          href="/hospital"
          onClick={onItemClick}
          className="group relative block overflow-hidden rounded-2xl border border-[#F0F0F4] bg-[#FBFBFE] p-3 transition-all hover:border-[#8B7CF6]/60 hover:bg-white hover:shadow-sm dark:border-[#272738] dark:bg-[#1D1D2B] dark:hover:border-[#8B7CF6]/40 dark:hover:bg-[#222234] cursor-pointer"
        >
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#8B7CF6] to-[#5B7CFA] text-white shadow-sm font-bold text-xs">
              <Building2 className="size-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#171725] dark:text-white truncate group-hover:text-[#8B7CF6] transition-colors">
                  {hospitalName}
                </span>
                <ChevronRight className="size-3 text-[#8C8CA1] group-hover:text-[#8B7CF6] group-hover:translate-x-0.5 transition-all shrink-0" />
              </div>
              <div className="flex items-center gap-1 text-[10px] text-[#78788C] dark:text-[#A0A0B8] truncate">
                <MapPin className="size-2.5 shrink-0 text-[#8B7CF6]" />
                <span className="truncate">Sri Lanka</span>
                <span className="text-slate-300 dark:text-slate-600">·</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">Connected</span>
              </div>
            </div>
          </div>
        </Link>

        {/* Model Promo Card (§0 Thesis Honesty Rule) - Clickable to /model */}
        <Link
          href="/model"
          onClick={onItemClick}
          className="group relative block overflow-hidden rounded-2xl border border-[#DDD6FE]/60 bg-gradient-to-br from-[#EDE9FE] to-[#F5F3FF] p-3.5 transition-all hover:border-[#8B7CF6]/60 hover:shadow-md dark:border-[#383850] dark:from-[#252538] dark:to-[#1C1C2A] dark:hover:border-[#8B7CF6]/40 cursor-pointer"
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#8B7CF6] dark:text-[#C4B5FD] group-hover:underline">
              Risk Model
            </span>
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Active
            </span>
          </div>

          <div className="text-[13px] font-extrabold text-[#171725] dark:text-white flex items-center justify-between">
            <span>
              {modelInfo?.metrics.roc_auc != null
                ? `ROC-AUC ${modelInfo.metrics.roc_auc.toFixed(3)}${modelInfo.metrics.lift_top20 != null ? ` · ${modelInfo.metrics.lift_top20.toFixed(1)}× Lift` : ""}`
                : "Model metrics"}
            </span>
            <ChevronRight className="size-3.5 text-[#8B7CF6] transition-transform group-hover:translate-x-0.5" />
          </div>
          <p className="mt-0.5 text-[10px] text-[#78788C] dark:text-[#A0A0B8] leading-tight">
            XGBoost calibrated risk telemetry &amp; SHAP
          </p>

          <div className="mt-2.5 flex items-center justify-between pt-1.5 border-t border-[#DDD6FE]/40 text-[9px] text-[#8C8CA1] dark:border-[#383850]">
            <span className="flex items-center gap-1 font-medium">
              <Sparkles className="size-2.5 text-[#8B7CF6]" />
              Synthetic data · simulation
            </span>
            <span className="font-mono text-[9px]">{modelInfo?.base_rate != null ? `${(modelInfo.base_rate * 100).toFixed(1)}% base` : ""}</span>
          </div>
        </Link>

        {/* User Profile Block - Clickable to /profile */}
        <div className="flex items-center justify-between px-1">
          <Link
            href="/profile"
            onClick={onItemClick}
            className="flex items-center gap-2.5 group hover:opacity-90 transition-opacity"
          >
            <div className="relative flex size-9 shrink-0 items-center justify-center rounded-full bg-[#EDE9FE] font-bold text-xs text-[#8B7CF6] ring-2 ring-white dark:bg-[#252538] dark:text-[#C4B5FD] dark:ring-[#171722] group-hover:ring-[#8B7CF6]/40 transition-all">
              {initials}
              <span className="absolute bottom-0 right-0 size-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-[#171722]" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-bold leading-tight text-[#171725] dark:text-white group-hover:text-[#8B7CF6] transition-colors">
                {userName}
              </span>
              <span className="text-[10px] font-medium leading-tight text-[#8C8CA1]">
                {userRole}
              </span>
            </div>
          </Link>

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
        )}
      </div>
    </aside>
  );
}
