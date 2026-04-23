from datetime import datetime, timedelta, timezone


def seed_plan(supabase_stub, date_str: str):
    supabase_stub.seed(
        "workout_plans",
        [
            {
                "date": date_str,
                "phase": "测试阶段",
                "headers": ["动作", "组数", "次数", "休息"],
                "plan_data": [["深蹲", "3", "12", "90秒"], ["硬拉", "3", "10", "120秒"]],
                "remarks": ["注意动作控制"],
            }
        ],
    )


def seed_completed_session(
    supabase_stub,
    *,
    session_id: str,
    plan_date: str,
    session_load: float,
    session_name: str = "力量训练",
    session_slot: str = "evening",
    session_rpe: float = 7.0,
    duration_minutes: int = 60,
    notes: str | None = None,
):
    started_at = f"{plan_date}T10:00:00+00:00"
    completed_at = f"{plan_date}T11:00:00+00:00"
    rows = list(supabase_stub.storage.get("training_sessions", []))
    rows.append(
        {
            "id": session_id,
            "plan_date": plan_date,
            "status": "completed",
            "rest_interval_seconds": 90,
            "started_at": started_at,
            "completed_at": completed_at,
            "notes": notes,
            "session_name": session_name,
            "session_slot": session_slot,
            "session_rpe": session_rpe,
            "duration_minutes": duration_minutes,
            "session_load": session_load,
            "metadata": {},
        }
    )
    supabase_stub.seed("training_sessions", rows)


def test_index_renders(client):
    response = client.get("/")
    assert response.status_code == 200
    assert "休息日" in response.text


def test_today_plan_summary(client, supabase_stub):
    today = datetime.now().strftime("%Y-%m-%d")
    seed_plan(supabase_stub, today)

    response = client.get(f"/api/today-plan?date={today}")
    assert response.status_code == 200
    payload = response.get_json()

    assert payload["date"] == today
    assert payload["phase"] == "测试阶段"
    assert payload["default_rest_seconds"] == 90
    assert len(payload["exercises"]) == 2
    assert payload["exercises"][0]["exercise_name"] == "深蹲"
    assert payload["exercises"][0]["target_sets"] == 3
    assert payload["exercises"][0]["target_rest_seconds"] == 90
    assert payload["exercises"][1]["target_rest_seconds"] == 120
    assert payload["trackable_exercise_count"] == 2
    assert payload["note_exercise_count"] == 0
    assert payload["is_rest_day"] is False
    assert all(entry["is_trackable"] for entry in payload["exercises"])
    assert all(entry["is_combination"] is False for entry in payload["exercises"])


def test_training_session_flow(client, supabase_stub):
    today = datetime.now().strftime("%Y-%m-%d")
    seed_plan(supabase_stub, today)

    start_resp = client.post(
        "/api/start-training",
        json={"date": today, "rest_interval_seconds": 30},
    )
    assert start_resp.status_code == 200
    session_payload = start_resp.get_json()
    assert session_payload["status"] == "active"
    assert session_payload["current_exercise"] == "深蹲"
    assert session_payload["current_set"] == 1
    assert session_payload["default_rest_seconds"] == 90
    assert session_payload["target_rest_seconds"] == 90
    assert session_payload["is_combination"] is False
    assert session_payload["components"] == []

    session_id = session_payload["session"]["session_id"]

    # Log six sets (3 for each exercise)
    rest_values = []
    result = None
    for idx in range(6):
        payload = {"session_id": session_id, "actual_reps": 12}
        if idx == 1:
            payload["rest_interval_seconds"] = 45
        if idx == 0:
            payload["rpe"] = 8.5
        result = client.post(
            "/api/next-set",
            json=payload,
        ).get_json()
        assert result["status"] in {"rest", "ready_to_finish"}
        if result["status"] == "rest":
            rest_values.append(result["rest_seconds"])
            assert result["target_rest_seconds"] in {90, 120}
            assert "rest_end_time" in result

    assert result["status"] == "ready_to_finish"
    assert result["session"]["status"] == "active"
    assert len(rest_values) == 5
    assert rest_values == [90, 90, 120, 120, 120]

    # history endpoint should now include six entries
    history = client.get("/api/training-history").get_json()
    assert len(history) == 6
    assert {log["exercise_name"] for log in history} == {"深蹲", "硬拉"}
    logged_rests = {log.get("rest_seconds") for log in history}
    assert logged_rests == {45, 90, 120}
    assert any(log.get("rpe") == 8.5 for log in history)

    # current session stays open for summary capture
    status = client.get(f"/api/current-session?date={today}").get_json()
    assert status["status"] == "ready_to_finish"

    finish_resp = client.post(
        "/api/finish-training",
        json={
            "session_id": session_id,
            "notes": "今天整体节奏稳定",
            "session_rpe": 7,
        },
    )
    assert finish_resp.status_code == 200
    finish_payload = finish_resp.get_json()
    assert finish_payload["status"] == "completed"
    assert finish_payload["session"]["notes"] == "今天整体节奏稳定"

    status = client.get(f"/api/current-session?date={today}").get_json()
    assert status["status"] == "no_session"


def test_finish_training_endpoint(client, supabase_stub):
    today = datetime.now().strftime("%Y-%m-%d")
    seed_plan(supabase_stub, today)

    start_resp = client.post("/api/start-training", json={"date": today})
    session_payload = start_resp.get_json()
    session_id = session_payload["session"]["session_id"]

    finish_resp = client.post(
        "/api/finish-training",
        json={
            "session_id": session_id,
            "notes": "今天收得很干净",
            "session_rpe": 6,
        },
    )
    assert finish_resp.status_code == 200
    finish_payload = finish_resp.get_json()
    assert finish_payload["status"] == "completed"
    assert finish_payload["session"]["status"] == "completed"
    assert finish_payload["session"]["notes"] == "今天收得很干净"
    assert finish_payload["session"]["session_rpe"] == 6.0
    assert finish_payload["session"]["duration_minutes"] >= 1
    assert finish_payload["session"]["session_load"] == 6.0 * finish_payload["session"]["duration_minutes"]
    assert finish_payload["session"]["session_slot"] in {"morning", "afternoon", "evening", "extra"}

    status = client.get(f"/api/current-session?date={today}").get_json()
    assert status["status"] == "no_session"


def test_finish_training_persists_load_monitor_fields(client, supabase_stub):
    today = datetime.now().strftime("%Y-%m-%d")
    seed_plan(supabase_stub, today)

    start_resp = client.post("/api/start-training", json={"date": today})
    session_id = start_resp.get_json()["session"]["session_id"]

    finish_resp = client.post(
        "/api/finish-training",
        json={
            "session_id": session_id,
            "notes": "力量输出稳定",
            "session_name": "力量房",
            "session_slot": "evening",
            "session_rpe": 6.5,
            "duration_minutes": 70,
            "body_weight_kg": 76.4,
            "fatigue_score": 5,
            "pain_score": 1,
            "daily_note": "右膝有轻微紧张",
        },
    )
    assert finish_resp.status_code == 200

    finish_payload = finish_resp.get_json()
    assert finish_payload["session"]["session_name"] == "力量房"
    assert finish_payload["session"]["session_slot"] == "evening"
    assert finish_payload["session"]["session_rpe"] == 6.5
    assert finish_payload["session"]["duration_minutes"] == 70
    assert finish_payload["session"]["session_load"] == 455.0
    assert finish_payload["day_metric"]["body_weight_kg"] == 76.4
    assert finish_payload["day_metric"]["fatigue_score"] == 5.0
    assert finish_payload["day_metric"]["pain_score"] == 1.0
    assert finish_payload["day_metric"]["daily_note"] == "右膝有轻微紧张"

    day_payload = client.get(f"/api/load-monitor/day?date={today}").get_json()
    assert day_payload["day_total_load"] == 455.0
    assert day_payload["body_weight_kg"] == 76.4
    assert day_payload["daily_note"] == "右膝有轻微紧张"
    assert len(day_payload["sessions"]) == 1
    assert day_payload["sessions"][0]["session_name"] == "力量房"
    assert day_payload["sessions"][0]["session_slot_label"] == "晚上"


def test_finish_training_requires_session_rpe(client, supabase_stub):
    today = datetime.now().strftime("%Y-%m-%d")
    seed_plan(supabase_stub, today)

    start_resp = client.post("/api/start-training", json={"date": today})
    session_id = start_resp.get_json()["session"]["session_id"]

    finish_resp = client.post(
        "/api/finish-training",
        json={"session_id": session_id, "notes": "收尾"},
    )
    assert finish_resp.status_code == 400
    assert finish_resp.get_json()["error"] == "Session RPE 需要填写"


def test_finish_training_uses_elapsed_duration_when_omitted(client, supabase_stub):
    today = datetime.now().strftime("%Y-%m-%d")
    seed_plan(supabase_stub, today)

    start_resp = client.post("/api/start-training", json={"date": today})
    session_id = start_resp.get_json()["session"]["session_id"]
    started_at = datetime.now(timezone.utc) - timedelta(minutes=94, seconds=20)
    supabase_stub.storage["training_sessions"][0]["started_at"] = started_at.isoformat()

    finish_resp = client.post(
        "/api/finish-training",
        json={
            "session_id": session_id,
            "session_rpe": 6.5,
        },
    )
    assert finish_resp.status_code == 200

    finish_payload = finish_resp.get_json()
    assert finish_payload["session"]["duration_minutes"] == 95
    assert finish_payload["session"]["session_load"] == 617.5
    assert finish_payload["session"]["session_slot"] in {"morning", "afternoon", "evening", "extra"}


def test_load_monitor_week_summary(client, supabase_stub):
    reference_date = "2026-04-22"
    week_start = datetime.strptime(reference_date, "%Y-%m-%d")
    current_monday = week_start - timedelta(days=week_start.weekday())

    seed_completed_session(
        supabase_stub,
        session_id="current-week",
        plan_date=(current_monday + timedelta(days=1)).strftime("%Y-%m-%d"),
        session_load=420,
        session_name="球场专项",
    )
    seed_completed_session(
        supabase_stub,
        session_id="week-minus-1",
        plan_date=(current_monday - timedelta(days=6)).strftime("%Y-%m-%d"),
        session_load=360,
        session_name="力量房",
    )
    seed_completed_session(
        supabase_stub,
        session_id="week-minus-2",
        plan_date=(current_monday - timedelta(days=13)).strftime("%Y-%m-%d"),
        session_load=300,
    )
    seed_completed_session(
        supabase_stub,
        session_id="week-minus-3",
        plan_date=(current_monday - timedelta(days=20)).strftime("%Y-%m-%d"),
        session_load=240,
    )
    seed_completed_session(
        supabase_stub,
        session_id="week-minus-4",
        plan_date=(current_monday - timedelta(days=27)).strftime("%Y-%m-%d"),
        session_load=180,
    )
    supabase_stub.seed(
        "training_day_metrics",
        [
            {
                "date": (current_monday + timedelta(days=1)).strftime("%Y-%m-%d"),
                "body_weight_kg": 76.0,
                "fatigue_score": 4,
                "pain_score": 1,
                "daily_note": "弹跳专项日",
                "metadata": {},
            }
        ],
    )

    response = client.get(f"/api/load-monitor?date={reference_date}")
    assert response.status_code == 200

    payload = response.get_json()
    assert payload["week_start"] == current_monday.strftime("%Y-%m-%d")
    assert payload["summary"]["week_total_load"] == 420.0
    assert payload["summary"]["avg_daily_load"] == 60.0
    assert payload["summary"]["daily_load_stddev"] == 146.97
    assert payload["summary"]["chronic_load_4w"] == 330.0
    assert payload["summary"]["chronic_load_prev3w"] == 300.0
    assert payload["summary"]["acwr_coupled"] == 1.27
    assert payload["summary"]["acwr_uncoupled"] == 1.4
    assert len(payload["days"]) == 7
    assert payload["days"][1]["day_total_load"] == 420.0
    assert payload["days"][1]["daily_note"] == "弹跳专项日"
    assert len(payload["trend"]) == 8
    assert payload["trend"][-1]["week_total_load"] == 420.0


def test_load_monitor_day_returns_latest_defaults(client, supabase_stub):
    target_date = "2026-04-23"
    supabase_stub.seed(
        "training_day_metrics",
        [
            {
                "date": "2026-04-22",
                "body_weight_kg": 75.8,
                "fatigue_score": 3,
                "pain_score": 1,
                "daily_note": "恢复正常",
                "metadata": {},
            }
        ],
    )

    payload = client.get(f"/api/load-monitor/day?date={target_date}").get_json()
    assert payload["date"] == target_date
    assert payload["defaults"]["body_weight_kg"] == 75.8
    assert payload["defaults"]["fatigue_score"] == 3.0
    assert payload["defaults"]["pain_score"] == 1.0


def test_training_history_exposes_rpe_and_session_summary(client, supabase_stub):
    today = datetime.now().strftime("%Y-%m-%d")
    supabase_stub.seed(
        "workout_plans",
        [
            {
                "date": today,
                "phase": "单组测试",
                "headers": ["动作", "组数", "次数", "休息"],
                "plan_data": [["深蹲", "1", "5", "90秒"]],
                "remarks": [],
            }
        ],
    )

    start_resp = client.post("/api/start-training", json={"date": today})
    session_payload = start_resp.get_json()
    session_id = session_payload["session"]["session_id"]

    set_resp = client.post(
        "/api/next-set",
        json={
            "session_id": session_id,
            "actual_reps": 5,
            "actual_weight": "100",
            "rpe": 9,
            "notes": "顶组速度稳定",
        },
    )
    assert set_resp.status_code == 200
    assert set_resp.get_json()["status"] == "ready_to_finish"

    finish_resp = client.post(
        "/api/finish-training",
        json={
            "session_id": session_id,
            "notes": "深蹲状态在线，下周继续加重",
            "session_rpe": 8,
        },
    )
    assert finish_resp.status_code == 200

    history = client.get("/api/training-history").get_json()
    assert len(history) == 1
    assert history[0]["exercise_name"] == "深蹲"
    assert history[0]["rpe"] == 9
    assert history[0]["notes"] == "顶组速度稳定"
    assert history[0]["session_notes"] == "深蹲状态在线，下周继续加重"


def test_delete_training_history_session_removes_completed_session(client, supabase_stub):
    today = datetime.now().strftime("%Y-%m-%d")
    supabase_stub.seed(
        "workout_plans",
        [
            {
                "date": today,
                "phase": "删除测试",
                "headers": ["动作", "组数", "次数", "休息"],
                "plan_data": [["深蹲", "1", "5", "90秒"]],
                "remarks": [],
            }
        ],
    )

    start_resp = client.post("/api/start-training", json={"date": today})
    session_id = start_resp.get_json()["session"]["session_id"]

    set_resp = client.post(
        "/api/next-set",
        json={"session_id": session_id, "actual_reps": 5, "actual_weight": "100", "rpe": 8.5},
    )
    assert set_resp.status_code == 200
    assert set_resp.get_json()["status"] == "ready_to_finish"

    finish_resp = client.post(
        "/api/finish-training",
        json={"session_id": session_id, "notes": "完成删除测试", "session_rpe": 7},
    )
    assert finish_resp.status_code == 200

    history = client.get("/api/training-history").get_json()
    assert len(history) == 1

    delete_resp = client.delete(f"/api/training-history/{session_id}")
    assert delete_resp.status_code == 200
    delete_payload = delete_resp.get_json()
    assert delete_payload["status"] == "deleted"
    assert delete_payload["session_id"] == session_id
    assert delete_payload["session_status"] == "completed"
    assert delete_payload["deleted_sets"] == 1

    assert supabase_stub.storage["training_sessions"] == []
    assert supabase_stub.storage["training_sets"] == []

    history = client.get("/api/training-history").get_json()
    assert history == []

    day_payload = client.get(f"/api/load-monitor/day?date={today}").get_json()
    assert day_payload["day_total_load"] == 0.0
    assert day_payload["sessions"] == []


def test_delete_training_history_session_removes_ready_to_finish_session(client, supabase_stub):
    today = datetime.now().strftime("%Y-%m-%d")
    supabase_stub.seed(
        "workout_plans",
        [
            {
                "date": today,
                "phase": "删除未结束训练",
                "headers": ["动作", "组数", "次数", "休息"],
                "plan_data": [["深蹲", "1", "5", "90秒"]],
                "remarks": [],
            }
        ],
    )

    start_resp = client.post("/api/start-training", json={"date": today})
    session_id = start_resp.get_json()["session"]["session_id"]

    set_resp = client.post(
        "/api/next-set",
        json={"session_id": session_id, "actual_reps": 5},
    )
    assert set_resp.status_code == 200
    assert set_resp.get_json()["status"] == "ready_to_finish"

    delete_resp = client.delete(f"/api/training-history/{session_id}")
    assert delete_resp.status_code == 200
    delete_payload = delete_resp.get_json()
    assert delete_payload["session_status"] == "active"

    status = client.get(f"/api/current-session?date={today}").get_json()
    assert status["status"] == "no_session"


def test_rest_day_blocks_training(client, supabase_stub):
    today = datetime.now().strftime("%Y-%m-%d")
    supabase_stub.seed(
        "workout_plans",
        [
            {
                "date": today,
                "phase": "恢复阶段",
                "headers": ["动作", "组数", "次数", "重量", "休息"],
                "plan_data": [["休息", "", "", "", ""]],
                "remarks": ["好好休息"],
            }
        ],
    )

    payload = client.get(f"/api/today-plan?date={today}").get_json()
    assert payload["trackable_exercise_count"] == 0
    assert payload["note_exercise_count"] == 1
    assert payload["is_rest_day"] is True
    assert payload["exercises"][0]["is_trackable"] is False
    assert payload["exercises"][0]["category"] == "rest"

    start_resp = client.post("/api/start-training", json={"date": today})
    assert start_resp.status_code == 400
    assert start_resp.get_json()["error"]


def test_plan_filters_zero_only_rows_and_detects_combination(client, supabase_stub):
    today = datetime.now().strftime("%Y-%m-%d")
    supabase_stub.seed(
        "workout_plans",
        [
            {
                "date": today,
                "phase": "第三周",
                "headers": ["动作", "组数", "次数", "重量", "组间歇"],
                "plan_data": [
                    ["垫铃高拉+短触地跌落跳", "4", "2+4", "80", "180秒"],
                    ["助跑跳箱/扣矮框", "0", "0", "0", "0"],
                    ["筋膜梳理、静态拉伸", "", "", "", ""]
                ],
                "remarks": ["注意组合动作顺序"],
            }
        ],
    )

    payload = client.get(f"/api/today-plan?date={today}").get_json()

    names = [entry["exercise_name"] for entry in payload["exercises"]]
    assert "助跑跳箱/扣矮框" not in names

    combination = next(entry for entry in payload["exercises"] if entry["exercise_name"] == "垫铃高拉+短触地跌落跳")
    assert combination["is_trackable"] is True
    assert combination["is_combination"] is True
    assert combination["components"] == ["垫铃高拉", "短触地跌落跳"]
    assert combination["primary_component"] == "垫铃高拉"
    assert combination["target_rest_seconds"] == 180
    warmup = next(entry for entry in payload["exercises"] if entry["exercise_name"] == "筋膜梳理、静态拉伸")
    assert warmup["is_trackable"] is False
    assert warmup["category"] == "warmup"

    assert payload["trackable_exercise_count"] == 1
    assert payload["note_exercise_count"] == 1
    assert payload["is_rest_day"] is False

    start_resp = client.post("/api/start-training", json={"date": today})
    assert start_resp.status_code == 200
    session_payload = start_resp.get_json()
    assert session_payload["is_combination"] is True
    assert session_payload["components"] == ["垫铃高拉", "短触地跌落跳"]
    assert session_payload["primary_component"] == "垫铃高拉"


def test_zero_rest_is_preserved(client, supabase_stub):
    today = datetime.now().strftime("%Y-%m-%d")
    supabase_stub.seed(
        "workout_plans",
        [
            {
                "date": today,
                "phase": "第30阶段",
                "headers": ["动作", "组数", "次数", "重量", "组间歇"],
                "plan_data": [
                    ["助跑上箱", "3", "3", "", "0秒"],
                    ["上肢训练", "3", "10", "", "180秒"],
                ],
                "remarks": [],
            }
        ],
    )

    payload = client.get(f"/api/today-plan?date={today}").get_json()
    assert payload["exercises"][0]["target_rest_seconds"] == 0

    start_resp = client.post("/api/start-training", json={"date": today})
    assert start_resp.status_code == 200
    session_payload = start_resp.get_json()
    assert session_payload["target_rest_seconds"] == 0

    next_set_payload = client.post(
        "/api/next-set",
        json={"session_id": session_payload["session"]["session_id"], "actual_reps": 3},
    ).get_json()
    assert next_set_payload["status"] == "rest"
    assert next_set_payload["rest_seconds"] == 0
