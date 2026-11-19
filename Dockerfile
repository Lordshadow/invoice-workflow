# ==============================================================================
# LedgerFlow Enterprise - Multi-Stage Production Backend Dockerfile
# Base: Python 3.12 Slim (Debian Bookworm)
# Portability: Containerized Run Anywhere (GCP Cloud Run, AWS ECS, Docker Compose)
# ==============================================================================
FROM python:3.12-slim-bookworm AS base

# Environment Settings
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PORT=8000

# Install native OS dependencies required by OpenCV, PyMuPDF, and PaddleOCR
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies first for optimal Docker layer caching
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

# Copy backend application source code
COPY backend /app/backend

# Copy project sample files for out-of-the-box demo & benchmark evaluation
COPY samples /app/samples

# Create persistent storage directories
RUN mkdir -p /app/data /app/uploads /app/temp

# Create non-root user for enterprise container security
RUN useradd -m -u 1000 appuser && \
    chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

# Container Healthcheck verifying FastAPI availability
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:8000/api/v1/invoices/escalation-stats || exit 1

# Launch production ASGI server via Uvicorn (supports Cloud Run dynamic $PORT)
CMD ["sh", "-c", "exec uvicorn backend.app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
