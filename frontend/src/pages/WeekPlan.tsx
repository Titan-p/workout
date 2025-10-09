import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useWeekPlans } from "../hooks/useWeekPlans";
import { WeekGrid } from "../components/WeekGrid";

export function WeekPlan() {
  const [params, setParams] = useSearchParams();
  const weekOffset = useMemo(() => {
    const raw = Number(params.get("week") ?? "0");
    return Number.isNaN(raw) ? 0 : raw;
  }, [params]);
  const { data, isLoading } = useWeekPlans(weekOffset);

  function handleChange(offset: number) {
    if (offset === 0) {
      setParams({});
    } else {
      setParams({ week: String(offset) });
    }
  }

  return (
    <div className="page">
      <WeekGrid
        currentWeek={weekOffset}
        days={data?.days ?? []}
        loading={isLoading}
        onChangeWeek={handleChange}
      />
    </div>
  );
}
