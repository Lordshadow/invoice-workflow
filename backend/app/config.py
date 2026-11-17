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


settings = Settings()

# Ensure required directories exist
settings.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
settings.TEMP_DIR.mkdir(parents=True, exist_ok=True)
