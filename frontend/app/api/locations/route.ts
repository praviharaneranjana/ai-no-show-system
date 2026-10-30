import { NextRequest, NextResponse } from "next/server";
import { searchLocations } from "@/lib/api";

export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get("q") || "";
    const limit = Number(request.nextUrl.searchParams.get("limit") || 8);
    const data = await searchLocations(q, limit);
    return NextResponse.json(data);
  } catch (err: unknown) {
    const error = err as { message?: string; status?: number };
    return NextResponse.json(
      { detail: error?.message || "Failed to search locations" },
      { status: error?.status || 500 }
    );
  }
}
