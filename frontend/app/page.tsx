import Link from "next/link";
import { CalendarDays, Dumbbell, Upload, BarChart3 } from "lucide-react";
import { hasSupabaseServerEnv } from "@/lib/supabase";
import { getTrainingPageSnapshot, normalizeDate } from "@/lib/workout";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const date = normalizeDate();

  if (!hasSupabaseServerEnv()) {
    return (
      <main className="app-shell">
        <section className="surface">
          <span className="kicker">Setup</span>
          <h1>缺少 Supabase 服务端变量</h1>
          <p>配置 `SUPABASE_URL` 和 `SUPABASE_SERVICE_ROLE_KEY` 后页面会读取训练计划。</p>
        </section>
      </main>
    );
  }

  const snapshot = await getTrainingPageSnapshot(date);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <div className="kicker">{date}</div>
          <h1>训练工作台</h1>
        </div>
        <div className="status-pill">{snapshot.currentSession ? "训练中" : snapshot.plan.is_rest_day ? "恢复日" : "待开始"}</div>
      </header>

      <section className="work-grid">
        <article className="surface primary-work">
          <div className="section-head">
            <div>
              <span className="kicker">{snapshot.plan.phase || "Today"}</span>
              <h2>{snapshot.plan.is_rest_day ? "今天恢复" : "今日计划"}</h2>
            </div>
            <Link className="primary-button" href={`/training?date=${date}`}>
              <Dumbbell size={18} />
              进入训练
            </Link>
          </div>
          <div className="exercise-list compact">
            {snapshot.plan.exercises.slice(0, 6).map((exercise) => (
              <div key={`${exercise.exercise_name}-${exercise.details.join("|")}`} className="exercise-item">
                <div className="exercise-head">
                  <strong>{exercise.exercise_name}</strong>
                  <span>{exercise.is_trackable ? "记录" : exercise.category}</span>
                </div>
                <div className="exercise-meta">
                  {exercise.target_sets ? `${exercise.target_sets} 组` : ""}
                  {exercise.target_metric.label ? ` · ${exercise.target_metric.label}` : ""}
                  {exercise.target_weight ? ` · ${exercise.target_weight}` : ""}
                </div>
              </div>
            ))}
            {snapshot.plan.exercises.length === 0 ? <div className="empty-state">今天没有训练项目。</div> : null}
          </div>
        </article>

        <aside className="surface">
          <span className="kicker">Load</span>
          <div className="metric-row">
            <div>
              <span>Day Load</span>
              <strong>{snapshot.loadMonitorDay.day_total_load}</strong>
            </div>
            <div>
              <span>完成训练</span>
              <strong>{snapshot.loadMonitorDay.sessions.length}</strong>
            </div>
          </div>
          <div className="action-row">
            <Link className="ghost-button" href="/week">
              <CalendarDays size={17} />
              周视图
            </Link>
            <Link className="ghost-button" href={`/training?date=${date}`}>
              <BarChart3 size={17} />
              负荷
            </Link>
            <Link className="ghost-button" href="/upload">
              <Upload size={17} />
              同步
            </Link>
          </div>
        </aside>
      </section>
    </main>
  );
}
