from flask import Flask, render_template_string, request, redirect, url_for
import pandas as pd
from datetime import datetime, timedelta
import os

app = Flask(__name__)

# Configurations
FILE_PATH = "./workout.xlsx"
UPLOAD_FOLDER = './'
ALLOWED_EXTENSIONS = {'xlsx'}
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# Global variables for caching Excel data
excel_data = None
phase_sheets = None

# Utility Functions
def load_excel_data():
    global excel_data, phase_sheets
    excel_data = pd.ExcelFile(FILE_PATH)
    phase_sheets = {name: pd.read_excel(FILE_PATH, sheet_name=name, header=None)
                    for name in excel_data.sheet_names if "阶段" in name}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def get_plan_for_date(date_str):
    """Fetch the workout plan for a specific date."""
    for sheet_name, df in phase_sheets.items():
        # Locate the date
        match = df.apply(lambda row: row.astype(str).str.contains(date_str, na=False), axis=1)

        if not match.any().any():
            continue

        row_index, col_index = match.stack().idxmax()

        header_row_index = None
        for i in range(row_index - 1, -1, -1):
            row_values = df.iloc[i].astype(str).tolist()
            if any(day in row_values for day in ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]):
                header_row_index = i + 1
                break

        if header_row_index is None:
            return None, None, None

        plan = df.iloc[header_row_index + 2: row_index, col_index: col_index + 5].dropna(how="all")
        headers = df.iloc[header_row_index, col_index: col_index + 5].tolist()
        plan.columns = headers

        # Remove rows with all zeros
        plan = plan[(plan != 0).any(axis=1)]

        remarks = df.iloc[header_row_index + 1, col_index: col_index + 6].dropna().tolist()

        return sheet_name, remarks, plan

    return None, None, None

def get_current_week_dates():
    today = datetime.now().date()
    monday = today - timedelta(days=today.weekday())
    return [monday + timedelta(days=i) for i in range(7)]

def get_week_plan(start_date):
    """Get workout plans for a week starting from the given date."""
    week_plan = {}
    for i in range(7):
        date = start_date + pd.Timedelta(days=i)
        date_str = date.strftime("%-m.%-d")
        sheet_name, remarks, plan = get_plan_for_date(date_str)
        week_plan[date.strftime("%Y-%m-%d")] = {
            "date": date_str,
            "sheet_name": sheet_name,
            "remarks": remarks,
            "plan": plan
        }
    return week_plan

# Routes
@app.route('/upload', methods=['GET', 'POST'])
def upload_file():
    if request.method == 'POST':
        file = request.files.get('file')
        if not file or file.filename == '':
            return '没有选择文件'
        if file and allowed_file(file.filename):
            file.save(os.path.join(app.config['UPLOAD_FOLDER'], 'workout.xlsx'))
            load_excel_data()
            return redirect(url_for('index'))
    return render_template_string(open("templates/upload.html").read())

@app.route("/", methods=["GET"])
def index():
    if not os.path.exists(FILE_PATH):
        return redirect(url_for('upload_file'))
    date_str = request.args.get("date", datetime.now().strftime("%Y-%m-%d"))
    formatted_date_str = datetime.strptime(date_str, "%Y-%m-%d").strftime("%-m.%-d")

    sheet_name, remarks, plan = get_plan_for_date(formatted_date_str)

    message = f"{formatted_date_str} 的训练计划（{sheet_name}）" if plan is not None else f"{formatted_date_str} 休息日，好好休息吧"
    return render_template_string(
        open("templates/index.html").read(),
        message=message,
        remarks=remarks,
        plan_html=plan.fillna("").to_html(index=False, classes="custom-table") if plan is not None else "",
        date_str=date_str
    )

@app.route("/week", methods=["GET"])
def week_view():
    if not os.path.exists(FILE_PATH):
        return redirect(url_for('upload_file'))
    week_dates = get_current_week_dates()
    week_plan = {date.strftime("%Y-%m-%d"): get_plan_for_date(date.strftime("%-m.%-d")) for date in week_dates}
    return render_template_string(
        open("templates/week.html").read(),
        week_plan=week_plan
    )

# Initialize the application
def initialize_app():
    if os.path.exists(FILE_PATH):
        load_excel_data()

if __name__ == "__main__":
    initialize_app()
    app.run(host="0.0.0.0", port=8088)
