import { getAppointmentsWithPredictions } from "@/lib/appointments-with-predictions";
import { listDoctorSessions } from "@/lib/api";
import { BackendUnreachable } from "@/components/backend-unreachable";
import { DashboardBento } from "@/components/dashboard-bento";

export default async function DashboardPage() {
  let records, doctorSessions;
  try {
    [records, doctorSessions] = await Promise.all([
      getAppointmentsWithPredictions(),
      listDoctorSessions(),
    ]);
  } catch (err) {
    return <BackendUnreachable error={err} />;
  }

  return <DashboardBento records={records} doctorSessions={doctorSessions} />;
}
