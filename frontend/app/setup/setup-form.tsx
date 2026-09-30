"use client";

import { useState, type FormEvent } from "react";
import { AlertCircle, Loader2, ServerCog } from "lucide-react";

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

    // On success, saveServerConfigAction redirects and never resolves normally.
    if (!res.ok) {
      setError(res.message);
      setIsSaving(false);
    }
  }

  if (envLocked) {
    return (
      <Card className="w-full border-border/80 bg-card/95 shadow-2xl backdrop-blur-md">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Server settings</CardTitle>
          <CardDescription>
            The backend address is fixed for this deployment.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          This copy of SHAI is configured via the <code className="font-mono text-xs">BACKEND_API_URL</code>{" "}
          environment variable and can&apos;t be changed here.
        </CardContent>
        <CardFooter className="justify-center border-t border-border/60 bg-muted/50 py-3">
          <a href="/login" className="text-xs font-medium text-primary hover:underline">
            Continue to sign in
          </a>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="w-full border-border/80 bg-card/95 shadow-2xl backdrop-blur-md">
      <CardHeader className="pb-3">
        <div className="mb-1 flex items-center gap-2 text-primary">
          <ServerCog className="size-4" />
          <CardTitle className="text-lg">Connect to your SHAI server</CardTitle>
        </div>
        <CardDescription>
          Enter the address of the hospital&apos;s SHAI backend server. You only need to do this once.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="hostPort">Server address</Label>
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
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="apiKey">
              API key <span className="text-muted-foreground">(optional{hasApiKey ? " — already set" : ""})</span>
            </Label>
            <Input
              id="apiKey"
              name="apiKey"
              type="password"
              placeholder={hasApiKey ? "••••••••••••" : "Leave blank if none"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              disabled={isSaving}
            />
          </div>

          {error && (
            <div
              className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-2.5 text-xs text-destructive"
              role="alert"
              aria-live="polite"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <Button type="submit" className="w-full" disabled={isSaving}>
            {isSaving && <Loader2 className="size-4 animate-spin" />}
            <span>Connect</span>
          </Button>
        </form>
      </CardContent>

      <CardFooter className="justify-center border-t border-border/60 bg-muted/50 py-3 text-center">
        <p className="text-xs text-muted-foreground">
          Don&apos;t know the address? Ask your IT administrator.
        </p>
      </CardFooter>
    </Card>
  );
}
