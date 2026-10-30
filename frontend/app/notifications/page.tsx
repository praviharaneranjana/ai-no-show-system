import { getNotifications } from "@/lib/api";
import { BackendUnreachable } from "@/components/backend-unreachable";
import { PageHeader, Panel } from "@/components/page-header";
import { NotificationsList } from "./notifications-list";

export default async function NotificationsPage() {
  let data;
  try {
    data = await getNotifications(200);
  } catch (err) {
    return <BackendUnreachable error={err} />;
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title="Notifications"
        subtitle="High-risk appointments today, doctor delays, patient replies and waitlist requests — computed live from clinic data."
      />
      <Panel>
        <NotificationsList items={data.items} />
      </Panel>
    </div>
  );
}
