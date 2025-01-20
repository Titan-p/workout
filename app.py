from flask import Flask, render_template_string, request, redirect, url_for, flash
import pandas as pd
from datetime import datetime, timedelta
import os
from supabase import create_client, Client
from dotenv import load_dotenv
import io
from functools import wraps
from typing import Optional, Tuple, Dict, Any
import logging

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()

# 配置验证
required_env_vars = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]
missing_vars = [var for var in required_env_vars if not os.getenv(var)]
if missing_vars:
    raise RuntimeError(
        f"Missing required environment variables: {', '.join(missing_vars)}"
    )

app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY", os.urandom(24))


# 配置
class Config:
    SUPABASE_URL = os.getenv("SUPABASE_URL")
    SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    ALLOWED_EXTENSIONS = {"xlsx"}


# Supabase client
try:
    supabase: Client = create_client(Config.SUPABASE_URL, Config.SUPABASE_KEY)
except Exception as e:
    logger.error(f"Failed to initialize Supabase client: {e}")
    raise


def allowed_file(filename: str) -> bool:
    return (
        "." in filename
        and filename.rsplit(".", 1)[1].lower() in Config.ALLOWED_EXTENSIONS
    )


def import_excel_to_db(file) -> bool:
    """将Excel文件数据导入到数据库"""
    try:
        # 读取Excel文件
        excel_data = pd.ExcelFile(file)

        # 清空现有数据（删除所有记录）
        supabase.table("workout_plans").delete().gt("id", 0).execute()

        # 用于批量插入的数据列表
        bulk_insert_data = []

        # 处理每个阶段的工作表
        for sheet_name in excel_data.sheet_names:
            if "阶段" not in sheet_name:
                continue

            try:
                phase_num = int("".join(filter(str.isdigit, sheet_name)))
                if phase_num < 14:  # 只处理第14阶段及以后的数据
                    continue

                df = pd.read_excel(file, sheet_name=sheet_name, header=None)

                # 遍历工作表寻找日期和训练计划
                for row_idx in range(len(df)):
                    for col_idx in range(len(df.columns)):
                        cell_value = str(df.iloc[row_idx, col_idx])
                        if not cell_value or cell_value == "nan":
                            continue

                        # 检查是否是日期（格式：M.D 完成）
                        if "." in cell_value and "完成" in cell_value:
                            date_part = cell_value.split(" ")[0]  # 获取日期部分
                            if all(part.isdigit() for part in date_part.split(".")):
                                # 找到表头行
                                header_row_idx = None
                                for i in range(row_idx - 1, -1, -1):
                                    row_values = df.iloc[i].astype(str).tolist()
                                    if any(
                                        day in row_values
                                        for day in [
                                            "周一",
                                            "周二",
                                            "周三",
                                            "周四",
                                            "周五",
                                            "周六",
                                            "周日",
                                        ]
                                    ):
                                        header_row_idx = i + 1
                                        break

                                if header_row_idx is not None:
                                    # 获取计划内容
                                    headers = df.iloc[
                                        header_row_idx, col_idx : col_idx + 5
                                    ].tolist()
                                    # 将 nan 和 None 转换为空字符串
                                    headers = [
                                        str(h) if pd.notna(h) else "" for h in headers
                                    ]

                                    remarks = (
                                        df.iloc[
                                            header_row_idx + 1, col_idx : col_idx + 6
                                        ]
                                        .dropna()
                                        .tolist()
                                    )
                                    # 确保备注是字符串列表
                                    remarks = [str(r) for r in remarks]

                                    plan_data = df.iloc[
                                        header_row_idx + 2 : row_idx,
                                        col_idx : col_idx + 5,
                                    ].dropna(how="all")
                                    # 将计划数据转换为嵌套列表，并处理 nan 值
                                    plan_data_list = []
                                    for _, row in plan_data.iterrows():
                                        row_data = []
                                        for val in row:
                                            if pd.isna(val):
                                                row_data.append("")
                                            else:
                                                row_data.append(str(val))
                                        plan_data_list.append(row_data)

                                    # 构建当前年份的日期
                                    month, day = map(int, date_part.split("."))
                                    current_year = datetime.now().year
                                    date_str = f"{current_year}-{month:02d}-{day:02d}"

                                    # 添加到批量插入列表
                                    bulk_insert_data.append(
                                        {
                                            "date": date_str,
                                            "phase": sheet_name,
                                            "headers": headers,
                                            "remarks": remarks,
                                            "plan_data": plan_data_list,
                                        }
                                    )

            except ValueError as ve:
                logger.error(f"处理工作表 {sheet_name} 时出错: {ve}")
                continue

        # 批量插入数据
        if bulk_insert_data:
            supabase.table("workout_plans").insert(bulk_insert_data).execute()

        return True
    except Exception as e:
        logger.error(f"导入数据失败: {e}")
        return False


def get_plan_for_date(
    date_str: str,
) -> Tuple[Optional[str], Optional[list], Optional[pd.DataFrame]]:
    """从数据库获取指定日期的训练计划"""
    try:
        response = (
            supabase.table("workout_plans").select("*").eq("date", date_str).execute()
        )

        if not response.data:
            return None, None, None

        plan_data = response.data[0]
        plan_df = pd.DataFrame(plan_data["plan_data"], columns=plan_data["headers"])

        return plan_data["phase"], plan_data["remarks"], plan_df
    except Exception as e:
        logger.error(f"获取训练计划失败: {e}")
        return None, None, None


@app.route("/", methods=["GET"])
def index():
    try:
        date_str = request.args.get("date", datetime.now().strftime("%Y-%m-%d"))
        formatted_date_str = datetime.strptime(date_str, "%Y-%m-%d").strftime("%-m.%-d")

        sheet_name, remarks, plan = get_plan_for_date(date_str)

        message = (
            f"{formatted_date_str} 的训练计划（{sheet_name}）"
            if plan is not None
            else f"{formatted_date_str} 休息日，好好休息吧"
        )

        return render_template_string(
            open("templates/index.html").read(),
            message=message,
            remarks=remarks,
            plan_html=(
                plan.fillna("").to_html(index=False, classes="custom-table")
                if plan is not None
                else ""
            ),
            date_str=date_str,
        )
    except Exception as e:
        logger.error(f"Error in index route: {e}")
        flash("获取训练计划时发生错误", "error")
        return redirect(url_for("upload_file"))


@app.route("/upload", methods=["GET", "POST"])
def upload_file():
    if request.method == "POST":
        file = request.files.get("file")
        if not file or file.filename == "":
            flash("没有选择文件", "error")
            return redirect(request.url)

        if not allowed_file(file.filename):
            flash("不支持的文件类型", "error")
            return redirect(request.url)

        try:
            if import_excel_to_db(file):
                flash("文件导入成功", "success")
                return redirect(url_for("index"))
            else:
                flash("文件导入失败，请检查文件格式", "error")
                return redirect(request.url)
        except Exception as e:
            logger.error(f"Upload failed: {e}")
            flash(f"上传失败: {str(e)}", "error")
            return redirect(request.url)

    return render_template_string(open("templates/upload.html").read())


@app.route("/week", methods=["GET"])
def week_view():
    try:
        # 获取本周的日期范围
        today = datetime.now()
        week_start = today - timedelta(days=today.weekday())
        week_dates = [week_start + timedelta(days=i) for i in range(7)]
        date_strs = [date.strftime("%Y-%m-%d") for date in week_dates]

        # 批量获取一周的训练计划
        response = (
            supabase.table("workout_plans").select("*").in_("date", date_strs).execute()
        )

        # 将结果转换为以日期为键的字典
        plans_by_date = {item["date"]: item for item in response.data}

        # 构建周计划数据
        week_plan = {}
        for date_str in date_strs:
            if date_str in plans_by_date:
                plan_data = plans_by_date[date_str]
                plan_df = pd.DataFrame(
                    plan_data["plan_data"], columns=plan_data["headers"]
                )
                week_plan[date_str] = (
                    plan_data["phase"],
                    plan_data["remarks"],
                    plan_df,
                )
            else:
                week_plan[date_str] = (None, None, None)

        return render_template_string(
            open("templates/week.html").read(), week_plan=week_plan
        )
    except Exception as e:
        logger.error(f"Error in week view: {e}")
        flash("获取周计划时发生错误", "error")
        return redirect(url_for("index"))


if __name__ == "__main__":
    app.run(debug=True)
