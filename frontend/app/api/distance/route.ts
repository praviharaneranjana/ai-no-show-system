import { NextRequest, NextResponse } from "next/server";
import { calculateDistance } from "@/lib/api";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { latitude, longitude } = body;
    if (latitude === undefined || longitude === undefined) {
      return NextResponse.json({ detail: "Latitude and longitude are required" }, { status: 400 });
    }
    const data = await calculateDistance(latitude, longitude);
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json(
      { detail: error?.message || "Failed to calculate distance" },
      { status: error?.status || 500 }
    );
  }
}
