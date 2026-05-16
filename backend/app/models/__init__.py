"""
KosmoInsight AI — All database models in one file for simplicity.
Import individual models from here throughout the app.
"""

from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Text, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
import enum


# ─── Enums ───────────────────────────────────────────────────────────────────

class UserRole(str, enum.Enum):
    admin = "admin"
    staff = "staff"
    analyst = "analyst"


class CustomerStatus(str, enum.Enum):
    active = "active"
    completed = "completed"
    defaulted = "defaulted"
    suspended = "suspended"


class PaymentStatus(str, enum.Enum):
    paid = "paid"
    pending = "pending"
    missed = "missed"
    partial = "partial"


class RiskLevel(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"


# ─── User ────────────────────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    email = Column(String(150), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(20), default="staff")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


# ─── Customer ────────────────────────────────────────────────────────────────

class Customer(Base):
    __tablename__ = "customers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), nullable=False)
    phone = Column(String(20), nullable=False)
    location = Column(String(100))
    region = Column(String(50))
    product_type = Column(String(100))       # e.g. "Menstrual Cup", "Solar Lamp"
    payment_plan = Column(String(50))        # e.g. "weekly", "monthly"
    status = Column(String(20), default="active")
    risk_score = Column(Float, default=0.0)  # 0–1 from ML model
    risk_level = Column(String(10), default="low")
    join_date = Column(DateTime(timezone=True), server_default=func.now())
    notes = Column(Text)
    created_by = Column(Integer, ForeignKey("users.id"))

    payments = relationship("Payment", back_populates="customer")
    distributions = relationship("Distribution", back_populates="customer")
    predictions = relationship("AIPrediction", back_populates="customer")


# ─── Payment ─────────────────────────────────────────────────────────────────

class Payment(Base):
    __tablename__ = "payments"

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False)
    amount_due = Column(Float, nullable=False)
    amount_paid = Column(Float, default=0.0)
    remaining_balance = Column(Float)
    due_date = Column(DateTime(timezone=True))
    paid_date = Column(DateTime(timezone=True))
    status = Column(String(20), default="pending")
    installment_number = Column(Integer)
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    customer = relationship("Customer", back_populates="payments")


# ─── Product ─────────────────────────────────────────────────────────────────

class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), nullable=False)
    category = Column(String(100))           # "menstrual_health", "maternal_health", "solar"
    unit_price = Column(Float)
    stock_quantity = Column(Integer, default=0)
    description = Column(Text)
    lifespan_months = Column(Integer)        # expected product lifespan
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    distributions = relationship("Distribution", back_populates="product")


# ─── Distribution ────────────────────────────────────────────────────────────

class Distribution(Base):
    __tablename__ = "distributions"

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id"))
    product_id = Column(Integer, ForeignKey("products.id"))
    agent_name = Column(String(100))
    quantity = Column(Integer, default=1)
    region = Column(String(50))
    distribution_date = Column(DateTime(timezone=True), server_default=func.now())
    notes = Column(Text)

    customer = relationship("Customer", back_populates="distributions")
    product = relationship("Product", back_populates="distributions")


# ─── Health Session ──────────────────────────────────────────────────────────

class HealthSession(Base):
    __tablename__ = "health_sessions"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    topic = Column(String(100))              # "menstrual_hygiene", "maternal_care", "nutrition"
    region = Column(String(50))
    facilitator = Column(String(100))
    session_date = Column(DateTime(timezone=True))
    duration_minutes = Column(Integer)
    expected_attendance = Column(Integer)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    attendances = relationship("Attendance", back_populates="session")


class Attendance(Base):
    __tablename__ = "attendance"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("health_sessions.id"))
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=True)
    attendee_name = Column(String(150))
    attended = Column(Boolean, default=True)
    feedback_score = Column(Integer)         # 1–5 rating

    session = relationship("HealthSession", back_populates="attendances")


# ─── AI Prediction ───────────────────────────────────────────────────────────

class AIPrediction(Base):
    __tablename__ = "ai_predictions"

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=True)
    prediction_type = Column(String(50))     # "repayment_risk", "demand_forecast", "segmentation"
    input_features = Column(Text)            # JSON string of input features
    output_result = Column(Text)             # JSON string of result
    confidence = Column(Float)
    model_version = Column(String(20))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    customer = relationship("Customer", back_populates="predictions")


# ─── Uploaded File ───────────────────────────────────────────────────────────

class UploadedFile(Base):
    __tablename__ = "uploaded_files"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String(255))
    original_name = Column(String(255))
    file_type = Column(String(50))
    rows_imported = Column(Integer)
    status = Column(String(20), default="pending")  # pending, success, error
    error_message = Column(Text)
    uploaded_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())


# ─── Report ──────────────────────────────────────────────────────────────────

class Report(Base):
    __tablename__ = "reports"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200))
    report_type = Column(String(50))         # "donor", "investor", "kpi", "trend"
    period_start = Column(DateTime(timezone=True))
    period_end = Column(DateTime(timezone=True))
    file_path = Column(String(255))
    generated_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
