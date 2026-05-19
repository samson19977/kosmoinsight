"""
DATABASE FIX — Data loss solution.

Root cause: Render free tier has an ephemeral filesystem.
SQLite files are deleted every time Render restarts or redeploys.
This is why all data disappears on logout/restart.

Solution: Use Supabase FREE PostgreSQL as persistent storage.
- Supabase free tier = 500MB PostgreSQL, persists forever, never deleted.
- Set DATABASE_URL env var on Render to your Supabase connection string.
- Local dev still uses SQLite automatically (no change needed locally).
"""
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./kosmoinsight.db")

# Supabase gives postgres:// but SQLAlchemy needs postgresql://
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

connect_args = {"check_same_thread": False} if "sqlite" in DATABASE_URL else {}

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=True,  # reconnect if DB connection dropped
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
