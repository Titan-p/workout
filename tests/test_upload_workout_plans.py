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


def test_target_metric_label_infers_distance_for_sprint():
    assert MODULE.normalize_target_metric_label("冲刺跑", "20", "次数") == "20米"
    assert MODULE.normalize_target_metric_label("助跑上箱", "3", "次数") == "3"


def test_target_metric_label_infers_duration_for_hold():
    assert MODULE.normalize_target_metric_label("平板支撑", "20", "次数") == "20秒"
    assert MODULE.normalize_target_metric_label("平板支撑", "20秒", "次数") == "20秒"


def test_component_target_labels_keep_component_units():
    assert MODULE.normalize_component_target_labels("单腿支撑等长交替+上肢拉", "6E+10", "次数") == "6+10"


def test_target_metric_label_uses_unit_overrides():
    overrides = {"滑雪机": "duration_sec", "跳箱": "distance_m"}
    assert MODULE.normalize_target_metric_label("滑雪机", "30", "次数", overrides) == "30秒"
    assert MODULE.normalize_target_metric_label("跳箱", "3", "次数", overrides) == "3米"


def test_target_metric_label_keeps_explicit_source_unit_before_override():
    overrides = {"冲刺跑": "reps"}
    assert MODULE.normalize_target_metric_label("冲刺跑", "20米", "次数", overrides) == "20米"


def test_load_exercise_unit_overrides_normalizes_aliases(tmp_path):
    override_file = tmp_path / "exercise_unit_overrides.json"
    override_file.write_text(
        '{"units": {"冲刺跑": "meters", "平板支撑": "seconds", "深蹲": "reps", "未知": "bad"}}',
        encoding="utf-8",
    )
    assert MODULE.load_exercise_unit_overrides(str(override_file)) == {
        "冲刺跑": "distance_m",
        "平板支撑": "duration_sec",
        "深蹲": "reps",
    }
