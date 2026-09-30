"use client";

import { useState, type FormEvent } from "react";
import { AlertCircle, Loader2, ServerCog, CheckCircle2 } from "lucide-react";

import { saveServerConfigAction } from "@/app/setup/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type SetupFormProps = {
  envLocked: boolean;
  initialBaseUrl: string;
  hasApiKey: boolean;
};

export function SetupForm({ envLocked, initialBaseUrl, hasApiKey }: SetupFormProps) {
  const [hostPort, setHostPort] = useState(initialBaseUrl);
  const [apiKey, setApiKey] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setIsSaving(true);

    const res = await saveServerConfigAction({ hostPort, apiKey: apiKey || undefined });

    if (!res.ok) {
      setError(res.message);
      setIsSaving(false);
    }
  }

  if (envLocked) {
    return (
      <Card className="w-full border-border/60 bg-card shadow-2xl rounded-[28px] overflow-hidden">
        <CardHeader className="pb-3 pt-6 px-6 sm:px-8">
          <div className="flex items-center gap-2 text-primary mb-1">
            <CheckCircle2 className="size-5 text-emerald-500" />
            <CardTitle className="text-xl font-bold tracking-tight text-foreground">Server Configured</CardTitle>
          </div>
          <CardDescription className="text-xs text-muted-foreground">
            The backend address is fixed for this deployment environment.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground px-6 sm:px-8 py-2">
          This client instance is connected via the{" "}
          <code className="font-mono text-[11px] px-1.5 py-0.5 rounded-md bg-muted text-foreground">
            BACKEND_API_URL
          </code>{" "}
          environment configuration and cannot be modified dynamically.
        </CardContent>
        <CardFooter className="justify-center border-t border-border/40 bg-muted/30 py-4 px-6 sm:px-8">
          <a
            href="/login"
            className="text-xs font-semibold text-primary underline-offset-4 hover:underline"
          >
            Continue to sign in →
          </a>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="w-full border-border/60 bg-card shadow-2xl rounded-[28px] overflow-hidden">
      <CardHeader className="pb-3 pt-6 px-6 sm:px-8">
        <div className="mb-2 flex items-center gap-2 text-primary">
          <div className="size-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            <ServerCog className="size-4" />
          </div>
          <CardTitle className="text-xl font-bold tracking-tight text-foreground">
            Connect to Hospital Server
          </CardTitle>
        </div>
        <CardDescription className="text-xs text-muted-foreground">
          Enter the address of the SHAI clinical backend engine. Stored locally for this workstation.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4 px-6 sm:px-8">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="hostPort" className="text-xs font-semibold text-foreground">
              Server address
            </Label>
            <Input
              id="hostPort"
              name="hostPort"
              type="text"
              required
              placeholder="192.168.1.10:8000"
              value={hostPort}
              onChange={(e) => setHostPort(e.target.value)}
              disabled={isSaving}
              autoFocus
              className="h-10 rounded-xl border-border/80 bg-background/80 px-3 text-xs focus:border-primary focus:ring-primary/20 font-mono"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="apiKey" className="text-xs font-semibold text-foreground">
              API key{" "}
              <span className="text-muted-foreground font-normal text-[11px]">
                (optional{hasApiKey ? " — currently configured" : ""})
              </span>
            </Label>
            <Input
              id="apiKey"
              name="apiKey"
              type="password"
              placeholder={hasApiKey ? "••••••••••••" : "Leave blank if not required"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              disabled={isSaving}
              className="h-10 rounded-xl border-border/80 bg-background/80 px-3 text-xs focus:border-primary focus:ring-primary/20"
            />
          </div>

          {error && (
            <div
              className="flex items-start gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
              role="alert"
              aria-live="polite"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <Button
            type="submit"
            className="w-full h-10 rounded-xl bg-gradient-to-r from-[#8B7CF6] to-[#5B7CFA] text-white font-semibold text-sm hover:opacity-90 shadow-md cursor-pointer transition-all active:scale-[0.99]"
            disabled={isSaving}
          >
            {isSaving && <Loader2 className="size-4 animate-spin mr-2" />}
            <span>Connect & Save</span>
          </Button>
        </form>
      </CardContent>

      <CardFooter className="justify-center border-t border-border/40 bg-muted/30 py-4 px-6 sm:px-8 text-center">
        <p className="text-xs text-muted-foreground">
          Need network assistance? Contact the hospital{" "}
          <span className="font-semibold text-foreground">IT Helpdesk</span>.
        </p>
      </CardFooter>
    </Card>
  );
}
