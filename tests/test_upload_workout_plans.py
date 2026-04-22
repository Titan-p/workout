from __future__ import annotations

import importlib.util
import sys
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "upload_workout_plans.py"
MODULE_SPEC = importlib.util.spec_from_file_location("upload_workout_plans", MODULE_PATH)
assert MODULE_SPEC is not None and MODULE_SPEC.loader is not None
MODULE = importlib.util.module_from_spec(MODULE_SPEC)
sys.modules[MODULE_SPEC.name] = MODULE
MODULE_SPEC.loader.exec_module(MODULE)


def test_parse_rest_seconds_respects_minute_header():
    assert MODULE.parse_rest_seconds("10", "组间歇（mins）") == 600
    assert MODULE.parse_rest_seconds("0.5", "组间歇（mins）") == 30
    assert MODULE.parse_rest_seconds("0", "组间歇（mins）") == 0


def test_format_rest_value_preserves_zero_seconds():
    assert MODULE.format_rest_value(0) == "0秒"
    assert MODULE.format_rest_value(180) == "180秒"
