"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, Clock, Eye, EyeOff, Loader2 } from "lucide-react";

import { loginAction } from "@/app/login/actions";
import { ThemeToggle } from "@/components/theme-toggle";
import { ShaiLogo } from "@/components/shai-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type LoginErrorType = {
  kind: "credentials" | "locked" | "disabled" | "server";
  message: string;
  rawDetail?: string;
};

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isInactiveLogout =
    searchParams.get("reason") === "inactivity" ||
    searchParams.get("reason") === "session_expired";
  const redirectTarget = searchParams.get("redirect") || "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<LoginErrorType | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    const res = await loginAction({ email: email.trim(), password });

    if (res.ok) {
      try {
        localStorage.setItem("shai_user_role", res.role);
        if (res.name) localStorage.setItem("shai_user_name", res.name);
        if (res.hospital_name) localStorage.setItem("shai_hospital_name", res.hospital_name);
        if (res.hospital_code) localStorage.setItem("shai_hospital_code", res.hospital_code);
        if (res.hospital_id) localStorage.setItem("shai_hospital_id", res.hospital_id);
      } catch {
        // localStorage disabled / privacy mode
      }

      if (res.status === "pending") {
        router.push("/approval-pending");
        setIsLoading(false);
        return;
      }

      if (res.mustChangePassword) {
        router.push("/change-password");
        setIsLoading(false);
        return;
      }

      router.push(redirectTarget);
      return;
    }

    const detailStr = (res.message || "").toLowerCase();

    if (
      res.status === 423 ||
      res.status === 429 ||
      detailStr.includes("locked") ||
      detailStr.includes("too many")
    ) {
      setError({
        kind: "locked",
        message:
          "Too many failed attempts. This account is temporarily locked. Contact IT if you need urgent access.",
      });
      setIsLoading(false);
      return;
    }

    if (
      (res.status === 403 && !detailStr.includes("credential")) ||
      detailStr.includes("inactive") ||
      detailStr.includes("disabled")
    ) {
      setError({
        kind: "disabled",
        message: "This account is inactive. Contact your administrator.",
      });
      setIsLoading(false);
      return;
    }

    if (res.status === 401 || detailStr.includes("credential") || detailStr.includes("password")) {
      setError({
        kind: "credentials",
        message: "Incorrect email or password.",
      });
      setIsLoading(false);
      return;
    }

    setError({
      kind: "server",
      message:
        res.status === 0
          ? "Could not reach the configured backend server."
          : `Backend error (${res.status}): Could not complete authentication.`,
      rawDetail: res.message,
    });
    setIsLoading(false);
  }

  return (
    <div className="flex flex-col justify-between h-full p-6 sm:p-8 lg:p-10">
      <div>
        <div className="flex items-center justify-between mb-8">
          <ShaiLogo size="default" />
          <span className="text-[10px] font-bold tracking-wider uppercase px-2.5 py-1 rounded-full bg-accent text-accent-foreground">
            Clinical Console
          </span>
        </div>

        <div className="space-y-1.5 mb-7">
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Sign in to SHAI</h2>
          <p className="text-sm text-muted-foreground">Authorized hospital staff only.</p>
        </div>

        {/* Inactivity Logout Notice Banner */}
        {isInactiveLogout && (
          <div
            className="flex items-start gap-2.5 rounded-2xl bg-risk-medium-bg p-3 text-xs text-risk-medium mb-4"
            role="status"
          >
            <Clock className="mt-0.5 size-4 shrink-0" />
            <p className="leading-snug">
              You have been signed out due to inactivity for workstation security.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-sm font-semibold text-foreground">
              Hospital email
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="username"
              placeholder="you@hospital.org"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
              autoFocus
              className="h-11 rounded-xl bg-secondary dark:bg-secondary px-3.5 text-sm focus-visible:ring-2 focus-visible:ring-ring/30"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-sm font-semibold text-foreground">
              Password
            </Label>
            <div className="relative">
              <Input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                className="h-11 rounded-xl bg-secondary dark:bg-secondary pl-3.5 pr-11 text-sm focus-visible:ring-2 focus-visible:ring-ring/30"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 cursor-pointer"
                tabIndex={0}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div
              className="flex items-start gap-2 rounded-2xl bg-risk-high-bg p-3 text-xs text-risk-high"
              role="alert"
              aria-live="polite"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <div className="flex-1 space-y-1 leading-snug">
                <div>{error.message}</div>
                {error.rawDetail && (
                  <div className="font-mono text-[11px] opacity-90 break-all">{error.rawDetail}</div>
                )}
              </div>
            </div>
          )}

          <Button
            type="submit"
            className="w-full h-11 rounded-xl bg-gradient-to-r from-primary to-primary-end text-primary-foreground font-semibold text-sm shadow-lg shadow-primary/25 cursor-pointer transition-all hover:opacity-90 active:scale-[0.99] border-0"
            disabled={isLoading}
          >
            {isLoading && <Loader2 className="size-4 animate-spin mr-2" />}
            <span>Sign in</span>
          </Button>
        </form>
      </div>

      <div className="mt-8 pt-6 border-t border-border text-center space-y-2">
        <div className="text-xs text-muted-foreground">
          <span>New hospital staff member? </span>
          <Link
            href="/register"
            className="font-semibold text-primary hover:underline underline-offset-4 transition-colors"
          >
            Create staff account
          </Link>
        </div>
        <p className="text-xs text-muted-foreground">
          Trouble signing in? Contact your <span className="font-semibold text-foreground">IT administrator</span>.
        </p>
        <div>
          <Link
            href="/setup"
            className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            Server settings
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 sm:p-6 lg:p-8 bg-[#06080E] relative overflow-hidden">
      {/* Ambient Radial Glowing Orbs */}
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 size-96 rounded-full bg-[#6C5CE7]/25 blur-[130px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 size-96 rounded-full bg-[#8B7CF6]/20 blur-[140px] pointer-events-none" />

      {/* Top Floating Utility Bar */}
      <div className="absolute top-5 right-5 z-30 flex items-center gap-3">
        <ThemeToggle />
      </div>

      {/* Centered Floating Two-Sided Modal Card */}
      <div className="w-full max-w-5xl rounded-[32px] border border-[#6C5CE7]/35 bg-[#0C101A]/95 shadow-2xl shadow-[#6C5CE7]/20 backdrop-blur-xl overflow-hidden grid grid-cols-1 lg:grid-cols-12 relative z-10">
        {/* LEFT SIDE: Vivid Nano Banana Multi-Color AI Background, Full Complete Logo, Orbiting Animated Pills & Glassmorphism Details */}
        <div
          className="lg:col-span-6 relative flex flex-col justify-between p-6 sm:p-8 lg:p-10 overflow-hidden min-h-[660px]"
          style={{ backgroundImage: "url('/shai-login-bg.jpg')", backgroundSize: "cover", backgroundPosition: "center" }}
        >
          {/* NANO BANANA AI GENERATED BACKGROUND PHOTO (Multi-color, high contrast) */}
          <Image
            src="/shai-login-bg.jpg"
            alt="SHAI Clinical AI Neural Background"
            fill
            priority
            unoptimized
            className="object-cover object-center pointer-events-none"
          />

          {/* Delicate Ambient Vignette for High Readability & Contrast */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#090D16]/50 via-[#090D16]/30 to-[#070A11]/85 pointer-events-none" />
          <div className="absolute inset-0 bg-[#070A11]/20 backdrop-blur-[1px] pointer-events-none" />

          {/* Top Core Status Pill */}
          <div className="relative z-10 flex items-center justify-between">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#0B0F19]/80 border border-[#6C5CE7]/40 text-[#A29BFE] text-xs font-semibold backdrop-blur-md shadow-lg">
              <span className="size-2 rounded-full bg-[#6C5CE7] animate-ping" />
              <span>SHAI Clinical AI Platform</span>
            </div>
            <span className="text-[10px] font-mono tracking-widest text-slate-300 uppercase px-2 py-0.5 rounded-full bg-black/50 border border-white/10 backdrop-blur-md">
              Core Online · v4.2
            </span>
          </div>

          {/* Center Showcase: The Whole Complete Logo with Orbiting Animated Pills */}
          <div className="relative z-10 my-4 flex flex-col items-center justify-center">
            <div className="relative w-full max-w-sm flex items-center justify-center py-6">
              {/* Central Glassmorphism Pedestal Holding the Whole Logo */}
              <div className="w-full rounded-3xl p-6 bg-black/60 border border-[#6C5CE7]/45 backdrop-blur-xl shadow-2xl shadow-black/70 flex flex-col items-center justify-center text-center group transition-all hover:border-[#6C5CE7]/70">
                <ShaiLogo
                  tone="dark"
                  variant="wordmark"
                  size="xl"
                  className="h-14 sm:h-16 mx-auto shai-wordmark-animate transition-transform duration-500 group-hover:scale-105"
                />
                <div className="mt-3 flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.08] border border-white/15 text-[11px] text-slate-200 font-medium backdrop-blur-sm">
                  <span>Intelligent Attendance &amp; Operational Orchestration</span>
                </div>
              </div>

              {/* Floating Pill 1 (Top-Left): Low Risk */}
              <div className="absolute -top-2 -left-2 sm:-left-4 animate-float-1 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#0B0F19]/90 border border-emerald-500/50 text-emerald-300 text-[11px] font-semibold backdrop-blur-md shadow-xl shadow-black/60">
                <span className="size-2 rounded-full bg-emerald-400 animate-ping" />
                <span>🟢 Low Risk · 4.2%</span>
              </div>

              {/* Floating Pill 2 (Top-Right): Auto-SMS Sent (Sinhala) */}
              <div className="absolute -top-2 -right-2 sm:-right-4 animate-float-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#0B0F19]/90 border border-[#6C5CE7]/60 text-[#A29BFE] text-[11px] font-semibold backdrop-blur-md shadow-xl shadow-black/60">
                <span>⚡ Auto-SMS Sent · සිංහල</span>
              </div>

              {/* Floating Pill 3 (Bottom-Left): High Risk Detected */}
              <div className="absolute -bottom-2 -left-2 sm:-left-3 animate-float-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#0B0F19]/90 border border-rose-500/50 text-rose-300 text-[11px] font-semibold backdrop-blur-md shadow-xl shadow-black/60">
                <span className="size-2 rounded-full bg-rose-400 animate-pulse" />
                <span>🔴 High Risk · 84.1%</span>
              </div>

              {/* Floating Pill 4 (Bottom-Right): Dynamic Slot Reallocation */}
              <div className="absolute -bottom-2 -right-2 sm:-right-3 animate-float-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#0B0F19]/90 border border-indigo-500/50 text-indigo-200 text-[11px] font-semibold backdrop-blur-md shadow-xl shadow-black/60">
                <span>📅 Slot Reallocated</span>
              </div>
            </div>
          </div>

          {/* Bottom Glassmorphism Architecture & Model Details Cards */}
          <div className="relative z-10 space-y-2.5">
            {/* Card 1: AI Model Introduction & Real Thesis Benchmarks */}
            <div className="rounded-2xl p-3.5 bg-black/60 border border-[#6C5CE7]/40 backdrop-blur-xl shadow-lg">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm">🧠</span>
                  <span className="text-xs font-bold text-white tracking-wide">
                    Model: SHAI Clinical Risk Core (GBDT)
                  </span>
                </div>
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-md bg-[#6C5CE7]/30 text-[#A29BFE] border border-[#6C5CE7]/40">
                  v4.2 PROD
                </span>
              </div>

              <p className="text-[11px] text-slate-300 leading-snug mb-2.5">
                Calibrated ensemble predicting patient no-show probabilities from clinical history, appointment lead days, distance indices, and clinic loads.
              </p>

              {/* Key Metrics 4-Column Grid */}
              <div className="grid grid-cols-4 gap-1.5 text-center">
                <div className="rounded-lg bg-white/[0.05] p-1.5 border border-white/10">
                  <div className="text-[9px] text-slate-400 uppercase font-mono">ROC-AUC</div>
                  <div className="text-xs font-bold text-white font-mono">0.672</div>
                </div>
                <div className="rounded-lg bg-white/[0.05] p-1.5 border border-white/10">
                  <div className="text-[9px] text-slate-400 uppercase font-mono">Top-20% Lift</div>
                  <div className="text-xs font-bold text-[#A29BFE] font-mono">1.8×</div>
                </div>
                <div className="rounded-lg bg-white/[0.05] p-1.5 border border-white/10">
                  <div className="text-[9px] text-slate-400 uppercase font-mono">PR-AUC</div>
                  <div className="text-xs font-bold text-white font-mono">0.266</div>
                </div>
                <div className="rounded-lg bg-white/[0.05] p-1.5 border border-white/10">
                  <div className="text-[9px] text-slate-400 uppercase font-mono">Brier Score</div>
                  <div className="text-xs font-bold text-emerald-400 font-mono">0.124</div>
                </div>
              </div>
            </div>

            {/* Card 2: Trilingual NLP & Simulation Disclosure */}
            <div className="rounded-2xl p-2.5 bg-black/60 border border-white/15 backdrop-blur-xl flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="text-xs">🌐</span>
                <span className="text-[11px] font-semibold text-white">Trilingual NLP:</span>
                <span className="text-[10px] font-medium text-slate-300">
                  සිංහල · தமிழ் · English
                </span>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/35 text-[10px] text-emerald-300 font-medium">
                <span className="size-1.5 rounded-full bg-emerald-400" />
                <span>Synthetic Simulation</span>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT SIDE: Authentication Form Panel */}
        <div className="lg:col-span-6 bg-card flex flex-col justify-between">
          <Suspense
            fallback={
              <div className="h-full flex items-center justify-center p-12 text-slate-400">
                <Loader2 className="size-8 animate-spin text-[#6C5CE7]" />
              </div>
            }
          >
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
