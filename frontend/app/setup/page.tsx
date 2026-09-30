import { Activity } from "lucide-react";

import { getBackendConfig } from "@/lib/backend-config";
import { ThemeToggle } from "@/components/theme-toggle";
import { SetupForm } from "@/app/setup/setup-form";

export default async function SetupPage() {
  const envLocked = Boolean(process.env.BACKEND_API_URL);
  const config = await getBackendConfig();

  return (
    <div className="relative flex min-h-svh w-full items-center justify-center bg-background p-4">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <Activity className="size-4" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-base font-bold tracking-tight text-foreground">SHAI</span>
            <span className="text-xs text-muted-foreground">Clinical Platform</span>
          </div>
        </div>

        <SetupForm
          envLocked={envLocked}
          initialBaseUrl={config.baseUrl}
          hasApiKey={Boolean(config.apiKey)}
        />
      </div>
    </div>
  );
}
