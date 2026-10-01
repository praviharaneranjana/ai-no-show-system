import { Suspense } from "react";
import { PredictionHubClient } from "@/app/predictions/prediction-hub-client";
import { getPredictionsToday, getHisStatus } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function PredictionHubPage() {
  const todayStr = "2026-10-01"; // Default date or today in Asia/Colombo
  let initialData = null;
  let hisStatus = null;

  try {
    initialData = await getPredictionsToday(todayStr);
  } catch (e) {
    // If backend isn't ready or empty, fall back gracefully
    console.error("Failed to load initial prediction hub data", e);
  }

  try {
    hisStatus = await getHisStatus();
  } catch (e) {
    console.error("Failed to load HIS status", e);
  }

  return (
    <Suspense
      fallback={
        <div className="flex h-96 w-full items-center justify-center text-sm text-muted-foreground">
          Loading Prediction Hub...
        </div>
      }
    >
      <PredictionHubClient
        initialData={initialData}
        initialHisStatus={hisStatus}
        initialDate={todayStr}
      />
    </Suspense>
  );
}
