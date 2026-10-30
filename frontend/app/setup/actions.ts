"use server";

import { redirect } from "next/navigation";

import { writeBackendConfig } from "@/lib/backend-config";

export type SaveServerConfigResult = { ok: true } | { ok: false; message: string };

export async function saveServerConfigAction(input: {
  hostPort: string;
  apiKey?: string;
}): Promise<SaveServerConfigResult> {
  const trimmed = input.hostPort.trim();
  if (!trimmed) {
    return { ok: false, message: "Enter the server's address." };
  }

  let baseUrl: string;
  try {
    const raw = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
    baseUrl = new URL(raw).toString().replace(/\/$/, "");
  } catch {
    return { ok: false, message: "That doesn't look like a valid host:port." };
  }

  try {
    const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      return { ok: false, message: `Server responded with ${res.status}.` };
    }
    const body = await res.json();
    if (body?.status !== "ok") {
      return { ok: false, message: "Unexpected response from that address." };
    }
  } catch {
    return {
      ok: false,
      message:
        "Could not reach a SHAI backend at that address. Check the host, port, and that the server is running.",
    };
  }

  await writeBackendConfig({ baseUrl, apiKey: input.apiKey?.trim() || undefined });
  redirect("/login");
}
