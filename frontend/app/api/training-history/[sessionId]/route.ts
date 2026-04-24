import { errorJson, okJson } from "@/lib/api";
import { deleteTrainingHistorySession } from "@/lib/workout";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  try {
    return okJson(await deleteTrainingHistorySession(sessionId));
  } catch (error) {
    return errorJson(error, 404);
  }
}
