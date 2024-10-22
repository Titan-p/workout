# Dockerfile

FROM python:3.12

# Set the working directory
WORKDIR /app

# Copy the current directory contents into the container
COPY . /app

# Install the required packages using the Tsinghua mirror
RUN pip install -i https://pypi.tuna.tsinghua.edu.cn/simple flask pandas openpyxl

# Expose the port the app runs on
EXPOSE 8088

# Command to run the application
CMD ["python", "app.py"]
