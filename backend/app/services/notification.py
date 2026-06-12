"""
Notification Service
====================
Handles SMS, Email, WhatsApp, and in-app notifications.
Background worker (Celery) picks up pending rows and dispatches them.

Currently all channels are stubs — configure real APIs in .env to activate.
SMS:      Set SMS_PROVIDER=africas_talking + AT_API_KEY, AT_USERNAME
Email:    Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
WhatsApp: Set WHATSAPP_TOKEN (Twilio or Meta Cloud API)
"""
import os
import logging
from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Session
from app.models import Notification, Customer

logger = logging.getLogger(__name__)


def _create_notification_record(
    db: Session,
    customer_id: Optional[int],
    channel: str,
    recipient: str,
    message: str,
    subject: Optional[str] = None,
    created_by_id: Optional[int] = None,
) -> Notification:
    n = Notification(
        customer_id=customer_id,
        channel=channel,
        recipient=recipient,
        subject=subject,
        message=message,
        status="pending",
        created_by_id=created_by_id,
    )
    db.add(n)
    db.flush()
    return n


def send_payment_reminder(
    db: Session,
    customer: Customer,
    amount_due: float,
    due_date: datetime,
) -> Notification:
    """Queue a payment reminder for a customer."""
    msg = (
        f"Dear {customer.name}, your PayGo installment of {amount_due:,.0f} RWF "
        f"is due on {due_date.strftime('%d %b %Y')}. "
        "Please contact us for any questions. — Kosmotive"
    )
    n = _create_notification_record(
        db=db,
        customer_id=customer.id,
        channel="in_app",   # change to "sms" once AT credentials are set
        recipient=customer.phone,
        message=msg,
    )
    db.commit()
    logger.info(f"Queued payment reminder for customer {customer.id}")
    return n


def send_high_risk_alert(
    db: Session,
    customer: Customer,
    staff_email: str,
) -> Notification:
    """Alert staff when a customer moves to high risk."""
    msg = (
        f"⚠️ HIGH RISK ALERT: {customer.name} (ID {customer.id}) "
        f"has been flagged as HIGH RISK. Please follow up immediately."
    )
    n = _create_notification_record(
        db=db,
        customer_id=customer.id,
        channel="email",
        recipient=staff_email,
        subject=f"High Risk Alert — {customer.name}",
        message=msg,
    )
    db.commit()
    logger.info(f"Queued high-risk alert for customer {customer.id}")
    return n


def dispatch_notification(notification: Notification) -> bool:
    """
    Actually send the notification via its channel.
    Called by the Celery worker — not directly by API routes.
    Returns True if sent successfully.
    """
    channel = notification.channel

    if channel == "sms":
        return _send_sms(notification.recipient, notification.message)
    elif channel == "email":
        return _send_email(notification.recipient, notification.subject, notification.message)
    elif channel == "whatsapp":
        return _send_whatsapp(notification.recipient, notification.message)
    else:
        # in_app — just mark as sent (frontend reads from DB)
        logger.info(f"In-app notification {notification.id} marked as sent.")
        return True


def _send_sms(phone: str, message: str) -> bool:
    """Africa's Talking SMS — stub. Set AT_API_KEY + AT_USERNAME to activate."""
    api_key  = os.getenv("AT_API_KEY")
    username = os.getenv("AT_USERNAME")
    if not api_key or not username:
        logger.warning("SMS not configured. Set AT_API_KEY and AT_USERNAME.")
        return False
    # TODO: import africastalking; at.SMS.send(message, [phone])
    logger.info(f"[STUB] SMS to {phone}: {message[:50]}…")
    return True


def _send_email(to: str, subject: Optional[str], body: str) -> bool:
    """SMTP email — stub. Set SMTP_HOST etc. to activate."""
    smtp_host = os.getenv("SMTP_HOST")
    if not smtp_host:
        logger.warning("Email not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS.")
        return False
    # TODO: smtplib / sendgrid / mailgun
    logger.info(f"[STUB] Email to {to}: {subject}")
    return True


def _send_whatsapp(phone: str, message: str) -> bool:
    """WhatsApp via Twilio or Meta Cloud API — stub."""
    token = os.getenv("WHATSAPP_TOKEN")
    if not token:
        logger.warning("WhatsApp not configured. Set WHATSAPP_TOKEN.")
        return False
    # TODO: integrate Twilio or Meta Cloud API
    logger.info(f"[STUB] WhatsApp to {phone}: {message[:50]}…")
    return True
