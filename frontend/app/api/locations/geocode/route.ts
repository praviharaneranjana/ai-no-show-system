import { NextRequest, NextResponse } from "next/server";
import { geocodeLocation } from "@/lib/api";

export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get("q") || "";
    const data = await geocodeLocation(q);
    return NextResponse.json(data);
  } catch (err: unknown) {
    const error = err as { message?: string; status?: number };
    return NextResponse.json(
      { detail: error?.message || "Failed to geocode location" },
      { status: error?.status || 500 }
    );
  }
}
