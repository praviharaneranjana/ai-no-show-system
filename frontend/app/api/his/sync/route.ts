import { NextRequest, NextResponse } from "next/server";
import { triggerHisSync } from "@/lib/api";

export async function POST(request: NextRequest) {
  try {
    const date = request.nextUrl.searchParams.get("date") || undefined;
    const data = await triggerHisSync(date);
    return NextResponse.json(data);
  } catch (err: unknown) {
    const error = err as { message?: string; status?: number };
    return NextResponse.json(
      { detail: error?.message || "Failed to trigger HIS sync" },
      { status: error?.status || 500 }
    );
  }
}
