import { NextResponse } from "next/server";
import { getModelInfo } from "@/lib/api";

export async function GET() {
  try {
    return NextResponse.json(await getModelInfo());
  } catch (error: unknown) {
    const e = error as { message?: string; status?: number };
    return NextResponse.json({ detail: e?.message || "Failed to fetch model info" }, { status: e?.status || 500 });
  }
}
