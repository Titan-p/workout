import { NextResponse } from "next/server";
import { getTodayPlan, normalizeDate } from "@/lib/workout";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = normalizeDate(searchParams.get("date"));
  const payload = await getTodayPlan(date);
  return NextResponse.json({
    date,
    ...payload,
  });
}
