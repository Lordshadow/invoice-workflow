# LedgerFlow Enterprise — Deployment & Container Orchestration Guide

This directory contains containerization assets and production deployment configurations for **LedgerFlow Enterprise**.

---

## 1. Quick Start with Docker Compose (Local / On-Premise)

Run the entire pipeline (Backend API, Frontend SPA with NGINX, Primary PostgreSQL DB, Target ERP DB, and Redis Broker) in one command:

### Prerequisites
- Docker Engine 24+ and Docker Compose v2+ (e.g. Docker Desktop on Windows/macOS or Docker CE on Linux)

### Steps

1. **Configure Environment**:
   ```bash
   cp .env.docker.example .env
   ```
   Edit `.env` to include your:
   - `GEMINI_API_KEY` and/or `GROQ_API_KEY`
   - `IMAP_USER` and `IMAP_PASSWORD` (for automated email invoice polling)
   - `SMTP_USER` and `SMTP_PASSWORD` (for 2FA OTP codes)

2. **Launch All Services**:
   ```bash
   docker compose up -d --build
   ```

3. **Access Application**:
   - **Frontend UI & Review Portal**: [http://localhost:3000](http://localhost:3000)
   - **Backend API & Swagger Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)
   - **Primary PostgreSQL Database**: `localhost:5432` (`pipeline_db`)
   - **Target Company ERP Database**: `localhost:5433` (`company_erp_db`)
   - **Redis Event Broker**: `localhost:6379`

4. **Shutdown & Clean Up**:
   ```bash
   docker compose down
   # To remove persistent volumes as well:
   docker compose down -v
   ```

---

## 2. Container Architecture

```
[ Inbound Invoices ]
   (Email / Upload / WhatsApp)
               │
               ▼
   ┌───────────────────────┐
   │  Frontend (Port 3000) │  <-- NGINX Alpine + React 18 / TypeScript
   │  Reverse Proxy Gateway│
   └───────────┬───────────┘
               │ /api/ (Reverse Proxy)
               ▼
   ┌───────────────────────┐
   │  Backend  (Port 8000) │  <-- Python 3.12 Slim + FastAPI + Uvicorn
   │  AI Ingestion Engine  │      (OpenCV, PyMuPDF, PaddleOCR, Groq/Gemini)
   └─────┬───────────┬─────┘
         │           │
         ▼           ▼
   ┌───────────┐   ┌───────────┐   ┌───────────┐
   │Pipeline DB│   │Target ERP │   │   Redis   │
   │(Port 5432)│   │(Port 5433)│   │(Port 6379)│
   └───────────┘   └───────────┘   └───────────┘
```

---

## 3. Production Deployment to Google Cloud Platform (GCP)

### 3.1 Cloud SQL (PostgreSQL 16)
```bash
gcloud sql instances create ledgerflow-db \
    --database-version=POSTGRES_16 \
    --tier=db-custom-2-7680 \
    --region=asia-south1

gcloud sql databases create pipeline_db --instance=ledgerflow-db
gcloud sql databases create company_erp_db --instance=ledgerflow-db
```

### 3.2 Cloud Storage
```bash
gcloud storage buckets create gs://ledgerflow-invoice-docs --location=asia-south1
```

### 3.3 Build & Push to Artifact Registry
```bash
# Create repository
gcloud artifacts repositories create ledgerflow-repo \
    --repository-format=docker \
    --location=asia-south1

# Build and push images
docker build -t asia-south1-docker.pkg.dev/$PROJECT_ID/ledgerflow-repo/backend:latest -f docker/Dockerfile.backend .
docker push asia-south1-docker.pkg.dev/$PROJECT_ID/ledgerflow-repo/backend:latest

docker build -t asia-south1-docker.pkg.dev/$PROJECT_ID/ledgerflow-repo/frontend:latest -f docker/Dockerfile.frontend .
docker push asia-south1-docker.pkg.dev/$PROJECT_ID/ledgerflow-repo/frontend:latest
```

### 3.4 Deploy to Cloud Run
```bash
# Deploy Backend Service
gcloud run deploy ledgerflow-backend \
    --image=asia-south1-docker.pkg.dev/$PROJECT_ID/ledgerflow-repo/backend:latest \
    --region=asia-south1 \
    --platform=managed \
    --memory=2Gi \
    --cpu=2 \
    --min-instances=1 \
    --max-instances=10 \
    --set-env-vars="STP_DEFAULT_ENABLED=true,ENABLE_2FA=true"

# Deploy Frontend Gateway
gcloud run deploy ledgerflow-frontend \
    --image=asia-south1-docker.pkg.dev/$PROJECT_ID/ledgerflow-repo/frontend:latest \
    --region=asia-south1 \
    --platform=managed \
    --allow-unauthenticated
```
