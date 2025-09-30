from __future__ import annotations

import logging
import re
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from flask import Blueprint, jsonify, request

from ..services import (
    TrainingSessionService,
    get_plan_for_date,
    get_week_plans,
    import_excel_to_db,
)
from .web import allowed_file

logger = logging.getLogger(__name__)

api_bp = Blueprint("api", __name__, url_prefix="/api")

ISO_TIMESTAMP = "%Y-%m-%dT%H:%M:%S.%fZ"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _today_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _to_iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime(ISO_TIMESTAMP)


def _extract_number(value: Any) -> Optional[int]:
    match = re.search(r"\d+", str(value))
    return int(match.group()) if match else None


def _extract_set_rep_pair(value: Any) -> Optional[tuple[int, int]]:
    match = re.search(r"(\d+)\s*[x×*]\s*(\d+)", str(value))
    if match:
        return int(match.group(1)), int(match.group(2))
    return None


def _parse_rest_seconds(value: Any) -> Optional[int]:
    if value is None:
        return None

    text = str(value).strip()
    if not text:
        return None

    normalized = text.lower().replace("：", ":").replace("'", ":").replace("′", ":")
    normalized = normalized.replace("\"", "").replace("″", "")
    colon_match = re.search(r"(\d+)\s*[:]\s*(\d+)", normalized)
    if colon_match:
        return int(colon_match.group(1)) * 60 + int(colon_match.group(2))

    trailing_minutes = re.search(r"(\d+)\s*[:]\s*$", normalized)
    if trailing_minutes:
        return int(trailing_minutes.group(1)) * 60

    total = 0
    minute_match = re.search(r"(\d+)\s*(分钟|分|min)", normalized)
    if minute_match:
        total += int(minute_match.group(1)) * 60
    second_match = re.search(r"(\d+)\s*(秒|s|sec)", normalized)
    if second_match:
        total += int(second_match.group(1))
    if total:
        return total

    compact = re.sub(r"[^0-9]\Z", "", normalized)
    compact_digits = re.fullmatch(r"\d+", compact)
    if compact_digits:
        try:
            return int(compact_digits.group())
        except ValueError:
            return None

    return None


def _summarise_plan(plan, phase: Optional[str], remarks: Optional[List[str]]):
    if plan is None:
        return {
            "phase": phase,
            "remarks": remarks or [],
            "exercises": [],
            "default_rest_seconds": None,
        }

    plan = plan.fillna("")
    headers = [str(header).strip() for header in plan.columns]
    exercises: List[Dict[str, Any]] = []

    default_rest_seconds: Optional[int] = None

    for idx, row in enumerate(plan.itertuples(index=False), start=1):
        values = [str(value).strip() for value in row]
        if not any(values):
            continue

        exercise = values[0] or f"未命名动作{idx}"
        details = []
        target_sets: Optional[int] = None
        target_reps: Optional[int] = None
        target_weight: Optional[str] = None
        target_rest_seconds: Optional[int] = None

        for header, value in zip(headers, values):
            if not value:
                continue
            details.append(f"{header}: {value}")
            lowered = header.lower()
            pair = _extract_set_rep_pair(value)
            if ("组" in header or "set" in lowered) and target_sets is None:
                target_sets = _extract_number(value)
            if ("次" in header or "rep" in lowered) and target_reps is None:
                target_reps = _extract_number(value)
            if ("重" in header or "kg" in lowered) and target_weight is None:
                target_weight = value
            if target_rest_seconds is None and ("休息" in header or "间隔" in header or "rest" in lowered):
                parsed_rest = _parse_rest_seconds(value)
                if parsed_rest is not None:
                    target_rest_seconds = parsed_rest
            if pair:
                if target_sets is None:
                    target_sets = pair[0]
                if target_reps is None:
                    target_reps = pair[1]
            if target_rest_seconds is None and ("休息" in value or "rest" in value.lower()):
                parsed_rest = _parse_rest_seconds(value)
                if parsed_rest is not None:
                    target_rest_seconds = parsed_rest

        if target_rest_seconds is None:
            for value in values[1:]:
                parsed_rest = _parse_rest_seconds(value)
                if parsed_rest is not None:
                    target_rest_seconds = parsed_rest
                    break

        # Fallbacks: count non-empty columns beyond the exercise name
        if target_sets is None:
            non_empty_columns = [value for value in values[1:] if value]
            if non_empty_columns:
                target_sets = len(non_empty_columns)

        exercises.append(
            {
                "exercise_name": exercise,
                "phase": phase,
                "target_sets": target_sets,
                "target_reps": target_reps,
                "target_weight": target_weight,
                "target_rest_seconds": target_rest_seconds,
                "details": details,
            }
        )

        if default_rest_seconds is None and target_rest_seconds is not None:
            default_rest_seconds = target_rest_seconds

    return {
        "phase": phase,
        "remarks": remarks or [],
        "exercises": exercises,
        "default_rest_seconds": default_rest_seconds,
    }


def _determine_next_step(plan_summary: Dict[str, Any], logs) -> Optional[Dict[str, Any]]:
    exercises = plan_summary.get("exercises", [])
    if not exercises:
        return None

    counts: Dict[str, int] = defaultdict(int)
    for log in logs:
        counts[log.exercise] = max(counts[log.exercise], log.set_number)

    for entry in exercises:
        exercise = entry["exercise_name"]
        goal_sets = entry.get("target_sets")
        logged = counts.get(exercise, 0)
        effective_goal = goal_sets if goal_sets is not None else 1
        if logged < effective_goal:
            return {
                "exercise": exercise,
                "next_set": logged + 1,
                "target_sets": goal_sets,
                "target_reps": entry.get("target_reps"),
                "target_weight": entry.get("target_weight"),
                "target_rest_seconds": entry.get("target_rest_seconds"),
                "details": entry.get("details", []),
            }

    return None


def _build_session_payload(
    session_payload: Dict[str, Any],
    plan_summary: Dict[str, Any],
    logs,
) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "session": session_payload,
        "plan": plan_summary,
        "status": "active" if session_payload.get("status") == "active" else "completed",
    }

    next_step = _determine_next_step(plan_summary, logs)
    if next_step is None:
        payload["status"] = "completed"
        payload["current_exercise"] = None
        payload["current_set"] = None
        payload["target_rest_seconds"] = None
    else:
        payload.update(
            {
                "current_exercise": next_step["exercise"],
                "current_set": next_step["next_set"],
                "target_sets": next_step["target_sets"],
                "target_reps": next_step["target_reps"],
                "target_weight": next_step["target_weight"],
                "target_rest_seconds": next_step.get("target_rest_seconds"),
                "details": next_step["details"],
            }
        )

    return payload


# ---------------------------------------------------------------------------
# Plan endpoints
# ---------------------------------------------------------------------------


@api_bp.route("/plans/<date_str>", methods=["GET"])
def get_plan(date_str: str):
    """Return the structured workout plan for a given date."""
    phase, remarks, plan = get_plan_for_date(date_str)

    if plan is None:
        logger.info("Plan not found for date %s", date_str)
        return (
            jsonify(
                {
                    "date": date_str,
                    "has_plan": False,
                    "phase": None,
                    "remarks": [],
                    "headers": [],
                    "rows": [],
                }
            ),
            404,
        )

    headers = list(plan.columns)
    rows = plan.fillna("").values.tolist()

    return jsonify(
        {
            "date": date_str,
            "has_plan": True,
            "phase": phase,
            "remarks": remarks or [],
            "headers": headers,
            "rows": rows,
        }
    )


@api_bp.route("/week", methods=["GET"])
def get_week():
    """Expose a week of plans for client-side rendering."""
    week_offset = int(request.args.get("week", 0))
    today = datetime.now()
    week_start = today - timedelta(days=today.weekday()) + timedelta(weeks=week_offset)
    week_dates = [week_start + timedelta(days=i) for i in range(7)]
    date_strs = [date.strftime("%Y-%m-%d") for date in week_dates]

    logger.info(
        "API fetch for week offset %d (%s to %s)",
        week_offset,
        date_strs[0],
        date_strs[-1],
    )

    week_plan_raw, training_days = get_week_plans(date_strs)
    days: Dict[str, Dict[str, Any]] = {}
    for date_str, data in week_plan_raw.items():
        plan_headers = []
        plan_rows = []
        plan_df = data.get("plan")
        if plan_df is not None:
            plan_headers = list(plan_df.columns)
            plan_rows = plan_df.fillna("").values.tolist()

        days[date_str] = {
            "date": date_str,
            "day_name": data.get("day_name"),
            "phase": data.get("phase"),
            "has_plan": data.get("has_plan", False),
            "remarks": data.get("remarks", []),
            "headers": plan_headers,
            "rows": plan_rows,
        }

    ordered_days = [days[date_str] for date_str in date_strs]

    return jsonify(
        {
            "week_offset": week_offset,
            "start_date": date_strs[0],
            "end_date": date_strs[-1],
            "training_days": training_days,
            "days": ordered_days,
        }
    )


@api_bp.route("/today-plan", methods=["GET"])
def today_plan():
    date_str = request.args.get("date", _today_iso())
    phase, remarks, plan = get_plan_for_date(date_str)

    summary = _summarise_plan(plan, phase, remarks)
    summary.update({"date": date_str})
    return jsonify(summary)


# ---------------------------------------------------------------------------
# Training session endpoints
# ---------------------------------------------------------------------------


@api_bp.route("/start-training", methods=["POST"])
def start_training():
    payload = request.get_json(silent=True) or {}
    date_str = payload.get("date") or _today_iso()

    phase, remarks, plan = get_plan_for_date(date_str)
    plan_summary = _summarise_plan(plan, phase, remarks)

    rest_value = payload.get("rest_interval_seconds")
    if rest_value in (None, "", 0):
        rest_interval = plan_summary.get("default_rest_seconds") or 90
    else:
        rest_interval = int(rest_value)

    service = TrainingSessionService()
    session = service.start_session(date_str, rest_interval_seconds=rest_interval)

    response = _build_session_payload(session.to_dict(), plan_summary, session.logs)
    response.update({
        "plan_date": date_str,
        "default_rest_seconds": plan_summary.get("default_rest_seconds"),
    })
    return jsonify(response)


@api_bp.route("/next-set", methods=["POST"])
def next_set():
    payload = request.get_json(silent=True) or {}
    session_id = payload.get("session_id")
    if not session_id:
        return jsonify({"error": "Missing session_id"}), 400

    actual_reps = payload.get("actual_reps")
    actual_weight = payload.get("actual_weight")
    notes = payload.get("notes")
    rpe = payload.get("rpe")

    service = TrainingSessionService()
    session = service.get_session(session_id)
    if session is None:
        return jsonify({"error": "Session not found"}), 404

    phase, remarks, plan = get_plan_for_date(session.plan_date)
    plan_summary = _summarise_plan(plan, phase, remarks)
    next_step = _determine_next_step(plan_summary, session.logs)

    if next_step is None:
        completed_session = service.complete_session(session_id)
        return jsonify(
            {
                "status": "completed",
                "session": completed_session.to_dict(),
            }
        )

    exercise = next_step["exercise"]
    set_number = next_step["next_set"]

    manual_rest = payload.get("rest_interval_seconds")
    try:
        manual_rest = int(manual_rest) if manual_rest is not None else None
    except (TypeError, ValueError):
        manual_rest = None

    selected_rest = next_step.get("target_rest_seconds") if next_step else None
    effective_rest = manual_rest or selected_rest or session.rest_interval_seconds

    try:
        log = service.record_set(
            session_id=session_id,
            exercise=exercise,
            actual_reps=actual_reps,
            actual_weight=actual_weight,
            notes=notes,
            rest_seconds=effective_rest,
            rpe=rpe,
            set_number=set_number,
        )
    except Exception as exc:  # pragma: no cover - defensive
        logger.exception("Failed to record training set: %s", exc)
        return jsonify({"error": "无法记录训练组"}), 500

    updated_session = service.get_session(session_id)
    if updated_session is None:
        return jsonify({"error": "Session not found after update"}), 404

    next_step = _determine_next_step(plan_summary, updated_session.logs)
    if next_step is None:
        completed_session = service.complete_session(session_id)
        return jsonify(
            {
                "status": "completed",
                "session": completed_session.to_dict(),
                "last_log": log.to_dict(),
            }
        )

    rest_seconds = next_step.get("target_rest_seconds") or updated_session.rest_interval_seconds
    rest_finish = service.rest_finishes_at(rest_seconds)
    return jsonify(
        {
            "status": "rest",
            "current_exercise": next_step["exercise"],
            "current_set": next_step["next_set"],
            "target_sets": next_step["target_sets"],
            "target_reps": next_step["target_reps"],
            "target_weight": next_step["target_weight"],
            "target_rest_seconds": next_step.get("target_rest_seconds"),
            "details": next_step["details"],
            "rest_seconds": rest_seconds,
            "rest_end_time": _to_iso(rest_finish),
            "session": updated_session.to_dict(),
            "last_log": log.to_dict(),
        }
    )


@api_bp.route("/current-session", methods=["GET"])
def current_session():
    date_str = request.args.get("date", _today_iso())
    service = TrainingSessionService()
    session = service.get_active_session(date_str)
    if session is None:
        return jsonify({"status": "no_session"})

    phase, remarks, plan = get_plan_for_date(session.plan_date)
    plan_summary = _summarise_plan(plan, phase, remarks)
    payload = _build_session_payload(session.to_dict(), plan_summary, session.logs)
    payload.update({
        "status": "active" if session.is_active else "completed",
        "plan_date": session.plan_date,
        "default_rest_seconds": plan_summary.get("default_rest_seconds"),
    })
    return jsonify(payload)


@api_bp.route("/finish-training", methods=["POST"])
def finish_training():
    payload = request.get_json(silent=True) or {}
    session_id = payload.get("session_id")
    if not session_id:
        return jsonify({"error": "Missing session_id"}), 400

    notes = payload.get("notes")
    service = TrainingSessionService()
    session = service.get_session(session_id)
    if session is None:
        return jsonify({"error": "Session not found"}), 404

    completed_session = service.complete_session(session_id, notes=notes)
    phase, remarks, plan = get_plan_for_date(completed_session.plan_date)
    plan_summary = _summarise_plan(plan, phase, remarks)

    return jsonify(
        {
            "status": "completed",
            "session": completed_session.to_dict(),
            "plan": plan_summary,
        }
    )


@api_bp.route("/training-history", methods=["GET"])
def training_history():
    limit = int(request.args.get("limit", 30))
    service = TrainingSessionService()
    logs = service.list_recent_history(limit=limit)
    session_ids = [log.session_id for log in logs]
    sessions_map = service.fetch_sessions_map(session_ids)

    history = []
    for log in logs:
        session = sessions_map.get(log.session_id)
        history.append(
            {
                "session_id": log.session_id,
                "exercise_name": log.exercise,
                "set_number": log.set_number,
                "actual_reps": log.actual_reps,
                "actual_weight": log.actual_weight,
                "notes": log.notes,
                "rest_seconds": log.rest_seconds,
                "log_date": _to_iso(log.completed_at),
                "plan_date": session.plan_date if session else None,
            }
        )

    return jsonify(history)


# ---------------------------------------------------------------------------
# Upload helper (AJAX variant of /upload)
# ---------------------------------------------------------------------------


@api_bp.route("/upload-plan", methods=["POST"])
def upload_plan():
    file = request.files.get("file")
    if not file or file.filename == "":
        return jsonify({"error": "未选择文件"}), 400

    if not allowed_file(file.filename):
        return jsonify({"error": "文件类型不支持，仅支持 .xlsx"}), 400

    file.seek(0, 2)
    file_size = file.tell()
    file.seek(0)

    if file_size > 10 * 1024 * 1024:
        return jsonify({"error": "文件过大，限制 10MB"}), 400

    try:
        if import_excel_to_db(file):
            return jsonify({"message": "训练计划导入成功"})
        return jsonify({"error": "导入失败，请检查文件内容"}), 400
    except Exception as exc:  # pragma: no cover - defensive
        logger.exception("Excel 导入失败: %s", exc)
        return jsonify({"error": "上传失败"}), 500
