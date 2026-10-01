import { NextRequest, NextResponse } from "next/server";
import { updateAppointmentOutcome } from "@/lib/api";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const data = await updateAppointmentOutcome(
      id,
      body.no_show,
      body.reason,
      body.cancelled
    );
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json(
      { detail: error?.message || "Failed to record outcome" },
      { status: error?.status || 500 }
    );
  }
}
