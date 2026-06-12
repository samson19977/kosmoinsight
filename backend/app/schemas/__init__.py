"""
Pydantic v2 schemas — request/response models for all API endpoints.
"""

from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional, List, Dict, Any
from datetime import datetime


# ─── Auth ────────────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    name:     str           = Field(min_length=2, max_length=100)
    email:    EmailStr
    password: str           = Field(min_length=6)
    role:     str           = Field(default="staff", pattern="^(admin|staff|analyst)$")


class UserLogin(BaseModel):
    email:    EmailStr
    password: str


class UserOut(BaseModel):
    id:         int
    name:       str
    email:      str
    role:       str
    is_active:  bool
    last_login: Optional[datetime] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    name:      Optional[str]  = None
    is_active: Optional[bool] = None
    role:      Optional[str]  = Field(default=None, pattern="^(admin|staff|analyst)$")


class Token(BaseModel):
    access_token: str
    token_type:   str     = "bearer"
    user:         UserOut


# ─── Customer ────────────────────────────────────────────────────────────────

class CustomerCreate(BaseModel):
    name:         str
    phone:        str = Field(min_length=7, max_length=20)
    location:     Optional[str] = None
    region:       Optional[str] = None
    product_type: Optional[str] = None
    payment_plan: Optional[str] = "monthly"
    notes:        Optional[str] = None

    @field_validator("phone")
    @classmethod
    def clean_phone(cls, v: str) -> str:
        return v.strip().replace(" ", "")


class CustomerUpdate(BaseModel):
    name:         Optional[str] = None
    phone:        Optional[str] = None
    location:     Optional[str] = None
    region:       Optional[str] = None
    product_type: Optional[str] = None
    payment_plan: Optional[str] = None
    status:       Optional[str] = None
    notes:        Optional[str] = None


class CustomerOut(BaseModel):
    id:           int
    name:         str
    phone:        str
    location:     Optional[str]
    region:       Optional[str]
    product_type: Optional[str]
    payment_plan: Optional[str]
    status:       str
    risk_score:   float
    risk_level:   str
    total_debt:   float
    join_date:    datetime

    model_config = {"from_attributes": True}


class CustomerDetail(CustomerOut):
    """Full customer view with payment summary."""
    notes:          Optional[str]
    total_paid:     float = 0.0
    total_due:      float = 0.0
    missed_count:   int   = 0
    payment_count:  int   = 0


# ─── Payment ─────────────────────────────────────────────────────────────────

class PaymentCreate(BaseModel):
    customer_id:        int
    amount_due:         float = Field(gt=0)
    amount_paid:        float = Field(default=0.0, ge=0)
    due_date:           Optional[datetime] = None
    installment_number: Optional[int]      = None
    payment_method:     Optional[str]      = "cash"
    transaction_ref:    Optional[str]      = None
    notes:              Optional[str]      = None


class PaymentUpdate(BaseModel):
    amount_paid:     Optional[float]    = None
    status:          Optional[str]      = None
    paid_date:       Optional[datetime] = None
    payment_method:  Optional[str]      = None
    transaction_ref: Optional[str]      = None
    notes:           Optional[str]      = None


class PaymentOut(BaseModel):
    id:                  int
    customer_id:         int
    amount_due:          float
    amount_paid:         float
    remaining_balance:   Optional[float]
    due_date:            Optional[datetime]
    paid_date:           Optional[datetime]
    status:              str
    installment_number:  Optional[int]
    payment_method:      Optional[str]
    transaction_ref:     Optional[str]
    created_at:          datetime

    model_config = {"from_attributes": True}


# ─── Installment ─────────────────────────────────────────────────────────────

class InstallmentCreate(BaseModel):
    customer_id:    int
    installment_no: int
    frequency:      str   = Field(default="monthly", pattern="^(daily|weekly|monthly)$")
    amount_due:     float = Field(gt=0)
    due_date:       datetime


class InstallmentOut(BaseModel):
    id:             int
    customer_id:    int
    installment_no: int
    frequency:      str
    amount_due:     float
    due_date:       datetime
    status:         str
    paid_amount:    float
    paid_date:      Optional[datetime]
    reminder_sent:  bool

    model_config = {"from_attributes": True}


class GenerateInstallmentsRequest(BaseModel):
    customer_id:        int
    total_amount:       float = Field(gt=0, description="Total product price")
    num_installments:   int   = Field(gt=0, le=60)
    frequency:          str   = Field(default="monthly", pattern="^(daily|weekly|monthly)$")
    start_date:         datetime


# ─── Product ─────────────────────────────────────────────────────────────────

class ProductCreate(BaseModel):
    name:             str
    category:         Optional[str]   = None
    unit_price:       Optional[float] = None
    stock_quantity:   int             = 0
    low_stock_alert:  int             = 10
    description:      Optional[str]   = None
    lifespan_months:  Optional[int]   = None


class ProductUpdate(BaseModel):
    name:             Optional[str]   = None
    category:         Optional[str]   = None
    unit_price:       Optional[float] = None
    stock_quantity:   Optional[int]   = None
    low_stock_alert:  Optional[int]   = None
    description:      Optional[str]   = None
    is_active:        Optional[bool]  = None


class ProductOut(BaseModel):
    id:               int
    name:             str
    category:         Optional[str]
    unit_price:       Optional[float]
    stock_quantity:   int
    low_stock_alert:  int
    lifespan_months:  Optional[int]
    is_active:        bool

    model_config = {"from_attributes": True}


# ─── Distribution ────────────────────────────────────────────────────────────

class DistributionCreate(BaseModel):
    customer_id: Optional[int] = None
    product_id:  int
    agent_name:  Optional[str] = None
    quantity:    int           = 1
    region:      Optional[str] = None
    notes:       Optional[str] = None


class DistributionOut(BaseModel):
    id:                int
    customer_id:       Optional[int]
    product_id:        int
    agent_name:        Optional[str]
    quantity:          int
    region:            Optional[str]
    distribution_date: datetime

    model_config = {"from_attributes": True}


# ─── Health Session ──────────────────────────────────────────────────────────

class HealthSessionCreate(BaseModel):
    title:               str
    topic:               Optional[str]      = None
    region:              Optional[str]      = None
    facilitator:         Optional[str]      = None
    session_date:        Optional[datetime] = None
    duration_minutes:    Optional[int]      = None
    expected_attendance: Optional[int]      = None


class HealthSessionOut(BaseModel):
    id:                  int
    title:               str
    topic:               Optional[str]
    region:              Optional[str]
    facilitator:         Optional[str]
    session_date:        Optional[datetime]
    expected_attendance: Optional[int]
    created_at:          datetime

    model_config = {"from_attributes": True}


# ─── Notification ────────────────────────────────────────────────────────────

class NotificationCreate(BaseModel):
    customer_id: Optional[int] = None
    channel:     str           = Field(default="in_app", pattern="^(sms|email|whatsapp|in_app)$")
    recipient:   str
    subject:     Optional[str] = None
    message:     str           = Field(min_length=1)


class NotificationOut(BaseModel):
    id:          int
    customer_id: Optional[int]
    channel:     str
    recipient:   str
    subject:     Optional[str]
    message:     str
    status:      str
    sent_at:     Optional[datetime]
    created_at:  datetime

    model_config = {"from_attributes": True}


# ─── AI Prediction ───────────────────────────────────────────────────────────

class RiskPredictionRequest(BaseModel):
    customer_id:      int
    missed_payments:  int   = 0
    total_payments:   int   = 1
    months_active:    int   = 1
    region:           Optional[str] = None
    payment_plan:     Optional[str] = None


class RiskPredictionResponse(BaseModel):
    customer_id:     int
    risk_score:      float   # 0.0 – 1.0
    risk_level:      str     # low | medium | high
    confidence:      float
    recommendation:  str


class DemandForecastRequest(BaseModel):
    product_type: str
    region:       Optional[str] = None
    periods:      int           = Field(default=3, ge=1, le=12)


class DemandForecastResponse(BaseModel):
    product_type: str
    region:       Optional[str]
    forecast:     List[Dict[str, Any]]
    trend:        str   # "increasing" | "stable" | "decreasing"


# ─── Payment Provider (future) ───────────────────────────────────────────────

class PaymentInitiateRequest(BaseModel):
    payment_id:  int
    provider:    str   = Field(pattern="^(mtn_momo|airtel_money|bank|cash)$")
    phone:       str
    amount:      float = Field(gt=0)


class PaymentInitiateResponse(BaseModel):
    status:          str
    transaction_ref: Optional[str]
    message:         str
    provider:        str


# ─── Analytics ───────────────────────────────────────────────────────────────

class DashboardStats(BaseModel):
    total_customers:        int
    active_customers:       int
    total_revenue:          float
    repayment_rate:         float
    high_risk_count:        int
    medium_risk_count:      int
    low_risk_count:         int
    products_distributed:   int
    health_sessions_count:  int
    this_month_revenue:     float
    revenue_change_pct:     float
    outstanding_debt:       float
    overdue_installments:   int


# ─── Audit Log ───────────────────────────────────────────────────────────────

class AuditLogOut(BaseModel):
    id:          int
    user_id:     Optional[int]
    action:      str
    resource:    str
    resource_id: Optional[int]
    detail:      Optional[Dict[str, Any]]
    ip_address:  Optional[str]
    created_at:  datetime

    model_config = {"from_attributes": True}
