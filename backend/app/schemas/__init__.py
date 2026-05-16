"""
Pydantic schemas — request/response models for all API endpoints.
"""

from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from datetime import datetime


# ─── Auth ────────────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str = Field(min_length=6)
    role: str = "staff"


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: int
    name: str
    email: str
    role: str
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ─── Customer ────────────────────────────────────────────────────────────────

class CustomerCreate(BaseModel):
    name: str
    phone: str
    location: Optional[str] = None
    region: Optional[str] = None
    product_type: Optional[str] = None
    payment_plan: Optional[str] = "monthly"
    notes: Optional[str] = None


class CustomerUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    location: Optional[str] = None
    region: Optional[str] = None
    product_type: Optional[str] = None
    payment_plan: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None


class CustomerOut(BaseModel):
    id: int
    name: str
    phone: str
    location: Optional[str]
    region: Optional[str]
    product_type: Optional[str]
    payment_plan: Optional[str]
    status: str
    risk_score: float
    risk_level: str
    join_date: datetime

    class Config:
        from_attributes = True


# ─── Payment ─────────────────────────────────────────────────────────────────

class PaymentCreate(BaseModel):
    customer_id: int
    amount_due: float
    amount_paid: float = 0.0
    due_date: Optional[datetime] = None
    installment_number: Optional[int] = None
    notes: Optional[str] = None


class PaymentUpdate(BaseModel):
    amount_paid: Optional[float] = None
    status: Optional[str] = None
    paid_date: Optional[datetime] = None
    notes: Optional[str] = None


class PaymentOut(BaseModel):
    id: int
    customer_id: int
    amount_due: float
    amount_paid: float
    remaining_balance: Optional[float]
    due_date: Optional[datetime]
    paid_date: Optional[datetime]
    status: str
    installment_number: Optional[int]

    class Config:
        from_attributes = True


# ─── Product ─────────────────────────────────────────────────────────────────

class ProductCreate(BaseModel):
    name: str
    category: Optional[str] = None
    unit_price: Optional[float] = None
    stock_quantity: int = 0
    description: Optional[str] = None
    lifespan_months: Optional[int] = None


class ProductOut(BaseModel):
    id: int
    name: str
    category: Optional[str]
    unit_price: Optional[float]
    stock_quantity: int
    lifespan_months: Optional[int]

    class Config:
        from_attributes = True


# ─── Distribution ────────────────────────────────────────────────────────────

class DistributionCreate(BaseModel):
    customer_id: Optional[int] = None
    product_id: int
    agent_name: Optional[str] = None
    quantity: int = 1
    region: Optional[str] = None
    notes: Optional[str] = None


class DistributionOut(BaseModel):
    id: int
    customer_id: Optional[int]
    product_id: int
    agent_name: Optional[str]
    quantity: int
    region: Optional[str]
    distribution_date: datetime

    class Config:
        from_attributes = True


# ─── Health Session ──────────────────────────────────────────────────────────

class HealthSessionCreate(BaseModel):
    title: str
    topic: Optional[str] = None
    region: Optional[str] = None
    facilitator: Optional[str] = None
    session_date: Optional[datetime] = None
    duration_minutes: Optional[int] = None
    expected_attendance: Optional[int] = None


class HealthSessionOut(BaseModel):
    id: int
    title: str
    topic: Optional[str]
    region: Optional[str]
    facilitator: Optional[str]
    session_date: Optional[datetime]
    expected_attendance: Optional[int]
    created_at: datetime

    class Config:
        from_attributes = True


# ─── AI Prediction ───────────────────────────────────────────────────────────

class RiskPredictionRequest(BaseModel):
    customer_id: int
    missed_payments: int = 0
    total_payments: int = 1
    months_active: int = 1
    region: Optional[str] = None
    payment_plan: Optional[str] = None


class RiskPredictionResponse(BaseModel):
    customer_id: int
    risk_score: float          # 0.0 – 1.0
    risk_level: str            # low / medium / high
    confidence: float
    recommendation: str


class DemandForecastRequest(BaseModel):
    product_type: str
    region: Optional[str] = None
    periods: int = 3           # months ahead


class DemandForecastResponse(BaseModel):
    product_type: str
    region: Optional[str]
    forecast: List[dict]       # [{month, predicted_demand}]
    trend: str                 # "increasing", "stable", "decreasing"


# ─── Analytics ───────────────────────────────────────────────────────────────

class DashboardStats(BaseModel):
    total_customers: int
    active_customers: int
    total_revenue: float
    repayment_rate: float
    high_risk_count: int
    products_distributed: int
    health_sessions_count: int
    this_month_revenue: float
    revenue_change_pct: float
