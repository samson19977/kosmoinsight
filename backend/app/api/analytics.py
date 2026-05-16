from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, extract
from datetime import datetime, timedelta
from app.database import get_db
from app.models import Customer, Payment, Distribution, HealthSession, Attendance
from app.schemas import DashboardStats
from app.auth import get_current_user

router = APIRouter()


@router.get("/dashboard", response_model=DashboardStats)
def get_dashboard_stats(db: Session = Depends(get_db), _=Depends(get_current_user)):
    now = datetime.utcnow()
    month_start = now.replace(day=1, hour=0, minute=0, second=0)
    last_month_start = (month_start - timedelta(days=1)).replace(day=1)

    total_customers = db.query(func.count(Customer.id)).scalar()
    active_customers = db.query(func.count(Customer.id)).filter(Customer.status == "active").scalar()
    high_risk = db.query(func.count(Customer.id)).filter(Customer.risk_level == "high").scalar()

    # Revenue
    total_revenue = db.query(func.sum(Payment.amount_paid)).scalar() or 0.0
    this_month_revenue = db.query(func.sum(Payment.amount_paid)).filter(
        Payment.paid_date >= month_start
    ).scalar() or 0.0
    last_month_revenue = db.query(func.sum(Payment.amount_paid)).filter(
        Payment.paid_date >= last_month_start,
        Payment.paid_date < month_start,
    ).scalar() or 1.0

    revenue_change = ((this_month_revenue - last_month_revenue) / last_month_revenue) * 100

    # Repayment rate
    total_payments = db.query(func.count(Payment.id)).scalar() or 1
    paid_payments = db.query(func.count(Payment.id)).filter(Payment.status == "paid").scalar()
    repayment_rate = round((paid_payments / total_payments) * 100, 1)

    # Products distributed
    products_distributed = db.query(func.sum(Distribution.quantity)).scalar() or 0

    # Health sessions
    health_sessions = db.query(func.count(HealthSession.id)).scalar()

    return DashboardStats(
        total_customers=total_customers,
        active_customers=active_customers,
        total_revenue=total_revenue,
        repayment_rate=repayment_rate,
        high_risk_count=high_risk,
        products_distributed=products_distributed,
        health_sessions_count=health_sessions,
        this_month_revenue=this_month_revenue,
        revenue_change_pct=round(revenue_change, 1),
    )


@router.get("/revenue-trend")
def get_revenue_trend(months: int = 6, db: Session = Depends(get_db), _=Depends(get_current_user)):
    """Monthly revenue for the past N months."""
    now = datetime.utcnow()
    result = []
    for i in range(months - 1, -1, -1):
        target = now - timedelta(days=30 * i)
        month_revenue = db.query(func.sum(Payment.amount_paid)).filter(
            extract("month", Payment.paid_date) == target.month,
            extract("year", Payment.paid_date) == target.year,
        ).scalar() or 0.0
        result.append({
            "month": target.strftime("%b %Y"),
            "revenue": round(month_revenue, 2),
        })
    return result


@router.get("/repayment-trend")
def get_repayment_trend(months: int = 6, db: Session = Depends(get_db), _=Depends(get_current_user)):
    """Monthly repayment rate over time."""
    now = datetime.utcnow()
    result = []
    for i in range(months - 1, -1, -1):
        target = now - timedelta(days=30 * i)
        total = db.query(func.count(Payment.id)).filter(
            extract("month", Payment.due_date) == target.month,
            extract("year", Payment.due_date) == target.year,
        ).scalar() or 1
        paid = db.query(func.count(Payment.id)).filter(
            extract("month", Payment.due_date) == target.month,
            extract("year", Payment.due_date) == target.year,
            Payment.status == "paid",
        ).scalar()
        result.append({
            "month": target.strftime("%b %Y"),
            "rate": round((paid / total) * 100, 1),
        })
    return result


@router.get("/risk-distribution")
def get_risk_distribution(db: Session = Depends(get_db), _=Depends(get_current_user)):
    low = db.query(func.count(Customer.id)).filter(Customer.risk_level == "low").scalar()
    medium = db.query(func.count(Customer.id)).filter(Customer.risk_level == "medium").scalar()
    high = db.query(func.count(Customer.id)).filter(Customer.risk_level == "high").scalar()
    return [
        {"name": "Low Risk", "value": low},
        {"name": "Medium Risk", "value": medium},
        {"name": "High Risk", "value": high},
    ]


@router.get("/region-distribution")
def get_region_distribution(db: Session = Depends(get_db), _=Depends(get_current_user)):
    rows = db.query(Customer.region, func.count(Customer.id)).group_by(Customer.region).all()
    return [{"region": r or "Unknown", "count": c} for r, c in rows]


@router.get("/health-impact")
def get_health_impact(db: Session = Depends(get_db), _=Depends(get_current_user)):
    sessions = db.query(func.count(HealthSession.id)).scalar()
    attendees = db.query(func.count(Attendance.id)).filter(Attendance.attended == True).scalar()
    avg_feedback = db.query(func.avg(Attendance.feedback_score)).scalar() or 0
    return {
        "total_sessions": sessions,
        "total_attendees": attendees,
        "avg_feedback_score": round(avg_feedback, 1),
    }


@router.get("/ai-insights")
def get_ai_insights(db: Session = Depends(get_db), _=Depends(get_current_user)):
    """Generate smart text insights from the data."""
    insights = []

    high_risk = db.query(func.count(Customer.id)).filter(Customer.risk_level == "high").scalar()
    if high_risk > 0:
        insights.append({
            "type": "warning",
            "message": f"{high_risk} high-risk customers detected. Review their payment plans.",
        })

    missed = db.query(func.count(Payment.id)).filter(Payment.status == "missed").scalar()
    total_p = db.query(func.count(Payment.id)).scalar() or 1
    miss_rate = round((missed / total_p) * 100, 1)
    insights.append({
        "type": "info",
        "message": f"Overall missed payment rate is {miss_rate}%. Target: below 10%.",
    })

    # Top region by customers
    top_region = db.query(Customer.region, func.count(Customer.id).label("cnt"))\
        .group_by(Customer.region).order_by(func.count(Customer.id).desc()).first()
    if top_region:
        insights.append({
            "type": "success",
            "message": f"{top_region[0] or 'Unknown'} region has the highest customer base ({top_region[1]} customers).",
        })

    insights.append({
        "type": "info",
        "message": "Run the demand forecast model to predict next month's product needs.",
    })

    return insights
