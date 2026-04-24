import { errorJson, okJson, readJson } from "@/lib/api";
import { startTraining } from "@/lib/workout";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const payload = await readJson(request);
  try {
    return okJson(await startTraining(String(payload.date || "")));
  } catch (error) {
    return errorJson(error, 400);
  }
}
