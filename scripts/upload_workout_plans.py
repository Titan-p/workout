#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import logging
import os
import re
import shutil
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable, Optional

LOGGER = logging.getLogger("upload_workout_plans")
DEFAULT_ENV_FILES = ("env.local", ".env.local", ".env")
DEFAULT_HEADERS = ["动作", "组数", "次数", "重量", "休息"]
WEEKDAYS = {"周一", "周二", "周三", "周四", "周五", "周六", "周日"}
DATE_ANCHOR_RE = re.compile(r"^\d+\.\d+$")
SET_REP_RE = re.compile(r"(\d+)\s*[x×*]\s*(\d+)")
REST_CLOCK_RE = re.compile(r"(\d+)\s*[:]\s*(\d+)")
NUMERIC_RE = re.compile(r"\d+(?:\.\d+)?")


def configure_logging(verbose: bool) -> None:
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(level=level, format="%(levelname)s %(message)s")


def load_env_sources(explicit_env_file: str | None) -> list[str]:
    try:
        from dotenv import load_dotenv
    except ModuleNotFoundError as exc:  # pragma: no cover - dependency guard
        raise RuntimeError(
            "python-dotenv is required. Run: pip install -r requirements.txt"
        ) from exc

    loaded_files: list[str] = []

    if explicit_env_file:
        env_path = Path(explicit_env_file)
        if not env_path.is_file():
            raise RuntimeError(f"Env file not found: {env_path}")
        candidates = [explicit_env_file]
    else:
        candidates = list(DEFAULT_ENV_FILES)

    for candidate in candidates:
        if not candidate:
            continue
        env_path = Path(candidate)
        if env_path.is_file():
            load_dotenv(env_path, override=False)
            loaded_files.append(str(env_path))

    return loaded_files


def resolve_required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def resolve_kdocs_cli(cli_bin: str | None) -> str:
    return cli_bin or os.getenv("KDOCS_CLI_BIN", "").strip() or shutil.which("kdocs-cli") or "kdocs-cli"


def run_kdocs_json(
    cli_bin: str,
    service: str,
    action: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    result = subprocess.run(
        [cli_bin, service, action, json.dumps(payload, ensure_ascii=False)],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip() or f"{service} {action} failed")

    data = json.loads(result.stdout)
    if data.get("code") != 0:
        raise RuntimeError(data.get("message", f"{service} {action} failed"))
    return data


def row_slice(row: list[str], start_col: int, width: int) -> list[str]:
    return [row[start_col + offset] if start_col + offset < len(row) else "" for offset in range(width)]


def find_header_row(grid: list[list[str]], date_row_idx: int) -> Optional[int]:
    for idx in range(date_row_idx - 1, -1, -1):
        if any(cell in WEEKDAYS for cell in grid[idx]):
            return idx + 1
    return None


def parse_date_anchor(text: str, year: int) -> Optional[str]:
    date_token = text.split()[0]
    if not DATE_ANCHOR_RE.match(date_token):
        return None
    month_str, day_str = date_token.split(".")
    try:
        month = int(month_str)
        day = int(day_str)
    except ValueError:
        return None
    return f"{year:04d}-{month:02d}-{day:02d}"


def extract_set_rep_pair(value: str) -> Optional[tuple[int, int]]:
    match = SET_REP_RE.search(value)
    if not match:
        return None
    return int(match.group(1)), int(match.group(2))


def extract_number(value: str) -> Optional[int]:
    match = re.search(r"\d+", value)
    return int(match.group()) if match else None


def normalize_plus(text: str) -> str:
    return text.replace("＋", "+").strip()


def categorize_entry(name: str) -> str:
    lowered = name.lower()
    if not lowered:
        return "note"
    if any(token in lowered for token in ("休息", "rest", "放松")):
        return "rest"
    if any(token in lowered for token in ("完成", "记录", "总结")):
        return "log"
    if any(token in lowered for token in ("热身", "拉伸", "激活", "准备")):
        return "warmup"
    return "exercise"


def is_rest_header(header: str) -> bool:
    lowered = header.lower()
    return any(token in lowered for token in ("休息", "间隔", "间歇", "rest"))


def parse_rest_seconds(value: Any, header: str = "") -> Optional[int]:
    if value is None:
        return None

    text = str(value).strip()
    if not text:
        return None

    normalized = text.lower().replace("：", ":").replace("'", ":").replace("′", ":")
    normalized = normalized.replace("\"", "").replace("″", "")

    colon_match = REST_CLOCK_RE.search(normalized)
    if colon_match:
        return int(colon_match.group(1)) * 60 + int(colon_match.group(2))

    minute_match = re.search(r"(\d+(?:\.\d+)?)\s*(分钟|mins?|min|分)", normalized)
    if minute_match:
        return int(round(float(minute_match.group(1)) * 60))

    second_match = re.search(r"(\d+(?:\.\d+)?)\s*(秒|secs?|sec)\b", normalized)
    if second_match:
        return int(round(float(second_match.group(1))))

    number_match = NUMERIC_RE.search(normalized)
    if not number_match:
        return None

    numeric_value = float(number_match.group())
    header_lower = header.lower()
    if any(token in header_lower for token in ("mins", "min", "分钟")):
        return int(round(numeric_value * 60))

    if numeric_value < 10:
        return int(round(numeric_value * 60))
    return int(round(numeric_value))


def read_sheet_grid(
    cli_bin: str,
    file_id: str,
    sheet_meta: dict[str, Any],
) -> list[list[str]]:
    row_from = int(sheet_meta.get("rowFrom", 0))
    row_to = int(sheet_meta.get("rowTo", 0))
    col_from = int(sheet_meta.get("colFrom", 0))
    col_to = int(sheet_meta.get("colTo", 0))

    payload = {
        "file_id": file_id,
        "sheetId": int(sheet_meta["sheetId"]),
        "range": {
            "rowFrom": row_from,
            "rowTo": row_to,
            "colFrom": col_from,
            "colTo": col_to,
        },
    }
    data = run_kdocs_json(cli_bin, "sheet", "get-range-data", payload)
    range_data = data["data"]["detail"]["rangeData"]

    row_count = row_to + 1
    col_count = col_to + 1
    grid = [["" for _ in range(col_count)] for _ in range(row_count)]

    for cell in range_data:
        row = int(cell.get("originRow", cell.get("rowFrom", 0)))
        col = int(cell.get("originCol", cell.get("colFrom", 0)))
        if row < 0 or col < 0 or row >= row_count or col >= col_count:
            continue
        value = cell.get("originalCellValue")
        if value in (None, ""):
            value = cell.get("cellText", "")
        grid[row][col] = str(value)

    return grid


def parse_workout_plans_from_kdocs(
    file_id: str,
    year: int,
    cli_bin: str,
) -> dict[str, Any]:
    sheets_data = run_kdocs_json(cli_bin, "sheet", "get-sheets-info", {"file_id": file_id})
    sheets = sheets_data["data"]["detail"]["sheetsInfo"]

    valid_sheets: list[dict[str, Any]] = []
    for sheet in sheets:
        sheet_name = str(sheet.get("sheetName", ""))
        if "阶段" not in sheet_name:
            continue
        digits = "".join(ch for ch in sheet_name if ch.isdigit())
        if not digits:
            continue
        phase_num = int(digits)
        if phase_num >= 14:
            valid_sheets.append({**sheet, "phase_num": phase_num})

    if not valid_sheets:
        raise RuntimeError("No phase sheet found with name containing 阶段 and phase >= 14.")

    latest_phase = max(sheet["phase_num"] for sheet in valid_sheets)
    target_sheets = [sheet for sheet in valid_sheets if sheet["phase_num"] == latest_phase]

    plans: list[dict[str, Any]] = []

    for sheet in target_sheets:
        grid = read_sheet_grid(cli_bin, file_id, sheet)
        phase_label = str(grid[1][0]).strip() if len(grid) > 1 and grid[1] else str(sheet.get("sheetName", ""))

        max_rows = len(grid)
        max_cols = max((len(row) for row in grid), default=0)
        for row_idx in range(max_rows):
            for col_idx in range(max_cols):
                cell_value = grid[row_idx][col_idx] if col_idx < len(grid[row_idx]) else ""
                if "." not in cell_value or "完成" not in cell_value:
                    continue
                date_token = cell_value.split()[0]
                if not DATE_ANCHOR_RE.match(date_token):
                    continue

                header_row_idx = find_header_row(grid, row_idx)
                if header_row_idx is None:
                    continue

                headers = row_slice(grid[header_row_idx], col_idx, 5)
                remarks_row = grid[header_row_idx + 1] if header_row_idx + 1 < len(grid) else []
                remarks = [item for item in row_slice(remarks_row, col_idx, 6) if item]

                exercises: list[dict[str, Any]] = []
                for plan_row_idx in range(header_row_idx + 2, row_idx):
                    row = grid[plan_row_idx]
                    row_data = row_slice(row, col_idx, 5)
                    if all(value in {"", "0"} for value in row_data):
                        continue

                    exercise_name = row_data[0] or "未命名动作"
                    details: list[str] = []
                    target_sets: Optional[str] = None
                    target_reps: Optional[str] = None
                    target_weight: Optional[str] = None
                    target_rest_seconds: Optional[int] = None

                    for value_idx, value in enumerate(row_data):
                        if not value:
                            continue
                        header = headers[value_idx] if value_idx < len(headers) else ""
                        if value_idx != 0:
                            details.append(f"{header}: {value}")

                        lowered_header = header.lower()
                        pair = extract_set_rep_pair(value)
                        normalized_value = normalize_plus(value)

                        if ("组" in header or "set" in lowered_header) and target_sets is None:
                            if "+" in normalized_value:
                                target_sets = normalized_value
                            else:
                                number = extract_number(value)
                                target_sets = str(number) if number is not None else value

                        if ("次" in header or "rep" in lowered_header) and target_reps is None:
                            if "+" in normalized_value:
                                target_reps = normalized_value
                            else:
                                number = extract_number(value)
                                target_reps = str(number) if number is not None else value

                        if ("重" in header or "kg" in lowered_header) and target_weight is None:
                            target_weight = value

                        if target_rest_seconds is None and is_rest_header(header):
                            target_rest_seconds = parse_rest_seconds(value, header)

                        if pair:
                            if target_sets is None:
                                target_sets = str(pair[0])
                            if target_reps is None:
                                target_reps = str(pair[1])

                    if target_rest_seconds is None:
                        for value_idx, value in enumerate(row_data[1:], start=1):
                            header = headers[value_idx] if value_idx < len(headers) else ""
                            if not (
                                is_rest_header(header)
                                or re.search(r"(分钟|分|min|秒|sec|:)", value.lower())
                            ):
                                continue
                            parsed_rest = parse_rest_seconds(value, header)
                            if parsed_rest is not None:
                                target_rest_seconds = parsed_rest
                                break

                    category = categorize_entry(exercise_name)
                    is_trackable = category == "exercise" and (
                        target_sets is not None or target_reps is not None
                    )

                    components: list[str] = []
                    is_combination = False
                    if "+" in normalize_plus(exercise_name):
                        components = [
                            part.strip()
                            for part in normalize_plus(exercise_name).split("+")
                            if part.strip()
                        ]
                        is_combination = True

                    exercises.append(
                        {
                            "name": exercise_name,
                            "components": components,
                            "primaryComponent": components[0] if components else None,
                            "isCombination": is_combination,
                            "targetSets": target_sets,
                            "targetReps": target_reps,
                            "targetWeight": target_weight,
                            "targetRestSeconds": target_rest_seconds,
                            "details": details,
                            "isTrackable": is_trackable,
                            "category": category,
                            "orderIndex": len(exercises),
                        }
                    )

                date_str = parse_date_anchor(cell_value, year)
                if not date_str:
                    continue

                plans.append(
                    {
                        "date": date_str,
                        "phase": phase_label,
                        "remarks": remarks,
                        "exercises": exercises,
                    }
                )

    plans.sort(key=lambda plan: plan["date"])
    return {
        "source": f"kdocs:{file_id}",
        "phase": latest_phase,
        "plans": plans,
    }


def format_rest_value(rest_seconds: Any) -> str:
    if rest_seconds in (None, ""):
        return ""

    try:
        rest_value = int(rest_seconds)
    except (TypeError, ValueError):
        return str(rest_seconds)

    if rest_value < 0:
        return ""
    return f"{rest_value}秒"


def chunked(items: list[dict[str, Any]], size: int) -> Iterable[list[dict[str, Any]]]:
    for index in range(0, len(items), size):
        yield items[index : index + size]


def build_workout_plan_rows(parsed: dict[str, Any]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []

    for plan in parsed.get("plans", []):
        exercises = plan.get("exercises") or []
        plan_rows: list[list[str]] = []

        for exercise in exercises:
            plan_rows.append(
                [
                    str(exercise.get("name", "") or ""),
                    str(exercise.get("targetSets", "") or ""),
                    str(exercise.get("targetReps", "") or ""),
                    str(exercise.get("targetWeight", "") or ""),
                    format_rest_value(exercise.get("targetRestSeconds")),
                ]
            )

        if not plan_rows:
            continue

        rows.append(
            {
                "date": str(plan.get("date", "") or ""),
                "phase": str(plan.get("phase", "") or ""),
                "headers": list(DEFAULT_HEADERS),
                "remarks": [str(item) for item in plan.get("remarks", [])],
                "plan_data": plan_rows,
            }
        )

    return rows


def upload_rows(
    supabase_url: str,
    supabase_key: str,
    rows: list[dict[str, Any]],
    batch_size: int,
) -> None:
    try:
        from supabase import create_client
    except ModuleNotFoundError as exc:  # pragma: no cover - dependency guard
        raise RuntimeError("supabase is required. Run: pip install -r requirements.txt") from exc

    client = create_client(supabase_url, supabase_key)

    delete_result = client.table("workout_plans").delete().gt("id", 0).execute()
    deleted_count = len(delete_result.data or [])
    LOGGER.info("Cleared workout_plans: %d rows removed", deleted_count)

    inserted_count = 0
    for batch in chunked(rows, batch_size):
        client.table("workout_plans").insert(batch).execute()
        inserted_count += len(batch)
        LOGGER.info("Inserted %d/%d rows", inserted_count, len(rows))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Pull the latest workout plan from Kdocs and upload it into Supabase workout_plans."
    )
    parser.add_argument(
        "--env-file",
        help="Env file path. Defaults to the first existing file in env.local, .env.local, .env.",
    )
    parser.add_argument(
        "--file-id",
        help="Kdocs spreadsheet file id. Defaults to KDOCS_WORKOUT_FILE_ID from env.",
    )
    parser.add_argument(
        "--year",
        type=int,
        default=datetime.now().year,
        help="Year used for month.day date anchors. Defaults to the current year.",
    )
    parser.add_argument(
        "--kdocs-cli",
        help="Path to the kdocs-cli binary. Defaults to KDOCS_CLI_BIN or PATH lookup.",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=50,
        help="Supabase insert batch size. Defaults to 50.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Parse and print the upload summary without writing to Supabase.",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Enable debug logging.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    configure_logging(args.verbose)

    loaded_files = load_env_sources(args.env_file)
    if loaded_files:
        LOGGER.info("Loaded env files: %s", ", ".join(loaded_files))

    supabase_url = resolve_required_env("SUPABASE_URL")
    supabase_key = resolve_required_env("SUPABASE_SERVICE_ROLE_KEY")
    file_id = args.file_id or resolve_required_env("KDOCS_WORKOUT_FILE_ID")
    kdocs_cli = resolve_kdocs_cli(args.kdocs_cli)

    parsed = parse_workout_plans_from_kdocs(file_id, args.year, cli_bin=kdocs_cli)
    rows = build_workout_plan_rows(parsed)

    if not rows:
        raise RuntimeError("No workout plan rows parsed from Kdocs.")

    LOGGER.info(
        "Parsed %d plans from %s, latest phase=%s",
        len(rows),
        parsed.get("source", f"kdocs:{file_id}"),
        parsed.get("phase"),
    )
    LOGGER.info("Plan dates: %s", ", ".join(row["date"] for row in rows))

    if args.dry_run:
        LOGGER.info("Dry run complete. Supabase upload skipped.")
        return 0

    upload_rows(supabase_url, supabase_key, rows, args.batch_size)
    LOGGER.info("Upload complete. workout_plans now has %d rows.", len(rows))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
