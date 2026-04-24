import { errorJson, okJson, readJson } from "@/lib/api";
import { cancelTraining } from "@/lib/workout";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const payload = await readJson(request);
  try {
    return okJson(await cancelTraining(String(payload.session_id || "")));
  } catch (error) {
    return errorJson(error, 400);
  }
}
