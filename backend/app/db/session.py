"""
Database Session Management & Engine Initialization.
Supports both PostgreSQL (production) and SQLite (zero-config local testing and CI).
"""
import logging
from typing import Generator
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from backend.app.config import settings
from backend.app.db.base import Base
from backend.app.models.target_company import TargetBase

logger = logging.getLogger("invoice_processor.db")

# 1. Primary Pipeline Database Engine
is_sqlite_primary = settings.DATABASE_URL.startswith("sqlite")
connect_args_primary = {"check_same_thread": False, "timeout": 30} if is_sqlite_primary else {}

engine = create_engine(
    settings.DATABASE_URL,
    connect_args=connect_args_primary,
    pool_pre_ping=True,
    echo=False
)

# Enable SQLite foreign key enforcement, WAL journal mode, and busy timeout for concurrent safety
if is_sqlite_primary:
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=30000")
        cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# 2. Target Company / External Egress Database Engine
is_sqlite_target = settings.TARGET_DATABASE_URL.startswith("sqlite")
connect_args_target = {"check_same_thread": False, "timeout": 30} if is_sqlite_target else {}

target_engine = create_engine(
    settings.TARGET_DATABASE_URL,
    connect_args=connect_args_target,
    pool_pre_ping=True,
    echo=False
)

if is_sqlite_target:
    @event.listens_for(target_engine, "connect")
    def set_target_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=30000")
        cursor.close()

TargetSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=target_engine)


def init_db():
    """Initializes schema tables across both primary and target databases."""
    logger.info("Initializing database schemas...")
    # Import all models to ensure they are registered with Base metadata
    import backend.app.models  # noqa: F401
    Base.metadata.create_all(bind=engine)
    TargetBase.metadata.create_all(bind=target_engine)

    # Engine-agnostic schema migration for newly added columns (Postgres & SQLite compatible)
    from sqlalchemy import inspect, text
    inspector = inspect(engine)
    if inspector.has_table("invoices"):
        existing_cols = {c["name"] for c in inspector.get_columns("invoices")}
        with engine.begin() as conn:
            if "is_escalated" not in existing_cols:
                conn.execute(text("ALTER TABLE invoices ADD COLUMN is_escalated BOOLEAN DEFAULT 0"))
            if "escalation_reason" not in existing_cols:
                conn.execute(text("ALTER TABLE invoices ADD COLUMN escalation_reason VARCHAR(255)"))
            if "escalation_category" not in existing_cols:
                conn.execute(text("ALTER TABLE invoices ADD COLUMN escalation_category VARCHAR(50)"))
            if "duplicate_of_id" not in existing_cols:
                conn.execute(text("ALTER TABLE invoices ADD COLUMN duplicate_of_id VARCHAR(36)"))

    logger.info("Database schemas initialized successfully.")


def get_db() -> Generator[Session, None, None]:
    """FastAPI Dependency for Primary Pipeline DB Session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_target_db() -> Generator[Session, None, None]:
    """FastAPI Dependency for Target Company DB Session."""
    db = TargetSessionLocal()
    try:
        yield db
    finally:
        db.close()
