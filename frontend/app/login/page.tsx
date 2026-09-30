"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Activity, AlertCircle, Clock, Eye, EyeOff, Loader2 } from "lucide-react";

import { loginAction } from "@/app/login/actions";
import { ThemeToggle } from "@/components/theme-toggle";
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
      // Save role / name for UI convenience (not used for auth — the
      // session cookie was already set server-side by loginAction)
      try {
        localStorage.setItem("shai_user_role", res.role);
        if (res.name) localStorage.setItem("shai_user_name", res.name);
      } catch {
        // localStorage disabled / privacy mode
      }

      // Check forced password change requirement
      if (res.mustChangePassword) {
        router.push("/change-password");
        setIsLoading(false);
        return;
      }

      router.push(redirectTarget);
      return;
    }

    const detailStr = (res.message || "").toLowerCase();

    // Account locked check
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

    // Account disabled / deprovisioned check
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

    // Invalid credentials (generic check to avoid username enumeration)
    if (res.status === 401 || detailStr.includes("credential") || detailStr.includes("password")) {
      setError({
        kind: "credentials",
        message: "Incorrect email or password.",
      });
      setIsLoading(false);
      return;
    }

    // Server error or backend unreachable
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
    <Card className="w-full max-w-sm border-border/80 bg-card/95 shadow-2xl backdrop-blur-md">
      <CardHeader className="pb-3">
        {/* Brand Mark: size-7 rounded-lg bg-primary with Activity icon */}
        <div className="mb-2 flex items-center gap-2.5">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <Activity className="size-4" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-base font-bold tracking-tight text-foreground">SHAI</span>
            <span className="text-xs text-muted-foreground">Clinical Platform</span>
          </div>
        </div>

        <CardTitle className="text-lg">Sign in to SHAI</CardTitle>
        <CardDescription>Authorized hospital staff only.</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Inactivity Logout Notice Banner */}
        {isInactiveLogout && (
          <div
            className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-800 dark:text-amber-200"
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
            <Label htmlFor="email">Hospital email</Label>
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
            />
          </div>

          {/* Password Field with Integrated Toggle */}
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
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
                className="pr-9"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
              className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-2.5 text-xs text-destructive"
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
            className="w-full"
            disabled={isLoading}
          >
            {isLoading && <Loader2 className="size-4 animate-spin" />}
            <span>Sign in</span>
          </Button>
        </form>
      </CardContent>

      <CardFooter className="flex flex-col items-center gap-1.5 border-t border-border/60 bg-muted/50 py-3 text-center">
        <p className="text-xs text-muted-foreground">
          Trouble signing in? Contact your{" "}
          <span className="font-medium text-foreground">IT administrator</span>.
        </p>
        <Link
          href="/setup"
          className="text-[11px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Server settings
        </Link>
      </CardFooter>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <div className="relative flex min-h-svh w-full items-center justify-center p-4 overflow-hidden bg-background">
      {/* Connected Hospital Wallpaper with Wire Network & Blur */}
      <div
        className="pointer-events-none absolute inset-0 bg-cover bg-center filter blur-md scale-105 opacity-35 dark:opacity-40 transition-opacity"
        style={{ backgroundImage: "url('/hospital-network-bg.svg')" }}
        aria-hidden="true"
      />

      {/* Atmospheric Clinical Gradient Backdrop Overlay */}
      <div
        className="pointer-events-none absolute inset-0 bg-radial from-transparent via-background/60 to-background/90 backdrop-blur-[1px]"
        aria-hidden="true"
      />

      {/* Top-Right Theme Toggle */}
      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle />
      </div>

      {/* Main Auth Content */}
      <div className="relative z-10 w-full max-w-sm">
        <Suspense
          fallback={
            <Card className="w-full max-w-sm p-6 text-center">
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
