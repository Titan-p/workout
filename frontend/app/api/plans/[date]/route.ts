import { errorJson, okJson } from "@/lib/api";
import { getPlanPayloadForDate } from "@/lib/workout";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ date: string }> },
) {
  const { date } = await params;
  try {
    const payload = await getPlanPayloadForDate(date);
    return okJson(payload, { status: payload.has_plan ? 200 : 404 });
  } catch (error) {
    return errorJson(error, 500);
  }
}
