"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, Clock, Eye, EyeOff, Loader2, Sparkles, Activity, ShieldCheck } from "lucide-react";

import { loginAction } from "@/app/login/actions";
import { ThemeToggle } from "@/components/theme-toggle";
import { ShaiLogo } from "@/components/shai-logo";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
    <Card className="w-full max-w-md border-border/60 bg-card shadow-2xl rounded-[28px] overflow-hidden">
      <CardHeader className="pb-3 pt-6 px-6 sm:px-8">
        {/* Brand Mark with Modern Nano Logo */}
        <div className="mb-4 flex items-center justify-between">
          <ShaiLogo size="md" variant="horizontal" />
          <span className="text-[10px] font-semibold tracking-wider uppercase px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
            Staff Portal
          </span>
        </div>

        <CardTitle className="text-2xl font-bold tracking-tight text-foreground">Sign in to SHAI</CardTitle>
        <CardDescription className="text-xs text-muted-foreground">Authorized hospital staff only.</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4 px-6 sm:px-8">
        {/* Inactivity Logout Notice Banner */}
        {isInactiveLogout && (
          <div
            className="flex items-start gap-2.5 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200"
            role="status"
          >
            <Clock className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <p className="leading-snug">
              You have been signed out due to inactivity for workstation security.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Hospital Email Field */}
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs font-semibold text-foreground">Hospital email</Label>
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
              className="h-10 rounded-xl border-border/80 bg-background/80 px-3 text-xs focus:border-primary focus:ring-primary/20"
            />
          </div>

          {/* Password Field with Integrated Toggle */}
          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-xs font-semibold text-foreground">Password</Label>
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
                className="h-10 rounded-xl border-border/80 bg-background/80 pr-10 text-xs focus:border-primary focus:ring-primary/20"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
                tabIndex={0}
              >
                {showPassword ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </button>
            </div>
          </div>

          {/* Error Banner */}
          {error && (
            <div
              className="flex items-start gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
              role="alert"
              aria-live="polite"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <div className="flex-1 space-y-1 leading-snug">
                <div>{error.message}</div>
                {error.rawDetail && (
                  <div className="font-mono text-[11px] opacity-90 break-all">
                    {error.rawDetail}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Submit Button */}
          <Button
            type="submit"
            className="w-full h-10 rounded-xl bg-gradient-to-r from-[#8B7CF6] to-[#5B7CFA] text-white font-semibold text-sm hover:opacity-90 shadow-md cursor-pointer transition-all active:scale-[0.99]"
            disabled={isLoading}
          >
            {isLoading && <Loader2 className="size-4 animate-spin mr-2" />}
            <span>Sign in</span>
          </Button>
        </form>
      </CardContent>

      <CardFooter className="flex flex-col items-center gap-2 border-t border-border/40 bg-muted/30 py-4 px-6 sm:px-8 text-center">
        <p className="text-xs text-muted-foreground">
          Trouble signing in? Contact your{" "}
          <span className="font-semibold text-foreground">IT administrator</span>.
        </p>
        <Link
          href="/setup"
          className="text-xs font-semibold text-primary underline-offset-4 hover:underline"
        >
          Server settings
        </Link>
      </CardFooter>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen w-full flex bg-[#F7F7F8] dark:bg-[#0A0D14] relative overflow-hidden">
      {/* Top Floating Utility Bar */}
      <div className="absolute top-4 right-4 z-30 flex items-center gap-2">
        <ThemeToggle />
      </div>

      {/* Left Visual Illustration & Hero Showcase Panel (Visible on lg screens ~1280x800) */}
      <div className="hidden lg:flex lg:w-7/12 relative flex-col justify-between p-10 xl:p-12 overflow-hidden bg-slate-950 text-white">
        {/* Hospital Hero Background Image with Layered Atmospheric Gradient */}
        <div className="absolute inset-0 z-0">
          <Image
            src="/shai-hospital-hero.jpg"
            alt="SHAI Hospital Command Center"
            fill
            priority
            className="object-cover object-center opacity-45 scale-105 transition-transform duration-1000"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0A0D14] via-[#0A0D14]/75 to-transparent" />
          <div className="absolute inset-0 bg-radial from-transparent via-[#0A0D14]/50 to-[#0A0D14]" />
        </div>

        {/* Top Branding */}
        <div className="relative z-10 flex items-center gap-3">
          <ShaiLogo size="lg" variant="horizontal" />
        </div>

        {/* Center Floating Glass Telemetry Cards */}
        <div className="relative z-10 flex flex-col gap-4 max-w-lg my-auto py-8">
          <div className="inline-flex items-center gap-2 self-start px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-white text-xs font-medium">
            <Sparkles className="size-3.5 text-cyan-400" />
            <span>Autonomous Attendance & Queue Orchestration</span>
          </div>

          <h2 className="text-3xl xl:text-4xl font-bold tracking-tight text-white leading-tight">
            Preventing patient drop-off with calibrated clinical intelligence.
          </h2>

          <p className="text-sm text-slate-300 leading-relaxed">
            Prescriptive appointment queue scheduling, trilingual automated outreach, and risk-adjusted overbooking tailored for Sri Lankan healthcare operations.
          </p>

          {/* Floating Glass Metric Badges */}
          <div className="grid grid-cols-2 gap-3 pt-4">
            <div className="rounded-2xl bg-white/10 backdrop-blur-md p-4 border border-white/15 shadow-xl flex flex-col">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-slate-300 font-medium">Model Calibration</span>
                <ShieldCheck className="size-4 text-emerald-400" />
              </div>
              <span className="text-xl font-bold font-mono text-white">ROC-AUC 0.672</span>
              <span className="text-[11px] text-emerald-300 mt-0.5">1.8× top-decile lift</span>
            </div>

            <div className="rounded-2xl bg-white/10 backdrop-blur-md p-4 border border-white/15 shadow-xl flex flex-col">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-slate-300 font-medium">Trilingual Triage</span>
                <Activity className="size-4 text-cyan-400" />
              </div>
              <span className="text-xl font-bold text-white">SI · TA · EN</span>
              <span className="text-[11px] text-cyan-300 mt-0.5">Automated SMS & Telehealth</span>
            </div>
          </div>
        </div>

        {/* Bottom Honesty Footnote */}
        <div className="relative z-10 flex items-center justify-between border-t border-white/10 pt-4 text-xs text-slate-400">
          <span>Sri Lanka Outpatient Capacity Simulation</span>
          <span className="text-slate-500">Synthetic validation cohort</span>
        </div>
      </div>

      {/* Right Authentication Panel */}
      <div className="w-full lg:w-5/12 flex items-center justify-center p-4 sm:p-8 relative z-10">
        <Suspense
          fallback={
            <Card className="w-full max-w-md p-8 text-center rounded-[28px]">
              <Loader2 className="mx-auto size-6 animate-spin text-primary" />
            </Card>
          }
        >
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
