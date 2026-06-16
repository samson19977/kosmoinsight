FROM python:3.11-slim

WORKDIR /app

# Install system deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev gcc && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt constraints.txt ./
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -c constraints.txt -r requirements.txt

COPY . .

RUN mkdir -p uploads

EXPOSE 8000

# Use $PORT so Render can inject its assigned port
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 2
