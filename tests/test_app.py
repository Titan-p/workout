from datetime import datetime


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
        result = client.post(
            "/api/next-set",
            json=payload,
        ).get_json()
        assert result["status"] in {"rest", "completed"}
        if result["status"] == "rest":
            rest_values.append(result["rest_seconds"])
            assert result["target_rest_seconds"] in {90, 120}
            assert "rest_end_time" in result

    assert result["status"] == "completed"
    assert result["session"]["status"] == "completed"
    assert len(rest_values) == 5
    assert rest_values == [90, 90, 120, 120, 120]

    # history endpoint should now include six entries
    history = client.get("/api/training-history").get_json()
    assert len(history) == 6
    assert {log["exercise_name"] for log in history} == {"深蹲", "硬拉"}
    logged_rests = {log.get("rest_seconds") for log in history}
    assert logged_rests == {45, 90, 120}

    # current session reports completed state
    status = client.get(f"/api/current-session?date={today}").get_json()
    assert status["status"] in {"no_session", "completed"}


def test_finish_training_endpoint(client, supabase_stub):
    today = datetime.now().strftime("%Y-%m-%d")
    seed_plan(supabase_stub, today)

    start_resp = client.post("/api/start-training", json={"date": today})
    session_payload = start_resp.get_json()
    session_id = session_payload["session"]["session_id"]

    finish_resp = client.post("/api/finish-training", json={"session_id": session_id})
    assert finish_resp.status_code == 200
    finish_payload = finish_resp.get_json()
    assert finish_payload["status"] == "completed"
    assert finish_payload["session"]["status"] == "completed"

    status = client.get(f"/api/current-session?date={today}").get_json()
    assert status["status"] in {"no_session", "completed"}


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