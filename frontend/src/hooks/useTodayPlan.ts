import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { TodayPlanResponse } from "../types/api";

export function useTodayPlan(date?: string) {
  return useQuery<TodayPlanResponse, Error>({
    queryKey: ["today-plan", date ?? "today"],
    queryFn: () => api.getTodayPlan(date),
    staleTime: 1000 * 60 * 5,
    retry: 1,
  });
}
