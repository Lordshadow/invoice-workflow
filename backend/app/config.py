"""
Configuration and environment settings for the Invoice Processing Backend.
Supports both Google Gemini API (local testing) and GCP Vertex AI (production).
"""
import os
from pathlib import Path
from dotenv import load_dotenv
from pydantic import BaseModel, Field

# Load .env file from project root or backend folder
env_path = Path(__file__).resolve().parent.parent.parent / ".env"
load_dotenv(dotenv_path=env_path)


class Settings(BaseModel):
    APP_NAME: str = "AI Invoice Processing Engine"
    API_V1_PREFIX: str = "/api/v1"
    DEBUG: bool = Field(default_factory=lambda: os.getenv("DEBUG", "true").lower() in ("true", "1", "yes"))
    LOG_LEVEL: str = Field(default_factory=lambda: os.getenv("LOG_LEVEL", "DEBUG"))

    # Upload and temp file settings
    UPLOAD_DIR: Path = Path(os.getenv("UPLOAD_DIR", "uploads"))
    TEMP_DIR: Path = Path(os.getenv("TEMP_DIR", "tmp"))
    MAX_FILE_SIZE_BYTES: int = 25 * 1024 * 1024  # 25 MB

    # Preprocessing thresholds
    PDF_DPI: int = 300
    TEXT_DENSITY_THRESHOLD_CHARS: int = 80
    DESKEW_MAX_ANGLE: float = 45.0
    ENABLE_QR_SCANNER: bool = Field(
        default_factory=lambda: os.getenv("ENABLE_QR_SCANNER", "true").lower() in ("true", "1", "yes")
    )

    # 1. Gemini Developer API Configuration (Local Testing)
    GEMINI_API_KEY: str = Field(default_factory=lambda: os.getenv("GEMINI_API_KEY", "").strip())

    # 2. GCP Vertex AI Configuration (Cloud Production)
    USE_VERTEX_AI: bool = Field(
        default_factory=lambda: os.getenv("USE_VERTEX_AI", "false").lower() in ("true", "1", "yes")
    )
    GCP_PROJECT_ID: str = Field(default_factory=lambda: os.getenv("GCP_PROJECT_ID", "").strip())
    GCP_LOCATION: str = Field(default_factory=lambda: os.getenv("GCP_LOCATION", "asia-south1").strip())

    # 3. Model Configuration
    GEMINI_MODEL_NAME: str = Field(
        default_factory=lambda: os.getenv("GEMINI_MODEL_NAME", "gemini-3.7-flash").strip()
    )

    # Database Settings
    DATA_DIR: Path = Path(os.getenv("DATA_DIR", "data"))
    DATABASE_URL: str = Field(
        default_factory=lambda: os.getenv("DATABASE_URL", "sqlite:///./data/invoice_pipeline.db")
    )
    TARGET_DATABASE_URL: str = Field(
        default_factory=lambda: os.getenv("TARGET_DATABASE_URL", "sqlite:///./data/target_company.db")
    )

    # 4. Straight-Through Processing (STP) & Escalation Settings
    STP_DEFAULT_ENABLED: bool = Field(
        default_factory=lambda: os.getenv("STP_DEFAULT_ENABLED", "true").lower() in ("true", "1", "yes")
    )
    STP_MIN_CONFIDENCE_THRESHOLD: float = Field(
        default_factory=lambda: float(os.getenv("STP_MIN_CONFIDENCE_THRESHOLD", "0.85"))
    )
    STP_MAX_AMOUNT_LIMIT: float = Field(
        default_factory=lambda: float(os.getenv("STP_MAX_AMOUNT_LIMIT", "100000.0"))
    )

    # 5. Groq API Configuration (Ultra-fast, Low-Token LPU Inference)
    GROQ_API_KEY: str = Field(default_factory=lambda: os.getenv("GROQ_API_KEY", "").strip())
    GROQ_MODEL_NAME: str = Field(
        default_factory=lambda: os.getenv("GROQ_MODEL_NAME", "qwen/qwen3.8-27b").strip()
    )
    GROQ_FALLBACK_MODEL: str = Field(
        default_factory=lambda: os.getenv("GROQ_FALLBACK_MODEL", "openai/gpt-oss-20b").strip()
    )

    # 6. Storage & Outbox Background Worker Configuration ("Host Anywhere")
    STORAGE_PROVIDER: str = Field(default_factory=lambda: os.getenv("STORAGE_PROVIDER", "local").strip())
    GCS_BUCKET_NAME: str = Field(default_factory=lambda: os.getenv("GCS_BUCKET_NAME", "invoice-processing-bucket").strip())
    S3_BUCKET_NAME: str = Field(default_factory=lambda: os.getenv("S3_BUCKET_NAME", "invoices").strip())
    ENABLE_OUTBOX_WORKER: bool = Field(default_factory=lambda: os.getenv("ENABLE_OUTBOX_WORKER", "true").lower() in ("true", "1", "yes"))

    # 7. Automated Email Ingestion (IMAP Poller & Webhook)
    ENABLE_EMAIL_POLLER: bool = Field(
        default_factory=lambda: os.getenv("ENABLE_EMAIL_POLLER", "false").lower() in ("true", "1", "yes")
    )
    IMAP_HOST: str = Field(default_factory=lambda: os.getenv("IMAP_HOST", "").strip())
    IMAP_PORT: int = Field(default_factory=lambda: int(os.getenv("IMAP_PORT", "993")))
    IMAP_USER: str = Field(default_factory=lambda: os.getenv("IMAP_USER", "").strip())
    IMAP_PASSWORD: str = Field(default_factory=lambda: os.getenv("IMAP_PASSWORD", "").strip())
    IMAP_FOLDER: str = Field(default_factory=lambda: os.getenv("IMAP_FOLDER", "INBOX").strip())
    IMAP_POLL_INTERVAL_SECONDS: int = Field(
        default_factory=lambda: int(os.getenv("IMAP_POLL_INTERVAL_SECONDS", "60"))
    )
    IMAP_USE_SSL: bool = Field(
        default_factory=lambda: os.getenv("IMAP_USE_SSL", "true").lower() in ("true", "1", "yes")
    )

    # 8. Automated WhatsApp Intake
    WHATSAPP_AUTO_REPLY: bool = Field(
        default_factory=lambda: os.getenv("WHATSAPP_AUTO_REPLY", "true").lower() in ("true", "1", "yes")
    )

    # Testing Mode (Exposes dev_otp_hint strictly for automated test runners)
    IS_TESTING: bool = False

    # 9. Two-Factor Authentication (2FA) & SMTP Outbound
    ENABLE_2FA: bool = Field(
        default_factory=lambda: os.getenv("ENABLE_2FA", "true").lower() in ("true", "1", "yes")
    )
    SMTP_HOST: str = Field(default_factory=lambda: os.getenv("SMTP_HOST", "smtp.gmail.com").strip())
    SMTP_PORT: int = Field(default_factory=lambda: int(os.getenv("SMTP_PORT", "587")))
    SMTP_USER: str = Field(default_factory=lambda: os.getenv("SMTP_USER", "").strip())
    SMTP_PASSWORD: str = Field(default_factory=lambda: os.getenv("SMTP_PASSWORD", "").strip())
    SMTP_USE_TLS: bool = Field(
        default_factory=lambda: os.getenv("SMTP_USE_TLS", "true").lower() in ("true", "1", "yes")
    )
    SMTP_FROM_NAME: str = Field(
        default_factory=lambda: os.getenv("SMTP_FROM_NAME", "LedgerFlow Security").strip()
    )


settings = Settings()

# Ensure required directories exist
settings.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
settings.TEMP_DIR.mkdir(parents=True, exist_ok=True)
settings.DATA_DIR.mkdir(parents=True, exist_ok=True)
