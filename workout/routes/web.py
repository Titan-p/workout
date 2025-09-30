from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Dict

from flask import (
    Blueprint,
    current_app,
    flash,
    redirect,
    render_template,
    request,
    url_for,
)

from ..services import get_plan_for_date, get_week_plans, import_excel_to_db

logger = logging.getLogger(__name__)

web_bp = Blueprint("web", __name__)


def allowed_file(filename: str) -> bool:
    allowed_types = current_app.config.get("ALLOWED_EXTENSIONS", set())
    return "." in filename and filename.rsplit(".", 1)[1].lower() in allowed_types


@web_bp.route("/", methods=["GET"])
def index():
    """主页 - 显示指定日期的训练计划"""
    try:
        date_str = request.args.get("date", datetime.now().strftime("%Y-%m-%d"))

        try:
            selected_date = datetime.strptime(date_str, "%Y-%m-%d")
            formatted_date_str = selected_date.strftime("%-m.%-d")
        except ValueError:
            flash("无效的日期格式", "error")
            return redirect(url_for("web.index"))

        sheet_name, remarks, plan = get_plan_for_date(date_str)

        plan_headers = []
        plan_rows = []
        if plan is not None:
            plan_headers = list(plan.columns)
            plan_rows = plan.fillna("").values.tolist()
            message = f"{formatted_date_str} 的训练计划（{sheet_name}）"
        else:
            message = f"{formatted_date_str} 休息日，好好休息吧"

        nav_dates = []
        for i in range(-7, 8):
            nav_date = selected_date + timedelta(days=i)
            nav_dates.append(
                {
                    "date": nav_date.strftime("%Y-%m-%d"),
                    "display": nav_date.strftime("%-m.%-d"),
                    "is_today": nav_date.date() == datetime.now().date(),
                    "is_selected": nav_date.strftime("%Y-%m-%d") == date_str,
                }
            )

        return render_template(
            "index.html",
            message=message,
            remarks=remarks or [],
            plan_headers=plan_headers,
            plan_rows=plan_rows,
            date_str=date_str,
            nav_dates=nav_dates,
            has_plan=plan is not None,
        )
    except Exception as exc:  # pragma: no cover - defensive
        logger.error("主页错误: %s", exc)
        flash("获取训练计划时发生错误", "error")
        return redirect(url_for("web.upload_file"))




@web_bp.route("/training", methods=["GET"])
def training_view():
    date_str = request.args.get("date", datetime.now().strftime("%Y-%m-%d"))
    return render_template("new_index.html", default_rest_interval=90, selected_date=date_str)

@web_bp.route("/upload", methods=["GET", "POST"])
def upload_file():
    """文件上传页面 - 处理Excel文件导入"""
    if request.method == "POST":
        file = request.files.get("file")

        if not file or file.filename == "":
            flash("请选择要上传的文件", "error")
            return redirect(request.url)

        if not allowed_file(file.filename):
            flash("不支持的文件类型，请上传 .xlsx 文件", "error")
            return redirect(request.url)

        file.seek(0, 2)
        file_size = file.tell()
        file.seek(0)

        if file_size > 10 * 1024 * 1024:
            flash("文件过大，请上传小于10MB的文件", "error")
            return redirect(request.url)

        try:
            logger.info(
                "开始导入文件: %s (大小: %.1fKB)", file.filename, file_size / 1024
            )

            if import_excel_to_db(file):
                flash("文件导入成功！已处理训练计划数据", "success")
                logger.info("文件 %s 导入成功", file.filename)
                return redirect(url_for("web.index"))

            flash("文件导入失败，请检查文件格式和内容是否正确", "error")
            logger.warning("文件 %s 导入失败", file.filename)
            return redirect(request.url)

        except Exception as exc:  # pragma: no cover - defensive
            logger.error("文件上传失败: %s", exc)
            flash(f"上传失败: {exc}", "error")
            return redirect(request.url)

    try:
        return render_template("upload.html")
    except Exception as exc:  # pragma: no cover - defensive
        logger.error("上传页面模板未找到: %s", exc)
        return "系统错误：模板文件缺失", 500


@web_bp.route("/week", methods=["GET"])
def week_view():
    """周视图 - 显示本周训练计划"""
    try:
        week_offset = int(request.args.get("week", 0))
        today = datetime.now()
        week_start = today - timedelta(days=today.weekday()) + timedelta(weeks=week_offset)
        week_dates = [week_start + timedelta(days=i) for i in range(7)]
        date_strs = [date.strftime("%Y-%m-%d") for date in week_dates]

        logger.info(
            "获取第 %d 周的训练计划，日期范围: %s 到 %s",
            week_offset,
            date_strs[0],
            date_strs[-1],
        )

        week_plan_raw, training_days = get_week_plans(date_strs)

        week_plan: Dict[str, Dict[str, object]] = {}
        for date_str, data in week_plan_raw.items():
            plan_headers = []
            plan_rows = []
            plan_df = data.get("plan")
            if plan_df is not None:
                plan_headers = list(plan_df.columns)
                plan_rows = plan_df.fillna("").values.tolist()

            render_data = {key: value for key, value in data.items() if key != "plan"}
            render_data.update({"plan_headers": plan_headers, "plan_rows": plan_rows})
            week_plan[date_str] = render_data

        prev_week = week_offset - 1
        next_week = week_offset + 1

        return render_template(
            "week.html",
            week_plan=week_plan,
            current_week_offset=week_offset,
            prev_week=prev_week,
            next_week=next_week,
            training_days=training_days,
        )
    except Exception as exc:  # pragma: no cover - defensive
        logger.error("周视图错误: %s", exc)
        flash("获取周计划时发生错误", "error")
        return redirect(url_for("web.index"))
