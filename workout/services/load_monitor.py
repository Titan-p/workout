from __future__ import annotations

from datetime import date, datetime, timedelta
from statistics import pstdev
from typing import Any, Dict, List, Optional

from .training_sessions import TrainingDayMetric, TrainingSession, TrainingSessionService

ISO_DATE = "%Y-%m-%d"
SLOT_LABELS = {
    "morning": "上午",
    "afternoon": "下午",
    "evening": "晚上",
    "extra": "额外",
}
SLOT_ORDER = {key: index for index, key in enumerate(SLOT_LABELS)}
WEEKDAY_LABELS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]


def _to_date(value: str | date | datetime | None) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str) and value:
        return datetime.strptime(value, ISO_DATE).date()
    return datetime.now().date()


def _iso_date(value: date) -> str:
    return value.strftime(ISO_DATE)


def _round_or_none(value: Optional[float], digits: int = 2) -> Optional[float]:
    if value is None:
        return None
    return round(float(value), digits)


def week_start_for(value: str | date | datetime | None) -> date:
    base = _to_date(value)
    return base - timedelta(days=base.weekday())


def load_band_for(value: float) -> str:
    if value <= 200:
        return "0_200"
    if value <= 400:
        return "200_400"
    if value <= 600:
        return "400_600"
    if value <= 800:
        return "600_800"
    if value <= 1000:
        return "800_1000"
    return "1000_plus"


def _display_session_name(session: TrainingSession) -> str:
    return session.session_name or "训练会话"


def _display_slot(session: TrainingSession) -> str:
    if not session.session_slot:
        return "未设置"
    return SLOT_LABELS.get(session.session_slot, session.session_slot)


def _session_sort_key(session: TrainingSession):
    completed = session.completed_at or session.started_at
    return (
        SLOT_ORDER.get(session.session_slot or "", 99),
        completed,
        session.id,
    )


def _group_sessions_by_date(
    sessions: List[TrainingSession],
) -> Dict[str, List[TrainingSession]]:
    grouped: Dict[str, List[TrainingSession]] = {}
    for session in sessions:
        grouped.setdefault(session.plan_date, []).append(session)
    for bucket in grouped.values():
        bucket.sort(key=_session_sort_key)
    return grouped


def _build_day_payload(
    target_date: date,
    sessions: List[TrainingSession],
    day_metric: Optional[TrainingDayMetric],
) -> Dict[str, Any]:
    day_total_load = round(
        sum(float(session.session_load or 0) for session in sessions),
        2,
    )
    return {
        "date": _iso_date(target_date),
        "weekday": WEEKDAY_LABELS[target_date.weekday()],
        "sessions": [
            {
                "session_id": session.id,
                "session_name": _display_session_name(session),
                "session_slot": session.session_slot,
                "session_slot_label": _display_slot(session),
                "session_rpe": session.session_rpe,
                "duration_minutes": session.duration_minutes,
                "session_load": session.session_load,
                "summary": session.notes,
                "completed_at": session.completed_at.strftime("%Y-%m-%dT%H:%M:%S.%fZ")
                if session.completed_at
                else None,
            }
            for session in sessions
        ],
        "day_total_load": day_total_load,
        "body_weight_kg": day_metric.body_weight_kg if day_metric else None,
        "fatigue_score": day_metric.fatigue_score if day_metric else None,
        "pain_score": day_metric.pain_score if day_metric else None,
        "daily_note": day_metric.daily_note if day_metric else None,
        "load_band": load_band_for(day_total_load),
    }


def _week_totals_map(
    sessions: List[TrainingSession],
    oldest_week_start: date,
    newest_week_start: date,
) -> Dict[str, float]:
    week_totals = {}
    cursor = oldest_week_start
    while cursor <= newest_week_start:
        week_totals[_iso_date(cursor)] = 0.0
        cursor += timedelta(days=7)

    for session in sessions:
        total = float(session.session_load or 0)
        session_week = week_start_for(session.plan_date)
        key = _iso_date(session_week)
        if key in week_totals:
            week_totals[key] += total

    return {key: round(value, 2) for key, value in week_totals.items()}


def build_load_monitor_day(
    service: TrainingSessionService,
    target_date: str | date | datetime | None,
) -> Dict[str, Any]:
    date_obj = _to_date(target_date)
    date_str = _iso_date(date_obj)
    sessions = service.list_completed_sessions(date_str, date_str)
    day_metrics = service.list_day_metrics(date_str, date_str)
    payload = _build_day_payload(date_obj, sessions, day_metrics.get(date_str))
    latest_metric = service.get_latest_day_metric(date_obj)
    payload["defaults"] = {
        "body_weight_kg": latest_metric.body_weight_kg if latest_metric else None,
        "fatigue_score": latest_metric.fatigue_score if latest_metric else None,
        "pain_score": latest_metric.pain_score if latest_metric else None,
    }
    return payload


def build_load_monitor_week(
    service: TrainingSessionService,
    week_offset: int = 0,
    reference_date: str | date | datetime | None = None,
) -> Dict[str, Any]:
    current_week_start = week_start_for(reference_date) + timedelta(weeks=week_offset)
    current_week_end = current_week_start + timedelta(days=6)
    oldest_week_start = current_week_start - timedelta(days=7 * 7)

    sessions = service.list_completed_sessions(oldest_week_start, current_week_end)
    day_metrics = service.list_day_metrics(current_week_start, current_week_end)
    current_week_sessions = [
        session
        for session in sessions
        if current_week_start <= _to_date(session.plan_date) <= current_week_end
    ]
    sessions_by_date = _group_sessions_by_date(current_week_sessions)

    days = []
    daily_totals = []
    for offset in range(7):
        day = current_week_start + timedelta(days=offset)
        day_str = _iso_date(day)
        payload = _build_day_payload(
            day,
            sessions_by_date.get(day_str, []),
            day_metrics.get(day_str),
        )
        days.append(payload)
        daily_totals.append(payload["day_total_load"])

    week_total_load = round(sum(daily_totals), 2)
    avg_daily_load = round(week_total_load / 7, 2)
    daily_load_stddev = round(pstdev(daily_totals), 2) if daily_totals else 0.0

    week_totals = _week_totals_map(sessions, oldest_week_start, current_week_start)
    last_four_starts = [
        current_week_start - timedelta(days=7 * index)
        for index in range(3, -1, -1)
    ]
    previous_three_starts = last_four_starts[:-1]

    def _week_total_for(week_date: date) -> float:
        return week_totals.get(_iso_date(week_date), 0.0)

    last_four_values = [_week_total_for(week_date) for week_date in last_four_starts]
    previous_three_values = [_week_total_for(week_date) for week_date in previous_three_starts]

    has_last_four = len(last_four_values) == 4 and any(value > 0 for value in last_four_values)
    has_previous_three = len(previous_three_values) == 3 and any(
        value > 0 for value in previous_three_values
    )

    chronic_load_4w = (
        round(sum(last_four_values) / 4, 2) if has_last_four else None
    )
    chronic_load_prev3w = (
        round(sum(previous_three_values) / 3, 2) if has_previous_three else None
    )

    acwr_coupled = (
        round(week_total_load / chronic_load_4w, 2)
        if chronic_load_4w and chronic_load_4w > 0
        else None
    )
    acwr_uncoupled = (
        round(week_total_load / chronic_load_prev3w, 2)
        if chronic_load_prev3w and chronic_load_prev3w > 0
        else None
    )

    trend = []
    trend_start = current_week_start - timedelta(days=7 * 7)
    for index in range(8):
        week_date = trend_start + timedelta(days=7 * index)
        week_key = _iso_date(week_date)
        trend.append(
            {
                "week_start": week_key,
                "week_end": _iso_date(week_date + timedelta(days=6)),
                "week_total_load": week_totals.get(week_key, 0.0),
            }
        )

    return {
        "week_offset": week_offset,
        "week_start": _iso_date(current_week_start),
        "week_end": _iso_date(current_week_end),
        "days": days,
        "summary": {
            "week_total_load": week_total_load,
            "avg_daily_load": avg_daily_load,
            "daily_load_stddev": daily_load_stddev,
            "chronic_load_4w": _round_or_none(chronic_load_4w),
            "chronic_load_prev3w": _round_or_none(chronic_load_prev3w),
            "acwr_coupled": _round_or_none(acwr_coupled),
            "acwr_uncoupled": _round_or_none(acwr_uncoupled),
        },
        "trend": trend,
    }


__all__ = [
    "SLOT_LABELS",
    "build_load_monitor_day",
    "build_load_monitor_week",
    "load_band_for",
    "week_start_for",
]
