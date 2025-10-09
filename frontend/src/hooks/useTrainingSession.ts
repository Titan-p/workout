import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { TrainingWorkflowState } from "../types/api";

export function useTrainingSession(date?: string) {
  const queryClient = useQueryClient();

  const current = useQuery<TrainingWorkflowState, Error>({
    queryKey: ["training-session", date ?? "today"],
    queryFn: () => api.currentSession(date),
    staleTime: 1000 * 15,
    refetchInterval: 1000 * 15,
  });

  const startMutation = useMutation({
    mutationFn: api.startTraining,
    onSuccess: (data) => {
      queryClient.setQueryData(["training-session", date ?? "today"], data);
      queryClient.invalidateQueries({ queryKey: ["today-plan", date ?? "today"] });
    },
  });

  const nextMutation = useMutation({
    mutationFn: api.nextSet,
    onSuccess: (data) => {
      queryClient.setQueryData(["training-session", date ?? "today"], data);
      queryClient.invalidateQueries({ queryKey: ["today-plan", date ?? "today"] });
    },
  });

  const finishMutation = useMutation({
    mutationFn: ({ sessionId, notes }: { sessionId: string; notes?: string }) =>
      api.finishTraining(sessionId, notes),
    onSuccess: (data) => {
      queryClient.setQueryData(["training-session", date ?? "today"], data);
      queryClient.invalidateQueries({ queryKey: ["today-plan", date ?? "today"] });
    },
  });

  return {
    current,
    start: startMutation,
    nextSet: nextMutation,
    finish: finishMutation,
  };
}
