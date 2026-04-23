from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from uuid import uuid4

from ..extensions import get_supabase

logger = logging.getLogger(__name__)


ISO_DATE = "%Y-%m-%d"
ISO_TIMESTAMP = "%Y-%m-%dT%H:%M:%S.%fZ"


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _ensure_datetime(value: datetime | str | None) -> datetime:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    return _utcnow()


def _normalize_date(date_value: Optional[str | date | datetime]) -> str:
    if isinstance(date_value, datetime):
        return date_value.strftime(ISO_DATE)
    if isinstance(date_value, date):
        return date_value.strftime(ISO_DATE)
    if isinstance(date_value, str) and date_value:
        return date_value
    return _utcnow().strftime(ISO_DATE)


def _parse_optional_float(value: Any) -> Optional[float]:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _parse_optional_int(value: Any) -> Optional[int]:
    if value in (None, ""):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _estimate_duration_minutes(started_at: datetime, completed_at: datetime) -> int:
    elapsed_seconds = max((completed_at - started_at).total_seconds(), 0)
    return max(1, int(math.ceil(elapsed_seconds / 60)))


def infer_session_slot(reference_time: datetime | str | None = None) -> str:
    local_time = _ensure_datetime(reference_time).astimezone()
    hour = local_time.hour
    if 5 <= hour < 12:
        return "morning"
    if 12 <= hour < 18:
        return "afternoon"
    if 18 <= hour <= 23:
        return "evening"
    return "extra"


@dataclass(slots=True)
class TrainingSetLog:
    """A single logged training set."""

    id: str
    session_id: str
    exercise: str
    set_number: int
    actual_reps: Optional[int] = None
    actual_weight: Optional[str] = None
    rpe: Optional[float] = None
    rest_seconds: Optional[int] = None
    notes: Optional[str] = None
    completed_at: datetime = field(default_factory=_utcnow)

    @classmethod
    def from_record(cls, record: Dict[str, Any]) -> "TrainingSetLog":
        completed_at = record.get("completed_at")
        if isinstance(completed_at, str):
            completed_at = datetime.fromisoformat(completed_at.replace("Z", "+00:00"))

        return cls(
            id=record.get("id"),
            session_id=record.get("session_id"),
            exercise=record.get("exercise"),
            set_number=int(record.get("set_number", 0) or 0),
            actual_reps=record.get("actual_reps"),
            actual_weight=record.get("actual_weight"),
            rpe=record.get("rpe"),
            rest_seconds=record.get("rest_seconds"),
            notes=record.get("notes"),
            completed_at=completed_at or _utcnow(),
        )

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "session_id": self.session_id,
            "exercise": self.exercise,
            "set_number": self.set_number,
            "actual_reps": self.actual_reps,
            "actual_weight": self.actual_weight,
            "rpe": self.rpe,
            "rest_seconds": self.rest_seconds,
            "notes": self.notes,
            "completed_at": self.completed_at.strftime(ISO_TIMESTAMP),
        }


@dataclass(slots=True)
class TrainingSession:
    """State for an in-progress or completed workout session."""

    id: str
    plan_date: str
    status: str
    rest_interval_seconds: int
    started_at: datetime
    completed_at: Optional[datetime] = None
    notes: Optional[str] = None
    session_name: Optional[str] = None
    session_slot: Optional[str] = None
    session_rpe: Optional[float] = None
    duration_minutes: Optional[int] = None
    session_load: Optional[float] = None
    metadata: Dict[str, Any] | None = None
    logs: List[TrainingSetLog] = field(default_factory=list)

    @property
    def is_active(self) -> bool:
        return self.status == "active" and self.completed_at is None

    @classmethod
    def from_record(
        cls, record: Dict[str, Any], logs: Optional[List[TrainingSetLog]] = None
    ) -> "TrainingSession":
        started_at = record.get("started_at")
        if isinstance(started_at, str):
            started_at = datetime.fromisoformat(started_at.replace("Z", "+00:00"))

        completed_at = record.get("completed_at")
        if isinstance(completed_at, str):
            completed_at = datetime.fromisoformat(completed_at.replace("Z", "+00:00"))

        return cls(
            id=record.get("id"),
            plan_date=_normalize_date(record.get("plan_date")),
            status=record.get("status", "active"),
            rest_interval_seconds=int(record.get("rest_interval_seconds", 90) or 90),
            started_at=started_at or _utcnow(),
            completed_at=completed_at,
            notes=record.get("notes"),
            session_name=record.get("session_name"),
            session_slot=record.get("session_slot"),
            session_rpe=_parse_optional_float(record.get("session_rpe")),
            duration_minutes=_parse_optional_int(record.get("duration_minutes")),
            session_load=_parse_optional_float(record.get("session_load")),
            metadata=record.get("metadata"),
            logs=logs or [],
        )

    def to_dict(self) -> Dict[str, Any]:
        completed = (
            self.completed_at.strftime(ISO_TIMESTAMP) if self.completed_at else None
        )
        return {
            "session_id": self.id,
            "plan_date": self.plan_date,
            "status": self.status,
            "rest_interval_seconds": self.rest_interval_seconds,
            "started_at": self.started_at.strftime(ISO_TIMESTAMP),
            "completed_at": completed,
            "notes": self.notes,
            "session_name": self.session_name,
            "session_slot": self.session_slot,
            "session_rpe": self.session_rpe,
            "duration_minutes": self.duration_minutes,
            "session_load": self.session_load,
            "metadata": self.metadata or {},
            "logs": [log.to_dict() for log in self.logs],
        }


@dataclass(slots=True)
class TrainingDayMetric:
    """Daily readiness and load-monitor fields."""

    date: str
    body_weight_kg: Optional[float] = None
    fatigue_score: Optional[float] = None
    pain_score: Optional[float] = None
    daily_note: Optional[str] = None
    metadata: Dict[str, Any] | None = None

    @classmethod
    def from_record(cls, record: Dict[str, Any]) -> "TrainingDayMetric":
        return cls(
            date=_normalize_date(record.get("date")),
            body_weight_kg=_parse_optional_float(record.get("body_weight_kg")),
            fatigue_score=_parse_optional_float(record.get("fatigue_score")),
            pain_score=_parse_optional_float(record.get("pain_score")),
            daily_note=record.get("daily_note"),
            metadata=record.get("metadata"),
        )

    def to_dict(self) -> Dict[str, Any]:
        return {
            "date": self.date,
            "body_weight_kg": self.body_weight_kg,
            "fatigue_score": self.fatigue_score,
            "pain_score": self.pain_score,
            "daily_note": self.daily_note,
            "metadata": self.metadata or {},
        }


class TrainingSessionService:
    """Persistence layer for training sessions and set logs."""

    SESSION_TABLE = "training_sessions"
    SET_TABLE = "training_sets"
    DAY_METRIC_TABLE = "training_day_metrics"

    def __init__(self, client=None):
        self._client = client or get_supabase()

    # Session helpers -------------------------------------------------

    def start_session(
        self, plan_date: str, rest_interval_seconds: int = 90
    ) -> TrainingSession:
        plan_date = _normalize_date(plan_date)

        existing = (
            self._client.table(self.SESSION_TABLE)
            .select("*")
            .eq("plan_date", plan_date)
            .eq("status", "active")
            .order("started_at", desc=True)
            .limit(1)
            .execute()
        )

        if existing.data:
            logger.info("Resuming active training session for %s", plan_date)
            record = existing.data[0]
            logs = self._fetch_logs(record.get("id"))
            return TrainingSession.from_record(record, logs)

        session_id = str(uuid4())
        payload = {
            "id": session_id,
            "plan_date": plan_date,
            "status": "active",
            "rest_interval_seconds": rest_interval_seconds,
            "started_at": _utcnow().isoformat(),
        }

        response = self._client.table(self.SESSION_TABLE).insert(payload).execute()
        if not response.data:
            raise RuntimeError("Failed to create training session")

        logger.info("Created new training session %s for %s", session_id, plan_date)
        return TrainingSession.from_record(response.data[0], [])

    def complete_session(
        self,
        session_id: str,
        notes: Optional[str] = None,
        session_name: Optional[str] = None,
        session_slot: Optional[str] = None,
        session_rpe: Optional[float] = None,
        duration_minutes: Optional[int] = None,
    ) -> TrainingSession:
        current = self.get_session(session_id)
        if current is None:
            raise RuntimeError("Training session not found")

        completed_at_dt = _utcnow()
        completed_at = completed_at_dt.isoformat()
        effective_notes = notes if notes is not None else current.notes
        effective_name = session_name if session_name is not None else current.session_name
        effective_slot = (
            session_slot
            if session_slot is not None
            else (current.session_slot or infer_session_slot(completed_at_dt))
        )
        effective_rpe = session_rpe if session_rpe is not None else current.session_rpe
        effective_duration = (
            duration_minutes
            if duration_minutes is not None
            else (
                current.duration_minutes
                or _estimate_duration_minutes(current.started_at, completed_at_dt)
            )
        )
        effective_load = None
        if effective_rpe is not None and effective_duration is not None:
            effective_load = round(float(effective_rpe) * int(effective_duration), 2)

        payload = {"status": "completed", "completed_at": completed_at}
        if effective_notes is not None:
            payload["notes"] = effective_notes
        if effective_name is not None:
            payload["session_name"] = effective_name
        if effective_slot is not None:
            payload["session_slot"] = effective_slot
        if effective_rpe is not None:
            payload["session_rpe"] = effective_rpe
        if effective_duration is not None:
            payload["duration_minutes"] = effective_duration
        if effective_load is not None:
            payload["session_load"] = effective_load

        response = (
            self._client.table(self.SESSION_TABLE)
            .update(payload)
            .eq("id", session_id)
            .execute()
        )
        if not response.data:
            raise RuntimeError("Failed to complete training session")

        logs = self._fetch_logs(session_id)
        return TrainingSession.from_record(response.data[0], logs)

    def get_session(self, session_id: str) -> Optional[TrainingSession]:
        response = (
            self._client.table(self.SESSION_TABLE)
            .select("*")
            .eq("id", session_id)
            .limit(1)
            .execute()
        )
        if not response.data:
            return None
        logs = self._fetch_logs(session_id)
        return TrainingSession.from_record(response.data[0], logs)

    def get_active_session(self, plan_date: str) -> Optional[TrainingSession]:
        plan_date = _normalize_date(plan_date)
        response = (
            self._client.table(self.SESSION_TABLE)
            .select("*")
            .eq("plan_date", plan_date)
            .eq("status", "active")
            .order("started_at", desc=True)
            .limit(1)
            .execute()
        )
        if not response.data:
            return None
        record = response.data[0]
        logs = self._fetch_logs(record.get("id"))
        return TrainingSession.from_record(record, logs)

    def delete_session(self, session_id: str) -> Optional[TrainingSession]:
        session = self.get_session(session_id)
        if session is None:
            return None

        self._client.table(self.SET_TABLE).delete().eq("session_id", session_id).execute()
        (
            self._client.table(self.SESSION_TABLE)
            .delete()
            .eq("id", session_id)
            .execute()
        )

        logger.info("Deleted training session %s", session_id)
        return session

    # Day metrics ----------------------------------------------------

    def get_day_metric(self, date_value: str | datetime) -> Optional[TrainingDayMetric]:
        date_str = _normalize_date(date_value)
        response = (
            self._client.table(self.DAY_METRIC_TABLE)
            .select("*")
            .eq("date", date_str)
            .limit(1)
            .execute()
        )
        if not response.data:
            return None
        return TrainingDayMetric.from_record(response.data[0])

    def get_latest_day_metric(
        self,
        before_date: str | date | datetime | None = None,
        *,
        include_same_day: bool = False,
    ) -> Optional[TrainingDayMetric]:
        response = self._client.table(self.DAY_METRIC_TABLE).select("*").execute()
        records = response.data or []
        if not records:
            return None

        if before_date is None:
            filtered = records
        else:
            target_date = _normalize_date(before_date)
            if include_same_day:
                filtered = [
                    record for record in records
                    if _normalize_date(record.get("date")) <= target_date
                ]
            else:
                filtered = [
                    record for record in records
                    if _normalize_date(record.get("date")) < target_date
                ]

        if not filtered:
            return None

        filtered.sort(key=lambda record: _normalize_date(record.get("date")), reverse=True)
        return TrainingDayMetric.from_record(filtered[0])

    def upsert_day_metric(
        self,
        date_value: str | datetime,
        body_weight_kg: Optional[float] = None,
        fatigue_score: Optional[float] = None,
        pain_score: Optional[float] = None,
        daily_note: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> TrainingDayMetric:
        date_str = _normalize_date(date_value)
        existing = self.get_day_metric(date_str)
        payload: Dict[str, Any] = {}

        if body_weight_kg is not None:
            payload["body_weight_kg"] = body_weight_kg
        if fatigue_score is not None:
            payload["fatigue_score"] = fatigue_score
        if pain_score is not None:
            payload["pain_score"] = pain_score
        if daily_note is not None:
            payload["daily_note"] = daily_note

        if metadata is not None:
            merged_metadata = dict(existing.metadata or {}) if existing else {}
            merged_metadata.update(metadata)
            payload["metadata"] = merged_metadata

        if existing is None:
            insert_payload = {"date": date_str, **payload}
            response = (
                self._client.table(self.DAY_METRIC_TABLE).insert(insert_payload).execute()
            )
        else:
            response = (
                self._client.table(self.DAY_METRIC_TABLE)
                .update(payload)
                .eq("date", date_str)
                .execute()
            )

        if not response.data:
            raise RuntimeError("Failed to upsert training day metric")
        return TrainingDayMetric.from_record(response.data[0])

    # Set helpers -----------------------------------------------------

    def record_set(
        self,
        session_id: str,
        exercise: str,
        actual_reps: Optional[int] = None,
        actual_weight: Optional[str] = None,
        notes: Optional[str] = None,
        rest_seconds: Optional[int] = None,
        rpe: Optional[float] = None,
        set_number: Optional[int] = None,
    ) -> TrainingSetLog:
        if not exercise:
            raise ValueError("Exercise name is required")

        if set_number is None:
            set_number = self._next_set_number(session_id, exercise)

        payload = {
            "id": str(uuid4()),
            "session_id": session_id,
            "exercise": exercise,
            "set_number": set_number,
            "actual_reps": actual_reps,
            "actual_weight": actual_weight,
            "notes": notes,
            "rest_seconds": rest_seconds,
            "rpe": rpe,
            "completed_at": _utcnow().isoformat(),
        }

        response = self._client.table(self.SET_TABLE).insert(payload).execute()
        if not response.data:
            raise RuntimeError("Failed to record training set")

        logger.info(
            "Logged set %s for session %s exercise %s",
            set_number,
            session_id,
            exercise,
        )
        return TrainingSetLog.from_record(response.data[0])

    def _fetch_logs(self, session_id: str) -> List[TrainingSetLog]:
        response = (
            self._client.table(self.SET_TABLE)
            .select("*")
            .eq("session_id", session_id)
            .order("completed_at", desc=True)
            .execute()
        )
        data = response.data or []
        return [TrainingSetLog.from_record(item) for item in data]

    def _next_set_number(self, session_id: str, exercise: str) -> int:
        response = (
            self._client.table(self.SET_TABLE)
            .select("set_number")
            .eq("session_id", session_id)
            .eq("exercise", exercise)
            .order("set_number", desc=True)
            .limit(1)
            .execute()
        )
        if response.data:
            last_number = response.data[0].get("set_number") or 0
            try:
                return int(last_number) + 1
            except (TypeError, ValueError):
                logger.warning("Invalid set number %s; defaulting to 1", last_number)
        return 1

    # History ---------------------------------------------------------

    def list_recent_history(self, limit: int = 50) -> List[TrainingSetLog]:
        response = (
            self._client.table(self.SET_TABLE)
            .select("*")
            .order("completed_at", desc=True)
            .limit(limit)
            .execute()
        )
        data = response.data or []
        return [TrainingSetLog.from_record(item) for item in data]

    def fetch_sessions_map(self, session_ids: List[str]) -> Dict[str, TrainingSession]:
        if not session_ids:
            return {}

        response = (
            self._client.table(self.SESSION_TABLE)
            .select('*')
            .in_('id', session_ids)
            .execute()
        )
        records = response.data or []
        return {record.get('id'): TrainingSession.from_record(record) for record in records}

    def list_completed_sessions(
        self,
        date_from: str | datetime,
        date_to: str | datetime,
    ) -> List[TrainingSession]:
        start_date = _normalize_date(date_from)
        end_date = _normalize_date(date_to)
        response = self._client.table(self.SESSION_TABLE).select("*").execute()
        records = response.data or []
        filtered: List[TrainingSession] = []

        for record in records:
            plan_date = _normalize_date(record.get("plan_date"))
            if plan_date < start_date or plan_date > end_date:
                continue
            if record.get("status") != "completed":
                continue
            filtered.append(TrainingSession.from_record(record))

        filtered.sort(
            key=lambda item: (item.plan_date, item.completed_at or item.started_at)
        )
        return filtered

    def list_day_metrics(
        self,
        date_from: str | datetime,
        date_to: str | datetime,
    ) -> Dict[str, TrainingDayMetric]:
        start_date = _normalize_date(date_from)
        end_date = _normalize_date(date_to)
        response = self._client.table(self.DAY_METRIC_TABLE).select("*").execute()
        records = response.data or []
        filtered: Dict[str, TrainingDayMetric] = {}

        for record in records:
            date_str = _normalize_date(record.get("date"))
            if date_str < start_date or date_str > end_date:
                continue
            filtered[date_str] = TrainingDayMetric.from_record(record)

        return filtered

    def rest_finishes_at(self, rest_interval_seconds: int) -> datetime:
        return _utcnow() + timedelta(seconds=rest_interval_seconds)


__all__ = [
    "TrainingDayMetric",
    "TrainingSetLog",
    "TrainingSession",
    "TrainingSessionService",
]
