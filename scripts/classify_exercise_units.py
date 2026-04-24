#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_OUTPUT = Path(__file__).resolve().parents[1] / "config" / "exercise_unit_overrides.json"
VALID_UNITS = {"reps", "distance_m", "duration_sec", "duration_min"}
UNIT_ALIASES = {
    "rep": "reps",
    "reps": "reps",
    "count": "reps",
    "次数": "reps",
    "distance": "distance_m",
    "distance_m": "distance_m",
    "meter": "distance_m",
    "meters": "distance_m",
    "m": "distance_m",
    "米": "distance_m",
    "duration": "duration_sec",
    "duration_sec": "duration_sec",
    "second": "duration_sec",
    "seconds": "duration_sec",
    "sec": "duration_sec",
    "秒": "duration_sec",
    "duration_min": "duration_min",
    "minute": "duration_min",
    "minutes": "duration_min",
    "min": "duration_min",
    "分钟": "duration_min",
}


def load_env_file(path: str | None) -> None:
    if not path:
        return
    env_path = Path(path)
    if not env_path.is_file():
        raise RuntimeError(f"Env file not found: {env_path}")
    for line in env_path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def normalize_unit(raw_unit: Any) -> str | None:
    return UNIT_ALIASES.get(str(raw_unit or "").strip().lower())


def collect_exercises_from_json(payload: Any) -> list[str]:
    names: list[str] = []

    def add(value: Any) -> None:
        name = str(value or "").strip()
        if name:
            names.append(name)

    if isinstance(payload, dict):
        for plan in payload.get("plans", []):
            for exercise in (plan or {}).get("exercises", []):
                add((exercise or {}).get("name"))
        for row in payload.get("plan_data", []):
            if isinstance(row, list) and row:
                add(row[0])
        for row in payload.get("rows", []):
            if isinstance(row, dict):
                for plan_row in row.get("plan_data", []):
                    if isinstance(plan_row, list) and plan_row:
                        add(plan_row[0])
    elif isinstance(payload, list):
        for item in payload:
            if isinstance(item, str):
                add(item)
            elif isinstance(item, dict):
                add(item.get("name") or item.get("exercise") or item.get("exercise_name"))
            elif isinstance(item, list) and item:
                add(item[0])

    return sorted(set(names))


def load_existing(path: Path) -> dict[str, Any]:
    if not path.is_file():
        return {"version": 1, "units": {}, "notes": {}}
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        return {"version": 1, "units": {}, "notes": {}}
    payload.setdefault("version", 1)
    payload.setdefault("units", {})
    payload.setdefault("notes", {})
    return payload


def parse_ai_json(content: str) -> dict[str, Any]:
    stripped = content.strip()
    if stripped.startswith("```"):
        stripped = stripped.strip("`")
        if stripped.startswith("json"):
            stripped = stripped[4:].strip()
    start = stripped.find("{")
    end = stripped.rfind("}")
    if start >= 0 and end >= start:
        stripped = stripped[start : end + 1]
    payload = json.loads(stripped)
    if not isinstance(payload, dict):
        raise RuntimeError("AI response must be a JSON object.")
    return payload


def classify_with_ai(exercises: list[str], model: str, base_url: str, api_key: str) -> dict[str, Any]:
    prompt = {
        "task": "Classify workout exercise target metric units.",
        "allowed_units": {
            "reps": "目标数字表示次数",
            "distance_m": "目标数字表示距离，单位米",
            "duration_sec": "目标数字表示时长，单位秒",
            "duration_min": "目标数字表示时长，单位分钟"
        },
        "rules": [
            "Return JSON only.",
            "Use exact exercise names as keys.",
            "Classify the meaning of the target number in a workout plan.",
            "For strength and corrective drills, prefer reps unless the name clearly means a hold or duration.",
            "For sprints, shuttle runs, long runs, and acceleration runs, prefer distance_m when the target is a small number like 20."
        ],
        "response_schema": {
            "units": {"动作名": "reps|distance_m|duration_sec|duration_min"},
            "notes": {"动作名": "short reason in Chinese"}
        },
        "exercises": exercises,
    }
    body = {
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": "You are a precise strength-training data normalizer. Return valid compact JSON only.",
            },
            {
                "role": "user",
                "content": json.dumps(prompt, ensure_ascii=False),
            },
        ],
        "temperature": 0,
        "response_format": {"type": "json_object"},
    }
    request = urllib.request.Request(
        base_url.rstrip("/") + "/chat/completions",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"AI request failed: HTTP {exc.code} {detail}") from exc

    content = payload["choices"][0]["message"]["content"]
    return parse_ai_json(content)


def normalize_ai_result(result: dict[str, Any]) -> dict[str, dict[str, str]]:
    raw_units = result.get("units", {})
    raw_notes = result.get("notes", {})
    units: dict[str, str] = {}
    notes: dict[str, str] = {}

    if not isinstance(raw_units, dict):
        raise RuntimeError("AI response units must be an object.")

    for exercise_name, raw_unit in raw_units.items():
        name = str(exercise_name or "").strip()
        unit = normalize_unit(raw_unit)
        if name and unit in VALID_UNITS:
            units[name] = unit
            if isinstance(raw_notes, dict):
                note = str(raw_notes.get(name, "") or "").strip()
                if note:
                    notes[name] = note

    return {"units": units, "notes": notes}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Use AI to classify workout exercise target units.")
    parser.add_argument("--input", help="JSON file with parsed plans, upload rows, or exercise rows.")
    parser.add_argument("--exercise", action="append", default=[], help="Exercise name. Can be repeated.")
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT), help="Output override JSON path.")
    parser.add_argument("--replace", action="store_true", help="Replace existing overrides instead of merging.")
    parser.add_argument("--env-file", help="Optional env file containing OPENAI_API_KEY.")
    parser.add_argument("--model", default=os.getenv("OPENAI_MODEL", "gpt-4.1-mini"), help="OpenAI-compatible model.")
    parser.add_argument(
        "--base-url",
        default=os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1"),
        help="OpenAI-compatible base URL.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    load_env_file(args.env_file)

    exercises = [str(item).strip() for item in args.exercise if str(item).strip()]
    if args.input:
        input_path = Path(args.input)
        payload = json.loads(input_path.read_text(encoding="utf-8"))
        exercises.extend(collect_exercises_from_json(payload))
    exercises = sorted(set(exercises))
    if not exercises:
        raise RuntimeError("No exercises found. Use --input or --exercise.")

    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("Missing OPENAI_API_KEY.")

    classified = normalize_ai_result(classify_with_ai(exercises, args.model, args.base_url, api_key))
    output_path = Path(args.output)
    existing = {"version": 1, "units": {}, "notes": {}} if args.replace else load_existing(output_path)
    existing_units = existing.get("units", {})
    existing_notes = existing.get("notes", {})
    if not isinstance(existing_units, dict):
        existing_units = {}
    if not isinstance(existing_notes, dict):
        existing_notes = {}

    existing["units"] = {**existing_units, **classified["units"]}
    existing["notes"] = {**existing_notes, **classified["notes"]}
    existing["updated_at"] = datetime.now(timezone.utc).isoformat()
    existing["source"] = f"ai:{args.model}"

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(existing, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(classified['units'])} unit overrides to {output_path}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"error: {exc}", file=sys.stderr)
        raise SystemExit(1)
