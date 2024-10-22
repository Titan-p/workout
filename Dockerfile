# 构建阶段
FROM python:3.12-slim-bullseye AS builder

# 设置工作目录
WORKDIR /app

# 只复制必要的文件
COPY requirements.txt .

# 安装依赖并清理缓存
RUN pip install --no-cache-dir -i https://pypi.tuna.tsinghua.edu.cn/simple -r requirements.txt

# 运行阶段
FROM python:3.12-slim-bullseye

# 设置工作目录
WORKDIR /app

# 安装 gunicorn
RUN pip install --no-cache-dir gunicorn

# 从构建阶段复制安装好的依赖
COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages

# 复制应用程序文件
COPY app.py .
COPY templates .

# 暴露端口
EXPOSE 8088

# 运行应用
CMD ["gunicorn", "--bind", "0.0.0.0:8088", "app:app"]
