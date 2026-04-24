import { hasSupabaseServerEnv } from "@/lib/supabase";
import { getTrainingPageSnapshot, normalizeDate } from "@/lib/workout";
import TrainingClient from "./TrainingClient";

export const dynamic = "force-dynamic";

type SearchParamValue = string | string[] | undefined;

function readDateParam(params: Record<string, SearchParamValue>): string {
  const raw = params.date;
  if (Array.isArray(raw)) {
    return normalizeDate(raw[0]);
  }
  return normalizeDate(raw);
}

export default async function TrainingPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, SearchParamValue>>;
}) {
  const params = searchParams ? await searchParams : {};
  const date = readDateParam(params);

  if (!hasSupabaseServerEnv()) {
    return (
      <main className="app-shell">
        <section className="surface">
          <span className="kicker">Setup</span>
          <h1>缺少 Supabase 服务端变量</h1>
          <p>在 Vercel 和本地 `frontend/.env.local` 配置 `SUPABASE_URL` 和 `SUPABASE_SERVICE_ROLE_KEY`。</p>
        </section>
      </main>
    );
  }

  const snapshot = await getTrainingPageSnapshot(date);
  return <TrainingClient initialSnapshot={snapshot} />;
}
