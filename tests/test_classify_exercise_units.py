from __future__ import annotations

import importlib.util
import sys
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "classify_exercise_units.py"
MODULE_SPEC = importlib.util.spec_from_file_location("classify_exercise_units", MODULE_PATH)
assert MODULE_SPEC is not None and MODULE_SPEC.loader is not None
MODULE = importlib.util.module_from_spec(MODULE_SPEC)
sys.modules[MODULE_SPEC.name] = MODULE
MODULE_SPEC.loader.exec_module(MODULE)


def test_collect_exercises_from_parsed_plan_json():
    payload = {
        "plans": [
            {
                "exercises": [
                    {"name": "冲刺跑"},
                    {"name": "平板支撑"},
                    {"name": "冲刺跑"},
                ]
            }
        ]
    }
    assert MODULE.collect_exercises_from_json(payload) == ["冲刺跑", "平板支撑"]


def test_collect_exercises_from_upload_rows_json():
    payload = {
        "rows": [
            {
                "plan_data": [
                    ["深蹲", "3", "5", "90%1RM", "180秒"],
                    ["冲刺跑", "2", "20", "BW", "180秒"],
                ]
            }
        ]
    }
    assert MODULE.collect_exercises_from_json(payload) == ["冲刺跑", "深蹲"]


def test_normalize_ai_result_filters_invalid_units():
    result = {
        "units": {
            "冲刺跑": "meters",
            "平板支撑": "seconds",
            "未知": "unknown",
        },
        "notes": {
            "冲刺跑": "距离",
            "平板支撑": "时长",
        },
    }
    assert MODULE.normalize_ai_result(result) == {
        "units": {
            "冲刺跑": "distance_m",
            "平板支撑": "duration_sec",
        },
        "notes": {
            "冲刺跑": "距离",
            "平板支撑": "时长",
        },
    }
