import { NextRequest, NextResponse } from "next/server";
import { simulateHisArrivals } from "@/lib/api";

export async function POST(request: NextRequest) {
  try {
    const count = Number(request.nextUrl.searchParams.get("count") || 5);
    const data = await simulateHisArrivals(count);
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json(
      { detail: error?.message || "Failed to simulate HIS arrivals" },
      { status: error?.status || 500 }
    );
  }
}
