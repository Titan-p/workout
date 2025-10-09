import type { PlanExercise } from "../types/api";

interface Props {
  exercises: PlanExercise[];
}

const categoryLabel: Record<PlanExercise["category"], string> = {
  exercise: "训练",
  note: "提示",
  rest: "休息",
  warmup: "热身",
  log: "记录",
};

export function ExerciseList({ exercises }: Props) {
  if (!exercises.length) {
    return <p className="card-empty">今天是休息日 🎉</p>;
  }

  return (
    <div className="exercise-list">
      {exercises.map((exercise) => (
        <article key={exercise.exercise_name} className="exercise-card">
          <header>
            <div>
              <p className="exercise-name">{exercise.exercise_name}</p>
              <span className={`exercise-chip category-${exercise.category}`}>
                {categoryLabel[exercise.category]}
              </span>
              {exercise.is_combination && exercise.components.length > 1 && (
                <p className="exercise-components">
                  组合：{exercise.components.join(" + ")}
                </p>
              )}
            </div>
            {exercise.target_rest_seconds && (
              <span className="exercise-rest">{exercise.target_rest_seconds}s 间歇</span>
            )}
          </header>
          <dl className="exercise-meta">
            {exercise.target_sets !== null && (
              <div>
                <dt>目标组数</dt>
                <dd>{exercise.target_sets}</dd>
              </div>
            )}
            {exercise.target_reps !== null && (
              <div>
                <dt>目标次数</dt>
                <dd>{exercise.target_reps}</dd>
              </div>
            )}
            {exercise.target_weight && (
              <div>
                <dt>建议重量</dt>
                <dd>{exercise.target_weight}</dd>
              </div>
            )}
          </dl>
          {exercise.details.length > 0 && (
            <ul className="exercise-details">
              {exercise.details.map((detail) => (
                <li key={detail}>{detail}</li>
              ))}
            </ul>
          )}
        </article>
      ))}
    </div>
  );
}
