"""
Database setup — SQLAlchemy engine + session factory.
Supports PostgreSQL (production) and SQLite (dev/test).
"""
from dotenv import load_dotenv
load_dotenv()

from sqlalchemy import create_engine, event
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os
import logging

logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    # IMPORTANT: on Render this must be set in Dashboard -> Environment,
    # NOT just in a local .env file (which is never uploaded/read on Render).
    # A missing DATABASE_URL crashes the process during import, before
    # uvicorn binds to $PORT — which Render reports as
    # "No open ports detected ... Timed Out".
    logger.error(
        "DATABASE_URL is not set. On Render: Dashboard -> your service "
        "-> Environment -> add DATABASE_URL (and SECRET_KEY, CORS_ORIGINS)."
    )
    raise ValueError(
        "DATABASE_URL is not set in environment variables. "
        "Set it in your hosting provider's Environment settings."
    )

# Render / Supabase sometimes give postgres:// — SQLAlchemy needs postgresql://
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

IS_SQLITE = DATABASE_URL.startswith("sqlite")

if IS_SQLITE:
    connect_args = {"check_same_thread": False}
else:
    # connect_timeout prevents a slow/unreachable DB (e.g. paused Supabase
    # project) from hanging app startup indefinitely, which also looks like
    # "No open ports detected" from Render's perspective.
    connect_args = {"connect_timeout": 10}

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=True,       # detect stale connections
    pool_recycle=300,          # recycle connections every 5 min
    pool_size=10,              # max persistent connections (ignored for SQLite)
    max_overflow=20,           # extra connections under load
    echo=os.getenv("APP_ENV") == "development",
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    """FastAPI dependency — yield a DB session, always close it."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
