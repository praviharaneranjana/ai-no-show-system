import { Suspense } from "react";
import { ReconcileClient } from "@/app/appointments/reconcile/reconcile-client";
import { getPredictionsToday } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function ReconcilePage() {
  const targetDate = "2026-10-01";
  let initialData = null;

  try {
    initialData = await getPredictionsToday(targetDate);
  } catch (e) {
    console.error("Failed to load today's appointments for reconciliation", e);
  }

  return (
    <Suspense
      fallback={
        <div className="flex h-96 w-full items-center justify-center text-sm text-muted-foreground">
          Loading Outcome Reconciliation...
        </div>
      }
    >
      <ReconcileClient initialData={initialData} targetDate={targetDate} />
    </Suspense>
  );
}
