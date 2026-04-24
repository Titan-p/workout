import { okJson } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST() {
  return okJson(
    {
      error: "训练计划上传保留在本地脚本链路",
      command: "python3 scripts/upload_workout_plans.py --env-file .env",
    },
    { status: 410 },
  );
}
