from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from uuid import uuid4

from ..extensions import get_supabase

logger = logging.getLogger(__name__)


ISO_DATE = "%Y-%m-%d"
ISO_TIMESTAMP = "%Y-%m-%dT%H:%M:%S.%fZ"


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _normalize_date(date_value: Optional[str | datetime]) -> str:
    if isinstance(date_value, datetime):
        return date_value.strftime(ISO_DATE)
    if isinstance(date_value, str) and date_value:
        return date_value
    return _utcnow().strftime(ISO_DATE)


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
            "metadata": self.metadata or {},
            "logs": [log.to_dict() for log in self.logs],
        }


class TrainingSessionService:
    """Persistence layer for training sessions and set logs."""

    SESSION_TABLE = "training_sessions"
    SET_TABLE = "training_sets"

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
        self, session_id: str, notes: Optional[str] = None
    ) -> TrainingSession:
        completed_at = _utcnow().isoformat()
        payload = {
            "status": "completed",
            "completed_at": completed_at,
            "notes": notes,
        }

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

    def rest_finishes_at(self, rest_interval_seconds: int) -> datetime:
        return _utcnow() + timedelta(seconds=rest_interval_seconds)


__all__ = [
    "TrainingSetLog",
    "TrainingSession",
    "TrainingSessionService",
]
