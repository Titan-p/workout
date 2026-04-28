"use client";

import {
  Activity,
  BarChart3,
  CalendarDays,
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
import Link from "next/link";
import { FormEvent, useEffect, useRef, useState, useTransition } from "react";
import type {
  LoadMonitorDayPayload,
  LoadMonitorWeekPayload,
  PlanSummary,
  SessionPayload,
  TargetMetric,
  TrainingHistorySession,
  TrainingPageSnapshot,
} from "@/lib/workout";

type TabKey = "training" | "plan" | "load" | "history";
type Feedback = { tone: "info" | "success" | "error"; text: string } | null;
type NextSetResponse = Omit<SessionPayload, "status"> & {
  status: SessionPayload["status"] | "rest";
  rest_end_time?: string;
  last_logs?: unknown;
};
type SkipMode = "set" | "exercise";
type StepCursor = {
  exercise_name: string;
  set_number: number;
};

type ComponentSetForm = {
  component_name: string;
  metric_label: string;
  target_label: string;
  actual_reps: string;
  actual_weight: string;
  rpe: string;
  notes: string;
};

type SetForm = {
  actual_reps: string;
  actual_weight: string;
  rpe: string;
  notes: string;
};

type SetFormSource = {
  status: string;
  is_combination: boolean;
  target_reps: number | null;
  target_metric: TargetMetric | null;
  target_weight: string | null;
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

function metricInputLabel(metric: TargetMetric | null | undefined): string {
  if (metric?.type === "distance") {
    return "距离";
  }
  if (metric?.type === "duration") {
    return "时长";
  }
  return "次数";
}

function metricValueLabel(metric: TargetMetric | null | undefined): string {
  return metric?.label || "";
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

function formatMetricValue(value: number | null | undefined, unit: string | null | undefined): string {
  if (value === null || value === undefined) {
    return "-";
  }
  return unit ? `${formatNumber(value)} ${unit}` : formatNumber(value);
}

function formatActualMetric(
  set: Pick<
    TrainingHistorySession["exercises"][number]["sets"][number],
    "actual_value" | "actual_unit" | "actual_reps"
  >,
): string {
  return formatMetricValue(set.actual_value ?? set.actual_reps, set.actual_unit || "次");
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return "-";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatSetLine(set: TrainingHistorySession["exercises"][number]["sets"][number]): string {
  return [
    `第 ${set.set_number} 组`,
    formatActualMetric(set),
    set.actual_weight || "-",
    `RPE ${set.rpe ?? "-"}`,
  ].join(" · ");
}

function formatComponentLine(set: TrainingHistorySession["exercises"][number]["sets"][number]): string {
  return [
    set.component_name || "动作",
    formatActualMetric(set),
    set.actual_weight || "-",
    `RPE ${set.rpe ?? "-"}`,
  ].join(" · ");
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

function buildComponentSetForms(session: SessionPayload | null): ComponentSetForm[] {
  if (!session?.is_combination) {
    return [];
  }

  const targets = session.component_targets.length
    ? session.component_targets
    : session.components.map((componentName) => ({
        component_name: componentName,
        target_reps: null,
        target_weight: null,
        target_metric: { type: "reps", value: null, unit: "次", label: "" } satisfies TargetMetric,
      }));

  return targets.map((target) => ({
    component_name: target.component_name,
    metric_label: metricInputLabel(target.target_metric),
    target_label: metricValueLabel(target.target_metric),
    actual_reps: target.target_metric.value !== null ? String(target.target_metric.value) : target.target_reps ? String(target.target_reps) : "",
    actual_weight: target.target_weight || "",
    rpe: "",
    notes: "",
  }));
}

function buildSingleSetForm(session: SetFormSource | null): SetForm {
  if (!session || session.is_combination || session.status === "ready_to_finish" || session.status === "completed") {
    return { actual_reps: "", actual_weight: "", rpe: "", notes: "" };
  }
  return {
    actual_reps: session.target_metric?.value !== null && session.target_metric?.value !== undefined
      ? String(session.target_metric.value)
      : session.target_reps ? String(session.target_reps) : "",
    actual_weight: session.target_weight || "",
    rpe: "",
    notes: "",
  };
}

function stepKey(step: StepCursor): string {
  return `${step.exercise_name}::${step.set_number}`;
}

function buildPlanSteps(plan: PlanSummary): StepCursor[] {
  return plan.exercises
    .filter((exercise) => exercise.is_trackable)
    .flatMap((exercise) =>
      Array.from({ length: exercise.target_sets ?? 1 }, (_, index) => ({
        exercise_name: exercise.exercise_name,
        set_number: index + 1,
      })),
    );
}

function logStepKey(log: SessionPayload["session"]["logs"][number]): string {
  return stepKey({
    exercise_name: log.group_name || log.exercise,
    set_number: Number(log.round_number || log.set_number || 0),
  });
}

function recordedStepKeys(session: SessionPayload): Set<string> {
  return new Set(session.session.logs.map(logStepKey));
}

function currentStepFromSession(session: SessionPayload | null): StepCursor | null {
  if (!session?.current_exercise || !session.current_set) {
    return null;
  }
  return {
    exercise_name: session.current_exercise,
    set_number: session.current_set,
  };
}

function findNextOpenStep(
  plan: PlanSummary,
  session: SessionPayload,
  skippedKeys: Set<string>,
  afterStep: StepCursor | null,
): StepCursor | null {
  const steps = buildPlanSteps(plan);
  const recorded = recordedStepKeys(session);
  const afterIndex = afterStep ? steps.findIndex((step) => stepKey(step) === stepKey(afterStep)) : -1;

  for (let index = Math.max(afterIndex + 1, 0); index < steps.length; index += 1) {
    const key = stepKey(steps[index]);
    if (!recorded.has(key) && !skippedKeys.has(key)) {
      return steps[index];
    }
  }
  return null;
}

function findFirstOpenExerciseStep(
  plan: PlanSummary,
  session: SessionPayload,
  exerciseName: string,
): StepCursor | null {
  const recorded = recordedStepKeys(session);
  return buildPlanSteps(plan).find((step) => (
    step.exercise_name === exerciseName && !recorded.has(stepKey(step))
  )) || null;
}

function skippedExerciseStepKeys(plan: PlanSummary, session: SessionPayload, currentStep: StepCursor): string[] {
  const recorded = recordedStepKeys(session);
  return buildPlanSteps(plan)
    .filter((step) => (
      step.exercise_name === currentStep.exercise_name &&
      step.set_number >= currentStep.set_number &&
      !recorded.has(stepKey(step))
    ))
    .map(stepKey);
}

function applyStepToSession(session: SessionPayload, step: StepCursor | null): SessionPayload {
  if (!step) {
    return {
      ...session,
      status: "ready_to_finish",
      current_exercise: null,
      current_set: null,
      target_sets: null,
      target_reps: null,
      target_metric: null,
      target_weight: null,
      target_rest_seconds: null,
      details: [],
      is_combination: false,
      components: [],
      component_targets: [],
      primary_component: null,
    };
  }

  const exercise = session.plan.exercises.find((item) => item.exercise_name === step.exercise_name);
  if (!exercise) {
    return session;
  }

  return {
    ...session,
    status: "active",
    current_exercise: exercise.exercise_name,
    current_set: step.set_number,
    target_sets: exercise.target_sets,
    target_reps: exercise.target_reps,
    target_metric: exercise.target_metric,
    target_weight: exercise.target_weight,
    target_rest_seconds: exercise.target_rest_seconds,
    details: exercise.details,
    is_combination: exercise.is_combination,
    components: exercise.components,
    component_targets: exercise.component_targets,
    primary_component: exercise.primary_component,
  };
}

export default function TrainingClient({ initialSnapshot }: { initialSnapshot: TrainingPageSnapshot }) {
  const [activeTab, setActiveTab] = useState<TabKey>("training");
  const [plan, setPlan] = useState<PlanSummary>(initialSnapshot.plan);
  const [session, setSession] = useState<SessionPayload | null>(initialSnapshot.currentSession);
  const [loadDay, setLoadDay] = useState<LoadMonitorDayPayload>(initialSnapshot.loadMonitorDay);
  const [loadWeek, setLoadWeek] = useState<LoadMonitorWeekPayload | null>(null);
  const [history, setHistory] = useState<TrainingHistorySession[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [skippedStepKeys, setSkippedStepKeys] = useState<string[]>([]);
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
  const [setForm, setSetForm] = useState<SetForm>(() => buildSingleSetForm(initialSnapshot.currentSession));
  const [componentForms, setComponentForms] = useState<ComponentSetForm[]>(() =>
    buildComponentSetForms(initialSnapshot.currentSession),
  );
  const actionLockRef = useRef(false);
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

  useEffect(() => {
    setComponentForms(buildComponentSetForms(session));
  }, [session]);

  useEffect(() => {
    setSetForm(buildSingleSetForm(session));
  }, [session]);

  async function refreshSnapshot() {
    const snapshot = await apiJson<TrainingPageSnapshot>(`/api/training/snapshot?date=${initialSnapshot.date}`);
    setPlan(snapshot.plan);
    setSession((current) => {
      if (!snapshot.currentSession) {
        return null;
      }
      const skipped = new Set(skippedStepKeys);
      const preferredStep = currentStepFromSession(current);
      const recorded = recordedStepKeys(snapshot.currentSession);
      const nextStep = preferredStep && !recorded.has(stepKey(preferredStep)) && !skipped.has(stepKey(preferredStep))
        ? preferredStep
        : findNextOpenStep(snapshot.plan, snapshot.currentSession, skipped, null);
      return applyStepToSession(snapshot.currentSession, nextStep);
    });
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
    const payload = await apiJson<TrainingHistorySession[]>("/api/training-history");
    setHistory(payload);
    setHistoryLoaded(true);
  }

  async function runAction(action: string, task: () => Promise<void>) {
    if (actionLockRef.current) {
      return;
    }
    actionLockRef.current = true;
    setBusyAction(action);
    setFeedback({ tone: "info", text: "处理中..." });
    try {
      await task();
    } catch (error) {
      setFeedback({ tone: "error", text: error instanceof Error ? error.message : "请求失败" });
    } finally {
      actionLockRef.current = false;
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

  function changeComponentField(index: number, field: keyof ComponentSetForm, value: string) {
    setComponentForms((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item)),
    );
  }

  async function startTraining() {
    await runAction("start", async () => {
      const payload = await apiJson<SessionPayload>("/api/start-training", {
        method: "POST",
        body: JSON.stringify({ date: initialSnapshot.date }),
      });
      setPlan(payload.plan);
      setSkippedStepKeys([]);
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
      const currentStep = currentStepFromSession(session);
      const payload = await apiJson<NextSetResponse>("/api/next-set", {
        method: "POST",
        body: JSON.stringify(session.is_combination
          ? {
              session_id: session.session.session_id,
              exercise_name: session.current_exercise,
              set_number: session.current_set,
              component_logs: componentForms.map((component) => ({
                component_name: component.component_name,
                actual_reps: component.actual_reps || null,
                actual_weight: component.actual_weight || null,
                rpe: component.rpe || null,
                notes: component.notes || null,
              })),
            }
          : {
              session_id: session.session.session_id,
              exercise_name: session.current_exercise,
              set_number: session.current_set,
              actual_reps: setForm.actual_reps || null,
              actual_weight: setForm.actual_weight || null,
              rpe: setForm.rpe || null,
              notes: setForm.notes || null,
            }),
      });
      setSetForm({ actual_reps: "", actual_weight: "", rpe: "", notes: "" });
      const nextSkippedKeys = currentStep
        ? skippedStepKeys.filter((key) => key !== stepKey(currentStep))
        : skippedStepKeys;
      const basePayload = (payload.status === "rest" ? {
        ...payload,
        status: "active",
      } : payload) as SessionPayload;
      const nextStep = findNextOpenStep(basePayload.plan, basePayload, new Set(nextSkippedKeys), currentStep);
      setSkippedStepKeys(nextSkippedKeys);
      setSession(applyStepToSession(basePayload, nextStep));
      setRestEndTime(payload.rest_end_time || null);
      setFeedback({
        tone: "success",
        text: payload.status === "ready_to_finish"
          ? "计划组数已完成，可以结束训练。"
          : session.is_combination ? "这一轮已记录。" : "这一组已记录。",
      });
      if (historyLoaded) {
        await refreshHistory(true);
      }
    });
  }

  async function skipStep(mode: SkipMode) {
    if (!session?.session.session_id) {
      setFeedback({ tone: "error", text: "先开始训练。" });
      return;
    }

    await runAction(`skip-${mode}`, async () => {
      const currentStep = currentStepFromSession(session);
      if (!currentStep) {
        setFeedback({ tone: "error", text: "当前没有可跳过的组。" });
        return;
      }
      const nextSkipped = new Set(skippedStepKeys);
      if (mode === "exercise") {
        skippedExerciseStepKeys(session.plan, session, currentStep).forEach((key) => nextSkipped.add(key));
      } else {
        nextSkipped.add(stepKey(currentStep));
      }
      const nextStep = findNextOpenStep(session.plan, session, nextSkipped, currentStep);
      setSkippedStepKeys(Array.from(nextSkipped));
      setSession(applyStepToSession(session, nextStep));
      setRestEndTime(null);
      setFeedback({
        tone: "success",
        text: mode === "exercise"
          ? "当前动作已跳过，可在计划页跳回补记。"
          : session.is_combination ? "这一轮已跳过，可在计划页跳回补记。" : "这一组已跳过，可在计划页跳回补记。",
      });
      if (historyLoaded) {
        await refreshHistory(true);
      }
    });
  }

  async function jumpToExercise(exerciseName: string) {
    if (!session?.session.session_id) {
      setFeedback({ tone: "error", text: "先开始训练。" });
      return;
    }

    await runAction(`jump-${exerciseName}`, async () => {
      const nextStep = findFirstOpenExerciseStep(session.plan, session, exerciseName);
      if (!nextStep) {
        setFeedback({ tone: "error", text: "这个动作已经记录完成。" });
        return;
      }
      setSession(applyStepToSession(session, nextStep));
      setRestEndTime(null);
      setActiveTab("training");
      setFeedback({ tone: "success", text: "已切换到指定动作，可以补记。" });
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
      setSkippedStepKeys([]);
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
        <div className="topbar-actions">
          <Link className="ghost-button" href={`/week?date=${initialSnapshot.date}`}>
            <CalendarDays size={17} />
            周视图
          </Link>
          <div className="status-pill">{restSecondsLeft > 0 ? `休息 ${restSecondsLeft}s` : statusLabel(session)}</div>
        </div>
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
                    <span>{session.is_combination ? "轮次" : "组数"}</span>
                    <strong>{session.current_set ? `第 ${session.current_set} ${session.is_combination ? "轮" : "组"}` : "总结"}</strong>
                  </div>
                  <div>
                    <span>目标</span>
                    <strong>
                      {session.target_sets ? `${session.target_sets} ${session.is_combination ? "轮" : "组"}` : "完成"}
                      {session.is_combination
                        ? ` / ${componentForms.length || session.components.length} 动作`
                        : metricValueLabel(session.target_metric) ? ` / ${metricValueLabel(session.target_metric)}` : ""}
                    </strong>
                  </div>
                  <div>
                    <span>休息</span>
                    <strong>{formatRestSeconds(session.target_rest_seconds || session.default_rest_seconds)}</strong>
                  </div>
                </div>

                <div className="action-row top-action-row">
                  {session.status === "ready_to_finish" ? (
                    <button type="button" className="primary-button" onClick={openFinishModal} disabled={isBusy}>
                      <Flag size={18} />
                      结束训练
                    </button>
                  ) : (
                    <button type="button" className="primary-button" onClick={completeSet} disabled={isBusy}>
                      {busyAction === "set" ? <Loader2 className="spin" size={18} /> : <Check size={18} />}
                      {session.is_combination ? "完成本轮" : "完成这组"}
                    </button>
                  )}
                  <button type="button" className="ghost-button" onClick={refreshSnapshot} disabled={isBusy}>
                    <RefreshCw size={17} />
                    刷新
                  </button>
                  {session.status === "ready_to_finish" ? null : (
                    <>
                      <button type="button" className="ghost-button" onClick={() => skipStep("set")} disabled={isBusy}>
                        {busyAction === "skip-set" ? <Loader2 className="spin" size={17} /> : null}
                        {session.is_combination ? "跳过本轮" : "跳过这组"}
                      </button>
                      <button type="button" className="ghost-button danger" onClick={() => skipStep("exercise")} disabled={isBusy}>
                        {busyAction === "skip-exercise" ? <Loader2 className="spin" size={17} /> : null}
                        跳过动作
                      </button>
                    </>
                  )}
                </div>

                {session.details.length ? <div className="detail-line">{session.details.join(" · ")}</div> : null}

                {session.status === "ready_to_finish" ? (
                  <div className="empty-state">计划组数已完成，记录总结后结束训练。</div>
                ) : session.is_combination ? (
                  <div className="combo-form">
                    <div className="combo-note">
                      连续完成下面动作后点击完成本轮，休息会在整轮之后开始。
                    </div>
                    {componentForms.map((component, index) => (
                      <div key={`${component.component_name}-${index}`} className="combo-component">
                        <div className="combo-component-head">
                          <strong>{component.component_name}</strong>
                          <span>{component.target_label || `动作 ${index + 1}`}</span>
                        </div>
                        <div className="set-form compact">
                          <label>
                            {component.metric_label}
                            <input
                              inputMode="numeric"
                              value={component.actual_reps}
                              onChange={(event) => changeComponentField(index, "actual_reps", event.target.value)}
                            />
                          </label>
                          <label>
                            重量
                            <input
                              value={component.actual_weight}
                              onChange={(event) => changeComponentField(index, "actual_weight", event.target.value)}
                            />
                          </label>
                          <label>
                            RPE
                            <input
                              inputMode="decimal"
                              value={component.rpe}
                              onChange={(event) => changeComponentField(index, "rpe", event.target.value)}
                            />
                          </label>
                          <label className="wide">
                            备注
                            <input
                              value={component.notes}
                              onChange={(event) => changeComponentField(index, "notes", event.target.value)}
                            />
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="set-form">
                    <label>
                      {metricInputLabel(session.target_metric)}
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
          <ExerciseList
            plan={plan}
            activeSession={session}
            busyAction={busyAction}
            onJumpToExercise={jumpToExercise}
          />
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
              {history.map((sessionEntry) => (
                <article key={sessionEntry.session_id} className="history-session">
                  <div className="history-session-head">
                    <div>
                      <strong>{sessionEntry.session_name || sessionEntry.exercises[0]?.exercise_name || "训练会话"}</strong>
                      <span>
                        {sessionEntry.plan_date || "-"} · {sessionEntry.session_slot_label} · {sessionEntry.exercise_count} 动作 · {sessionEntry.total_sets} 组
                      </span>
                      <small>
                        <Clock size={14} />
                        {formatDateTime(sessionEntry.completed_at || sessionEntry.started_at)}
                        {sessionEntry.duration_minutes ? ` · ${sessionEntry.duration_minutes} 分钟` : ""}
                        {sessionEntry.session_rpe ? ` · RPE ${sessionEntry.session_rpe}` : ""}
                        {sessionEntry.session_load ? ` · Load ${sessionEntry.session_load}` : ""}
                      </small>
                    </div>
                    <button
                      type="button"
                      className="icon-button danger"
                      onClick={() => deleteHistorySession(sessionEntry.session_id)}
                      aria-label="删除训练"
                      title="删除训练"
                    >
                      {busyAction === `delete-${sessionEntry.session_id}` ? <Loader2 className="spin" size={17} /> : <Trash2 size={17} />}
                    </button>
                  </div>
                  {sessionEntry.notes ? <p className="history-session-note">{sessionEntry.notes}</p> : null}
                  {sessionEntry.exercises.length ? (
                    <div className="history-exercise-grid">
                      {sessionEntry.exercises.map((exercise) => (
                        <div key={`${sessionEntry.session_id}-${exercise.exercise_name}`} className="history-exercise">
                        <div className="history-exercise-head">
                          <strong>{exercise.exercise_name}</strong>
                          <span>{exercise.total_sets} {exercise.component_count > 1 ? "轮" : "组"}</span>
                        </div>
                        <div className="history-exercise-meta">
                          {exercise.component_count > 1 ? `${exercise.component_count} 动作 · ` : ""}
                          {exercise.total_value !== null ? formatMetricValue(exercise.total_value, exercise.actual_unit) : "次数 -"}
                          {exercise.weights.length ? ` · ${exercise.weights.join(" / ")}` : ""}
                          {exercise.avg_rpe !== null ? ` · 均 RPE ${exercise.avg_rpe}` : ""}
                        </div>
                        {exercise.component_count > 1 ? (
                          <div className="history-round-list">
                            {exercise.rounds.map((round) => (
                              <div key={`${exercise.exercise_name}-round-${round.round_number}`} className="history-round">
                                <strong>第 {round.round_number} 轮</strong>
                                {round.components.map((set) => (
                                  <span key={`${exercise.exercise_name}-${round.round_number}-${set.component_index}-${set.log_date}`}>
                                    {formatComponentLine(set)}
                                  </span>
                                ))}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="history-set-list">
                            {exercise.sets.map((set) => (
                              <div key={`${exercise.exercise_name}-${set.set_number}-${set.log_date}`} className="history-set">
                                <span>{formatSetLine(set)}</span>
                                {set.notes ? <small>{set.notes}</small> : null}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                    </div>
                  ) : (
                    <div className="empty-state">这次训练没有组记录。</div>
                  )}
                </article>
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

function ExerciseList({
  plan,
  activeSession,
  busyAction,
  onJumpToExercise,
}: {
  plan: PlanSummary;
  activeSession: SessionPayload | null;
  busyAction: string | null;
  onJumpToExercise: (exerciseName: string) => void;
}) {
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
            {exercise.target_metric.label ? ` · ${exercise.target_metric.label}` : ""}
            {exercise.target_weight ? ` · ${exercise.target_weight}` : ""}
            {exercise.target_rest_seconds ? ` · 休息 ${formatRestSeconds(exercise.target_rest_seconds)}` : ""}
          </div>
          {exercise.details.length ? <small>{exercise.details.join(" · ")}</small> : null}
          {activeSession && exercise.is_trackable ? (
            <div className="exercise-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={() => onJumpToExercise(exercise.exercise_name)}
                disabled={Boolean(busyAction)}
              >
                {busyAction === `jump-${exercise.exercise_name}` ? <Loader2 className="spin" size={17} /> : <Dumbbell size={17} />}
                跳到这里
              </button>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
