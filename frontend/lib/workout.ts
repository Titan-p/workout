import { createSupabaseAdminClient } from "@/lib/supabase";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const WEEKDAY_LABELS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const SLOT_LABELS: Record<string, string> = {
  morning: "上午",
  afternoon: "下午",
  evening: "晚上",
  extra: "额外",
};

type WorkoutPlanRecord = {
  date: string;
  phase: string | null;
  headers: string[];
  remarks: string[] | null;
  plan_data: string[][];
};

type TrainingSessionRecord = {
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

type TrainingSetRecord = {
  id: string;
  session_id: string;
  exercise: string;
  set_number: number;
  actual_reps: number | null;
  actual_weight: string | null;
  rpe: number | null;
  rest_seconds: number | null;
  notes: string | null;
  completed_at: string;
};

type TrainingDayMetricRecord = {
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
  primary_component: string;
  is_combination: boolean;
  target_sets: number | null;
  target_reps: number | null;
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
  target_weight: string | null;
  target_rest_seconds: number | null;
  details: string[];
  is_combination: boolean;
  components: string[];
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
      }
      if ((header.includes("重") || loweredHeader.includes("kg")) && targetWeight === null) {
        targetWeight = value;
      }
      if (targetRestSeconds === null && isRestHeader(header)) {
        targetRestSeconds = parseRestSeconds(value);
      }
      if (pair) {
        targetSets = targetSets ?? pair[0];
        targetReps = targetReps ?? pair[1];
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

    exercises.push({
      exercise_name: exercise,
      phase: record.phase,
      components,
      primary_component: components[0] || exercise,
      is_combination: isCombination,
      target_sets: targetSets,
      target_reps: targetReps,
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
    counts.set(log.exercise, Math.max(counts.get(log.exercise) || 0, Number(log.set_number || 0)));
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
        target_weight: entry.target_weight,
        target_rest_seconds: entry.target_rest_seconds,
        details: entry.details,
        is_combination: entry.is_combination,
        components: entry.components,
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
      target_weight: null,
      target_rest_seconds: null,
      details: [],
      is_combination: false,
      components: [],
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
    target_weight: nextStep.target_weight,
    target_rest_seconds: nextStep.target_rest_seconds,
    details: nextStep.details,
    is_combination: nextStep.is_combination,
    components: nextStep.components,
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
