from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd

from ..extensions import get_supabase

logger = logging.getLogger(__name__)


def import_excel_to_db(file) -> bool:
    """将Excel文件数据导入到数据库 - 优化版本"""
    supabase = get_supabase()
    try:
        excel_data = pd.ExcelFile(file)
        valid_sheets = [sheet for sheet in excel_data.sheet_names if "阶段" in sheet]
        if not valid_sheets:
            logger.warning("未找到包含'阶段'的工作表")
            return False

        logger.info("找到 %d 个有效工作表: %s", len(valid_sheets), valid_sheets)

        delete_result = supabase.table("workout_plans").delete().gt("id", 0).execute()
        deleted_rows = len(delete_result.data) if delete_result.data else 0
        logger.info("已清空现有数据，删除了 %d 条记录", deleted_rows)

        bulk_insert_data: List[Dict[str, Any]] = []
        processed_count = 0

        for sheet_name in valid_sheets:
            try:
                phase_num_match = "".join(filter(str.isdigit, sheet_name))
                if not phase_num_match:
                    logger.warning("工作表 %s 无法提取阶段数字，跳过", sheet_name)
                    continue

                phase_num = int(phase_num_match)
                if phase_num < 14:
                    logger.info("跳过阶段 %d (小于14)", phase_num)
                    continue

                df = pd.read_excel(file, sheet_name=sheet_name, header=None)
                logger.info("处理工作表: %s (阶段 %d), 数据行数: %d", sheet_name, phase_num, len(df))

                found_dates = 0
                for row_idx in range(len(df)):
                    for col_idx in range(len(df.columns)):
                        cell_value = str(df.iloc[row_idx, col_idx])
                        if not cell_value or cell_value == "nan":
                            continue

                        if "." in cell_value and "完成" in cell_value:
                            date_part = cell_value.split(" ")[0]
                            if not all(part.isdigit() for part in date_part.split(".")):
                                continue

                            header_row_idx = find_header_row(df, row_idx)
                            if header_row_idx is None:
                                logger.warning("在 %s 的行 %d 未找到表头，跳过", sheet_name, row_idx)
                                continue

                            plan_data = extract_plan_data(df, header_row_idx, row_idx, col_idx)
                            if plan_data and plan_data["plan_data"]:
                                bulk_insert_data.append(plan_data)
                                found_dates += 1
                                processed_count += 1

                                if len(bulk_insert_data) >= 50:
                                    insert_batch(supabase, bulk_insert_data)
                                    bulk_insert_data = []

                logger.info("工作表 %s 找到 %d 个有效日期", sheet_name, found_dates)

            except ValueError as err:
                logger.error("处理工作表 %s 时出错: %s", sheet_name, err)
                continue
            except Exception as exc:  # pragma: no cover - defensive
                logger.error("处理工作表 %s 时发生未预期错误: %s", sheet_name, exc)
                continue

        if bulk_insert_data:
            insert_batch(supabase, bulk_insert_data)

        logger.info("数据导入完成，共处理 %d 条记录", processed_count)
        return processed_count > 0

    except Exception as exc:  # pragma: no cover - defensive
        logger.error("导入数据失败: %s", exc)
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
        headers = df.iloc[header_row_idx, col_idx : col_idx + 5].tolist()
        headers = [str(h) if pd.notna(h) else "" for h in headers]

        remarks = df.iloc[header_row_idx + 1, col_idx : col_idx + 6].dropna().tolist()
        remarks = [str(r) for r in remarks]

        plan_data = df.iloc[header_row_idx + 2 : date_row_idx, col_idx : col_idx + 5]
        plan_data_list = []
        for _, row in plan_data.iterrows():
            row_data = [str(val).strip() if pd.notna(val) else "" for val in row]
            # Skip rows where all values are '' or '0'
            if all(value.strip() in {"", "0"} for value in row_data):
                continue
            plan_data_list.append(row_data)

        date_cell = str(df.iloc[date_row_idx, col_idx])
        date_part = date_cell.split(" ")[0]
        month, day = map(int, date_part.split("."))
        current_year = datetime.now().year
        date_str = f"{current_year}-{month:02d}-{day:02d}"

        phase_val = df.iloc[header_row_idx - 1, 0] if header_row_idx > 0 else "未知阶段"
        return {
            "date": date_str,
            "phase": phase_val if pd.notna(phase_val) else None,
            "headers": headers,
            "remarks": remarks,
            "plan_data": plan_data_list,
        }
    except Exception as exc:  # pragma: no cover - defensive
        logger.error("提取计划数据失败: %s", exc)
        return None


def insert_batch(supabase, data_list):
    """批量插入数据"""
    try:
        if not data_list:
            return
        normalized = []
        for entry in data_list:
            clean_entry = {
                "date": entry.get("date"),
                "phase": entry.get("phase"),
                "headers": [str(header) for header in entry.get("headers", [])],
                "remarks": [str(remark) for remark in entry.get("remarks", [])],
                "plan_data": [
                    ["" if cell is None else str(cell) for cell in row]
                    for row in entry.get("plan_data", [])
                ],
            }
            normalized.append(clean_entry)

        supabase.table("workout_plans").insert(normalized).execute()
        logger.info("批量插入 %d 条记录成功", len(data_list))
    except Exception as exc:  # pragma: no cover - defensive
        logger.error("批量插入失败: %s", exc)
        try:
            sample = data_list[0] if data_list else {}
            logger.error(
                "失败批次信息: 条目数=%d, 示例记录=%s",
                len(data_list),
                sample,
            )
        except Exception as sample_exc:  # pragma: no cover - defensive
            logger.exception("记录批次示例失败: %s", sample_exc)


def get_plan_for_date(
    date_str: str,
) -> Tuple[Optional[str], Optional[List[str]], Optional[pd.DataFrame]]:
    """从数据库获取指定日期的训练计划 - 优化版本"""
    supabase = get_supabase()
    try:
        try:
            datetime.strptime(date_str, "%Y-%m-%d")
        except ValueError:
            logger.error("无效的日期格式: %s", date_str)
            return None, None, None

        response = supabase.table("workout_plans").select("*").eq("date", date_str).execute()

        if not response.data:
            logger.info("未找到日期 %s 的训练计划", date_str)
            return None, None, None

        plan_data = response.data[0]
        plan_df = pd.DataFrame(plan_data["plan_data"], columns=plan_data["headers"])

        logger.info("成功获取 %s 的训练计划: %s", date_str, plan_data["phase"])
        return plan_data["phase"], plan_data["remarks"], plan_df
    except Exception as exc:  # pragma: no cover - defensive
        logger.error("获取训练计划失败: %s", exc)
        return None, None, None


def get_week_plans(date_strs: List[str]) -> Tuple[Dict[str, Dict[str, Any]], int]:
    """批量获取一周训练计划并组装结果。"""
    supabase = get_supabase()
    response = supabase.table("workout_plans").select("*").in_("date", date_strs).execute()

    plans_by_date: Dict[str, Dict[str, Any]] = {
        item["date"]: item for item in response.data or []
    }

    week_plan: Dict[str, Dict[str, Any]] = {}
    training_days = 0

    for idx, date_str in enumerate(date_strs):
        date_obj = datetime.strptime(date_str, "%Y-%m-%d")
        day_name = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"][idx]

        if date_str in plans_by_date:
            plan_data = plans_by_date[date_str]
            plan_df = pd.DataFrame(plan_data["plan_data"], columns=plan_data["headers"])
            week_plan[date_str] = {
                "day_name": day_name,
                "date_obj": date_obj,
                "phase": plan_data["phase"],
                "remarks": plan_data["remarks"],
                "plan": plan_df,
                "has_plan": True,
            }
            training_days += 1
        else:
            week_plan[date_str] = {
                "day_name": day_name,
                "date_obj": date_obj,
                "phase": None,
                "remarks": [],
                "plan": None,
                "has_plan": False,
            }

    return week_plan, training_days
