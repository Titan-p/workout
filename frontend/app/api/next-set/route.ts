import { errorJson, okJson, readJson } from "@/lib/api";
import { recordNextSet } from "@/lib/workout";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const payload = await readJson(request);
  try {
    return okJson(await recordNextSet({
      session_id: String(payload.session_id || ""),
      exercise_name: payload.exercise_name as string | null | undefined,
      set_number: payload.set_number as string | number | null | undefined,
      actual_reps: payload.actual_reps as string | number | null | undefined,
      actual_weight: payload.actual_weight as string | null | undefined,
      rpe: payload.rpe as string | number | null | undefined,
      notes: payload.notes as string | null | undefined,
      component_logs: Array.isArray(payload.component_logs)
        ? payload.component_logs as Array<{
            component_name?: string | null;
            actual_reps?: string | number | null;
            actual_weight?: string | null;
            rpe?: string | number | null;
            notes?: string | null;
          }>
        : undefined,
      rest_interval_seconds: payload.rest_interval_seconds as string | number | null | undefined,
    }));
  } catch (error) {
    return errorJson(error, 400);
  }
}
