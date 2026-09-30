"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, Clock, Eye, EyeOff, Loader2, ShieldCheck, Activity } from "lucide-react";

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
      } catch {
        // localStorage disabled / privacy mode
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
      {/* Header with Andrew's Wordmark Logo */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <ShaiLogo size="sm" variant="horizontal" />
          <span className="text-[10px] font-bold tracking-wider uppercase px-2.5 py-1 rounded-full bg-[#6C5CE7]/15 text-[#A29BFE] border border-[#6C5CE7]/30">
            Clinical Console
          </span>
        </div>

        <div className="space-y-1 mb-6">
          <h2 className="text-2xl font-bold tracking-tight text-white">Sign in to SHAI</h2>
          <p className="text-xs text-slate-400">Authorized hospital staff only.</p>
        </div>

        {/* Inactivity Logout Notice Banner */}
        {isInactiveLogout && (
          <div
            className="flex items-start gap-2.5 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300 mb-4"
            role="status"
          >
            <Clock className="mt-0.5 size-4 shrink-0 text-amber-400" />
            <p className="leading-snug">
              You have been signed out due to inactivity for workstation security.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Hospital Email Field */}
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs font-semibold text-slate-300">
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
              className="h-10 rounded-xl border-white/10 bg-white/[0.04] text-white placeholder:text-slate-500 text-xs focus:border-[#6C5CE7] focus:ring-[#6C5CE7]/25"
            />
          </div>

          {/* Password Field with Integrated Toggle */}
          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-xs font-semibold text-slate-300">
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
                className="h-10 rounded-xl border-white/10 bg-white/[0.04] text-white placeholder:text-slate-500 pr-10 text-xs focus:border-[#6C5CE7] focus:ring-[#6C5CE7]/25"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors focus:outline-none cursor-pointer"
                tabIndex={0}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          {/* Error Banner */}
          {error && (
            <div
              className="flex items-start gap-2 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300"
              role="alert"
              aria-live="polite"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-rose-400" />
              <div className="flex-1 space-y-1 leading-snug">
                <div>{error.message}</div>
                {error.rawDetail && (
                  <div className="font-mono text-[11px] opacity-90 break-all">{error.rawDetail}</div>
                )}
              </div>
            </div>
          )}

          {/* Submit Button */}
          <Button
            type="submit"
            className="w-full h-11 rounded-xl bg-gradient-to-r from-[#6C5CE7] to-[#8B7CF6] hover:from-[#5A4AD1] hover:to-[#7A6AE6] text-white font-semibold text-sm shadow-lg shadow-[#6C5CE7]/25 cursor-pointer transition-all active:scale-[0.99] border-0"
            disabled={isLoading}
          >
            {isLoading && <Loader2 className="size-4 animate-spin mr-2" />}
            <span>Sign in</span>
          </Button>
        </form>
      </div>

      {/* Footer Support & Setup Links */}
      <div className="pt-6 border-t border-white/10 text-center space-y-1.5">
        <p className="text-xs text-slate-400">
          Trouble signing in? Contact your <span className="font-semibold text-white">IT administrator</span>.
        </p>
        <div>
          <Link
            href="/setup"
            className="text-xs font-semibold text-[#A29BFE] hover:text-[#6C5CE7] underline-offset-4 hover:underline transition-colors"
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
    <div className="min-h-screen w-full flex items-center justify-center p-4 sm:p-6 lg:p-8 bg-[#070A10] relative overflow-hidden">
      {/* Ambient Radial Glowing Orbs in Violet / Purple Theme */}
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 size-96 rounded-full bg-[#6C5CE7]/15 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 size-96 rounded-full bg-[#8B7CF6]/20 blur-[130px] pointer-events-none" />

      {/* Top Floating Utility Bar */}
      <div className="absolute top-5 right-5 z-30 flex items-center gap-3">
        <ThemeToggle />
      </div>

      {/* Centered Floating Two-Sided Modal Card */}
      <div className="w-full max-w-5xl rounded-[32px] border border-[#6C5CE7]/25 bg-[#0C101A]/95 shadow-2xl shadow-[#6C5CE7]/15 backdrop-blur-xl overflow-hidden grid grid-cols-1 lg:grid-cols-12 relative z-10">
        
        {/* LEFT SIDE: Futuristic Holographic 3D AI Showcase & Andrew's Neural Branding */}
        <div className="lg:col-span-6 relative flex flex-col justify-between p-6 sm:p-8 lg:p-10 bg-gradient-to-br from-[#0B0F19] via-[#090D15] to-[#06080E] border-b lg:border-b-0 lg:border-r border-white/10 overflow-hidden">
          
          {/* Subtle Cyber Grid Background in #6C5CE7 */}
          <div
            className="absolute inset-0 opacity-15 pointer-events-none"
            style={{
              backgroundImage: "linear-gradient(rgba(108, 92, 231, 0.25) 1px, transparent 1px), linear-gradient(90deg, rgba(108, 92, 231, 0.25) 1px, transparent 1px)",
              backgroundSize: "28px 28px",
            }}
          />

          {/* Top Holographic Pill Badge */}
          <div className="relative z-10 flex items-center justify-between">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#6C5CE7]/15 border border-[#6C5CE7]/30 text-[#A29BFE] text-xs font-semibold backdrop-blur-md">
              <span className="size-2 rounded-full bg-[#6C5CE7] animate-ping" />
              <span>Neural Diagnostic Mesh v4.2</span>
            </div>
            <span className="text-[10px] font-mono tracking-widest text-slate-500 uppercase">
              Core Engine
            </span>
          </div>

          {/* Center 3D AI Brain Hologram with Floating Animation & Andrew's Emblem */}
          <div className="relative z-10 flex flex-col items-center justify-center my-6 group">
            <div className="relative size-60 sm:size-72 rounded-3xl overflow-hidden shadow-2xl border border-[#6C5CE7]/35 bg-[#060910]">
              <Image
                src="/shai-login-3d-hero.jpg"
                alt="SHAI Clinical AI Hologram"
                fill
                priority
                className="object-cover object-center transition-transform duration-700 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0B0F19] via-transparent to-transparent opacity-80" />

              {/* Floating Holographic Ring Overlay */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="size-48 rounded-full border border-[#6C5CE7]/40 animate-pulse" />
              </div>
            </div>

            {/* Andrew's Standalone Neural Hex Emblem Floating Below 3D Brain */}
            <div className="mt-4 flex items-center gap-3 px-4 py-2 rounded-2xl bg-black/50 border border-[#6C5CE7]/35 backdrop-blur-md shadow-lg shadow-[#6C5CE7]/15">
              <Image
                src="/shai-logo-glyph.png"
                alt="SHAI Hex Emblem"
                width={36}
                height={36}
                className="object-contain drop-shadow-[0_0_10px_rgba(108,92,231,0.6)]"
              />
              <div className="flex flex-col text-left">
                <span className="text-xs font-bold text-white tracking-wide">Smart Hospital AI</span>
                <span className="text-[10px] text-[#A29BFE] font-medium">Intelligent Care, Unmatched Precision</span>
              </div>
            </div>
          </div>

          {/* Bottom Telemetry Floating Badges */}
          <div className="relative z-10 pt-4 border-t border-white/10 grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-xl bg-white/[0.04] p-2.5 border border-white/10 flex items-center gap-2">
              <ShieldCheck className="size-4 text-emerald-400 shrink-0" />
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-400">Calibrated ROC-AUC</span>
                <span className="font-bold font-mono text-white text-xs">0.672 · 1.8× Lift</span>
              </div>
            </div>

            <div className="rounded-xl bg-white/[0.04] p-2.5 border border-white/10 flex items-center gap-2">
              <Activity className="size-4 text-[#A29BFE] shrink-0" />
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-400">Trilingual NLP</span>
                <span className="font-bold text-white text-xs">SI · TA · EN</span>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT SIDE: Authentication Form Panel */}
        <div className="lg:col-span-6 bg-[#0E1322]">
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
