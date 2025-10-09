import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTodayPlan } from "../hooks/useTodayPlan";
import { useTrainingSession } from "../hooks/useTrainingSession";
import { PlanSummaryCard } from "../components/PlanSummaryCard";
import { ExerciseList } from "../components/ExerciseList";

function formatISODate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatDisplayDate(date: Date) {
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function parseDate(value: string | null): Date {
  if (!value) {
    return new Date();
  }
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return new Date();
  }
  return parsed;
}

export function TodayPlan() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedDate = parseDate(searchParams.get("date"));
  const todayISO = formatISODate(new Date());
  const selectedISO = formatISODate(selectedDate);

  const planQuery = useTodayPlan(selectedISO === todayISO ? undefined : selectedISO);
  const session = useTrainingSession(selectedISO === todayISO ? undefined : selectedISO);
  const [customRest, setCustomRest] = useState<string>("");

  const plan = planQuery.data;
  const isRestDay = plan?.is_rest_day ?? true;

  const sessionState = session.current.data;

  const dateLabel = useMemo(() => {
    const prefix = selectedISO === todayISO ? "今天" : "训练日";
    return `${prefix} · ${formatDisplayDate(selectedDate)}`;
  }, [selectedISO, selectedDate, todayISO]);

  function updateDate(date: Date) {
    const iso = formatISODate(date);
    if (iso === todayISO) {
      setSearchParams({});
    } else {
      setSearchParams({ date: iso });
    }
  }

  function handleShift(days: number) {
    const newDate = new Date(selectedDate);
    newDate.setDate(selectedDate.getDate() + days);
    updateDate(newDate);
  }

  function parseRestInput() {
    if (!customRest.trim()) {
      return plan?.default_rest_seconds ?? 90;
    }
    const value = Number(customRest.trim());
    return Number.isNaN(value) ? plan?.default_rest_seconds ?? 90 : value;
  }

  async function handleStart() {
    if (session.start.isPending) {
      return;
    }
    const restInterval = parseRestInput();
    session.start.mutate({ date: selectedISO, rest_interval_seconds: restInterval });
  }

  function handleComplete(notes?: string) {
    if (!sessionState?.session?.session_id) {
      return;
    }
    session.finish.mutate({ sessionId: sessionState.session.session_id, notes });
  }

  function handleNextSet() {
    if (!sessionState?.session?.session_id) {
      return;
    }
    session.nextSet.mutate({
      session_id: sessionState.session.session_id,
      rest_interval_seconds: parseRestInput(),
    });
  }

  return (
    <div className="page">
      <div className="date-controls">
        <button type="button" onClick={() => handleShift(-1)}>
          前一天
        </button>
        <button type="button" onClick={() => updateDate(new Date())} disabled={selectedISO === todayISO}>
          回到今天
        </button>
        <button type="button" onClick={() => handleShift(1)}>
          后一天
        </button>
      </div>

      <PlanSummaryCard dateLabel={dateLabel} plan={plan} loading={planQuery.isLoading} />

      <section className="card">
        <header className="card-header">
          <p className="card-title">训练记录</p>
          <p className="card-subtitle">在手机上实时记录每一组训练</p>
        </header>
        {isRestDay ? (
          <p className="card-empty">休息日无需开始训练。</p>
        ) : (
          <div className="session-panel">
            <div className="session-row">
              <label htmlFor="rest">目标间歇（秒）</label>
              <input
                id="rest"
                type="number"
                min={30}
                step={5}
                inputMode="numeric"
                placeholder={(plan?.default_rest_seconds ?? 90).toString()}
                value={customRest}
                onChange={(event) => setCustomRest(event.target.value)}
              />
            </div>
            <div className="session-actions">
              <button type="button" onClick={handleStart} disabled={session.start.isPending}>
                {sessionState?.status === "active" ? "继续训练" : "开始训练"}
              </button>
              {sessionState?.status === "active" && (
                <>
                  <button type="button" onClick={handleNextSet} disabled={session.nextSet.isPending}>
                    记录下一组
                  </button>
                  <button type="button" className="ghost" onClick={() => handleComplete()} disabled={session.finish.isPending}>
                    结束训练
                  </button>
                </>
              )}
              {sessionState?.status === "completed" && (
                <button type="button" className="ghost" onClick={() => handleComplete()} disabled={session.finish.isPending}>
                  查看总结
                </button>
              )}
            </div>
            {sessionState?.current_exercise && (
              <div className="session-status">
                <p>
                  当前项目：<strong>{sessionState.current_exercise}</strong>
                </p>
                {sessionState.current_set && (
                  <p>
                    第 {sessionState.current_set} 组 / 目标 {sessionState.target_sets ?? "?"} 组
                  </p>
                )}
                {sessionState.target_reps && (
                  <p>目标次数：{sessionState.target_reps}</p>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      <section className="card">
        <header className="card-header">
          <p className="card-title">动作明细</p>
          <p className="card-subtitle">按计划完成每一项动作</p>
        </header>
        {planQuery.isError ? (
          <p className="card-empty">加载失败：{planQuery.error?.message}</p>
        ) : (
          <ExerciseList exercises={plan?.exercises ?? []} />
        )}
      </section>
    </div>
  );
}
