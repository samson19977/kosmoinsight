"""
Celery Tasks
=============
Background jobs for reminders, risk scoring, and overdue detection.
"""
import logging
from datetime import datetime, timedelta
from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="app.workers.tasks.send_due_reminders")
def send_due_reminders():
    """
    Send payment reminders for installments due in the next 3 days.
    Runs daily at 8 AM Kigali time.
    """
    from app.database import SessionLocal
    from app.models import Installment, Customer
    from app.services.notification import send_payment_reminder

    db = SessionLocal()
    try:
        now = datetime.utcnow()
        lookahead = now + timedelta(days=3)

        due_soon = db.query(Installment).filter(
            Installment.status == "pending",
            Installment.due_date >= now,
            Installment.due_date <= lookahead,
            Installment.reminder_sent == False,
        ).all()

        sent = 0
        for inst in due_soon:
            customer = db.query(Customer).filter(Customer.id == inst.customer_id).first()
            if customer:
                send_payment_reminder(db, customer, inst.amount_due, inst.due_date)
                inst.reminder_sent = True
                sent += 1

        db.commit()
        logger.info(f"[TASK] Sent {sent} payment reminders.")
        return {"reminders_sent": sent}
    except Exception as e:
        logger.error(f"[TASK] send_due_reminders failed: {e}")
        raise
    finally:
        db.close()


@celery_app.task(name="app.workers.tasks.recalculate_all_risks")
def recalculate_all_risks():
    """
    Nightly job: recalculate risk scores for all active customers.
    Uses same rule-based engine as the API endpoint.
    """
    from app.database import SessionLocal
    from app.models import Customer
    from app.api.predictions import _compute_risk

    db = SessionLocal()
    try:
        customers = db.query(Customer).filter(Customer.status == "active").all()
        counts = {"high": 0, "medium": 0, "low": 0}

        for c in customers:
            missed = sum(1 for p in c.payments if p.status == "missed")
            total  = len(c.payments)
            months = max(1, (datetime.utcnow() - c.join_date).days // 30) if c.join_date else 1
            score, level, _ = _compute_risk(missed, total, months)
            c.risk_score = score
            c.risk_level = level
            # Update total_debt
            c.total_debt = sum(
                (p.remaining_balance or 0) for p in c.payments if p.status != "paid"
            )
            counts[level] += 1

        db.commit()
        logger.info(f"[TASK] Risk recalculated: {counts}")
        return counts
    except Exception as e:
        logger.error(f"[TASK] recalculate_all_risks failed: {e}")
        raise
    finally:
        db.close()


@celery_app.task(name="app.workers.tasks.flag_missed_installments")
def flag_missed_installments():
    """
    Weekly job: mark installments past due_date + 1 day as 'missed'.
    """
    from app.database import SessionLocal
    from app.models import Installment

    db = SessionLocal()
    try:
        cutoff = datetime.utcnow() - timedelta(days=1)
        overdue = db.query(Installment).filter(
            Installment.status == "pending",
            Installment.due_date < cutoff,
        ).all()

        for inst in overdue:
            inst.status = "missed"

        db.commit()
        logger.info(f"[TASK] Flagged {len(overdue)} installments as missed.")
        return {"flagged": len(overdue)}
    except Exception as e:
        logger.error(f"[TASK] flag_missed_installments failed: {e}")
        raise
    finally:
        db.close()


@celery_app.task(name="app.workers.tasks.dispatch_pending_notifications")
def dispatch_pending_notifications():
    """Process up to 100 pending notifications from the queue."""
    from app.database import SessionLocal
    from app.models import Notification
    from app.services.notification import dispatch_notification
    from datetime import datetime

    db = SessionLocal()
    try:
        pending = db.query(Notification).filter(
            Notification.status == "pending"
        ).limit(100).all()

        sent = failed = 0
        for notif in pending:
            try:
                success = dispatch_notification(notif)
                notif.status = "sent" if success else "failed"
                notif.sent_at = datetime.utcnow() if success else None
                if success:
                    sent += 1
                else:
                    failed += 1
            except Exception as e:
                notif.status = "failed"
                notif.error_message = str(e)
                failed += 1

        db.commit()
        return {"sent": sent, "failed": failed}
    finally:
        db.close()
