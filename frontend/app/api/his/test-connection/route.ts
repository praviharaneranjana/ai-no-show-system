import { NextRequest, NextResponse } from "next/server";
import { testHisConnection } from "@/lib/api";

export async function POST(request: NextRequest) {
  try {
    const simulateError = request.nextUrl.searchParams.get("simulate_error") === "true";
    const data = await testHisConnection(simulateError);
    return NextResponse.json(data);
  } catch (err: unknown) {
    const error = err as { message?: string; status?: number };
    return NextResponse.json(
      { detail: error?.message || "Failed to test HIS connection" },
      { status: error?.status || 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
