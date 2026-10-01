import { NextRequest, NextResponse } from "next/server";
import { previewPrediction } from "@/lib/api";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = await previewPrediction(body);
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json(
      { detail: error?.message || "Failed to generate preview prediction" },
      { status: error?.status || 500 }
    );
  }
}
