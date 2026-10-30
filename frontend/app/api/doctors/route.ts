import { NextRequest, NextResponse } from "next/server";
import { getDoctors } from "@/lib/api";

export async function GET(request: NextRequest) {
  try {
    const deptId = request.nextUrl.searchParams.get("department_id");
    const parsedDeptId = deptId ? Number(deptId) : undefined;
    const data = await getDoctors(parsedDeptId);
    return NextResponse.json(data);
  } catch (err: unknown) {
    const error = err as { message?: string; status?: number };
    return NextResponse.json(
      { detail: error?.message || "Failed to fetch doctors" },
      { status: error?.status || 500 }
    );
  }
}
