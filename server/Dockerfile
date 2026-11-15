FROM python:3.11-slim
WORKDIR /app
COPY server/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY server/app ./app
COPY content ./content
ENV CONTENT_DIR=/app/content PORT=8000 DEV_MODE=0 MOCK_SPEECH=0
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "172.16.0.0/12,10.0.0.0/8,192.168.0.0/16", "--ws-ping-interval", "20", "--ws-ping-timeout", "20"]
