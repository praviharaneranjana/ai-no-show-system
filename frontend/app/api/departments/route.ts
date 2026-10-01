import { NextRequest, NextResponse } from "next/server";
import { getDepartments } from "@/lib/api";

export async function GET() {
  try {
    const data = await getDepartments();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json(
      { detail: error?.message || "Failed to fetch departments" },
      { status: error?.status || 500 }
    );
  }
}
