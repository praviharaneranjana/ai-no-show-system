"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Clock,
  Building2,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  LogOut,
  RefreshCw,
  Mail,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ShaiLogo } from "@/components/shai-logo";
import { logoutAction } from "@/app/login/actions";

export default function ApprovalPendingPage() {
  const router = useRouter();
  const stored = useSyncExternalStore(
    (callback) => {
      window.addEventListener("storage", callback);
      return () => window.removeEventListener("storage", callback);
    },
    () => {
      try {
        return `${localStorage.getItem("shai_hospital_name") ?? ""}|${localStorage.getItem("shai_user_name") ?? ""}`;
      } catch {
        return "|";
      }
    },
    () => "|"
  );
  const [storedHospital, storedUser] = stored.split("|");
  const hospitalName = storedHospital || "Hospital";
  const userName = storedUser || "Staff Member";
  const [checking, setChecking] = useState(false);

  async function handleCheckStatus() {
    setChecking(true);
    // Reload page to re-check session
    window.location.href = "/";
  }

  async function handleSignOut() {
    await logoutAction();
    try {
      localStorage.clear();
    } catch {}
    router.push("/login");
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 sm:p-6 bg-[#06080E] relative overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 size-96 rounded-full bg-[#6C5CE7]/20 blur-[130px] pointer-events-none" />

      <div className="w-full max-w-lg rounded-3xl border border-[#6C5CE7]/30 bg-[#0C101A]/95 p-6 sm:p-8 shadow-2xl backdrop-blur-xl text-center space-y-6">
        <div className="flex justify-center">
          <ShaiLogo tone="dark" size="default" />
        </div>

        <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-400 ring-4 ring-amber-500/10">
          <Clock className="size-8 animate-pulse" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Staff Account Approval Pending
          </h1>
          <p className="text-sm text-slate-400">
            Welcome, <span className="font-semibold text-slate-200">{userName}</span>. Your institutional account is currently awaiting verification and role assignment.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-[#121622] p-4 text-left space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#8B7CF6]/20 text-[#8B7CF6]">
              <Building2 className="size-4" />
            </div>
            <div>
              <div className="text-xs text-slate-400">Target Institution</div>
              <div className="text-sm font-bold text-white">{hospitalName}</div>
            </div>
          </div>

          <div className="flex items-start gap-2.5 pt-2 border-t border-slate-800 text-xs text-slate-300">
            <ShieldCheck className="size-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>
              For healthcare compliance and patient privacy, hospital records remain isolated until your hospital administrator grants your role.
            </span>
          </div>
        </div>

        <div className="space-y-3 pt-2">
          <Button
            onClick={handleCheckStatus}
            disabled={checking}
            className="w-full h-11 rounded-xl bg-gradient-to-r from-[#8B7CF6] to-[#5B7CFA] text-white font-semibold text-sm shadow-lg shadow-[#8B7CF6]/25 hover:opacity-95"
          >
            <RefreshCw className={`size-4 mr-2 ${checking ? "animate-spin" : ""}`} />
            <span>Check Approval Status</span>
          </Button>

          <Button
            variant="ghost"
            onClick={handleSignOut}
            className="w-full text-xs text-slate-400 hover:text-white hover:bg-slate-800/50"
          >
            <LogOut className="size-3.5 mr-1.5" />
            <span>Sign Out &amp; Return to Login</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
