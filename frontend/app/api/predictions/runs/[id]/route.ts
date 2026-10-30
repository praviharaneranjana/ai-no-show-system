import { NextRequest, NextResponse } from "next/server";
import { getBackendConfig } from "@/lib/backend-config";
import { getSessionToken } from "@/lib/session";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const { baseUrl, apiKey } = await getBackendConfig();
  if (!baseUrl) {
    return NextResponse.json({ detail: "Backend server is not configured" }, { status: 500 });
  }

  const token = await getSessionToken();
  const headers = new Headers();
  headers.set("Content-Type", "application/json");
  if (apiKey) headers.set("X-API-Key", apiKey);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  try {
    const res = await fetch(`${baseUrl}/predictions/runs/${id}`, {
      headers,
      cache: "no-store",
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}
