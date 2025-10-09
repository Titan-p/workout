import type {
  TodayPlanResponse,
  WeekPlansResponse,
  TrainingWorkflowState,
} from "../types/api";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

async function request<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${input}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    credentials: "include",
    ...init,
  });

  const data = await response.json().catch(() => undefined);
  if (!response.ok) {
    const message = (data as { error?: string })?.error ?? response.statusText;
    throw new Error(message || "请求失败");
  }
  return data as T;
}

async function requestFormData<T>(input: RequestInfo, body: FormData): Promise<T> {
  const response = await fetch(`${API_BASE}${input}`, {
    method: "POST",
    body,
  });

  const data = await response.json().catch(() => undefined);
  if (!response.ok) {
    const message = (data as { error?: string })?.error ?? response.statusText;
    throw new Error(message || "请求失败");
  }
  return data as T;
}

export const api = {
  getTodayPlan(date?: string) {
    const query = date ? `?date=${encodeURIComponent(date)}` : "";
    return request<TodayPlanResponse>(`/api/today-plan${query}`);
  },
  getPlan(date: string) {
    return request(`/api/plans/${encodeURIComponent(date)}`);
  },
  getWeekPlans(week = 0) {
    return request<WeekPlansResponse>(`/api/week?week=${week}`);
  },
  startTraining(payload: { date?: string; rest_interval_seconds?: number }) {
    return request<TrainingWorkflowState>("/api/start-training", {
      method: "POST",
      body: JSON.stringify(payload ?? {}),
    });
  },
  nextSet(payload: {
    session_id: string;
    actual_reps?: number;
    actual_weight?: string;
    notes?: string;
    rpe?: number;
    rest_interval_seconds?: number;
  }) {
    return request<TrainingWorkflowState>("/api/next-set", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  currentSession(date?: string) {
    const query = date ? `?date=${encodeURIComponent(date)}` : "";
    return request<TrainingWorkflowState>(`/api/current-session${query}`);
  },
  finishTraining(session_id: string, notes?: string) {
    return request<TrainingWorkflowState>("/api/finish-training", {
      method: "POST",
      body: JSON.stringify({ session_id, notes }),
    });
  },
  uploadPlan(formData: FormData) {
    return requestFormData<{ message: string }>("/api/upload-plan", formData);
  },
};
