import { getAppointmentsWithPredictions } from "@/lib/appointments-with-predictions";
import { getAppointmentRegister, getNoShowTrend, getOutreachActivity, listDoctorSessions } from "@/lib/api";
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

  // Secondary widgets degrade individually instead of taking the whole dashboard down.
  const [trend, activity, register] = await Promise.all([
    getNoShowTrend("month").catch(() => null),
    getOutreachActivity(4).catch(() => null),
    getAppointmentRegister({ page_size: 10, view: "upcoming", sort: "risk" }).catch(() => null),
  ]);

  return (
    <DashboardBento
      records={records}
      doctorSessions={doctorSessions}
      trend={trend}
      activity={activity}
      register={register}
    />
  );
}
