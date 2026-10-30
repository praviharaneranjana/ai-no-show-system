import { NextRequest, NextResponse } from "next/server";
import { triggerBatchRun } from "@/lib/api";

export async function POST(request: NextRequest) {
  try {
    const runSync = request.nextUrl.searchParams.get("run_sync") === "true";
    const body = await request.json();
    const data = await triggerBatchRun(body, runSync);
    return NextResponse.json(data);
  } catch (err: unknown) {
    const error = err as { message?: string; status?: number };
    return NextResponse.json(
      { detail: error?.message || "Failed to trigger prediction run" },
      { status: error?.status || 500 }
    );
  }
}
