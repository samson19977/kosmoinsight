"""
KosmoInsight AI — All database models.
v2: Added Installment, Notification, AuditLog, PaymentMethod abstraction.
"""

from sqlalchemy import (
    Column, Integer, String, Float, Boolean,
    DateTime, ForeignKey, Text, JSON
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
import enum


# ─── Enums ───────────────────────────────────────────────────────────────────

class UserRole(str, enum.Enum):
    admin    = "admin"
    staff    = "staff"
    analyst  = "analyst"


class CustomerStatus(str, enum.Enum):
    active    = "active"
    completed = "completed"
    defaulted = "defaulted"
    suspended = "suspended"


class PaymentStatus(str, enum.Enum):
    paid    = "paid"
    pending = "pending"
    missed  = "missed"
    partial = "partial"


class RiskLevel(str, enum.Enum):
    low    = "low"
    medium = "medium"
    high   = "high"


class InstallmentFrequency(str, enum.Enum):
    daily   = "daily"
    weekly  = "weekly"
    monthly = "monthly"


class NotificationChannel(str, enum.Enum):
    sms      = "sms"
    email    = "email"
    whatsapp = "whatsapp"
    in_app   = "in_app"


class NotificationStatus(str, enum.Enum):
    pending = "pending"
    sent    = "sent"
    failed  = "failed"


# ─── User ────────────────────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id              = Column(Integer, primary_key=True, index=True)
    name            = Column(String(100), nullable=False)
    email           = Column(String(150), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role            = Column(String(20), default="staff")   # admin | staff | analyst
    is_active       = Column(Boolean, default=True)
    last_login      = Column(DateTime(timezone=True), nullable=True)
    created_at      = Column(DateTime(timezone=True), server_default=func.now())
    updated_at      = Column(DateTime(timezone=True), onupdate=func.now())

    audit_logs      = relationship("AuditLog", back_populates="user", cascade="all, delete-orphan")
    notifications   = relationship("Notification", back_populates="created_by_user")


# ─── Customer ────────────────────────────────────────────────────────────────

class Customer(Base):
    __tablename__ = "customers"

    id              = Column(Integer, primary_key=True, index=True)
    name            = Column(String(150), nullable=False)
    phone           = Column(String(20), nullable=False, index=True)
    location        = Column(String(100))
    region          = Column(String(50), index=True)
    product_type    = Column(String(100))           # "Menstrual Cup", "Solar Lamp"
    payment_plan    = Column(String(50))            # "weekly", "monthly"
    status          = Column(String(20), default="active", index=True)
    risk_score      = Column(Float, default=0.0)   # 0–1 from ML model
    risk_level      = Column(String(10), default="low", index=True)
    total_debt      = Column(Float, default=0.0)   # outstanding balance (auto-computed)
    join_date       = Column(DateTime(timezone=True), server_default=func.now())
    notes           = Column(Text)
    created_by      = Column(Integer, ForeignKey("users.id"), nullable=True)

    payments        = relationship("Payment", back_populates="customer", cascade="all, delete-orphan")
    installments    = relationship("Installment", back_populates="customer", cascade="all, delete-orphan")
    distributions   = relationship("Distribution", back_populates="customer")
    predictions     = relationship("AIPrediction", back_populates="customer", cascade="all, delete-orphan")
    notifications   = relationship("Notification", back_populates="customer")


# ─── Payment ─────────────────────────────────────────────────────────────────

class Payment(Base):
    __tablename__ = "payments"

    id                  = Column(Integer, primary_key=True, index=True)
    customer_id         = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    amount_due          = Column(Float, nullable=False)
    amount_paid         = Column(Float, default=0.0)
    remaining_balance   = Column(Float)
    due_date            = Column(DateTime(timezone=True), index=True)
    paid_date           = Column(DateTime(timezone=True))
    status              = Column(String(20), default="pending", index=True)
    installment_number  = Column(Integer)
    payment_method      = Column(String(50), default="cash")  # cash | mobile_money | bank
    transaction_ref     = Column(String(100))                 # future: MTN/Airtel ref
    notes               = Column(Text)
    recorded_by         = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at          = Column(DateTime(timezone=True), server_default=func.now())

    customer = relationship("Customer", back_populates="payments")


# ─── Installment Schedule ────────────────────────────────────────────────────

class Installment(Base):
    """
    Planned payment schedule per customer.
    Created when a PayGo contract is set up; each row = one due installment.
    """
    __tablename__ = "installments"

    id              = Column(Integer, primary_key=True, index=True)
    customer_id     = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    installment_no  = Column(Integer, nullable=False)          # 1, 2, 3 …
    frequency       = Column(String(20), default="monthly")    # daily | weekly | monthly
    amount_due      = Column(Float, nullable=False)
    due_date        = Column(DateTime(timezone=True), nullable=False, index=True)
    status          = Column(String(20), default="pending")    # pending | paid | missed | partial
    paid_amount     = Column(Float, default=0.0)
    paid_date       = Column(DateTime(timezone=True))
    reminder_sent   = Column(Boolean, default=False)
    created_at      = Column(DateTime(timezone=True), server_default=func.now())

    customer = relationship("Customer", back_populates="installments")


# ─── Payment Provider Abstraction ────────────────────────────────────────────

class PaymentProviderLog(Base):
    """
    Future-ready: log every attempt to initiate / verify mobile money payments.
    Plug MTN MoMo or Airtel Money in here when APIs are available.
    """
    __tablename__ = "payment_provider_logs"

    id              = Column(Integer, primary_key=True, index=True)
    payment_id      = Column(Integer, ForeignKey("payments.id"), nullable=True)
    provider        = Column(String(50))        # "mtn_momo" | "airtel_money" | "bank"
    phone           = Column(String(20))
    amount          = Column(Float)
    transaction_ref = Column(String(100))
    status          = Column(String(20))        # "initiated" | "confirmed" | "failed"
    provider_response = Column(JSON)            # raw JSON from provider API
    created_at      = Column(DateTime(timezone=True), server_default=func.now())


# ─── Product ─────────────────────────────────────────────────────────────────

class Product(Base):
    __tablename__ = "products"

    id              = Column(Integer, primary_key=True, index=True)
    name            = Column(String(150), nullable=False)
    category        = Column(String(100))         # "menstrual_health", "maternal_health", "solar"
    unit_price      = Column(Float)
    stock_quantity  = Column(Integer, default=0)
    low_stock_alert = Column(Integer, default=10) # alert when stock < this
    description     = Column(Text)
    lifespan_months = Column(Integer)
    is_active       = Column(Boolean, default=True)
    created_at      = Column(DateTime(timezone=True), server_default=func.now())

    distributions   = relationship("Distribution", back_populates="product")


# ─── Distribution ────────────────────────────────────────────────────────────

class Distribution(Base):
    __tablename__ = "distributions"

    id                  = Column(Integer, primary_key=True, index=True)
    customer_id         = Column(Integer, ForeignKey("customers.id"), nullable=True)
    product_id          = Column(Integer, ForeignKey("products.id"))
    agent_name          = Column(String(100))
    quantity            = Column(Integer, default=1)
    region              = Column(String(50), index=True)
    distribution_date   = Column(DateTime(timezone=True), server_default=func.now())
    notes               = Column(Text)

    customer = relationship("Customer", back_populates="distributions")
    product  = relationship("Product", back_populates="distributions")


# ─── Health Session ──────────────────────────────────────────────────────────

class HealthSession(Base):
    __tablename__ = "health_sessions"

    id                  = Column(Integer, primary_key=True, index=True)
    title               = Column(String(200), nullable=False)
    topic               = Column(String(100))    # "menstrual_hygiene", "maternal_care"
    region              = Column(String(50), index=True)
    facilitator         = Column(String(100))
    session_date        = Column(DateTime(timezone=True))
    duration_minutes    = Column(Integer)
    expected_attendance = Column(Integer)
    created_at          = Column(DateTime(timezone=True), server_default=func.now())

    attendances = relationship("Attendance", back_populates="session", cascade="all, delete-orphan")


class Attendance(Base):
    __tablename__ = "attendance"

    id              = Column(Integer, primary_key=True, index=True)
    session_id      = Column(Integer, ForeignKey("health_sessions.id", ondelete="CASCADE"))
    customer_id     = Column(Integer, ForeignKey("customers.id"), nullable=True)
    attendee_name   = Column(String(150))
    attended        = Column(Boolean, default=True)
    feedback_score  = Column(Integer)   # 1–5 rating

    session = relationship("HealthSession", back_populates="attendances")


# ─── Notification ────────────────────────────────────────────────────────────

class Notification(Base):
    """
    Tracks all outbound notifications (SMS, Email, WhatsApp, in-app).
    Background worker reads pending rows and dispatches them.
    """
    __tablename__ = "notifications"

    id              = Column(Integer, primary_key=True, index=True)
    customer_id     = Column(Integer, ForeignKey("customers.id"), nullable=True)
    channel         = Column(String(20), default="in_app")   # sms | email | whatsapp | in_app
    recipient       = Column(String(150))                     # phone or email address
    subject         = Column(String(200))                     # for email
    message         = Column(Text, nullable=False)
    status          = Column(String(20), default="pending")   # pending | sent | failed
    sent_at         = Column(DateTime(timezone=True))
    error_message   = Column(Text)
    created_by_id   = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at      = Column(DateTime(timezone=True), server_default=func.now())

    customer        = relationship("Customer", back_populates="notifications")
    created_by_user = relationship("User", back_populates="notifications")


# ─── AI Prediction ───────────────────────────────────────────────────────────

class AIPrediction(Base):
    __tablename__ = "ai_predictions"

    id              = Column(Integer, primary_key=True, index=True)
    customer_id     = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=True)
    prediction_type = Column(String(50))    # "repayment_risk" | "demand_forecast" | "segmentation"
    input_features  = Column(JSON)          # dict of input features
    output_result   = Column(JSON)          # dict of result
    confidence      = Column(Float)
    model_version   = Column(String(20))
    created_at      = Column(DateTime(timezone=True), server_default=func.now())

    customer = relationship("Customer", back_populates="predictions")


# ─── Audit Log ───────────────────────────────────────────────────────────────

class AuditLog(Base):
    """
    Every create / update / delete action is logged here for compliance.
    """
    __tablename__ = "audit_logs"

    id          = Column(Integer, primary_key=True, index=True)
    user_id     = Column(Integer, ForeignKey("users.id"), nullable=True)
    action      = Column(String(50))        # "create_customer", "delete_payment" …
    resource    = Column(String(50))        # "Customer", "Payment" …
    resource_id = Column(Integer)
    detail      = Column(JSON)              # snapshot of changed fields
    ip_address  = Column(String(45))
    created_at  = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="audit_logs")


# ─── Uploaded File ───────────────────────────────────────────────────────────

class UploadedFile(Base):
    __tablename__ = "uploaded_files"

    id              = Column(Integer, primary_key=True, index=True)
    filename        = Column(String(255))
    original_name   = Column(String(255))
    file_type       = Column(String(50))
    rows_imported   = Column(Integer)
    status          = Column(String(20), default="pending")   # pending | success | error | partial
    error_message   = Column(Text)
    uploaded_by     = Column(Integer, ForeignKey("users.id"))
    created_at      = Column(DateTime(timezone=True), server_default=func.now())


# ─── Report ──────────────────────────────────────────────────────────────────

class Report(Base):
    __tablename__ = "reports"

    id              = Column(Integer, primary_key=True, index=True)
    title           = Column(String(200))
    report_type     = Column(String(50))   # "donor" | "investor" | "kpi" | "trend"
    period_start    = Column(DateTime(timezone=True))
    period_end      = Column(DateTime(timezone=True))
    file_path       = Column(String(255))
    generated_by    = Column(Integer, ForeignKey("users.id"))
    created_at      = Column(DateTime(timezone=True), server_default=func.now())
