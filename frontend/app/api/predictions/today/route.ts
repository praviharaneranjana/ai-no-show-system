import { NextRequest, NextResponse } from "next/server";
import { getPredictionsToday } from "@/lib/api";

export async function GET(request: NextRequest) {
  try {
    const date = request.nextUrl.searchParams.get("date") || undefined;
    const data = await getPredictionsToday(date);
    return NextResponse.json(data);
  } catch (err: unknown) {
    const error = err as { message?: string; status?: number };
    return NextResponse.json(
      { detail: error?.message || "Failed to fetch predictions today" },
      { status: error?.status || 500 }
    );
  }
}
