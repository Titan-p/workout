import { errorJson, okJson } from "@/lib/api";
import { getCurrentSession, normalizeDate } from "@/lib/workout";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = normalizeDate(searchParams.get("date"));

  try {
    const session = await getCurrentSession(date);
    return okJson(session || { status: "no_session" });
  } catch (error) {
    return errorJson(error, 500);
  }
}
