"use client";

import {
  Activity,
  BarChart3,
  Check,
  Clock,
  Dumbbell,
  Flag,
  History,
  Loader2,
  Play,
  RefreshCw,
  RotateCcw,
  Square,
  Trash2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { FormEvent, useEffect, useState, useTransition } from "react";
import type {
  LoadMonitorDayPayload,
  LoadMonitorWeekPayload,
  PlanSummary,
  SessionPayload,
  TrainingHistoryEntry,
  TrainingPageSnapshot,
} from "@/lib/workout";

type TabKey = "training" | "plan" | "load" | "history";
type Feedback = { tone: "info" | "success" | "error"; text: string } | null;
type NextSetResponse = Omit<SessionPayload, "status"> & {
  status: SessionPayload["status"] | "rest";
  rest_end_time?: string;
  last_log?: unknown;
};

type FinishForm = {
  session_name: string;
  session_slot: string;
  session_rpe: string;
  duration_minutes: string;
  body_weight_kg: string;
  fatigue_score: string;
  pain_score: string;
  daily_note: string;
  notes: string;
};

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.error) {
    throw new Error(payload?.error || "请求失败");
  }
  return payload as T;
}

function formatRestSeconds(value: number | null | undefined): string {
  if (!value || value <= 0) {
    return "0 秒";
  }
  if (value >= 60 && value % 60 === 0) {
    return `${value / 60} 分钟`;
  }
  return `${value} 秒`;
}

function elapsedMinutes(startedAt: string | null | undefined): number {
  if (!startedAt) {
    return 1;
  }
  const elapsed = Date.now() - new Date(startedAt).getTime();
  return Math.max(1, Math.ceil(elapsed / 60000));
}

function guessSlot(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) {
    return "morning";
  }
  if (hour >= 12 && hour < 18) {
    return "afternoon";
  }
  if (hour >= 18 && hour <= 23) {
    return "evening";
  }
  return "extra";
}

function statusLabel(session: SessionPayload | null): string {
  if (!session) {
    return "尚未开始";
  }
  if (session.status === "ready_to_finish") {
    return "等待结束";
  }
  if (session.status === "completed") {
    return "已完成";
  }
  return "训练进行中";
}

function buildFinishForm(session: SessionPayload, loadDay: LoadMonitorDayPayload): FinishForm {
  return {
    session_name: session.suggested_session_name || session.current_exercise || "",
    session_slot: session.session.session_slot || guessSlot(),
    session_rpe: "1",
    duration_minutes: String(session.session.duration_minutes || elapsedMinutes(session.session.started_at)),
    body_weight_kg: String(loadDay.body_weight_kg ?? loadDay.defaults.body_weight_kg ?? ""),
    fatigue_score: String(loadDay.fatigue_score ?? loadDay.defaults.fatigue_score ?? ""),
    pain_score: String(loadDay.pain_score ?? loadDay.defaults.pain_score ?? ""),
    daily_note: loadDay.daily_note || "",
    notes: session.session.notes || "",
  };
}

export default function TrainingClient({ initialSnapshot }: { initialSnapshot: TrainingPageSnapshot }) {
  const [activeTab, setActiveTab] = useState<TabKey>("training");
  const [plan, setPlan] = useState<PlanSummary>(initialSnapshot.plan);
  const [session, setSession] = useState<SessionPayload | null>(initialSnapshot.currentSession);
  const [loadDay, setLoadDay] = useState<LoadMonitorDayPayload>(initialSnapshot.loadMonitorDay);
  const [loadWeek, setLoadWeek] = useState<LoadMonitorWeekPayload | null>(null);
  const [history, setHistory] = useState<TrainingHistoryEntry[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [restEndTime, setRestEndTime] = useState<string | null>(null);
  const [restSecondsLeft, setRestSecondsLeft] = useState(0);
  const [finishOpen, setFinishOpen] = useState(false);
  const [finishForm, setFinishForm] = useState<FinishForm>(() =>
    initialSnapshot.currentSession
      ? buildFinishForm(initialSnapshot.currentSession, initialSnapshot.loadMonitorDay)
      : {
          session_name: "",
          session_slot: guessSlot(),
          session_rpe: "1",
          duration_minutes: "1",
          body_weight_kg: "",
          fatigue_score: "",
          pain_score: "",
          daily_note: "",
          notes: "",
        },
  );
  const [setForm, setSetForm] = useState({
    actual_reps: "",
    actual_weight: "",
    rpe: "",
    notes: "",
  });
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (!restEndTime) {
      setRestSecondsLeft(0);
      return;
    }

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((new Date(restEndTime).getTime() - Date.now()) / 1000));
      setRestSecondsLeft(remaining);
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [restEndTime]);

  async function refreshSnapshot() {
    const snapshot = await apiJson<TrainingPageSnapshot>(`/api/training/snapshot?date=${initialSnapshot.date}`);
    setPlan(snapshot.plan);
    setSession(snapshot.currentSession);
    setLoadDay(snapshot.loadMonitorDay);
  }

  async function refreshLoadWeek() {
    const payload = await apiJson<LoadMonitorWeekPayload>(`/api/load-monitor?date=${initialSnapshot.date}`);
    setLoadWeek(payload);
  }

  async function refreshHistory(force = false) {
    if (historyLoaded && !force) {
      return;
    }
    const payload = await apiJson<TrainingHistoryEntry[]>("/api/training-history");
    setHistory(payload);
    setHistoryLoaded(true);
  }

  async function runAction(action: string, task: () => Promise<void>) {
    setBusyAction(action);
    setFeedback({ tone: "info", text: "处理中..." });
    try {
      await task();
    } catch (error) {
      setFeedback({ tone: "error", text: error instanceof Error ? error.message : "请求失败" });
    } finally {
      setBusyAction(null);
    }
  }

  function openFinishModal() {
    if (!session) {
      return;
    }
    setFinishForm(buildFinishForm(session, loadDay));
    setFinishOpen(true);
    setFeedback(null);
  }

  function changeFinishField(field: keyof FinishForm, value: string) {
    setFinishForm((current) => ({ ...current, [field]: value }));
  }

  async function startTraining() {
    await runAction("start", async () => {
      const payload = await apiJson<SessionPayload>("/api/start-training", {
        method: "POST",
        body: JSON.stringify({ date: initialSnapshot.date }),
      });
      setPlan(payload.plan);
      setSession(payload);
      setRestEndTime(null);
      setFeedback({ tone: "success", text: "训练已开始。" });
    });
  }

  async function completeSet() {
    if (!session?.session.session_id) {
      setFeedback({ tone: "error", text: "先开始训练。" });
      return;
    }

    await runAction("set", async () => {
      const payload = await apiJson<NextSetResponse>("/api/next-set", {
        method: "POST",
        body: JSON.stringify({
          session_id: session.session.session_id,
          actual_reps: setForm.actual_reps || null,
          actual_weight: setForm.actual_weight || null,
          rpe: setForm.rpe || null,
          notes: setForm.notes || null,
        }),
      });
      setSetForm({ actual_reps: "", actual_weight: "", rpe: "", notes: "" });
      setSession((payload.status === "rest" ? {
        ...payload,
        status: "active",
      } : payload) as SessionPayload);
      setRestEndTime(payload.rest_end_time || null);
      setFeedback({
        tone: "success",
        text: payload.status === "ready_to_finish" ? "计划组数已完成，可以结束训练。" : "这一组已记录。",
      });
      if (historyLoaded) {
        await refreshHistory(true);
      }
    });
  }

  async function submitFinish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session?.session.session_id) {
      return;
    }

    await runAction("finish", async () => {
      await apiJson("/api/finish-training", {
        method: "POST",
        body: JSON.stringify({
          session_id: session.session.session_id,
          ...finishForm,
        }),
      });
      setFinishOpen(false);
      setSession(null);
      setRestEndTime(null);
      await refreshSnapshot();
      await refreshLoadWeek();
      await refreshHistory(true);
      setFeedback({ tone: "success", text: "训练已结束，记录已保存。" });
    });
  }

  async function cancelTraining() {
    if (!session?.session.session_id || !window.confirm("确认取消这次训练？")) {
      return;
    }

    await runAction("cancel", async () => {
      await apiJson("/api/cancel-training", {
        method: "POST",
        body: JSON.stringify({ session_id: session.session.session_id }),
      });
      setSession(null);
      setRestEndTime(null);
      await refreshSnapshot();
      await refreshHistory(true);
      setFeedback({ tone: "success", text: "训练已取消。" });
    });
  }

  async function deleteHistorySession(sessionId: string) {
    if (!window.confirm("确认删除这次训练记录？")) {
      return;
    }

    await runAction(`delete-${sessionId}`, async () => {
      await apiJson(`/api/training-history/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
      await refreshSnapshot();
      await refreshHistory(true);
      await refreshLoadWeek();
      setFeedback({ tone: "success", text: "历史记录已删除。" });
    });
  }

  function selectTab(tab: TabKey) {
    setActiveTab(tab);
    startTransition(() => {
      if (tab === "history") {
        void refreshHistory();
      }
      if (tab === "load") {
        void refreshLoadWeek();
      }
    });
  }

  const isBusy = Boolean(busyAction);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <div className="kicker">{initialSnapshot.date}</div>
          <h1>训练控制台</h1>
        </div>
        <div className="status-pill">{restSecondsLeft > 0 ? `休息 ${restSecondsLeft}s` : statusLabel(session)}</div>
      </header>

      <nav className="tabs" aria-label="训练页签">
        {([
          ["training", Dumbbell, "训练"],
          ["plan", Activity, "计划"],
          ["load", BarChart3, "负荷"],
          ["history", History, "历史"],
        ] as Array<[TabKey, LucideIcon, string]>).map(([key, Icon, label]) => (
          <button
            key={String(key)}
            type="button"
            className={activeTab === key ? "tab active" : "tab"}
            onClick={() => selectTab(key as TabKey)}
          >
            <Icon size={17} />
            {label}
          </button>
        ))}
      </nav>

      {feedback ? <div className={`feedback ${feedback.tone}`}>{feedback.text}</div> : null}

      {activeTab === "training" ? (
        <section className="work-grid">
          <div className="surface primary-work">
            <div className="section-head">
              <div>
                <span className="kicker">Current Set</span>
                <h2>{session?.current_exercise || "准备开始"}</h2>
              </div>
              {session ? (
                <button type="button" className="ghost-button danger" onClick={cancelTraining} disabled={isBusy}>
                  {busyAction === "cancel" ? <Loader2 className="spin" size={17} /> : <Square size={17} />}
                  取消
                </button>
              ) : null}
            </div>

            {session ? (
              <>
                <div className="target-strip">
                  <div>
                    <span>组数</span>
                    <strong>{session.current_set ? `第 ${session.current_set} 组` : "总结"}</strong>
                  </div>
                  <div>
                    <span>目标</span>
                    <strong>
                      {session.target_sets ? `${session.target_sets} 组` : "完成"}
                      {session.target_reps ? ` / ${session.target_reps} 次` : ""}
                    </strong>
                  </div>
                  <div>
                    <span>休息</span>
                    <strong>{formatRestSeconds(session.target_rest_seconds || session.default_rest_seconds)}</strong>
                  </div>
                </div>

                {session.details.length ? <div className="detail-line">{session.details.join(" · ")}</div> : null}

                {session.status === "ready_to_finish" ? (
                  <div className="empty-state">计划组数已完成，记录总结后结束训练。</div>
                ) : (
                  <div className="set-form">
                    <label>
                      次数
                      <input
                        inputMode="numeric"
                        value={setForm.actual_reps}
                        onChange={(event) => setSetForm((current) => ({ ...current, actual_reps: event.target.value }))}
                      />
                    </label>
                    <label>
                      重量
                      <input
                        value={setForm.actual_weight}
                        onChange={(event) => setSetForm((current) => ({ ...current, actual_weight: event.target.value }))}
                      />
                    </label>
                    <label>
                      RPE
                      <input
                        inputMode="decimal"
                        value={setForm.rpe}
                        onChange={(event) => setSetForm((current) => ({ ...current, rpe: event.target.value }))}
                      />
                    </label>
                    <label className="wide">
                      组备注
                      <input
                        value={setForm.notes}
                        onChange={(event) => setSetForm((current) => ({ ...current, notes: event.target.value }))}
                      />
                    </label>
                  </div>
                )}

                <div className="action-row">
                  {session.status === "ready_to_finish" ? (
                    <button type="button" className="primary-button" onClick={openFinishModal} disabled={isBusy}>
                      <Flag size={18} />
                      结束训练
                    </button>
                  ) : (
                    <button type="button" className="primary-button" onClick={completeSet} disabled={isBusy}>
                      {busyAction === "set" ? <Loader2 className="spin" size={18} /> : <Check size={18} />}
                      完成这组
                    </button>
                  )}
                  <button type="button" className="ghost-button" onClick={refreshSnapshot} disabled={isBusy}>
                    <RefreshCw size={17} />
                    刷新
                  </button>
                </div>
              </>
            ) : (
              <div className="start-panel">
                <div>
                  <h3>{plan.is_rest_day ? "今天是恢复日" : "可以开始今天训练"}</h3>
                  <p>{plan.trackable_exercise_count} 个可记录项目</p>
                </div>
                <button type="button" className="primary-button" onClick={startTraining} disabled={isBusy || plan.is_rest_day}>
                  {busyAction === "start" ? <Loader2 className="spin" size={18} /> : <Play size={18} />}
                  开始训练
                </button>
              </div>
            )}
          </div>

          <aside className="surface">
            <span className="kicker">Load Today</span>
            <div className="metric-row">
              <div>
                <span>Day Load</span>
                <strong>{loadDay.day_total_load}</strong>
              </div>
              <div>
                <span>体重</span>
                <strong>{loadDay.body_weight_kg ?? loadDay.defaults.body_weight_kg ?? "-"}</strong>
              </div>
            </div>
            <div className="metric-row">
              <div>
                <span>疲劳</span>
                <strong>{loadDay.fatigue_score ?? loadDay.defaults.fatigue_score ?? "-"}</strong>
              </div>
              <div>
                <span>疼痛</span>
                <strong>{loadDay.pain_score ?? loadDay.defaults.pain_score ?? "-"}</strong>
              </div>
            </div>
          </aside>
        </section>
      ) : null}

      {activeTab === "plan" ? (
        <section className="surface">
          <div className="section-head">
            <div>
              <span className="kicker">{plan.phase || "Plan"}</span>
              <h2>今日计划</h2>
            </div>
          </div>
          <ExerciseList plan={plan} />
        </section>
      ) : null}

      {activeTab === "load" ? (
        <section className="surface">
          <div className="section-head">
            <div>
              <span className="kicker">Load Monitor</span>
              <h2>本周负荷</h2>
            </div>
            <button type="button" className="ghost-button" onClick={refreshLoadWeek}>
              <RefreshCw size={17} />
              刷新
            </button>
          </div>
          {loadWeek ? (
            <>
              <div className="metric-row four">
                <div><span>周负荷</span><strong>{loadWeek.summary.week_total_load}</strong></div>
                <div><span>日均</span><strong>{loadWeek.summary.avg_daily_load}</strong></div>
                <div><span>Chronic</span><strong>{loadWeek.summary.chronic_load_4w ?? "-"}</strong></div>
                <div><span>ACWR</span><strong>{loadWeek.summary.acwr_coupled ?? "-"}</strong></div>
              </div>
              <div className="week-load-grid">
                {loadWeek.days.map((day) => (
                  <div key={day.date} className="mini-day">
                    <span>{day.weekday}</span>
                    <strong>{day.day_total_load}</strong>
                    <small>{day.sessions.length} 次</small>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="empty-state">切到负荷页后会同步本周负荷。</div>
          )}
        </section>
      ) : null}

      {activeTab === "history" ? (
        <section className="surface">
          <div className="section-head">
            <div>
              <span className="kicker">History</span>
              <h2>训练历史</h2>
            </div>
            <button type="button" className="ghost-button" onClick={() => refreshHistory(true)}>
              <RefreshCw size={17} />
              刷新
            </button>
          </div>
          {history.length ? (
            <div className="history-list">
              {history.map((entry) => (
                <div key={`${entry.session_id}-${entry.exercise_name}-${entry.set_number}-${entry.log_date}`} className="history-row">
                  <div>
                    <strong>{entry.exercise_name}</strong>
                    <span>
                      第 {entry.set_number} 组 · {entry.actual_reps ?? "-"} 次 · {entry.actual_weight || "-"} · RPE {entry.rpe ?? "-"}
                    </span>
                    {entry.session_notes ? <small>{entry.session_notes}</small> : null}
                  </div>
                  <button
                    type="button"
                    className="icon-button danger"
                    onClick={() => deleteHistorySession(entry.session_id)}
                    aria-label="删除训练"
                    title="删除训练"
                  >
                    {busyAction === `delete-${entry.session_id}` ? <Loader2 className="spin" size={17} /> : <Trash2 size={17} />}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">{historyLoaded ? "暂无记录" : "切到历史页后会同步记录。"}</div>
          )}
        </section>
      ) : null}

      {finishOpen ? (
        <div className="modal-backdrop">
          <form className="modal" onSubmit={submitFinish}>
            <div className="section-head">
              <div>
                <span className="kicker">Finish</span>
                <h2>结束训练</h2>
              </div>
              <button type="button" className="icon-button" onClick={() => setFinishOpen(false)} aria-label="关闭">
                <RotateCcw size={17} />
              </button>
            </div>
            <div className="finish-grid">
              <label>
                主项目
                <input value={finishForm.session_name} onChange={(event) => changeFinishField("session_name", event.target.value)} />
              </label>
              <label>
                时段
                <select value={finishForm.session_slot} onChange={(event) => changeFinishField("session_slot", event.target.value)}>
                  <option value="morning">上午</option>
                  <option value="afternoon">下午</option>
                  <option value="evening">晚上</option>
                  <option value="extra">额外</option>
                </select>
              </label>
              <label>
                Session RPE
                <input min="1" max="10" required inputMode="decimal" value={finishForm.session_rpe} onChange={(event) => changeFinishField("session_rpe", event.target.value)} />
              </label>
              <label>
                时长
                <input min="1" required inputMode="numeric" value={finishForm.duration_minutes} onChange={(event) => changeFinishField("duration_minutes", event.target.value)} />
              </label>
              <label>
                体重
                <input inputMode="decimal" value={finishForm.body_weight_kg} onChange={(event) => changeFinishField("body_weight_kg", event.target.value)} />
              </label>
              <label>
                疲劳
                <input inputMode="decimal" value={finishForm.fatigue_score} onChange={(event) => changeFinishField("fatigue_score", event.target.value)} />
              </label>
              <label>
                疼痛
                <input inputMode="decimal" value={finishForm.pain_score} onChange={(event) => changeFinishField("pain_score", event.target.value)} />
              </label>
              <label className="wide">
                当日备注
                <input value={finishForm.daily_note} onChange={(event) => changeFinishField("daily_note", event.target.value)} />
              </label>
              <label className="wide">
                训练总结
                <textarea value={finishForm.notes} onChange={(event) => changeFinishField("notes", event.target.value)} />
              </label>
            </div>
            <div className="action-row">
              <button type="submit" className="primary-button" disabled={isBusy}>
                {busyAction === "finish" ? <Loader2 className="spin" size={18} /> : <Flag size={18} />}
                保存并结束
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  );
}

function ExerciseList({ plan }: { plan: PlanSummary }) {
  if (!plan.exercises.length) {
    return <div className="empty-state">今天没有训练项目。</div>;
  }

  return (
    <div className="exercise-list compact">
      {plan.exercises.map((exercise) => (
        <div key={`${exercise.exercise_name}-${exercise.details.join("|")}`} className="exercise-item">
          <div className="exercise-head">
            <strong>{exercise.exercise_name}</strong>
            <span>{exercise.is_trackable ? "记录" : exercise.category}</span>
          </div>
          <div className="exercise-meta">
            {exercise.target_sets ? `${exercise.target_sets} 组` : ""}
            {exercise.target_reps ? ` · ${exercise.target_reps} 次` : ""}
            {exercise.target_weight ? ` · ${exercise.target_weight}` : ""}
            {exercise.target_rest_seconds ? ` · 休息 ${formatRestSeconds(exercise.target_rest_seconds)}` : ""}
          </div>
          {exercise.details.length ? <small>{exercise.details.join(" · ")}</small> : null}
        </div>
      ))}
    </div>
  );
}
