import { NextResponse } from "next/server";
import { getHisStatus } from "@/lib/api";

export async function GET() {
  try {
    const data = await getHisStatus();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json(
      { detail: error?.message || "Failed to fetch HIS status" },
      { status: error?.status || 500 }
    );
  }
}
