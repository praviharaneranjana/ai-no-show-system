import Link from "next/link";

import { ApiError } from "@/lib/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function BackendUnreachable({ error }: { error: unknown }) {
  const isApiError = error instanceof ApiError;
  const is500 = isApiError && error.status === 500;
  const message = isApiError
    ? `Backend error (${error.status}): ${error.message}`
    : "Could not reach the backend API.";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-6 py-10">
      <Card>
        <CardHeader>
          <CardTitle>Can&apos;t load this page</CardTitle>
          <CardDescription className="font-mono text-xs">{message}</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {is500 ? (
            <div className="flex flex-col gap-3">
              <p>
                The FastAPI backend is running and reachable, but encountered an internal error while processing the request (most likely a database connection issue or pending database migration).
              </p>
              <div className="rounded-md border border-border bg-muted/50 p-3 text-xs space-y-1.5 font-mono">
                <div className="font-semibold text-foreground font-sans">Troubleshooting checklist:</div>
                <div>1. Ensure PostgreSQL service is running: <code className="text-primary">brew services start postgresql</code></div>
                <div>2. Ensure database exists: <code className="text-primary">createdb noshow_db</code></div>
                <div>3. Run Alembic migrations: <code className="text-primary">cd backend && alembic upgrade head</code></div>
                <div>4. Seed sample data: <code className="text-primary">python seed.py</code></div>
              </div>
            </div>
          ) : (
            <p>Make sure the FastAPI backend is running and BACKEND_API_URL is set correctly.</p>
          )}
          <p className="mt-3">
            <Link href="/setup" className="font-medium text-primary hover:underline">
              Server settings
            </Link>{" "}
            — check or change the configured server address.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
