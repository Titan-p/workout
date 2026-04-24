import { hasSupabaseServerEnv } from "@/lib/supabase";
import { getTrainingPageSnapshot, normalizeDate } from "@/lib/workout";

export const dynamic = "force-dynamic";

type SearchParamValue = string | string[] | undefined;

function formatRestSeconds(value: number | null): string {
  if (!value || value <= 0) {
    return "未设置";
  }
  if (value >= 60 && value % 60 === 0) {
    return `${value / 60} 分钟`;
  }
  return `${value} 秒`;
}

function readDateParam(params: Record<string, SearchParamValue>): string {
  const raw = params.date;
  if (Array.isArray(raw)) {
    return normalizeDate(raw[0]);
  }
  return normalizeDate(raw);
}

function renderStatusLabel(status: string | null): string {
  if (status === "active") {
    return "训练进行中";
  }
  if (status === "ready_to_finish") {
    return "等待结束记录";
  }
  if (status === "completed") {
    return "训练已完成";
  }
  return "尚未开始";
}

export default async function TrainingPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, SearchParamValue>>;
}) {
  const params = searchParams ? await searchParams : {};
  const date = readDateParam(params);
  const hasServerEnv = hasSupabaseServerEnv();

  if (!hasServerEnv) {
    return (
      <main className="shell">
        <section className="hero">
          <span className="eyebrow">Training / Setup</span>
          <h1>训练页首屏已经迁进 Next.js</h1>
          <p>先补齐 frontend 的 Supabase 环境变量，页面就能直接读取当天计划和训练状态。</p>
        </section>

        <section className="panel setup-panel">
          <h2>需要的变量</h2>
          <ol className="setup-list">
            <li>在 <code>frontend/.env.local</code> 写入 <code>SUPABASE_URL</code></li>
            <li>写入 <code>SUPABASE_SERVICE_ROLE_KEY</code></li>
            <li>后续客户端查询会继续使用 <code>NEXT_PUBLIC_SUPABASE_*</code></li>
          </ol>
        </section>
      </main>
    );
  }

  const snapshot = await getTrainingPageSnapshot(date);
  const currentSession = snapshot.currentSession;
  const currentStatus = renderStatusLabel(currentSession?.status || null);

  return (
    <main className="shell">
      <section className="hero">
        <span className="eyebrow">Training / Next.js Slice</span>
        <h1>{snapshot.date} 训练页</h1>
        <p>
          这一版先把训练页首屏数据迁过来，当前计划、当前训练状态和当日负荷都直接由
          Next.js 服务端读取 Supabase。
        </p>
      </section>

      <section className="grid two">
        <article className="panel">
          <div className="panel-body">
            <div className="status-row">
              <span className="badge accent">{currentStatus}</span>
              {snapshot.plan.phase ? <span className="badge success">{snapshot.plan.phase}</span> : null}
              {snapshot.plan.default_rest_seconds ? (
                <span className="badge warning">
                  默认休息 {formatRestSeconds(snapshot.plan.default_rest_seconds)}
                </span>
              ) : null}
            </div>

            <h2>当前训练</h2>
            {currentSession ? (
              <div className="exercise-list">
                <div className="exercise-item">
                  <div className="exercise-head">
                    <div className="exercise-name">{currentSession.current_exercise || "今日计划已完成"}</div>
                    <div className="exercise-meta">
                      {currentSession.current_set ? `第 ${currentSession.current_set} 组` : "总结阶段"}
                    </div>
                  </div>
                  <div className="exercise-meta">
                    {currentSession.target_sets ? `目标 ${currentSession.target_sets} 组` : "按计划执行"}
                    {currentSession.target_reps ? ` · ${currentSession.target_reps} 次` : ""}
                    {currentSession.target_weight ? ` · ${currentSession.target_weight}` : ""}
                  </div>
                  {currentSession.details.length ? (
                    <div className="session-detail">{currentSession.details.join(" · ")}</div>
                  ) : null}
                </div>
                <div className="exercise-item">
                  <div className="exercise-name">会话信息</div>
                  <div className="session-detail">
                    开始时间 {new Date(currentSession.session.started_at).toLocaleString("zh-CN")}
                  </div>
                  <div className="session-detail">已记录 {currentSession.session.logs.length} 组</div>
                </div>
              </div>
            ) : (
              <div className="empty-state">今天还没有活动中的训练会话。</div>
            )}
          </div>
        </article>

        <article className="panel">
          <div className="panel-body">
            <h2>当日负荷</h2>
            <div className="metric-grid">
              <div className="metric">
                <div className="metric-label">Day Load</div>
                <div className="metric-value">{snapshot.loadMonitorDay.day_total_load}</div>
              </div>
              <div className="metric">
                <div className="metric-label">体重</div>
                <div className="metric-value">
                  {snapshot.loadMonitorDay.body_weight_kg ?? snapshot.loadMonitorDay.defaults.body_weight_kg ?? "—"}
                </div>
              </div>
              <div className="metric">
                <div className="metric-label">疲劳 / 疼痛</div>
                <div className="metric-value">
                  {snapshot.loadMonitorDay.fatigue_score ?? snapshot.loadMonitorDay.defaults.fatigue_score ?? "—"} /{" "}
                  {snapshot.loadMonitorDay.pain_score ?? snapshot.loadMonitorDay.defaults.pain_score ?? "—"}
                </div>
              </div>
            </div>

            {snapshot.loadMonitorDay.sessions.length ? (
              <div className="session-list" style={{ marginTop: 16 }}>
                {snapshot.loadMonitorDay.sessions.map((session) => (
                  <div key={session.session_id} className="session-item">
                    <div className="session-head">
                      <div className="session-name">{session.session_name}</div>
                      <div className="session-meta">{session.session_slot_label}</div>
                    </div>
                    <div className="session-meta">
                      Session RPE {session.session_rpe ?? "—"} · 时长 {session.duration_minutes ?? "—"} 分钟
                    </div>
                    <div className="session-detail">Load {session.session_load ?? 0}</div>
                    {session.summary ? <div className="session-detail">{session.summary}</div> : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state" style={{ marginTop: 16 }}>
                今天还没有完成的训练负荷记录。
              </div>
            )}
          </div>
        </article>
      </section>

      <section className="panel" style={{ marginTop: 18 }}>
        <div className="panel-body">
          <h2>今日计划</h2>
          {snapshot.plan.exercises.length ? (
            <div className="exercise-list">
              {snapshot.plan.exercises.map((exercise) => (
                <div key={`${exercise.exercise_name}-${exercise.details.join("|")}`} className="exercise-item">
                  <div className="exercise-head">
                    <div className="exercise-name">{exercise.exercise_name}</div>
                    <div className="exercise-meta">
                      {exercise.is_trackable ? "可记录" : "说明项"}
                    </div>
                  </div>
                  <div className="exercise-meta">
                    {exercise.target_sets ? `${exercise.target_sets} 组` : ""}
                    {exercise.target_reps ? ` · ${exercise.target_reps} 次` : ""}
                    {exercise.target_weight ? ` · ${exercise.target_weight}` : ""}
                    {exercise.target_rest_seconds ? ` · 休息 ${formatRestSeconds(exercise.target_rest_seconds)}` : ""}
                  </div>
                  {exercise.details.length ? (
                    <div className="session-detail">{exercise.details.join(" · ")}</div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">今天没有可追踪训练项目。</div>
          )}

          {snapshot.plan.remarks.length ? (
            <div className="remark-list" style={{ marginTop: 16 }}>
              {snapshot.plan.remarks.map((remark, index) => (
                <div key={`${remark}-${index}`} className="exercise-item">
                  <div className="exercise-name">备注 {index + 1}</div>
                  <div className="exercise-meta">{remark}</div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
