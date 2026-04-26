import { createSupabaseAdminClient } from "@/lib/supabase";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const WEEKDAY_LABELS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const DISTANCE_EXERCISE_PATTERN = /(冲刺|加速跑|折返跑|短跑|长跑|跨步跑)/;
const DURATION_EXERCISE_PATTERN = /(平板支撑|支撑保持|保持|悬停|静止|定点)/;
const SLOT_LABELS: Record<string, string> = {
  morning: "上午",
  afternoon: "下午",
  evening: "晚上",
  extra: "额外",
};

export type WorkoutPlanRecord = {
  date: string;
  phase: string | null;
  headers: string[];
  remarks: string[] | null;
  plan_data: string[][];
};

export type TrainingSessionRecord = {
  id: string;
  plan_date: string;
  status: string;
  rest_interval_seconds: number | null;
  started_at: string;
  completed_at: string | null;
  notes: string | null;
  session_name: string | null;
  session_slot: string | null;
  session_rpe: number | null;
  duration_minutes: number | null;
  session_load: number | null;
  metadata: Record<string, unknown> | null;
};

export type TrainingSetRecord = {
  id: string;
  session_id: string;
  exercise: string;
  set_number: number;
  group_name?: string | null;
  group_type?: string | null;
  round_number?: number | null;
  component_index?: number | null;
  component_name?: string | null;
  actual_reps: number | null;
  actual_metric_type?: TargetMetric["type"] | null;
  actual_value?: number | null;
  actual_unit?: string | null;
  actual_weight: string | null;
  rpe: number | null;
  rest_seconds: number | null;
  notes: string | null;
  completed_at: string;
};

export type TrainingDayMetricRecord = {
  date: string;
  body_weight_kg: number | null;
  fatigue_score: number | null;
  pain_score: number | null;
  daily_note: string | null;
  metadata: Record<string, unknown> | null;
};

export type ExerciseSummary = {
  exercise_name: string;
  phase: string | null;
  components: string[];
  component_targets: Array<{
    component_name: string;
    target_reps: number | null;
    target_weight: string | null;
    target_metric: TargetMetric;
  }>;
  primary_component: string;
  is_combination: boolean;
  target_sets: number | null;
  target_reps: number | null;
  target_metric: TargetMetric;
  target_weight: string | null;
  target_rest_seconds: number | null;
  details: string[];
  is_trackable: boolean;
  category: string;
};

export type PlanSummary = {
  phase: string | null;
  remarks: string[];
  exercises: ExerciseSummary[];
  default_rest_seconds: number | null;
  trackable_exercise_count: number;
  note_exercise_count: number;
  is_rest_day: boolean;
};

export type TargetMetric = {
  type: "reps" | "distance" | "duration" | "custom";
  value: number | null;
  unit: string | null;
  label: string;
};

export type SessionPayload = {
  session: {
    session_id: string;
    plan_date: string;
    status: string;
    rest_interval_seconds: number;
    started_at: string;
    completed_at: string | null;
    notes: string | null;
    session_name: string | null;
    session_slot: string | null;
    session_rpe: number | null;
    duration_minutes: number | null;
    session_load: number | null;
    metadata: Record<string, unknown>;
    logs: TrainingSetRecord[];
  };
  plan: PlanSummary;
  status: "active" | "ready_to_finish" | "completed";
  current_exercise: string | null;
  current_set: number | null;
  target_sets: number | null;
  target_reps: number | null;
  target_metric: TargetMetric | null;
  target_weight: string | null;
  target_rest_seconds: number | null;
  details: string[];
  is_combination: boolean;
  components: string[];
  component_targets: ExerciseSummary["component_targets"];
  primary_component: string | null;
  suggested_session_name: string | null;
  plan_date: string;
  default_rest_seconds: number | null;
};

export type LoadMonitorDayPayload = {
  date: string;
  weekday: string;
  sessions: Array<{
    session_id: string;
    session_name: string;
    session_slot: string | null;
    session_slot_label: string;
    session_rpe: number | null;
    duration_minutes: number | null;
    session_load: number | null;
    summary: string | null;
    completed_at: string | null;
  }>;
  day_total_load: number;
  body_weight_kg: number | null;
  fatigue_score: number | null;
  pain_score: number | null;
  daily_note: string | null;
  load_band: string;
  defaults: {
    body_weight_kg: number | null;
    fatigue_score: number | null;
    pain_score: number | null;
  };
};

export type TrainingPageSnapshot = {
  date: string;
  plan: PlanSummary;
  currentSession: SessionPayload | null;
  loadMonitorDay: LoadMonitorDayPayload;
};

export type WeekPlanDay = {
  date: string;
  day_name: string;
  phase: string | null;
  has_plan: boolean;
  remarks: string[];
  headers: string[];
  rows: string[][];
};

export type WeekPlanPayload = {
  week_offset: number;
  start_date: string;
  end_date: string;
  training_days: number;
  days: WeekPlanDay[];
};

export type LoadMonitorWeekPayload = {
  week_offset: number;
  week_start: string;
  week_end: string;
  days: LoadMonitorDayPayload[];
  summary: {
    week_total_load: number;
    avg_daily_load: number;
    daily_load_stddev: number;
    chronic_load_4w: number | null;
    chronic_load_prev3w: number | null;
    acwr_coupled: number | null;
    acwr_uncoupled: number | null;
  };
  trend: Array<{
    week_start: string;
    week_end: string;
    week_total_load: number;
  }>;
};

export type TrainingHistoryEntry = {
  session_id: string;
  exercise_name: string;
  set_number: number;
  actual_reps: number | null;
  actual_metric_type: TargetMetric["type"] | null;
  actual_value: number | null;
  actual_unit: string | null;
  actual_weight: string | null;
  rpe: number | null;
  notes: string | null;
  rest_seconds: number | null;
  log_date: string;
  plan_date: string | null;
  session_notes: string | null;
};

export type TrainingHistorySet = {
  set_number: number;
  round_number: number | null;
  component_index: number | null;
  component_name: string | null;
  actual_reps: number | null;
  actual_metric_type: TargetMetric["type"] | null;
  actual_value: number | null;
  actual_unit: string | null;
  actual_weight: string | null;
  rpe: number | null;
  notes: string | null;
  rest_seconds: number | null;
  log_date: string;
};

export type TrainingHistoryExercise = {
  exercise_name: string;
  group_type: string;
  component_count: number;
  total_sets: number;
  total_reps: number | null;
  total_value: number | null;
  actual_unit: string | null;
  weights: string[];
  avg_rpe: number | null;
  notes: string[];
  sets: TrainingHistorySet[];
  rounds: Array<{
    round_number: number;
    components: TrainingHistorySet[];
  }>;
};

export type TrainingHistorySession = {
  session_id: string;
  plan_date: string | null;
  status: string;
  session_name: string | null;
  session_slot: string | null;
  session_slot_label: string;
  session_rpe: number | null;
  duration_minutes: number | null;
  session_load: number | null;
  started_at: string;
  completed_at: string | null;
  notes: string | null;
  total_sets: number;
  exercise_count: number;
  exercises: TrainingHistoryExercise[];
};

function getTodayIsoDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
  }).format(new Date());
}

export function normalizeDate(dateValue?: string | null): string {
  if (dateValue && ISO_DATE_PATTERN.test(dateValue)) {
    return dateValue;
  }

  return getTodayIsoDate();
}

function extractNumber(value: unknown): number | null {
  const match = String(value ?? "").match(/\d+/);
  return match ? Number.parseInt(match[0], 10) : null;
}

function extractSetRepPair(value: unknown): [number, number] | null {
  const match = String(value ?? "").match(/(\d+)\s*[x×*]\s*(\d+)/i);
  if (!match) {
    return null;
  }

  return [Number.parseInt(match[1], 10), Number.parseInt(match[2], 10)];
}

function extractNumericValues(value: string): number[] {
  return Array.from(value.matchAll(/\d+(?:\.\d+)?/g))
    .map((match) => Number.parseFloat(match[0]))
    .filter((number) => Number.isFinite(number));
}

function isZeroOnlyRow(values: string[]): boolean {
  const numbers = values.flatMap(extractNumericValues);
  return numbers.length > 0 && numbers.every((number) => number === 0);
}

function hasPositiveNumber(value: string): boolean {
  return extractNumericValues(value).some((number) => number > 0);
}

function isRestHeader(header: string): boolean {
  const lowered = header.toLowerCase();
  return ["休息", "间隔", "间歇", "rest"].some((token) => lowered.includes(token));
}

function parseRestSeconds(value: unknown): number | null {
  const text = String(value ?? "").trim();
  if (!text) {
    return null;
  }

  const normalized = text
    .toLowerCase()
    .replaceAll("：", ":")
    .replaceAll("'", ":")
    .replaceAll("′", ":")
    .replaceAll("\"", "")
    .replaceAll("″", "");

  const colonMatch = normalized.match(/(\d+)\s*:\s*(\d+)/);
  if (colonMatch) {
    return Number.parseInt(colonMatch[1], 10) * 60 + Number.parseInt(colonMatch[2], 10);
  }

  const trailingMinutes = normalized.match(/(\d+)\s*:\s*$/);
  if (trailingMinutes) {
    return Number.parseInt(trailingMinutes[1], 10) * 60;
  }

  let total = 0;
  const minuteMatch = normalized.match(/(\d+)(分钟|分|min)/);
  if (minuteMatch) {
    total += Number.parseInt(minuteMatch[1], 10) * 60;
  }
  const secondMatch = normalized.match(/(\d+)(秒|s|sec)/);
  if (secondMatch) {
    total += Number.parseInt(secondMatch[1], 10);
  }
  if (minuteMatch || secondMatch) {
    return total;
  }

  const compact = normalized.match(/^\d+$/);
  if (compact) {
    return Number.parseInt(compact[0], 10);
  }

  return null;
}

function splitCombination(name: string): string[] {
  const normalized = name.replaceAll("＋", "+").replaceAll("＆", "&");
  if (!normalized.includes("+") && !normalized.includes("&")) {
    return [name.trim()];
  }

  return normalized
    .split(/\s*[+&]\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function splitTargetText(value: string | null): string[] {
  if (!value) {
    return [];
  }
  return value
    .replaceAll("＋", "+")
    .split(/\s*[+&/]\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseRepTarget(value: string | null): number | null {
  return extractNumber(value ?? "");
}

function targetMetricFor(exerciseName: string, value: string | null): TargetMetric {
  const text = String(value || "").trim();
  const numericValues = extractNumericValues(text);
  const firstValue = numericValues.length ? numericValues[0] : null;
  const normalized = text.toLowerCase();

  if (!text) {
    return { type: "reps", value: null, unit: "次", label: "" };
  }
  if (/(秒|secs?\b|sec\b)/.test(normalized)) {
    return { type: "duration", value: firstValue, unit: "秒", label: firstValue !== null ? `${firstValue} 秒` : text };
  }
  if (/(分钟|mins?|min|分)/.test(normalized)) {
    return { type: "duration", value: firstValue, unit: "分钟", label: firstValue !== null ? `${firstValue} 分钟` : text };
  }
  if (/(米|m\b)/.test(normalized)) {
    return { type: "distance", value: firstValue, unit: "米", label: firstValue !== null ? `${firstValue} 米` : text };
  }
  if (DISTANCE_EXERCISE_PATTERN.test(exerciseName) && firstValue !== null) {
    return { type: "distance", value: firstValue, unit: "米", label: `${firstValue} 米` };
  }
  if (DURATION_EXERCISE_PATTERN.test(exerciseName) && firstValue !== null) {
    return { type: "duration", value: firstValue, unit: "秒", label: `${firstValue} 秒` };
  }
  if (firstValue !== null) {
    return { type: "reps", value: firstValue, unit: "次", label: `${firstValue} 次` };
  }

  return { type: "custom", value: null, unit: null, label: text };
}

function defaultUnitForMetric(metricType: TargetMetric["type"] | null | undefined): string | null {
  if (metricType === "distance") {
    return "米";
  }
  if (metricType === "duration") {
    return "秒";
  }
  if (metricType === "reps") {
    return "次";
  }
  return null;
}

function actualMetricPayload(
  value: unknown,
  targetMetric: TargetMetric | null | undefined,
) {
  const actualValue = parseOptionalFloat(value);
  const metricType = targetMetric?.type || "reps";
  const unit = targetMetric?.unit || defaultUnitForMetric(metricType);

  return {
    actual_reps: parseOptionalInt(value),
    actual_metric_type: metricType,
    actual_value: actualValue,
    actual_unit: unit,
  };
}

function actualMetricValue(log: Pick<TrainingSetRecord, "actual_value" | "actual_reps">): number | null {
  return parseOptionalFloat(log.actual_value) ?? parseOptionalFloat(log.actual_reps);
}

function actualMetricUnit(
  log: Pick<TrainingSetRecord, "actual_unit" | "actual_metric_type" | "actual_reps">,
  exerciseName: string,
): string | null {
  if (log.actual_unit) {
    return log.actual_unit;
  }
  if (log.actual_metric_type) {
    return defaultUnitForMetric(log.actual_metric_type);
  }
  const value = log.actual_reps === null || log.actual_reps === undefined ? null : String(log.actual_reps);
  return targetMetricFor(exerciseName, value).unit;
}

function isTrainingSetDuplicateError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const payload = error as { code?: unknown; message?: unknown; details?: unknown };
  return (
    payload.code === "23505" ||
    String(payload.message || "").includes("training_sets_unique_set") ||
    String(payload.details || "").includes("training_sets_unique_set")
  );
}

function nextSetRestPayload(
  updated: {
    session: TrainingSessionRecord;
    plan: PlanSummary;
    logs: TrainingSetRecord[];
    payload: SessionPayload;
  },
  lastLogs: TrainingSetRecord[],
) {
  const next = determineNextStep(updated.plan, updated.logs);
  if (!next) {
    return {
      ...updated.payload,
      last_logs: lastLogs,
    };
  }

  const restSeconds = next.target_rest_seconds ?? updated.session.rest_interval_seconds ?? 90;
  return {
    status: "rest",
    current_exercise: next.exercise,
    current_set: next.next_set,
    target_sets: next.target_sets,
    target_reps: next.target_reps,
    target_metric: next.target_metric,
    target_weight: next.target_weight,
    target_rest_seconds: next.target_rest_seconds,
    details: next.details,
    is_combination: next.is_combination,
    components: next.components,
    component_targets: next.component_targets,
    primary_component: next.primary_component,
    rest_seconds: restSeconds,
    rest_end_time: restFinishesAt(restSeconds),
    session: updated.payload.session,
    plan: updated.plan,
    last_logs: lastLogs,
  };
}

function buildComponentTargets(
  components: string[],
  repsText: string | null,
  weightText: string | null,
): ExerciseSummary["component_targets"] {
  if (!components.length) {
    return [];
  }

  const repParts = splitTargetText(repsText);
  const weightParts = splitTargetText(weightText);
  return components.map((componentName, index) => ({
    component_name: componentName,
    target_reps: parseRepTarget(repParts[index] ?? repParts[0] ?? null),
    target_weight: weightParts[index] ?? weightParts[0] ?? null,
    target_metric: targetMetricFor(componentName, repParts[index] ?? repParts[0] ?? null),
  }));
}

function categorizeEntry(name: string): string {
  const lowered = name.trim().toLowerCase();
  if (!lowered) {
    return "note";
  }

  if (["休息", "rest", "放松"].some((token) => lowered.includes(token))) {
    return "rest";
  }
  if (["完成", "记录", "总结"].some((token) => lowered.includes(token))) {
    return "log";
  }
  if (["热身", "拉伸", "激活", "准备", "梳理", "升温", "技术性"].some((token) => lowered.includes(token))) {
    return "warmup";
  }

  return "exercise";
}

export function summarisePlan(record: WorkoutPlanRecord | null): PlanSummary {
  if (!record) {
    return {
      phase: null,
      remarks: [],
      exercises: [],
      default_rest_seconds: null,
      trackable_exercise_count: 0,
      note_exercise_count: 0,
      is_rest_day: true,
    };
  }

  const headers = (record.headers || []).map((header) => String(header).trim());
  const exercises: ExerciseSummary[] = [];
  let defaultRestSeconds: number | null = null;

  for (const [index, rawRow] of (record.plan_data || []).entries()) {
    const values = rawRow.map((value) => String(value ?? "").trim());
    if (!values.some(Boolean)) {
      continue;
    }

    const exercise = values[0] || `未命名动作${index + 1}`;
    if (isZeroOnlyRow(values.slice(1))) {
      continue;
    }

    let components = splitCombination(exercise);
    const isCombination = components.length > 1;
    if (!isCombination) {
      components = [];
    }

    const details: string[] = [];
    let targetSets: number | null = null;
    let targetReps: number | null = null;
    let targetWeight: string | null = null;
    let targetRestSeconds: number | null = null;
    let targetRepsText: string | null = null;
    let targetWeightText: string | null = null;

    for (const [cellIndex, header] of headers.entries()) {
      const value = values[cellIndex] || "";
      if (!value) {
        continue;
      }

      if (cellIndex !== 0) {
        details.push(`${header}: ${value}`);
      }

      const loweredHeader = header.toLowerCase();
      const pair = extractSetRepPair(value);

      if ((header.includes("组") || loweredHeader.includes("set")) && targetSets === null) {
        targetSets = extractNumber(value);
      }
      if ((header.includes("次") || loweredHeader.includes("rep")) && targetReps === null) {
        targetReps = extractNumber(value);
        targetRepsText = value;
      }
      if ((header.includes("重") || loweredHeader.includes("kg")) && targetWeight === null) {
        targetWeight = value;
        targetWeightText = value;
      }
      if (targetRestSeconds === null && isRestHeader(header)) {
        targetRestSeconds = parseRestSeconds(value);
      }
      if (pair) {
        targetSets = targetSets ?? pair[0];
        if (targetReps === null) {
          targetReps = pair[1];
          targetRepsText = String(pair[1]);
        }
      }
      if (
        targetRestSeconds === null &&
        (value.includes("休息") || value.toLowerCase().includes("rest"))
      ) {
        targetRestSeconds = parseRestSeconds(value);
      }
    }

    if (targetSets === 0) {
      targetSets = null;
    }
    if (targetReps === 0) {
      targetReps = null;
    }

    if (targetRestSeconds === null) {
      for (const [headerIndex, header] of headers.slice(1).entries()) {
        const value = values[headerIndex + 1] || "";
        const probablyRest =
          isRestHeader(header) || /(分钟|分|min|秒|sec|:)/i.test(value.toLowerCase());
        if (!probablyRest) {
          continue;
        }

        targetRestSeconds = parseRestSeconds(value);
        if (targetRestSeconds !== null) {
          break;
        }
      }
    }

    let category = categorizeEntry(exercise);
    const hasPositiveNumbers = values.slice(1).some((value) => hasPositiveNumber(String(value)));
    const isTrackable =
      category === "exercise" &&
      ((targetSets !== null && targetSets > 0) ||
        (targetReps !== null && targetReps > 0) ||
        hasPositiveNumbers);

    if (!isTrackable) {
      if (category === "exercise") {
        category = "note";
      }
      targetSets = null;
      targetReps = null;
      targetRestSeconds = null;
    }

    const targetMetricText = isTrackable ? targetRepsText ?? (targetReps !== null ? String(targetReps) : null) : null;

    exercises.push({
      exercise_name: exercise,
      phase: record.phase,
      components,
      component_targets: buildComponentTargets(components, targetMetricText, targetWeightText),
      primary_component: components[0] || exercise,
      is_combination: isCombination,
      target_sets: targetSets,
      target_reps: targetReps,
      target_metric: targetMetricFor(exercise, targetMetricText),
      target_weight: targetWeight,
      target_rest_seconds: targetRestSeconds,
      details,
      is_trackable: isTrackable,
      category,
    });

    if (defaultRestSeconds === null && isTrackable && targetRestSeconds !== null) {
      defaultRestSeconds = targetRestSeconds;
    }
  }

  const trackableCount = exercises.filter((entry) => entry.is_trackable).length;

  return {
    phase: record.phase,
    remarks: record.remarks || [],
    exercises,
    default_rest_seconds: defaultRestSeconds,
    trackable_exercise_count: trackableCount,
    note_exercise_count: exercises.length - trackableCount,
    is_rest_day: trackableCount === 0,
  };
}

function determineNextStep(planSummary: PlanSummary, logs: TrainingSetRecord[]) {
  const counts = new Map<string, number>();
  for (const log of logs) {
    const key = log.group_name || log.exercise;
    const completedRound = Number(log.round_number || log.set_number || 0);
    counts.set(key, Math.max(counts.get(key) || 0, completedRound));
  }

  for (const entry of planSummary.exercises) {
    if (!entry.is_trackable) {
      continue;
    }

    const logged = counts.get(entry.exercise_name) || 0;
    const goalSets = entry.target_sets;
    const effectiveGoal = goalSets ?? 1;
    if (logged < effectiveGoal) {
      return {
        exercise: entry.exercise_name,
        next_set: logged + 1,
        target_sets: entry.target_sets,
        target_reps: entry.target_reps,
        target_metric: entry.target_metric,
        target_weight: entry.target_weight,
        target_rest_seconds: entry.target_rest_seconds,
        details: entry.details,
        is_combination: entry.is_combination,
        components: entry.components,
        component_targets: entry.component_targets,
        primary_component: entry.primary_component,
      };
    }
  }

  return null;
}

function buildSessionRecordPayload(
  session: TrainingSessionRecord,
  logs: TrainingSetRecord[],
): SessionPayload["session"] {
  return {
    session_id: session.id,
    plan_date: session.plan_date,
    status: session.status,
    rest_interval_seconds: Number(session.rest_interval_seconds || 90),
    started_at: session.started_at,
    completed_at: session.completed_at,
    notes: session.notes,
    session_name: session.session_name,
    session_slot: session.session_slot,
    session_rpe: session.session_rpe,
    duration_minutes: session.duration_minutes,
    session_load: session.session_load,
    metadata: session.metadata || {},
    logs,
  };
}

function buildSessionPayload(
  session: TrainingSessionRecord,
  planSummary: PlanSummary,
  logs: TrainingSetRecord[],
): SessionPayload {
  const sessionPayload = buildSessionRecordPayload(session, logs);
  const nextStep = determineNextStep(planSummary, logs);

  if (!nextStep) {
    return {
      session: sessionPayload,
      plan: planSummary,
      status: session.status === "completed" ? "completed" : "ready_to_finish",
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
      suggested_session_name: session.session_name || logs[0]?.exercise || null,
      plan_date: session.plan_date,
      default_rest_seconds: planSummary.default_rest_seconds,
    };
  }

  return {
    session: sessionPayload,
    plan: planSummary,
    status: "active",
    current_exercise: nextStep.exercise,
    current_set: nextStep.next_set,
    target_sets: nextStep.target_sets,
    target_reps: nextStep.target_reps,
    target_metric: nextStep.target_metric,
    target_weight: nextStep.target_weight,
    target_rest_seconds: nextStep.target_rest_seconds,
    details: nextStep.details,
    is_combination: nextStep.is_combination,
    components: nextStep.components,
    component_targets: nextStep.component_targets,
    primary_component: nextStep.primary_component,
    suggested_session_name: session.session_name || logs[0]?.exercise || null,
    plan_date: session.plan_date,
    default_rest_seconds: planSummary.default_rest_seconds,
  };
}

function toSlotLabel(slot: string | null): string {
  if (!slot) {
    return "未设置";
  }

  return SLOT_LABELS[slot] || slot;
}

function loadBandFor(value: number): string {
  if (value <= 200) {
    return "0_200";
  }
  if (value <= 400) {
    return "200_400";
  }
  if (value <= 600) {
    return "400_600";
  }
  if (value <= 800) {
    return "600_800";
  }
  if (value <= 1000) {
    return "800_1000";
  }
  return "1000_plus";
}

async function getPlanRecord(date: string): Promise<WorkoutPlanRecord | null> {
  const client = createSupabaseAdminClient();
  const { data, error } = await client
    .from("workout_plans")
    .select("*")
    .eq("date", date)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as WorkoutPlanRecord | null;
}

async function getActiveSession(date: string): Promise<TrainingSessionRecord | null> {
  const client = createSupabaseAdminClient();
  const { data, error } = await client
    .from("training_sessions")
    .select("*")
    .eq("plan_date", date)
    .eq("status", "active")
    .order("started_at", { ascending: false })
    .limit(1);

  if (error) {
    throw error;
  }

  return (data?.[0] || null) as TrainingSessionRecord | null;
}

async function getLogsBySessionId(sessionId: string): Promise<TrainingSetRecord[]> {
  const client = createSupabaseAdminClient();
  const { data, error } = await client
    .from("training_sets")
    .select("*")
    .eq("session_id", sessionId)
    .order("completed_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data || []) as TrainingSetRecord[];
}

async function listCompletedSessions(date: string): Promise<TrainingSessionRecord[]> {
  const client = createSupabaseAdminClient();
  const { data, error } = await client
    .from("training_sessions")
    .select("*")
    .eq("plan_date", date)
    .eq("status", "completed")
    .order("completed_at", { ascending: true });

  if (error) {
    throw error;
  }

  return (data || []) as TrainingSessionRecord[];
}

async function getDayMetric(date: string): Promise<TrainingDayMetricRecord | null> {
  const client = createSupabaseAdminClient();
  const { data, error } = await client
    .from("training_day_metrics")
    .select("*")
    .eq("date", date)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as TrainingDayMetricRecord | null;
}

async function getLatestDayMetric(beforeDate: string): Promise<TrainingDayMetricRecord | null> {
  const client = createSupabaseAdminClient();
  const { data, error } = await client
    .from("training_day_metrics")
    .select("*")
    .lt("date", beforeDate)
    .order("date", { ascending: false })
    .limit(1);

  if (error) {
    throw error;
  }

  return (data?.[0] || null) as TrainingDayMetricRecord | null;
}

export async function getTodayPlan(dateValue?: string | null): Promise<PlanSummary> {
  const date = normalizeDate(dateValue);
  const record = await getPlanRecord(date);
  return summarisePlan(record);
}

export async function getCurrentSession(dateValue?: string | null): Promise<SessionPayload | null> {
  const date = normalizeDate(dateValue);
  const [planRecord, activeSession] = await Promise.all([getPlanRecord(date), getActiveSession(date)]);

  if (!activeSession) {
    return null;
  }

  const [logs, planSummary] = await Promise.all([
    getLogsBySessionId(activeSession.id),
    Promise.resolve(summarisePlan(planRecord)),
  ]);

  return buildSessionPayload(activeSession, planSummary, logs);
}

export async function buildLoadMonitorDay(
  dateValue?: string | null,
): Promise<LoadMonitorDayPayload> {
  const date = normalizeDate(dateValue);
  const [completedSessions, dayMetric, latestMetric] = await Promise.all([
    listCompletedSessions(date),
    getDayMetric(date),
    getLatestDayMetric(date),
  ]);

  const dayTotalLoad = Number(
    completedSessions
      .reduce((sum, session) => sum + Number(session.session_load || 0), 0)
      .toFixed(2),
  );

  return {
    date,
    weekday: WEEKDAY_LABELS[new Date(`${date}T00:00:00`).getDay() === 0 ? 6 : new Date(`${date}T00:00:00`).getDay() - 1],
    sessions: completedSessions.map((session) => ({
      session_id: session.id,
      session_name: session.session_name || "训练会话",
      session_slot: session.session_slot,
      session_slot_label: toSlotLabel(session.session_slot),
      session_rpe: session.session_rpe,
      duration_minutes: session.duration_minutes,
      session_load: session.session_load,
      summary: session.notes,
      completed_at: session.completed_at,
    })),
    day_total_load: dayTotalLoad,
    body_weight_kg: dayMetric?.body_weight_kg ?? null,
    fatigue_score: dayMetric?.fatigue_score ?? null,
    pain_score: dayMetric?.pain_score ?? null,
    daily_note: dayMetric?.daily_note ?? null,
    load_band: loadBandFor(dayTotalLoad),
    defaults: {
      body_weight_kg: latestMetric?.body_weight_kg ?? null,
      fatigue_score: latestMetric?.fatigue_score ?? null,
      pain_score: latestMetric?.pain_score ?? null,
    },
  };
}

export async function getTrainingPageSnapshot(
  dateValue?: string | null,
): Promise<TrainingPageSnapshot> {
  const date = normalizeDate(dateValue);
  const [planRecord, activeSession, loadMonitorDay] = await Promise.all([
    getPlanRecord(date),
    getActiveSession(date),
    buildLoadMonitorDay(date),
  ]);

  const plan = summarisePlan(planRecord);

  if (!activeSession) {
    return {
      date,
      plan,
      currentSession: null,
      loadMonitorDay,
    };
  }

  const logs = await getLogsBySessionId(activeSession.id);
  return {
    date,
    plan,
    currentSession: buildSessionPayload(activeSession, plan, logs),
    loadMonitorDay,
  };
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseIsoDate(dateValue: string): Date {
  return new Date(`${normalizeDate(dateValue)}T00:00:00.000Z`);
}

function weekStartFor(dateValue?: string | null): Date {
  const date = parseIsoDate(normalizeDate(dateValue));
  const day = date.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  return addDays(date, mondayOffset);
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function parseOptionalFloat(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseOptionalInt(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function cleanText(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const text = String(value).trim();
  return text || null;
}

function nowIso(): string {
  return new Date().toISOString();
}

function estimateDurationMinutes(startedAt: string, completedAt: Date): number {
  const started = new Date(startedAt);
  const elapsedMs = Math.max(completedAt.getTime() - started.getTime(), 0);
  return Math.max(1, Math.ceil(elapsedMs / 60000));
}

export function inferSessionSlot(referenceTime = new Date()): string {
  const hour = referenceTime.getHours();
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

function restFinishesAt(restSeconds: number): string {
  return new Date(Date.now() + Math.max(0, restSeconds) * 1000).toISOString();
}

function normalizeSessionRecord(record: TrainingSessionRecord): TrainingSessionRecord {
  return {
    ...record,
    rest_interval_seconds: Number(record.rest_interval_seconds || 90),
    metadata: record.metadata || {},
  };
}

export async function getPlanPayloadForDate(dateValue?: string | null) {
  const date = normalizeDate(dateValue);
  const record = await getPlanRecord(date);

  if (!record) {
    return {
      date,
      has_plan: false,
      phase: null,
      remarks: [],
      headers: [],
      rows: [],
    };
  }

  return {
    date,
    has_plan: true,
    phase: record.phase,
    remarks: record.remarks || [],
    headers: record.headers || [],
    rows: record.plan_data || [],
  };
}

export async function getWeekPlan(weekOffset = 0, referenceDate?: string | null): Promise<WeekPlanPayload> {
  const currentWeekStart = addDays(weekStartFor(referenceDate), weekOffset * 7);
  const dates = Array.from({ length: 7 }, (_, index) => toIsoDate(addDays(currentWeekStart, index)));
  const client = createSupabaseAdminClient();
  const { data, error } = await client
    .from("workout_plans")
    .select("*")
    .in("date", dates);

  if (error) {
    throw error;
  }

  const records = new Map((data || []).map((item) => [item.date, item as WorkoutPlanRecord]));
  let trainingDays = 0;
  const days = dates.map((date, index) => {
    const record = records.get(date) || null;
    if (record) {
      trainingDays += 1;
    }
    return {
      date,
      day_name: WEEKDAY_LABELS[index],
      phase: record?.phase ?? null,
      has_plan: Boolean(record),
      remarks: record?.remarks || [],
      headers: record?.headers || [],
      rows: record?.plan_data || [],
    };
  });

  return {
    week_offset: weekOffset,
    start_date: dates[0],
    end_date: dates[6],
    training_days: trainingDays,
    days,
  };
}

async function getSessionById(sessionId: string): Promise<TrainingSessionRecord | null> {
  const client = createSupabaseAdminClient();
  const { data, error } = await client
    .from("training_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? normalizeSessionRecord(data as TrainingSessionRecord) : null;
}

async function getSessionPayloadById(sessionId: string): Promise<{
  session: TrainingSessionRecord;
  plan: PlanSummary;
  logs: TrainingSetRecord[];
  payload: SessionPayload;
} | null> {
  const session = await getSessionById(sessionId);
  if (!session) {
    return null;
  }

  const [planRecord, logs] = await Promise.all([
    getPlanRecord(session.plan_date),
    getLogsBySessionId(session.id),
  ]);
  const plan = summarisePlan(planRecord);
  return {
    session,
    plan,
    logs,
    payload: buildSessionPayload(session, plan, logs),
  };
}

export async function startTraining(dateValue?: string | null): Promise<SessionPayload> {
  const date = normalizeDate(dateValue);
  const planRecord = await getPlanRecord(date);
  const plan = summarisePlan(planRecord);
  const trackable = plan.exercises.filter((entry) => entry.is_trackable);

  if (!trackable.length) {
    throw new Error("今天没有需要记录的训练项目");
  }

  const activeSession = await getActiveSession(date);
  if (activeSession) {
    const logs = await getLogsBySessionId(activeSession.id);
    return buildSessionPayload(activeSession, plan, logs);
  }

  const client = createSupabaseAdminClient();
  const restInterval = plan.default_rest_seconds || 90;
  const sessionId = crypto.randomUUID();
  const { data, error } = await client
    .from("training_sessions")
    .insert({
      id: sessionId,
      plan_date: date,
      status: "active",
      rest_interval_seconds: restInterval,
      started_at: nowIso(),
    })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return buildSessionPayload(normalizeSessionRecord(data as TrainingSessionRecord), plan, []);
}

async function nextSetNumber(sessionId: string, exercise: string): Promise<number> {
  const client = createSupabaseAdminClient();
  const { data, error } = await client
    .from("training_sets")
    .select("set_number")
    .eq("session_id", sessionId)
    .eq("exercise", exercise)
    .order("set_number", { ascending: false })
    .limit(1);

  if (error) {
    throw error;
  }

  return Number(data?.[0]?.set_number || 0) + 1;
}

export async function recordNextSet(input: {
  session_id: string;
  actual_reps?: number | string | null;
  actual_weight?: string | null;
  rpe?: number | string | null;
  notes?: string | null;
  component_logs?: Array<{
    component_name?: string | null;
    actual_reps?: number | string | null;
    actual_weight?: string | null;
    rpe?: number | string | null;
    notes?: string | null;
  }>;
  rest_interval_seconds?: number | string | null;
}) {
  const sessionId = cleanText(input.session_id);
  if (!sessionId) {
    throw new Error("Missing session_id");
  }

  const rpe = parseOptionalFloat(input.rpe);
  if (input.rpe !== null && input.rpe !== undefined && input.rpe !== "" && rpe === null) {
    throw new Error("RPE 需要使用数字");
  }
  if (rpe !== null && (rpe < 1 || rpe > 10)) {
    throw new Error("RPE 范围为 1 到 10");
  }

  const sessionState = await getSessionPayloadById(sessionId);
  if (!sessionState) {
    throw new Error("Session not found");
  }

  const nextStep = determineNextStep(sessionState.plan, sessionState.logs);
  if (!nextStep) {
    return sessionState.payload;
  }

  const manualRest = parseOptionalInt(input.rest_interval_seconds);
  const effectiveRest =
    manualRest ??
    nextStep.target_rest_seconds ??
    sessionState.session.rest_interval_seconds ??
    90;
  const setNumber = nextStep.next_set;
  const componentInputs = Array.isArray(input.component_logs) ? input.component_logs : [];
  const client = createSupabaseAdminClient();
  const completedAt = nowIso();
  const insertRows = nextStep.is_combination
    ? (nextStep.component_targets.length
        ? nextStep.component_targets
        : nextStep.components.map((componentName) => ({
            component_name: componentName,
            target_reps: null,
            target_weight: null,
            target_metric: targetMetricFor(componentName, null),
          })))
        .map((target, index) => {
          const provided = componentInputs[index] || componentInputs.find((item) => item.component_name === target.component_name) || {};
          const componentRpe = parseOptionalFloat(provided.rpe);
          if (provided.rpe !== null && provided.rpe !== undefined && provided.rpe !== "" && componentRpe === null) {
            throw new Error(`${target.component_name} RPE 需要使用数字`);
          }
          if (componentRpe !== null && (componentRpe < 1 || componentRpe > 10)) {
            throw new Error(`${target.component_name} RPE 范围为 1 到 10`);
          }
          const actualMetric = actualMetricPayload(provided.actual_reps, target.target_metric);

          return {
            id: crypto.randomUUID(),
            session_id: sessionId,
            exercise: target.component_name,
            set_number: setNumber,
            group_name: nextStep.exercise,
            group_type: "superset",
            round_number: setNumber,
            component_index: index + 1,
            component_name: target.component_name,
            ...actualMetric,
            actual_weight: cleanText(provided.actual_weight),
            notes: cleanText(provided.notes),
            rest_seconds: effectiveRest,
            rpe: componentRpe,
            completed_at: completedAt,
          };
        })
    : [{
        id: crypto.randomUUID(),
        session_id: sessionId,
        exercise: nextStep.exercise,
        set_number: setNumber,
        group_name: null,
        group_type: "single",
        round_number: setNumber,
        component_index: 1,
        component_name: nextStep.exercise,
        ...actualMetricPayload(input.actual_reps, nextStep.target_metric),
        actual_weight: cleanText(input.actual_weight),
        notes: cleanText(input.notes),
        rest_seconds: effectiveRest,
        rpe,
        completed_at: completedAt,
      }];

  const { data, error } = await client
    .from("training_sets")
    .insert(insertRows)
    .select("*");

  if (error) {
    if (isTrainingSetDuplicateError(error)) {
      const updated = await getSessionPayloadById(sessionId);
      if (!updated) {
        throw new Error("Session not found after duplicate set");
      }
      return nextSetRestPayload(updated, []);
    }
    throw error;
  }

  const lastLogs = (data || []) as TrainingSetRecord[];
  const updated = await getSessionPayloadById(sessionId);
  if (!updated) {
    throw new Error("Session not found after update");
  }

  return nextSetRestPayload(updated, lastLogs);
}

async function upsertDayMetric(input: {
  date: string;
  body_weight_kg?: number | null;
  fatigue_score?: number | null;
  pain_score?: number | null;
  daily_note?: string | null;
}): Promise<TrainingDayMetricRecord> {
  const client = createSupabaseAdminClient();
  const existing = await getDayMetric(input.date);
  const payload: Partial<TrainingDayMetricRecord> = {};

  if (input.body_weight_kg !== undefined) {
    payload.body_weight_kg = input.body_weight_kg;
  }
  if (input.fatigue_score !== undefined) {
    payload.fatigue_score = input.fatigue_score;
  }
  if (input.pain_score !== undefined) {
    payload.pain_score = input.pain_score;
  }
  if (input.daily_note !== undefined) {
    payload.daily_note = input.daily_note;
  }

  if (existing) {
    const { data, error } = await client
      .from("training_day_metrics")
      .update(payload)
      .eq("date", input.date)
      .select("*")
      .single();

    if (error) {
      throw error;
    }
    return data as TrainingDayMetricRecord;
  }

  const { data, error } = await client
    .from("training_day_metrics")
    .insert({ date: input.date, ...payload })
    .select("*")
    .single();

  if (error) {
    throw error;
  }
  return data as TrainingDayMetricRecord;
}

export async function finishTraining(input: {
  session_id: string;
  notes?: string | null;
  session_name?: string | null;
  session_slot?: string | null;
  session_rpe?: number | string | null;
  duration_minutes?: number | string | null;
  body_weight_kg?: number | string | null;
  fatigue_score?: number | string | null;
  pain_score?: number | string | null;
  daily_note?: string | null;
}) {
  const sessionId = cleanText(input.session_id);
  if (!sessionId) {
    throw new Error("Missing session_id");
  }

  const sessionState = await getSessionPayloadById(sessionId);
  if (!sessionState) {
    throw new Error("Session not found");
  }

  const sessionSlot = cleanText(input.session_slot);
  if (sessionSlot && !SLOT_LABELS[sessionSlot]) {
    throw new Error("训练时段不合法");
  }

  const sessionRpe = parseOptionalFloat(input.session_rpe);
  if (input.session_rpe !== null && input.session_rpe !== undefined && input.session_rpe !== "" && sessionRpe === null) {
    throw new Error("Session RPE 需要使用数字");
  }
  if (sessionRpe !== null && (sessionRpe < 1 || sessionRpe > 10)) {
    throw new Error("Session RPE 范围为 1 到 10");
  }
  if (sessionRpe === null && sessionState.session.session_rpe === null) {
    throw new Error("Session RPE 需要填写");
  }

  const durationMinutes = parseOptionalInt(input.duration_minutes);
  if (
    input.duration_minutes !== null &&
    input.duration_minutes !== undefined &&
    input.duration_minutes !== "" &&
    durationMinutes === null
  ) {
    throw new Error("训练时长需要使用整数分钟");
  }
  if (durationMinutes !== null && durationMinutes <= 0) {
    throw new Error("训练时长需要大于 0");
  }

  const bodyWeightKg = parseOptionalFloat(input.body_weight_kg);
  if (bodyWeightKg !== null && bodyWeightKg <= 0) {
    throw new Error("体重需要大于 0");
  }
  const fatigueScore = parseOptionalFloat(input.fatigue_score);
  if (fatigueScore !== null && (fatigueScore < 0 || fatigueScore > 10)) {
    throw new Error("疲劳分数范围为 0 到 10");
  }
  const painScore = parseOptionalFloat(input.pain_score);
  if (painScore !== null && (painScore < 0 || painScore > 10)) {
    throw new Error("疼痛分数范围为 0 到 10");
  }

  const completedAt = new Date();
  const effectiveRpe = sessionRpe ?? sessionState.session.session_rpe;
  const effectiveDuration =
    durationMinutes ??
    sessionState.session.duration_minutes ??
    estimateDurationMinutes(sessionState.session.started_at, completedAt);
  const sessionName =
    cleanText(input.session_name) ??
    sessionState.session.session_name ??
    sessionState.logs[0]?.exercise ??
    null;
  const effectiveSlot = sessionSlot ?? sessionState.session.session_slot ?? inferSessionSlot(completedAt);
  const sessionLoad = effectiveRpe !== null ? round(Number(effectiveRpe) * effectiveDuration) : null;

  const client = createSupabaseAdminClient();
  const { data, error } = await client
    .from("training_sessions")
    .update({
      status: "completed",
      completed_at: completedAt.toISOString(),
      notes: cleanText(input.notes),
      session_name: sessionName,
      session_slot: effectiveSlot,
      session_rpe: effectiveRpe,
      duration_minutes: effectiveDuration,
      session_load: sessionLoad,
    })
    .eq("id", sessionId)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  const dayMetric = await upsertDayMetric({
    date: sessionState.session.plan_date,
    body_weight_kg: bodyWeightKg,
    fatigue_score: fatigueScore,
    pain_score: painScore,
    daily_note: cleanText(input.daily_note),
  });

  const plan = await getTodayPlan(sessionState.session.plan_date);
  return {
    status: "completed",
    session: buildSessionRecordPayload(normalizeSessionRecord(data as TrainingSessionRecord), sessionState.logs),
    day_metric: dayMetric,
    plan,
  };
}

export async function cancelTraining(sessionIdValue: string) {
  const sessionId = cleanText(sessionIdValue);
  if (!sessionId) {
    throw new Error("Missing session_id");
  }

  const sessionState = await getSessionPayloadById(sessionId);
  if (!sessionState) {
    throw new Error("Session not found");
  }
  if (sessionState.session.status === "completed") {
    throw new Error("已完成训练不能取消");
  }

  const client = createSupabaseAdminClient();
  await client.from("training_sets").delete().eq("session_id", sessionId);
  const { error } = await client.from("training_sessions").delete().eq("id", sessionId);
  if (error) {
    throw error;
  }

  return {
    status: "cancelled",
    session_id: sessionState.session.id,
    plan_date: sessionState.session.plan_date,
    deleted_sets: sessionState.logs.length,
  };
}

export async function deleteTrainingHistorySession(sessionId: string) {
  const sessionState = await getSessionPayloadById(sessionId);
  if (!sessionState) {
    throw new Error("Session not found");
  }

  const client = createSupabaseAdminClient();
  await client.from("training_sets").delete().eq("session_id", sessionId);
  const { error } = await client.from("training_sessions").delete().eq("id", sessionId);
  if (error) {
    throw error;
  }

  return {
    status: "deleted",
    session_id: sessionState.session.id,
    plan_date: sessionState.session.plan_date,
    session_status: sessionState.session.status,
    deleted_sets: sessionState.logs.length,
  };
}

export async function listTrainingHistory(limit = 30): Promise<TrainingHistoryEntry[]> {
  const client = createSupabaseAdminClient();
  const { data: logs, error } = await client
    .from("training_sets")
    .select("*")
    .order("completed_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  const setLogs = (logs || []) as TrainingSetRecord[];
  const sessionIds = Array.from(new Set(setLogs.map((log) => log.session_id)));
  let sessions = new Map<string, TrainingSessionRecord>();

  if (sessionIds.length) {
    const { data: sessionRows, error: sessionError } = await client
      .from("training_sessions")
      .select("*")
      .in("id", sessionIds);

    if (sessionError) {
      throw sessionError;
    }
    sessions = new Map((sessionRows || []).map((row) => [row.id, normalizeSessionRecord(row as TrainingSessionRecord)]));
  }

  return setLogs.map((log) => {
    const session = sessions.get(log.session_id);
    return {
      session_id: log.session_id,
      exercise_name: log.exercise,
      set_number: Number(log.set_number || 0),
      actual_reps: log.actual_reps,
      actual_metric_type: log.actual_metric_type ?? null,
      actual_value: actualMetricValue(log),
      actual_unit: actualMetricUnit(log, log.component_name || log.exercise),
      actual_weight: log.actual_weight,
      rpe: log.rpe,
      notes: log.notes,
      rest_seconds: log.rest_seconds,
      log_date: log.completed_at,
      plan_date: session?.plan_date ?? null,
      session_notes: session?.notes ?? null,
    };
  });
}

export async function listTrainingHistorySessions(limit = 20): Promise<TrainingHistorySession[]> {
  const client = createSupabaseAdminClient();
  const { data: sessionRows, error } = await client
    .from("training_sessions")
    .select("*")
    .in("status", ["completed", "ready_to_finish"])
    .order("completed_at", { ascending: false, nullsFirst: false })
    .order("started_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  const sessions = (sessionRows || []).map((row) => normalizeSessionRecord(row as TrainingSessionRecord));
  const sessionIds = sessions.map((session) => session.id);
  let logsBySession = new Map<string, TrainingSetRecord[]>();

  if (sessionIds.length) {
    const { data: setRows, error: setError } = await client
      .from("training_sets")
      .select("*")
      .in("session_id", sessionIds)
      .order("completed_at", { ascending: true });

    if (setError) {
      throw setError;
    }

    logsBySession = (setRows || []).reduce((acc, row) => {
      const log = row as TrainingSetRecord;
      const current = acc.get(log.session_id) || [];
      current.push(log);
      acc.set(log.session_id, current);
      return acc;
    }, new Map<string, TrainingSetRecord[]>());
  }

  return sessions.map((session) => {
    const logs = logsBySession.get(session.id) || [];
    const exerciseMap = new Map<string, TrainingSetRecord[]>();
    logs.forEach((log) => {
      const key = log.group_name || log.exercise;
      const current = exerciseMap.get(key) || [];
      current.push(log);
      exerciseMap.set(key, current);
    });

    const exercises = Array.from(exerciseMap.entries()).map(([exerciseName, exerciseLogs]) => {
      const sortedLogs = [...exerciseLogs].sort((left, right) => {
        const leftRound = Number(left.round_number || left.set_number || 0);
        const rightRound = Number(right.round_number || right.set_number || 0);
        if (leftRound !== rightRound) {
          return leftRound - rightRound;
        }
        return Number(left.component_index || 0) - Number(right.component_index || 0);
      });
      const groupType = sortedLogs[0]?.group_type || (sortedLogs[0]?.group_name ? "superset" : "single");
      const roundNumbers = Array.from(
        new Set(sortedLogs.map((log) => Number(log.round_number || log.set_number || 0)).filter(Boolean)),
      );
      const componentNames = Array.from(
        new Set(sortedLogs.map((log) => cleanText(log.component_name || log.exercise)).filter((value): value is string => Boolean(value))),
      );
      const reps = exerciseLogs
        .map((log) => log.actual_reps)
        .filter((value): value is number => value !== null && value !== undefined);
      const metricValues = exerciseLogs
        .map((log) => actualMetricValue(log))
        .filter((value): value is number => value !== null && value !== undefined);
      const metricUnits = Array.from(
        new Set(
          exerciseLogs
            .map((log) => actualMetricUnit(log, log.component_name || log.exercise))
            .filter((value): value is string => Boolean(value)),
        ),
      );
      const rpes = exerciseLogs
        .map((log) => log.rpe)
        .filter((value): value is number => value !== null && value !== undefined);
      const weights = Array.from(
        new Set(
          exerciseLogs
            .map((log) => cleanText(log.actual_weight))
            .filter((value): value is string => Boolean(value)),
        ),
      );
      const notes = exerciseLogs
        .map((log) => cleanText(log.notes))
        .filter((value): value is string => Boolean(value));

      return {
        exercise_name: exerciseName,
        group_type: groupType,
        component_count: componentNames.length || 1,
        total_sets: groupType === "superset" ? roundNumbers.length : sortedLogs.length,
        total_reps: reps.length ? reps.reduce((sum, value) => sum + value, 0) : null,
        total_value: metricValues.length && metricUnits.length <= 1 ? metricValues.reduce((sum, value) => sum + value, 0) : null,
        actual_unit: metricUnits.length === 1 ? metricUnits[0] : null,
        weights,
        avg_rpe: rpes.length ? round(rpes.reduce((sum, value) => sum + value, 0) / rpes.length, 1) : null,
        notes,
        sets: sortedLogs.map((log) => ({
          set_number: Number(log.set_number || 0),
          round_number: log.round_number ?? null,
          component_index: log.component_index ?? null,
          component_name: log.component_name ?? null,
          actual_reps: log.actual_reps,
          actual_metric_type: log.actual_metric_type ?? null,
          actual_value: actualMetricValue(log),
          actual_unit: actualMetricUnit(log, log.component_name || log.exercise),
          actual_weight: log.actual_weight,
          rpe: log.rpe,
          notes: log.notes,
          rest_seconds: log.rest_seconds,
          log_date: log.completed_at,
        })),
        rounds: roundNumbers.map((roundNumber) => ({
          round_number: roundNumber,
          components: sortedLogs
            .filter((log) => Number(log.round_number || log.set_number || 0) === roundNumber)
            .map((log) => ({
              set_number: Number(log.set_number || 0),
              round_number: log.round_number ?? null,
              component_index: log.component_index ?? null,
              component_name: log.component_name ?? null,
              actual_reps: log.actual_reps,
              actual_metric_type: log.actual_metric_type ?? null,
              actual_value: actualMetricValue(log),
              actual_unit: actualMetricUnit(log, log.component_name || log.exercise),
              actual_weight: log.actual_weight,
              rpe: log.rpe,
              notes: log.notes,
              rest_seconds: log.rest_seconds,
              log_date: log.completed_at,
            })),
        })),
      };
    });

    return {
      session_id: session.id,
      plan_date: session.plan_date ?? null,
      status: session.status,
      session_name: session.session_name,
      session_slot: session.session_slot,
      session_slot_label: toSlotLabel(session.session_slot),
      session_rpe: session.session_rpe,
      duration_minutes: session.duration_minutes,
      session_load: session.session_load,
      started_at: session.started_at,
      completed_at: session.completed_at,
      notes: session.notes,
      total_sets: exercises.reduce((sum, exercise) => sum + exercise.total_sets, 0),
      exercise_count: exercises.length,
      exercises,
    };
  });
}

async function listCompletedSessionsRange(dateFrom: string, dateTo: string): Promise<TrainingSessionRecord[]> {
  const client = createSupabaseAdminClient();
  const { data, error } = await client
    .from("training_sessions")
    .select("*")
    .eq("status", "completed")
    .gte("plan_date", dateFrom)
    .lte("plan_date", dateTo)
    .order("plan_date", { ascending: true })
    .order("completed_at", { ascending: true });

  if (error) {
    throw error;
  }

  return (data || []).map((row) => normalizeSessionRecord(row as TrainingSessionRecord));
}

async function listDayMetricsRange(dateFrom: string, dateTo: string): Promise<Map<string, TrainingDayMetricRecord>> {
  const client = createSupabaseAdminClient();
  const { data, error } = await client
    .from("training_day_metrics")
    .select("*")
    .gte("date", dateFrom)
    .lte("date", dateTo);

  if (error) {
    throw error;
  }

  return new Map((data || []).map((row) => [row.date, row as TrainingDayMetricRecord]));
}

function buildDayPayload(
  date: string,
  sessions: TrainingSessionRecord[],
  dayMetric?: TrainingDayMetricRecord | null,
): LoadMonitorDayPayload {
  const dateObj = parseIsoDate(date);
  const weekdayIndex = dateObj.getUTCDay() === 0 ? 6 : dateObj.getUTCDay() - 1;
  const dayTotalLoad = round(sessions.reduce((sum, session) => sum + Number(session.session_load || 0), 0));

  return {
    date,
    weekday: WEEKDAY_LABELS[weekdayIndex],
    sessions: sessions.map((session) => ({
      session_id: session.id,
      session_name: session.session_name || "训练会话",
      session_slot: session.session_slot,
      session_slot_label: toSlotLabel(session.session_slot),
      session_rpe: session.session_rpe,
      duration_minutes: session.duration_minutes,
      session_load: session.session_load,
      summary: session.notes,
      completed_at: session.completed_at,
    })),
    day_total_load: dayTotalLoad,
    body_weight_kg: dayMetric?.body_weight_kg ?? null,
    fatigue_score: dayMetric?.fatigue_score ?? null,
    pain_score: dayMetric?.pain_score ?? null,
    daily_note: dayMetric?.daily_note ?? null,
    load_band: loadBandFor(dayTotalLoad),
    defaults: {
      body_weight_kg: null,
      fatigue_score: null,
      pain_score: null,
    },
  };
}

export async function buildLoadMonitorWeek(
  weekOffset = 0,
  referenceDate?: string | null,
): Promise<LoadMonitorWeekPayload> {
  const currentWeekStart = addDays(weekStartFor(referenceDate), weekOffset * 7);
  const currentWeekEnd = addDays(currentWeekStart, 6);
  const oldestWeekStart = addDays(currentWeekStart, -7 * 7);

  const sessions = await listCompletedSessionsRange(toIsoDate(oldestWeekStart), toIsoDate(currentWeekEnd));
  const currentWeekSessions = sessions.filter((session) => {
    const planDate = session.plan_date;
    return planDate >= toIsoDate(currentWeekStart) && planDate <= toIsoDate(currentWeekEnd);
  });
  const dayMetrics = await listDayMetricsRange(toIsoDate(currentWeekStart), toIsoDate(currentWeekEnd));

  const sessionsByDate = new Map<string, TrainingSessionRecord[]>();
  for (const session of currentWeekSessions) {
    const bucket = sessionsByDate.get(session.plan_date) || [];
    bucket.push(session);
    sessionsByDate.set(session.plan_date, bucket);
  }

  const days = Array.from({ length: 7 }, (_, index) => {
    const date = toIsoDate(addDays(currentWeekStart, index));
    return buildDayPayload(date, sessionsByDate.get(date) || [], dayMetrics.get(date));
  });
  const dailyTotals = days.map((day) => day.day_total_load);
  const weekTotalLoad = round(dailyTotals.reduce((sum, value) => sum + value, 0));
  const avgDailyLoad = round(weekTotalLoad / 7);
  const variance = dailyTotals.reduce((sum, value) => sum + (value - avgDailyLoad) ** 2, 0) / dailyTotals.length;
  const dailyLoadStddev = round(Math.sqrt(variance));

  const weekTotals = new Map<string, number>();
  for (let cursor = oldestWeekStart; cursor <= currentWeekStart; cursor = addDays(cursor, 7)) {
    weekTotals.set(toIsoDate(cursor), 0);
  }
  for (const session of sessions) {
    const key = toIsoDate(weekStartFor(session.plan_date));
    weekTotals.set(key, round((weekTotals.get(key) || 0) + Number(session.session_load || 0)));
  }

  const lastFourStarts = [3, 2, 1, 0].map((index) => addDays(currentWeekStart, -7 * index));
  const lastFourValues = lastFourStarts.map((date) => weekTotals.get(toIsoDate(date)) || 0);
  const previousThreeValues = lastFourValues.slice(0, 3);
  const chronicLoad4w = lastFourValues.some((value) => value > 0)
    ? round(lastFourValues.reduce((sum, value) => sum + value, 0) / 4)
    : null;
  const chronicLoadPrev3w = previousThreeValues.some((value) => value > 0)
    ? round(previousThreeValues.reduce((sum, value) => sum + value, 0) / 3)
    : null;

  const trend = Array.from({ length: 8 }, (_, index) => {
    const weekStart = addDays(currentWeekStart, -7 * (7 - index));
    const weekStartKey = toIsoDate(weekStart);
    return {
      week_start: weekStartKey,
      week_end: toIsoDate(addDays(weekStart, 6)),
      week_total_load: round(weekTotals.get(weekStartKey) || 0),
    };
  });

  return {
    week_offset: weekOffset,
    week_start: toIsoDate(currentWeekStart),
    week_end: toIsoDate(currentWeekEnd),
    days,
    summary: {
      week_total_load: weekTotalLoad,
      avg_daily_load: avgDailyLoad,
      daily_load_stddev: dailyLoadStddev,
      chronic_load_4w: chronicLoad4w,
      chronic_load_prev3w: chronicLoadPrev3w,
      acwr_coupled: chronicLoad4w ? round(weekTotalLoad / chronicLoad4w) : null,
      acwr_uncoupled: chronicLoadPrev3w ? round(weekTotalLoad / chronicLoadPrev3w) : null,
    },
    trend,
  };
}
