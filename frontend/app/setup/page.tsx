import { getBackendConfig } from "@/lib/backend-config";
import { ThemeToggle } from "@/components/theme-toggle";
import { SetupForm } from "@/app/setup/setup-form";
import { ShaiLogo } from "@/components/shai-logo";

export default async function SetupPage() {
  const envLocked = Boolean(process.env.BACKEND_API_URL);
  const config = await getBackendConfig();

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center bg-[#F7F7F8] dark:bg-[#0A0D14] p-4 sm:p-6 overflow-hidden">
      {/* Background Decorative Glow */}
      <div className="absolute inset-0 bg-radial from-primary/5 via-transparent to-transparent pointer-events-none" />

      {/* Top Floating Utility Bar */}
      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md relative z-10 flex flex-col items-center gap-6">
        <ShaiLogo size="lg" variant="horizontal" />

        <SetupForm
          envLocked={envLocked}
          initialBaseUrl={config.baseUrl}
          hasApiKey={Boolean(config.apiKey)}
        />
      </div>
    </div>
  );
}
