"""
Celery Background Workers
==========================
Handles: installment reminders, risk recalculation, notification dispatch.

To run (requires Redis):
  celery -A app.workers.celery_app worker --loglevel=info
  celery -A app.workers.celery_app beat --loglevel=info

If Redis is not available, the system still works — tasks just won't run in background.
"""
import os
import logging
from celery import Celery
from celery.schedules import crontab

logger = logging.getLogger(__name__)

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

celery_app = Celery(
    "kosmoinsight",
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=["app.workers.tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="Africa/Kigali",
    enable_utc=True,

    # ─── Scheduled jobs ──────────────────────────────────────────────────────
    beat_schedule={
        # Every day at 8 AM Kigali time: send payment reminders
        "daily-payment-reminders": {
            "task": "app.workers.tasks.send_due_reminders",
            "schedule": crontab(hour=8, minute=0),
        },
        # Every night at midnight: recalculate all risk scores
        "nightly-risk-recalculation": {
            "task": "app.workers.tasks.recalculate_all_risks",
            "schedule": crontab(hour=0, minute=0),
        },
        # Every Sunday: flag missed installments
        "weekly-missed-check": {
            "task": "app.workers.tasks.flag_missed_installments",
            "schedule": crontab(hour=7, minute=0, day_of_week=0),
        },
    },
)
