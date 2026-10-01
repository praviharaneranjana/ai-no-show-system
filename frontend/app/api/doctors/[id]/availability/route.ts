import { NextRequest, NextResponse } from "next/server";
import { getDoctorAvailability } from "@/lib/api";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const daysParam = request.nextUrl.searchParams.get("days");
    const days = daysParam ? Number(daysParam) : 14;
    const data = await getDoctorAvailability(id, days);
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json(
      { detail: error?.message || "Failed to fetch doctor availability" },
      { status: error?.status || 500 }
    );
  }
}
