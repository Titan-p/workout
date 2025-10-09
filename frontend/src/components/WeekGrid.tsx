import type { WeekDayPlan } from "../types/api";

interface Props {
  currentWeek: number;
  days: WeekDayPlan[];
  loading?: boolean;
  onChangeWeek: (offset: number) => void;
}

export function WeekGrid({ currentWeek, days, loading, onChangeWeek }: Props) {
  const title = (() => {
    if (currentWeek === 0) {
      return "本周计划";
    }
    if (currentWeek > 0) {
      return `第${currentWeek + 1}周`;
    }
    return `上${Math.abs(currentWeek)}周`;
  })();
  return (
    <section className="card">
      <header className="card-header">
        <p className="card-title">{title}</p>
        <div className="week-controls">
          <button type="button" onClick={() => onChangeWeek(currentWeek - 1)}>
            上一周
          </button>
          <button type="button" onClick={() => onChangeWeek(0)}>本周</button>
          <button type="button" onClick={() => onChangeWeek(currentWeek + 1)}>
            下一周
          </button>
        </div>
      </header>
      {loading ? (
        <p className="card-empty">正在加载周计划…</p>
      ) : (
        <div className="week-grid">
          {days.map((day) => (
            <article key={day.date} className={`week-day ${day.has_plan ? "has-plan" : "rest"}`}>
              <header>
                <p className="week-day-title">{day.day_name ?? day.date}</p>
                <p className="week-day-date">{day.date}</p>
              </header>
              {day.has_plan ? (
                <ul>
                  {day.rows.slice(0, 4).map((row, index) => (
                    <li key={`${day.date}-${index}`}>{row[0]}</li>
                  ))}
                </ul>
              ) : (
                <p className="week-day-rest">休息</p>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
