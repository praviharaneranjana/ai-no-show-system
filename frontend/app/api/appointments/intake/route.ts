import { NextRequest, NextResponse } from "next/server";
import { createAppointmentIntake } from "@/lib/api";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = await createAppointmentIntake(body);
    return NextResponse.json(data);
  } catch (err: unknown) {
    const error = err as { message?: string; status?: number };
    return NextResponse.json(
      { detail: error?.message || "Failed to create appointment intake" },
      { status: error?.status || 500 }
    );
  }
}
