import { Suspense } from "react";
import { PredictionHubClient } from "@/app/predictions/prediction-hub-client";
import { getPredictionsToday, getHisStatus, isRedirectError } from "@/lib/api";
import { getColomboToday } from "@/lib/date-colombo";

export const dynamic = "force-dynamic";

export default async function PredictionHubPage() {
  const todayStr = getColomboToday();
  let initialData = null;
  let hisStatus = null;

  try {
    initialData = await getPredictionsToday(todayStr);
  } catch (e) {
    if (isRedirectError(e)) throw e;
    console.error("Failed to load initial prediction hub data", e);
  }

  try {
    hisStatus = await getHisStatus();
  } catch (e) {
    if (isRedirectError(e)) throw e;
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
