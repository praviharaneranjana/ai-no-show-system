import { BackendUnreachable } from "@/components/backend-unreachable";
import { PageHeader } from "@/components/page-header";
import { getRecallQueue, getRecallSummary } from "@/lib/api";
import { RecallClient } from "@/app/recall/recall-client";

export default async function RecallPage() {
  let queue, summary;
  try {
    [queue, summary] = await Promise.all([getRecallQueue(14), getRecallSummary(90)]);
  } catch (err) {
    return <BackendUnreachable error={err} />;
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        back={{ href: "/", label: "Dashboard" }}
        title="Missed-appointment recall"
        subtitle="Patients who did not attend in the last two weeks. Contact them and offer a new time; the study this is based on brought back 26% of such patients."
      />
      <RecallClient initialQueue={queue} summary={summary} />
    </div>
  );
}
