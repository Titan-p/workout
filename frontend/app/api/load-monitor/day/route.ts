import { errorJson, okJson } from "@/lib/api";
import { buildLoadMonitorDay, normalizeDate } from "@/lib/workout";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = normalizeDate(searchParams.get("date"));

  try {
    return okJson(await buildLoadMonitorDay(date));
  } catch (error) {
    return errorJson(error, 500);
  }
}
