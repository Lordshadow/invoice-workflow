"""
Configuration and environment settings for the Invoice Processing Backend.
"""
import os
from pathlib import Path
from pydantic import BaseModel, Field


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


settings = Settings()

# Ensure required directories exist
settings.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
settings.TEMP_DIR.mkdir(parents=True, exist_ok=True)
