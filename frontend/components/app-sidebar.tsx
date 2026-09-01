"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  BarChart3,
  PlusCircle,
  Activity,
  Sparkles,
  ShieldCheck,
  Gauge,
  MessagesSquare,
  Calculator,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

interface AppSidebarProps {
  onItemClick?: () => void;
  className?: string;
}

export function AppSidebar({ onItemClick, className }: AppSidebarProps) {
  const pathname = usePathname();

  const NAV_ITEMS = [
    {
      href: "/",
      label: "Command Center",
      icon: CalendarDays,
      exact: true,
      description: "Live schedule & risk triage",
    },
    {
      href: "/capacity",
      label: "Capacity & Overbooking",
      icon: Gauge,
      exact: false,
      description: "Prescriptive slot optimizer",
    },
    {
      href: "/outreach",
      label: "Autonomous Agent Hub",
      icon: MessagesSquare,
      exact: false,
      description: "Trilingual patient outreach",
    },
    {
      href: "/simulator",
      label: "Executive ROI Simulator",
      icon: Calculator,
      exact: false,
      description: "Boardroom revenue calculator",
    },
    {
      href: "/analytics",
      label: "Operations Analytics",
      icon: BarChart3,
      exact: false,
      description: "Model & department metrics",
    },
    {
      href: "/new",
      label: "New Appointment",
      icon: PlusCircle,
      exact: false,
      description: "Intake & risk prediction",
    },
  ];

  return (
    <aside
      className={cn(
        "flex h-full w-64 flex-col justify-between border-r border-sidebar-border bg-sidebar text-sidebar-foreground",
        className
      )}
    >
      {/* Brand Header */}
      <div className="flex flex-col gap-4 p-5">
        <Link
          href="/"
          onClick={onItemClick}
          className="group flex items-center gap-3 transition-opacity hover:opacity-90"
        >
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-xs shadow-primary/30">
            <Activity className="size-5" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5 font-bold tracking-tight text-foreground">
              <span>SHAI</span>
              <span className="rounded bg-primary/10 px-1 py-0.2 text-[10px] font-semibold text-primary">
                Smart Hospital AI
              </span>
            </div>
            <span className="text-[11px] text-muted-foreground">
              Autonomous Clinic Capacity & Engagement
            </span>
          </div>
        </Link>

        {/* Model Status Pill */}
        <div className="flex items-center justify-between rounded-lg border border-sidebar-border bg-background/60 px-2.5 py-1.5 text-[11px]">
          <div className="flex items-center gap-1.5">
            <span className="relative flex size-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
            </span>
            <span className="font-medium text-foreground">XGBoost v1.0</span>
          </div>
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono">
            <Sparkles className="size-2.5 text-primary" />
            SHAP Active
          </span>
        </div>

        {/* Navigation */}
        <nav className="mt-2 flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onItemClick}
                className={cn(
                  "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-xs shadow-primary/20"
                    : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                <Icon
                  className={cn(
                    "size-4 shrink-0 transition-transform group-hover:scale-105",
                    isActive ? "text-primary-foreground" : "text-muted-foreground group-hover:text-foreground"
                  )}
                />
                <div className="flex flex-1 flex-col">
                  <span className="leading-tight">{item.label}</span>
                </div>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Footer / Controls */}
      <div className="flex flex-col gap-3 border-t border-sidebar-border p-4">
        <Button
          variant="default"
          size="sm"
          className="w-full justify-center gap-2 shadow-xs"
          nativeButton={false}
          render={
            <Link href="/new" onClick={onItemClick}>
              <PlusCircle className="size-4" />
              <span>New Appointment</span>
            </Link>
          }
        />

        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="text-[11px]">Front-Desk Portal</span>
          </div>
          <ThemeToggle />
        </div>
      </div>
    </aside>
  );
}
