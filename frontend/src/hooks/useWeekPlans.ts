import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { WeekPlansResponse } from "../types/api";

export function useWeekPlans(weekOffset: number) {
  return useQuery<WeekPlansResponse, Error>({
    queryKey: ["week-plans", weekOffset],
    queryFn: () => api.getWeekPlans(weekOffset),
    keepPreviousData: true,
    staleTime: 1000 * 60 * 5,
  });
}
