import type { TodayPlanResponse } from "../types/api";

interface Props {
  dateLabel: string;
  plan?: TodayPlanResponse;
  loading?: boolean;
}

export function PlanSummaryCard({ dateLabel, plan, loading }: Props) {
  if (loading) {
    return <div className="card">加载中…</div>;
  }

  if (!plan) {
    return (
      <div className="card">
        <header className="card-header">
          <p className="card-title">{dateLabel}</p>
          <p className="card-subtitle">今天没有训练计划</p>
        </header>
        <p className="card-empty">安排休息，注意恢复 💤</p>
      </div>
    );
  }

  return (
    <div className="card">
      <header className="card-header">
        <p className="card-title">{dateLabel}</p>
        {plan.phase && <p className="card-subtitle">{plan.phase}</p>}
      </header>
      <section className="card-body">
        <div className="card-stats">
          <div>
            <span className="stat-label">练习动作</span>
            <span className="stat-value">{plan.trackable_exercise_count}</span>
          </div>
          <div>
            <span className="stat-label">备注</span>
            <span className="stat-value">{plan.note_exercise_count}</span>
          </div>
          <div>
            <span className="stat-label">默认间歇</span>
            <span className="stat-value">
              {plan.default_rest_seconds ? `${plan.default_rest_seconds}s` : "-"}
            </span>
          </div>
        </div>
        {plan.remarks?.length ? (
          <ul className="card-remarks">
            {plan.remarks.map((remark) => (
              <li key={remark}>{remark}</li>
            ))}
          </ul>
        ) : (
          <p className="card-empty">没有特别备注，专注完成训练即可。</p>
        )}
      </section>
    </div>
  );
}
