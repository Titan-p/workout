import Link from "next/link";
import { ChevronLeft, ChevronRight, Dumbbell } from "lucide-react";
import { hasSupabaseServerEnv } from "@/lib/supabase";
import { getWeekPlan, normalizeDate } from "@/lib/workout";

export const dynamic = "force-dynamic";

type SearchParamValue = string | string[] | undefined;

function readNumber(value: SearchParamValue): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(raw || "0", 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default async function WeekPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, SearchParamValue>>;
}) {
  const params = searchParams ? await searchParams : {};
  const week = readNumber(params.week);
  const date = normalizeDate(Array.isArray(params.date) ? params.date[0] : params.date);

  if (!hasSupabaseServerEnv()) {
    return (
      <main className="app-shell">
        <section className="surface">
          <span className="kicker">Setup</span>
          <h1>缺少 Supabase 服务端变量</h1>
        </section>
      </main>
    );
  }

  const payload = await getWeekPlan(week, date);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <div className="kicker">{payload.start_date} / {payload.end_date}</div>
          <h1>周训练计划</h1>
        </div>
        <div className="status-pill">{payload.training_days} 天训练</div>
      </header>

      <div className="action-row toolbar-row">
        <Link className="ghost-button" href={`/week?week=${week - 1}&date=${date}`}>
          <ChevronLeft size={17} />
          上周
        </Link>
        <Link className="ghost-button" href={`/week?week=${week + 1}&date=${date}`}>
          下周
          <ChevronRight size={17} />
        </Link>
        <Link className="primary-button" href="/">
          今日
        </Link>
        <Link className="ghost-button" href={`/training?date=${date}`}>
          <Dumbbell size={17} />
          训练控制台
        </Link>
      </div>

      <section className="surface">
        <div className="week-page-grid">
          {payload.days.map((day) => (
            <article key={day.date} className="week-day">
              <div className="section-head">
                <div>
                  <span className="kicker">{day.day_name}</span>
                  <h2>{day.date.slice(5)}</h2>
                </div>
                <Link className="icon-button" href={`/training?date=${day.date}`} aria-label="进入训练" title="进入训练">
                  <Dumbbell size={17} />
                </Link>
              </div>
              {day.has_plan ? (
                <div className="exercise-list">
                  {day.rows.slice(0, 6).map((row, index) => (
                    <div key={`${day.date}-${index}-${row.join("|")}`} className="exercise-item">
                      <strong>{row[0] || "训练项目"}</strong>
                      <div className="exercise-meta">{row.slice(1).filter(Boolean).join(" · ")}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state">恢复</div>
              )}
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
