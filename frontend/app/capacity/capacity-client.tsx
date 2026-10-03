"use client";

import React, { useState } from "react";
import {
  Layers,
  Clock,
  Sliders,
  UserCheck,
  CalendarDays,
  Target,
  Settings,
  Sparkles,
  Gauge,
  ArrowLeft,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { CapacityOverviewView } from "@/app/capacity/capacity-overview-view";
import { SlotHeatmapView } from "@/app/capacity/slot-heatmap-view";
import { WhatIfView } from "@/app/capacity/what-if-view";
import { SlotOffersView } from "@/app/capacity/slot-offers-view";
import { ForecastView } from "@/app/capacity/forecast-view";
import { AccuracyView } from "@/app/capacity/accuracy-view";
import { CapacitySettingsView } from "@/app/capacity/capacity-settings-view";

import type {
  CapacityOptimizeResult,
  DoctorSession,
  WaitlistEntry,
  CapacitySlotsResponse,
  SlotOffer,
  ForecastResponse,
  AccuracyResponse,
  CapacitySetting,
} from "@/lib/types";

export type CapacityTab =
  | "overview"
  | "heatmap"
  | "what-if"
  | "offers"
  | "forecast"
  | "accuracy"
  | "settings";

interface CapacityClientProps {
  initialOptimization: CapacityOptimizeResult;
  initialSessions: DoctorSession[];
  initialWaitlist: WaitlistEntry[];
  initialSlots: CapacitySlotsResponse | null;
  initialOffers: SlotOffer[];
  initialForecast: ForecastResponse | null;
  initialAccuracy: AccuracyResponse | null;
  initialSettings: CapacitySetting | null;
  departments: string[];
}

export function CapacityClient({
  initialOptimization,
  initialSessions,
  initialWaitlist,
  initialSlots,
  initialOffers,
  initialForecast,
  initialAccuracy,
  initialSettings,
  departments,
}: CapacityClientProps) {
  const [activeTab, setActiveTab] = useState<CapacityTab>("overview");
  const [previousTab, setPreviousTab] = useState<CapacityTab>("overview");
  const [isMorphing, setIsMorphing] = useState(false);

  const handleOpenWhatIf = () => {
    setIsMorphing(true);
    setPreviousTab(activeTab === "what-if" ? "overview" : activeTab);
    setTimeout(() => {
      setActiveTab("what-if");
      setIsMorphing(false);
    }, 200);
  };

  const handleBackToCapacity = () => {
    setIsMorphing(true);
    setTimeout(() => {
      setActiveTab(previousTab === "what-if" ? "overview" : previousTab);
      setIsMorphing(false);
    }, 200);
  };

  const tabs: Array<{
    id: CapacityTab;
    label: string;
    icon: React.ElementType;
    badge?: number;
  }> = [
    { id: "overview", label: "Overview", icon: Layers },
    { id: "heatmap", label: "Slot Heatmap", icon: Clock },
    { id: "what-if", label: "What-If Studio", icon: Sliders },
    {
      id: "offers",
      label: "Waitlist Auto-Fill",
      icon: UserCheck,
      badge: initialOffers.filter((o) => o.status === "proposed").length,
    },
    { id: "forecast", label: "Forecast", icon: CalendarDays },
    { id: "accuracy", label: "AI Accuracy", icon: Target },
    { id: "settings", label: "Settings", icon: Settings },
  ];

  return (
    <div className="flex w-full flex-col gap-6 p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-border/40">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2.5">
            <div className="size-9 rounded-xl bg-gradient-to-tr from-[#8B7CF6] to-[#5B7CFA] flex items-center justify-center text-white shadow-xs">
              <Gauge className="size-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                Capacity &amp; Smart Overbooking v2
              </h1>
            </div>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            AI-powered overbooking recommendations and slot optimisation for your hospital.
          </p>
        </div>

        <div className="inline-flex items-center gap-2 self-start md:self-auto px-3.5 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold">
          <Sparkles className="size-3.5" />
          <span>Exact Poisson-binomial overbooking · per-session capacity</span>
        </div>
      </div>

      {/* Tab Navigation Pill Bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none border-b border-border/40">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                if (tab.id === "what-if") {
                  handleOpenWhatIf();
                } else {
                  if (activeTab === "what-if") setPreviousTab(tab.id);
                  setActiveTab(tab.id);
                }
              }}
              className={cn(
                "flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer",
                isActive
                  ? "bg-primary text-white shadow-xs"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
              )}
            >
              <Icon className="size-3.5" />
              <span>{tab.label}</span>
              {Boolean(tab.badge && tab.badge > 0) && (
                <span
                  className={cn(
                    "px-1.5 py-0.2 rounded-full text-[10px] font-extrabold",
                    isActive
                      ? "bg-white/20 text-white"
                      : "bg-primary/15 text-primary"
                  )}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Content Panels with Morph Animation */}
      <div className={cn("w-full transition-opacity duration-200", isMorphing ? "opacity-30 scale-[0.99]" : "opacity-100 scale-100")}>
        {activeTab === "overview" && (
          <CapacityOverviewView
            optimization={initialOptimization}
            sessions={initialSessions}
          />
        )}

        {activeTab === "heatmap" && (
          <SlotHeatmapView initialSlots={initialSlots} />
        )}

        {activeTab === "what-if" && (
          <WhatIfView
            sessions={initialSessions}
            onBack={handleBackToCapacity}
          />
        )}

        {activeTab === "offers" && (
          <SlotOffersView initialOffers={initialOffers} />
        )}

        {activeTab === "forecast" && (
          <ForecastView
            initialForecast={initialForecast}
            departments={departments}
          />
        )}

        {activeTab === "accuracy" && (
          <AccuracyView
            initialAccuracy={initialAccuracy}
            departments={departments}
          />
        )}

        {activeTab === "settings" && (
          <CapacitySettingsView
            initialSettings={initialSettings}
            departments={departments}
          />
        )}
      </div>

      {/* Floating What-If Studio Trigger / Return Button (Using Header Sliders Icon) */}
      <div className="fixed bottom-6 right-6 z-40 flex items-center gap-2">
        <button
          type="button"
          onClick={activeTab === "what-if" ? handleBackToCapacity : handleOpenWhatIf}
          title={activeTab === "what-if" ? "Back to Capacity Engine" : "Open What-If Capacity Studio"}
          className={cn(
            "relative group flex items-center gap-2.5 rounded-full px-4 py-3.5 shadow-2xl transition-all duration-300 cursor-pointer border-2 border-white/20 select-none",
            activeTab === "what-if"
              ? "bg-gradient-to-tr from-slate-800 to-slate-950 text-white hover:from-slate-700 hover:to-slate-900 shadow-slate-900/50 hover:scale-105 active:scale-95"
              : "bg-gradient-to-tr from-violet-600 via-indigo-600 to-blue-600 text-white hover:from-violet-500 hover:to-blue-500 shadow-indigo-600/40 hover:scale-110 active:scale-95"
          )}
        >
          {activeTab === "what-if" ? (
            <>
              <ArrowLeft className="size-5 transition-transform group-hover:-translate-x-1" />
              <span className="text-xs font-bold tracking-tight">
                Back to Capacity
              </span>
            </>
          ) : (
            <>
              {/* Exact Header / Tab Sliders Icon */}
              <Sliders className="size-5 transition-transform group-hover:rotate-12" />
              <span className="text-xs font-bold tracking-tight">
                What-If Studio
              </span>
            </>
          )}

          {/* Morph Animation Ping Ring */}
          {isMorphing && (
            <span className="absolute inset-0 rounded-full border-2 border-primary animate-ping opacity-75" />
          )}
        </button>
      </div>
    </div>
  );
}
