import { errorJson, okJson } from "@/lib/api";
import { getWeekPlan, normalizeDate } from "@/lib/workout";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const week = Number.parseInt(searchParams.get("week") || "0", 10);
  const date = normalizeDate(searchParams.get("date"));

  try {
    return okJson(await getWeekPlan(Number.isFinite(week) ? week : 0, date));
  } catch (error) {
    return errorJson(error, 500);
  }
}
