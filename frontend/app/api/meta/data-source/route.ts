import { NextResponse } from "next/server";
import { getDataSourceInfo } from "@/lib/api";

export async function GET() {
  try {
    return NextResponse.json(await getDataSourceInfo());
  } catch (error: unknown) {
    const e = error as { message?: string; status?: number };
    return NextResponse.json({ detail: e?.message || "Failed to fetch data source" }, { status: e?.status || 500 });
  }
}
