export interface PlanExercise {
  exercise_name: string;
  phase: string | null;
  components: string[];
  primary_component: string | null;
  is_combination: boolean;
  target_sets: number | null;
  target_reps: number | null;
  target_weight: string | null;
  target_rest_seconds: number | null;
  details: string[];
  is_trackable: boolean;
  category: "exercise" | "note" | "rest" | "warmup" | "log";
}

export interface PlanSummary {
  phase: string | null;
  remarks: string[];
  exercises: PlanExercise[];
  default_rest_seconds: number | null;
  trackable_exercise_count: number;
  note_exercise_count: number;
  is_rest_day: boolean;
}

export interface TodayPlanResponse extends PlanSummary {
  date: string;
}

export interface WeekDayPlan {
  date: string;
  day_name: string | null;
  phase: string | null;
  has_plan: boolean;
  remarks: string[];
  headers: string[];
  rows: string[][];
}

export interface WeekPlansResponse {
  week_offset: number;
  start_date: string;
  end_date: string;
  training_days: number;
  days: WeekDayPlan[];
}

export interface TrainingSessionPayload {
  session_id: string;
  plan_date: string;
  status: "active" | "completed";
  rest_interval_seconds: number;
  started_at: string;
  completed_at: string | null;
  notes: string | null;
}

export interface TrainingLogEntry {
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
}

export interface TrainingWorkflowState {
  status: "no_session" | "active" | "rest" | "completed";
  plan_date?: string;
  current_exercise?: string | null;
  current_set?: number | null;
  target_sets?: number | null;
  target_reps?: number | null;
  target_weight?: string | null;
  target_rest_seconds?: number | null;
  rest_seconds?: number | null;
  rest_end_time?: string | null;
  details?: string[];
  is_combination?: boolean;
  components?: string[];
  primary_component?: string | null;
  default_rest_seconds?: number | null;
  session?: TrainingSessionPayload & { logs?: TrainingLogEntry[] };
  last_log?: TrainingLogEntry;
  plan?: PlanSummary;
}
