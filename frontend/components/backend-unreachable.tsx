"use client";

import Link from "next/link";
import { AlertTriangle, KeyRound, ShieldAlert, ServerCrash, RefreshCw } from "lucide-react";

import { ApiError, isRedirectError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function BackendUnreachable({ error }: { error: unknown }) {
  // If this error is a Next.js redirect (e.g. from apiFetch redirecting to /login), let Next.js handle it!
  if (isRedirectError(error)) {
    throw error;
  }

  const isApiError = error instanceof ApiError;
  const status = isApiError ? error.status : 0;
  const message = isApiError ? error.message : "Could not reach the backend API.";

  // 1. Session Expired / Unauthorized (401)
  if (status === 401) {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-col gap-4 px-6 py-16 animate-in fade-in duration-300">
        <Card className="border-border/80 shadow-lg text-center">
          <CardHeader className="flex flex-col items-center gap-2">
            <div className="size-12 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center">
              <KeyRound className="size-6" />
            </div>
            <CardTitle className="text-xl">Session Expired</CardTitle>
            <CardDescription className="text-xs">
              Your login session has expired or is no longer valid. Please sign in again to access hospital data.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Link href="/login?reason=session_expired" className="w-full">
              <Button className="w-full">Sign in to Hospital Portal</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 2. Permission Denied / Forbidden (403)
  if (status === 403) {
    const isPasswordChange = /password change required/i.test(message);
    return (
      <div className="mx-auto flex w-full max-w-lg flex-col gap-4 px-6 py-16 animate-in fade-in duration-300">
        <Card className="border-border/80 shadow-lg text-center">
          <CardHeader className="flex flex-col items-center gap-2">
            <div className="size-12 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center">
              <ShieldAlert className="size-6" />
            </div>
            <CardTitle className="text-xl">
              {isPasswordChange ? "Password Change Required" : "Access Restricted"}
            </CardTitle>
            <CardDescription className="text-xs">
              {isPasswordChange
                ? "You must update your default password before accessing clinical records."
                : "Your account does not have permission to view this section or hospital data."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {isPasswordChange ? (
              <Link href="/change-password" className="w-full">
                <Button className="w-full">Update Password</Button>
              </Link>
            ) : (
              <Link href="/" className="w-full">
                <Button variant="outline" className="w-full">Return to Dashboard</Button>
              </Link>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // 3. Backend 500 Internal Server Error
  if (status === 500) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-6 py-10 animate-in fade-in duration-300">
        <Card className="border-border/80 shadow-lg">
          <CardHeader className="flex flex-row items-center gap-3">
            <div className="size-10 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center shrink-0">
              <ServerCrash className="size-5" />
            </div>
            <div>
              <CardTitle className="text-lg">Backend Service Error (500)</CardTitle>
              <CardDescription className="font-mono text-xs text-destructive">{message}</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground flex flex-col gap-3">
            <p>
              The FastAPI backend is reachable, but encountered an unexpected error while processing this request (typically database connectivity, pending Alembic migration, or missing record relationship).
            </p>
            <div className="rounded-xl border border-border bg-muted/40 p-3.5 text-xs space-y-1.5 font-mono">
              <div className="font-semibold text-foreground font-sans">Troubleshooting steps:</div>
              <div>• Ensure PostgreSQL is running: <code className="text-primary font-bold">brew services start postgresql</code></div>
              <div>• Apply latest database schema: <code className="text-primary font-bold">cd backend && alembic upgrade head</code></div>
              <div>• Inspect backend logs for full traceback.</div>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <Button onClick={() => window.location.reload()} variant="outline" size="sm" className="gap-2">
                <RefreshCw className="size-3.5" />
                Retry Request
              </Button>
              <Link href="/setup" className="text-xs text-primary hover:underline">
                Server Settings
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 4. Default: Backend Unreachable / Connection Refused (status 0 or network failure)
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-6 py-10 animate-in fade-in duration-300">
      <Card className="border-border/80 shadow-lg">
        <CardHeader className="flex flex-row items-center gap-3">
          <div className="size-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
            <AlertTriangle className="size-5" />
          </div>
          <div>
            <CardTitle className="text-lg">Backend API Unreachable</CardTitle>
            <CardDescription className="font-mono text-xs">{message}</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground flex flex-col gap-3">
          <p>
            The application was unable to establish a network connection to the FastAPI backend service.
          </p>
          <div className="rounded-xl border border-border bg-muted/40 p-3 text-xs space-y-1 font-mono">
            <div>1. Verify the backend process is running: <code className="text-primary font-bold">uvicorn app.main:app --port 8000</code></div>
            <div>2. Check that <code className="text-foreground">BACKEND_API_URL</code> points to the active server address.</div>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <Button onClick={() => window.location.reload()} size="sm" className="gap-2">
              <RefreshCw className="size-3.5" />
              Retry Connection
            </Button>
            <Link href="/setup" className="text-xs text-primary hover:underline">
              Configure Server Address
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
