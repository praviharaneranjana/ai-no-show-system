import {
  getWaitlist,
  listDoctorSessions,
  getCapacityOverview,
  getCapacitySlots,
  getSlotOffers,
  getCapacityForecast,
  getCapacityAccuracy,
  getCapacitySettings,
} from "@/lib/api";
import { BackendUnreachable } from "@/components/backend-unreachable";
import { CapacityClient } from "@/app/capacity/capacity-client";
import { requireRole } from "@/lib/session";
import type {
  CapacityOptimizeResult,
  DoctorSession,
  WaitlistEntry,
  CapacitySlotsResponse,
  SlotOffer,
  ForecastResponse,
  AccuracyResponse,
  CapacitySetting,
} from "@/lib/types";

export default async function CapacityPage() {
  await requireRole("manager");

  let sessions: DoctorSession[] = [];
  let waitlist: WaitlistEntry[] = [];
  let optimization: CapacityOptimizeResult;
  let slots: CapacitySlotsResponse | null = null;
  let offers: SlotOffer[] = [];
  let forecast: ForecastResponse | null = null;
  let accuracy: AccuracyResponse | null = null;
  let settings: CapacitySetting | null = null;

  try {
    const results = await Promise.allSettled([
      getCapacityOverview(),
      listDoctorSessions(),
      getWaitlist(),
      getCapacitySlots(),
      getSlotOffers(),
      getCapacityForecast(14),
      getCapacityAccuracy(30),
      getCapacitySettings("global"),
    ]);

    if (results[0].status === "rejected") {
      throw results[0].reason;
    }

    optimization = results[0].value;
    if (results[1].status === "fulfilled") sessions = results[1].value;
    if (results[2].status === "fulfilled") waitlist = results[2].value;
    if (results[3].status === "fulfilled") slots = results[3].value;
    if (results[4].status === "fulfilled") offers = results[4].value;
    if (results[5].status === "fulfilled") forecast = results[5].value;
    if (results[6].status === "fulfilled") accuracy = results[6].value;
    if (results[7].status === "fulfilled") settings = results[7].value;
  } catch (err) {
    return <BackendUnreachable error={err} />;
  }

  // Collect unique department names
  const departments = Array.from(
    new Set([...sessions.map((s) => s.specialty), ...optimization.departments.map((d) => d.department)])
  ).filter(Boolean);

  return (
    <CapacityClient
      initialOptimization={optimization}
      initialSessions={sessions}
      initialWaitlist={waitlist}
      initialSlots={slots}
      initialOffers={offers}
      initialForecast={forecast}
      initialAccuracy={accuracy}
      initialSettings={settings}
      departments={departments}
    />
  );
}
