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
    """将Excel文件数据导入到数据库 - 优化版本"""
    try:
        # 读取Excel文件
        excel_data = pd.ExcelFile(file)

        # 验证工作表
        valid_sheets = [sheet for sheet in excel_data.sheet_names if "阶段" in sheet]
        if not valid_sheets:
            logger.warning("未找到包含'阶段'的工作表")
            return False

        logger.info(f"找到 {len(valid_sheets)} 个有效工作表: {valid_sheets}")

        # 清空现有数据（删除所有记录）
        delete_result = supabase.table("workout_plans").delete().gt("id", 0).execute()
        logger.info(f"已清空现有数据，删除了 {len(delete_result.data) if delete_result.data else 0} 条记录")

        # 用于批量插入的数据列表
        bulk_insert_data = []
        processed_count = 0

        # 处理每个阶段的工作表
        for sheet_name in valid_sheets:
            try:
                # 提取阶段数字
                phase_num_match = "".join(filter(str.isdigit, sheet_name))
                if not phase_num_match:
                    logger.warning(f"工作表 {sheet_name} 无法提取阶段数字，跳过")
                    continue

                phase_num = int(phase_num_match)
                if phase_num < 14:  # 只处理第14阶段及以后的数据
                    logger.info(f"跳过阶段 {phase_num} (小于14)")
                    continue

                df = pd.read_excel(file, sheet_name=sheet_name, header=None)
                logger.info(f"处理工作表: {sheet_name} (阶段 {phase_num}), 数据行数: {len(df)}")

                # 查找所有日期和对应的训练计划
                found_dates = 0
                for row_idx in range(len(df)):
                    for col_idx in range(len(df.columns)):
                        cell_value = str(df.iloc[row_idx, col_idx])
                        if not cell_value or cell_value == "nan":
                            continue

                        # 检查是否是日期（格式：M.D 完成）
                        if "." in cell_value and "完成" in cell_value:
                            date_part = cell_value.split(" ")[0]  # 获取日期部分
                            if not all(part.isdigit() for part in date_part.split(".")):
                                continue

                            # 找到表头行
                            header_row_idx = find_header_row(df, row_idx)
                            if header_row_idx is None:
                                logger.warning(f"在 {sheet_name} 的行 {row_idx} 未找到表头，跳过")
                                continue

                            # 提取计划数据
                            plan_data = extract_plan_data(df, header_row_idx, row_idx, col_idx)
                            if plan_data and plan_data["plan_data"]:
                                bulk_insert_data.append(plan_data)
                                found_dates += 1
                                processed_count += 1

                                # 批量插入，避免内存占用过大
                                if len(bulk_insert_data) >= 50:
                                    insert_batch(bulk_insert_data)
                                    bulk_insert_data = []

                logger.info(f"工作表 {sheet_name} 找到 {found_dates} 个有效日期")

            except ValueError as ve:
                logger.error(f"处理工作表 {sheet_name} 时出错: {ve}")
                continue
            except Exception as e:
                logger.error(f"处理工作表 {sheet_name} 时发生未预期错误: {e}")
                continue

        # 插入剩余数据
        if bulk_insert_data:
            insert_batch(bulk_insert_data)

        logger.info(f"数据导入完成，共处理 {processed_count} 条记录")
        return processed_count > 0

    except Exception as e:
        logger.error(f"导入数据失败: {e}")
        return False


def find_header_row(df, date_row_idx):
    """查找包含星期几的表头行"""
    for i in range(date_row_idx - 1, -1, -1):
        row_values = df.iloc[i].astype(str).tolist()
        if any(day in row_values for day in ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]):
            return i + 1
    return None


def extract_plan_data(df, header_row_idx, date_row_idx, col_idx):
    """提取训练计划数据"""
    try:
        # 获取表头
        headers = df.iloc[header_row_idx, col_idx : col_idx + 5].tolist()
        headers = [str(h) if pd.notna(h) else "" for h in headers]

        # 获取备注
        remarks = df.iloc[header_row_idx + 1, col_idx : col_idx + 6].dropna().tolist()
        remarks = [str(r) for r in remarks]

        # 获取计划内容
        plan_data = df.iloc[header_row_idx + 2 : date_row_idx, col_idx : col_idx + 5].dropna(how="all")
        plan_data_list = []
        for _, row in plan_data.iterrows():
            row_data = [str(val) if pd.notna(val) else "" for val in row]
            plan_data_list.append(row_data)

        # 解析日期
        date_cell = str(df.iloc[date_row_idx, col_idx])
        date_part = date_cell.split(" ")[0]
        month, day = map(int, date_part.split("."))
        current_year = datetime.now().year
        date_str = f"{current_year}-{month:02d}-{day:02d}"

        return {
            "date": date_str,
            "phase": df.iloc[header_row_idx - 1, 0] if header_row_idx > 0 else "未知阶段",
            "headers": headers,
            "remarks": remarks,
            "plan_data": plan_data_list,
        }
    except Exception as e:
        logger.error(f"提取计划数据失败: {e}")
        return None


def insert_batch(data_list):
    """批量插入数据"""
    try:
        if not data_list:
            return
        result = supabase.table("workout_plans").insert(data_list).execute()
        logger.info(f"批量插入 {len(data_list)} 条记录成功")
        return result
    except Exception as e:
        logger.error(f"批量插入失败: {e}")
        return None


def get_plan_for_date(
    date_str: str,
) -> Tuple[Optional[str], Optional[list], Optional[pd.DataFrame]]:
    """从数据库获取指定日期的训练计划 - 优化版本"""
    try:
        # 验证日期格式
        try:
            datetime.strptime(date_str, "%Y-%m-%d")
        except ValueError:
            logger.error(f"无效的日期格式: {date_str}")
            return None, None, None

        response = (
            supabase.table("workout_plans").select("*").eq("date", date_str).execute()
        )

        if not response.data:
            logger.info(f"未找到日期 {date_str} 的训练计划")
            return None, None, None

        plan_data = response.data[0]
        plan_df = pd.DataFrame(plan_data["plan_data"], columns=plan_data["headers"])

        logger.info(f"成功获取 {date_str} 的训练计划: {plan_data['phase']}")
        return plan_data["phase"], plan_data["remarks"], plan_df
    except Exception as e:
        logger.error(f"获取训练计划失败: {e}")
        return None, None, None


@app.route("/", methods=["GET"])
def index():
    """主页 - 显示指定日期的训练计划"""
    try:
        # 获取日期参数，默认为今天
        date_str = request.args.get("date", datetime.now().strftime("%Y-%m-%d"))

        # 验证日期格式
        try:
            selected_date = datetime.strptime(date_str, "%Y-%m-%d")
            formatted_date_str = selected_date.strftime("%-m.%-d")
        except ValueError:
            flash("无效的日期格式", "error")
            return redirect(url_for("index"))

        # 获取训练计划
        sheet_name, remarks, plan = get_plan_for_date(date_str)

        # 构建消息
        if plan is not None:
            message = f"{formatted_date_str} 的训练计划（{sheet_name}）"
            plan_html = plan.fillna("").to_html(index=False, classes="custom-table")
        else:
            message = f"{formatted_date_str} 休息日，好好休息吧"
            plan_html = ""

        # 获取导航日期（前后7天）
        nav_dates = []
        for i in range(-7, 8):
            nav_date = selected_date + timedelta(days=i)
            nav_dates.append({
                'date': nav_date.strftime("%Y-%m-%d"),
                'display': nav_date.strftime("%-m.%-d"),
                'is_today': nav_date.date() == datetime.now().date(),
                'is_selected': nav_date.strftime("%Y-%m-%d") == date_str
            })

        return render_template_string(
            open("templates/index.html").read(),
            message=message,
            remarks=remarks or [],
            plan_html=plan_html,
            date_str=date_str,
            nav_dates=nav_dates,
            has_plan=plan is not None
        )
    except FileNotFoundError:
        logger.error("模板文件未找到")
        flash("系统错误：模板文件缺失", "error")
        return "系统错误，请联系管理员", 500
    except Exception as e:
        logger.error(f"主页错误: {e}")
        flash("获取训练计划时发生错误", "error")
        return redirect(url_for("upload_file"))


@app.route("/upload", methods=["GET", "POST"])
def upload_file():
    """文件上传页面 - 处理Excel文件导入"""
    if request.method == "POST":
        file = request.files.get("file")

        # 文件验证
        if not file or file.filename == "":
            flash("请选择要上传的文件", "error")
            return redirect(request.url)

        if not allowed_file(file.filename):
            flash(f"不支持的文件类型，请上传 .xlsx 文件", "error")
            return redirect(request.url)

        # 文件大小检查 (10MB限制)
        file.seek(0, 2)  # 移动到文件末尾
        file_size = file.tell()
        file.seek(0)  # 重置文件指针

        if file_size > 10 * 1024 * 1024:  # 10MB
            flash("文件过大，请上传小于10MB的文件", "error")
            return redirect(request.url)

        try:
            # 导入数据
            logger.info(f"开始导入文件: {file.filename} (大小: {file_size/1024:.1f}KB)")

            if import_excel_to_db(file):
                flash(f"文件导入成功！已处理训练计划数据", "success")
                logger.info(f"文件 {file.filename} 导入成功")
                return redirect(url_for("index"))
            else:
                flash("文件导入失败，请检查文件格式和内容是否正确", "error")
                logger.warning(f"文件 {file.filename} 导入失败")
                return redirect(request.url)

        except Exception as e:
            logger.error(f"文件上传失败: {e}")
            flash(f"上传失败: {str(e)}", "error")
            return redirect(request.url)

    # GET 请求 - 显示上传页面
    try:
        return render_template_string(open("templates/upload.html").read())
    except FileNotFoundError:
        logger.error("上传页面模板未找到")
        return "系统错误：模板文件缺失", 500


@app.route("/week", methods=["GET"])
def week_view():
    """周视图 - 显示本周训练计划"""
    try:
        # 获取日期参数，默认为本周
        week_offset = int(request.args.get("week", 0))
        today = datetime.now()
        week_start = today - timedelta(days=today.weekday()) + timedelta(weeks=week_offset)
        week_dates = [week_start + timedelta(days=i) for i in range(7)]
        date_strs = [date.strftime("%Y-%m-%d") for date in week_dates]

        logger.info(f"获取第 {week_offset} 周的训练计划，日期范围: {date_strs[0]} 到 {date_strs[-1]}")

        # 批量获取一周的训练计划
        response = (
            supabase.table("workout_plans").select("*").in_("date", date_strs).execute()
        )

        if not response.data:
            logger.info("本周没有训练计划数据")

        # 将结果转换为以日期为键的字典
        plans_by_date = {item["date"]: item for item in response.data}

        # 构建周计划数据
        week_plan = {}
        training_days = 0
        for i, date_str in enumerate(date_strs):
            date_obj = datetime.strptime(date_str, "%Y-%m-%d")
            day_name = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"][i]

            if date_str in plans_by_date:
                plan_data = plans_by_date[date_str]
                plan_df = pd.DataFrame(
                    plan_data["plan_data"], columns=plan_data["headers"]
                )
                week_plan[date_str] = {
                    "day_name": day_name,
                    "date_obj": date_obj,
                    "phase": plan_data["phase"],
                    "remarks": plan_data["remarks"],
                    "plan": plan_df,
                    "has_plan": True
                }
                training_days += 1
            else:
                week_plan[date_str] = {
                    "day_name": day_name,
                    "date_obj": date_obj,
                    "phase": None,
                    "remarks": [],
                    "plan": None,
                    "has_plan": False
                }

        logger.info(f"本周共有 {training_days} 天训练计划")

        # 计算导航周
        prev_week = week_offset - 1
        next_week = week_offset + 1

        return render_template_string(
            open("templates/week.html").read(),
            week_plan=week_plan,
            current_week_offset=week_offset,
            prev_week=prev_week,
            next_week=next_week,
            training_days=training_days
        )
    except FileNotFoundError:
        logger.error("周视图模板未找到")
        flash("系统错误：模板文件缺失", "error")
        return "系统错误，请联系管理员", 500
    except Exception as e:
        logger.error(f"周视图错误: {e}")
        flash("获取周计划时发生错误", "error")
        return redirect(url_for("index"))


if __name__ == "__main__":
    app.run(debug=True)
