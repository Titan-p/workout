import { errorJson, okJson } from "@/lib/api";
import { listTrainingHistorySessions } from "@/lib/workout";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Number.parseInt(searchParams.get("limit") || "30", 10);

  try {
    return okJson(await listTrainingHistorySessions(Number.isFinite(limit) ? limit : 30));
  } catch (error) {
    return errorJson(error, 500);
  }
}
