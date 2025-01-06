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
    BUCKET_NAME = os.getenv("SUPABASE_BUCKET_NAME", "workout-files")
    FILE_NAME = "workout.xlsx"
    ALLOWED_EXTENSIONS = {"xlsx"}
    CACHE_TIMEOUT = 3600  # 1小时缓存过期


config = Config()

# Supabase client
try:
    supabase: Client = create_client(config.SUPABASE_URL, config.SUPABASE_KEY)
except Exception as e:
    logger.error(f"Failed to initialize Supabase client: {e}")
    raise


# 缓存类
class ExcelCache:
    def __init__(self):
        self.excel_data = None
        self.phase_sheets = {}
        self.last_update = None

    def is_expired(self) -> bool:
        if not self.last_update:
            return True
        return (
            datetime.now() - self.last_update
        ).total_seconds() > Config.CACHE_TIMEOUT

    def clear(self):
        self.excel_data = None
        self.phase_sheets = {}
        self.last_update = None


cache = ExcelCache()


# 装饰器：确保数据已加载
def require_excel_data(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not cache.excel_data or cache.is_expired():
            success = load_excel_data()
            if not success:
                flash("无法加载训练数据，请重新上传文件", "error")
                return redirect(url_for("upload_file"))
        return f(*args, **kwargs)

    return decorated_function


# Utility Functions
def load_excel_data() -> bool:
    try:
        # 从 Supabase 获取文件
        response = supabase.storage.from_(config.BUCKET_NAME).download(config.FILE_NAME)
        cache.excel_data = pd.ExcelFile(io.BytesIO(response))

        cache.phase_sheets.clear()
        for name in cache.excel_data.sheet_names:
            if "阶段" in name:
                try:
                    phase_num = int("".join(filter(str.isdigit, name)))
                    if phase_num >= 13:
                        cache.phase_sheets[name] = pd.read_excel(
                            io.BytesIO(response), sheet_name=name, header=None
                        )
                except ValueError:
                    continue

        cache.last_update = datetime.now()
        return True
    except Exception as e:
        logger.error(f"Error loading excel data: {e}")
        cache.clear()
        return False


def allowed_file(filename: str) -> bool:
    return (
        "." in filename
        and filename.rsplit(".", 1)[1].lower() in config.ALLOWED_EXTENSIONS
    )


def get_plan_for_date(
    date_str: str,
) -> Tuple[Optional[str], Optional[list], Optional[pd.DataFrame]]:
    """Fetch the workout plan for a specific date."""
    for sheet_name, df in cache.phase_sheets.items():
        # Locate the date
        match = df.apply(
            lambda row: row.astype(str).str.contains(date_str, na=False), axis=1
        )

        if not match.any().any():
            continue

        row_index, col_index = match.stack().idxmax()

        header_row_index = None
        for i in range(row_index - 1, -1, -1):
            row_values = df.iloc[i].astype(str).tolist()
            if any(
                day in row_values
                for day in ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]
            ):
                header_row_index = i + 1
                break

        if header_row_index is None:
            return None, None, None

        plan = df.iloc[
            header_row_index + 2 : row_index, col_index : col_index + 5
        ].dropna(how="all")
        headers = df.iloc[header_row_index, col_index : col_index + 5].tolist()
        plan.columns = headers

        # Remove rows with all zeros
        plan = plan[(plan != 0).any(axis=1)]

        remarks = (
            df.iloc[header_row_index + 1, col_index : col_index + 6].dropna().tolist()
        )

        return sheet_name, remarks, plan

    return None, None, None


# Routes
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
            # 上传文件到 Supabase Storage
            response = supabase.storage.from_(config.BUCKET_NAME).update(
                path=config.FILE_NAME,
                file=file.read(),
                file_options={
                    "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    # "upsert": True,
                },
            )

            cache.clear()  # 清除缓存
            if load_excel_data():
                flash("文件上传成功", "success")
                return redirect(url_for("index"))
            else:
                flash("文件上传成功但加载失败，请检查文件格式", "error")
                return redirect(request.url)

        except Exception as e:
            logger.error(f"Upload failed: {e}")
            flash(f"上传失败: {str(e)}", "error")
            return redirect(request.url)

    return render_template_string(open("templates/upload.html").read())


@app.route("/", methods=["GET"])
@require_excel_data
def index():
    try:
        date_str = request.args.get("date", datetime.now().strftime("%Y-%m-%d"))
        formatted_date_str = datetime.strptime(date_str, "%Y-%m-%d").strftime("%-m.%-d")

        sheet_name, remarks, plan = get_plan_for_date(formatted_date_str)

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


@app.route("/week", methods=["GET"])
@require_excel_data
def week_view():
    try:
        week_dates = get_current_week_dates()
        week_plan = {
            date.strftime("%Y-%m-%d"): get_plan_for_date(date.strftime("%-m.%-d"))
            for date in week_dates
        }
        return render_template_string(
            open("templates/week.html").read(), week_plan=week_plan
        )
    except Exception as e:
        logger.error(f"Error in week view: {e}")
        flash("获取周计划时发生错误", "error")
        return redirect(url_for("index"))


def get_current_week_dates():
    today = datetime.now().date()
    monday = today - timedelta(days=today.weekday())
    return [monday + timedelta(days=i) for i in range(7)]


# 错误处理
@app.errorhandler(Exception)
def handle_error(error):
    logger.error(f"Unhandled error: {error}")
    flash("发生未知错误", "error")
    return redirect(url_for("index"))


# Initialize the application
def initialize_app():
    try:
        load_excel_data()
    except Exception as e:
        logger.error(f"Failed to initialize app: {e}")


if __name__ == "__main__":
    initialize_app()
    app.run(debug=True)
