import { errorJson, okJson, readJson } from "@/lib/api";
import { finishTraining } from "@/lib/workout";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const payload = await readJson(request);
  try {
    return okJson(await finishTraining({
      session_id: String(payload.session_id || ""),
      notes: payload.notes as string | null | undefined,
      session_name: payload.session_name as string | null | undefined,
      session_slot: payload.session_slot as string | null | undefined,
      session_rpe: payload.session_rpe as string | number | null | undefined,
      duration_minutes: payload.duration_minutes as string | number | null | undefined,
      body_weight_kg: payload.body_weight_kg as string | number | null | undefined,
      fatigue_score: payload.fatigue_score as string | number | null | undefined,
      pain_score: payload.pain_score as string | number | null | undefined,
      daily_note: payload.daily_note as string | null | undefined,
    }));
  } catch (error) {
    return errorJson(error, 400);
  }
}
