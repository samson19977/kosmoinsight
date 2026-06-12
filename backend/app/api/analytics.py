"""
Analytics API — dashboard stats, trends, risk distribution, insights.
v2: added outstanding_debt, overdue_installments, product analytics.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, extract
from datetime import datetime, timedelta
from app.database import get_db
from app.models import Customer, Payment, Distribution, HealthSession, Attendance, Installment, Product
from app.schemas import DashboardStats
from app.auth import get_current_user

router = APIRouter()


@router.get("/dashboard", response_model=DashboardStats)
def get_dashboard_stats(db: Session = Depends(get_db), _=Depends(get_current_user)):
    now         = datetime.utcnow()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    prev_start  = (month_start - timedelta(days=1)).replace(day=1)

    total_customers  = db.query(func.count(Customer.id)).scalar() or 0
    active_customers = db.query(func.count(Customer.id)).filter(Customer.status == "active").scalar() or 0
    high_risk        = db.query(func.count(Customer.id)).filter(Customer.risk_level == "high").scalar() or 0
    medium_risk      = db.query(func.count(Customer.id)).filter(Customer.risk_level == "medium").scalar() or 0
    low_risk         = db.query(func.count(Customer.id)).filter(Customer.risk_level == "low").scalar() or 0

    total_revenue        = db.query(func.sum(Payment.amount_paid)).scalar() or 0.0
    this_month_revenue   = db.query(func.sum(Payment.amount_paid)).filter(
        Payment.paid_date >= month_start
    ).scalar() or 0.0
    last_month_revenue   = db.query(func.sum(Payment.amount_paid)).filter(
        Payment.paid_date >= prev_start,
        Payment.paid_date < month_start,
    ).scalar() or 0.0

    revenue_change = (
        ((this_month_revenue - last_month_revenue) / max(last_month_revenue, 1)) * 100
    )

    total_payments   = db.query(func.count(Payment.id)).scalar() or 1
    paid_count       = db.query(func.count(Payment.id)).filter(Payment.status == "paid").scalar() or 0
    repayment_rate   = round((paid_count / total_payments) * 100, 1)

    outstanding_debt = db.query(func.sum(Customer.total_debt)).scalar() or 0.0
    products_dist    = db.query(func.sum(Distribution.quantity)).scalar() or 0
    health_sessions  = db.query(func.count(HealthSession.id)).scalar() or 0

    # Overdue installments
    overdue = db.query(func.count(Installment.id)).filter(
        Installment.status == "pending",
        Installment.due_date < now,
    ).scalar() or 0

    return DashboardStats(
        total_customers=total_customers,
        active_customers=active_customers,
        total_revenue=round(total_revenue, 2),
        repayment_rate=repayment_rate,
        high_risk_count=high_risk,
        medium_risk_count=medium_risk,
        low_risk_count=low_risk,
        products_distributed=int(products_dist),
        health_sessions_count=health_sessions,
        this_month_revenue=round(this_month_revenue, 2),
        revenue_change_pct=round(revenue_change, 1),
        outstanding_debt=round(outstanding_debt, 2),
        overdue_installments=overdue,
    )


@router.get("/revenue-trend")
def get_revenue_trend(
    months: int = Query(default=6, ge=1, le=24),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    now    = datetime.utcnow()
    result = []
    for i in range(months - 1, -1, -1):
        target = now - timedelta(days=30 * i)
        rev = db.query(func.sum(Payment.amount_paid)).filter(
            extract("month", Payment.paid_date) == target.month,
            extract("year",  Payment.paid_date) == target.year,
        ).scalar() or 0.0
        result.append({"month": target.strftime("%b %Y"), "revenue": round(rev, 2)})
    return result


@router.get("/repayment-trend")
def get_repayment_trend(
    months: int = Query(default=6, ge=1, le=24),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    now    = datetime.utcnow()
    result = []
    for i in range(months - 1, -1, -1):
        target = now - timedelta(days=30 * i)
        total = db.query(func.count(Payment.id)).filter(
            extract("month", Payment.due_date) == target.month,
            extract("year",  Payment.due_date) == target.year,
        ).scalar() or 1
        paid = db.query(func.count(Payment.id)).filter(
            extract("month", Payment.due_date) == target.month,
            extract("year",  Payment.due_date) == target.year,
            Payment.status == "paid",
        ).scalar() or 0
        result.append({"month": target.strftime("%b %Y"), "rate": round((paid / total) * 100, 1)})
    return result


@router.get("/risk-distribution")
def get_risk_distribution(db: Session = Depends(get_db), _=Depends(get_current_user)):
    rows = db.query(Customer.risk_level, func.count(Customer.id)).group_by(Customer.risk_level).all()
    return [{"name": (r or "unknown").title() + " Risk", "value": c} for r, c in rows]


@router.get("/region-distribution")
def get_region_distribution(db: Session = Depends(get_db), _=Depends(get_current_user)):
    rows = db.query(Customer.region, func.count(Customer.id)).group_by(Customer.region).all()
    return [{"region": r or "Unknown", "count": c} for r, c in rows]


@router.get("/product-performance")
def get_product_performance(db: Session = Depends(get_db), _=Depends(get_current_user)):
    """Revenue and distribution by product type."""
    rows = db.query(
        Customer.product_type,
        func.count(Customer.id).label("customer_count"),
        func.sum(Payment.amount_paid).label("revenue"),
    ).join(Payment, Payment.customer_id == Customer.id, isouter=True)\
     .group_by(Customer.product_type).all()

    return [
        {
            "product_type":    r or "Unknown",
            "customer_count":  c,
            "revenue":         round(rev or 0, 2),
        }
        for r, c, rev in rows
    ]


@router.get("/health-impact")
def get_health_impact(db: Session = Depends(get_db), _=Depends(get_current_user)):
    sessions    = db.query(func.count(HealthSession.id)).scalar() or 0
    attendees   = db.query(func.count(Attendance.id)).filter(Attendance.attended == True).scalar() or 0
    avg_feedback = db.query(func.avg(Attendance.feedback_score)).scalar() or 0
    return {
        "total_sessions":     sessions,
        "total_attendees":    attendees,
        "avg_feedback_score": round(avg_feedback, 1),
    }


@router.get("/ai-insights")
def get_ai_insights(db: Session = Depends(get_db), _=Depends(get_current_user)):
    """Smart text insights derived from the data."""
    insights = []
    now = datetime.utcnow()

    high_risk = db.query(func.count(Customer.id)).filter(Customer.risk_level == "high").scalar() or 0
    if high_risk > 0:
        insights.append({"type": "warning",
                         "message": f"{high_risk} high-risk customers detected. Review their payment plans immediately."})

    missed = db.query(func.count(Payment.id)).filter(Payment.status == "missed").scalar() or 0
    total_p = db.query(func.count(Payment.id)).scalar() or 1
    miss_rate = round((missed / total_p) * 100, 1)
    t = "warning" if miss_rate > 10 else "success"
    insights.append({"type": t,
                     "message": f"Missed payment rate is {miss_rate}%. Target: below 10%."})

    overdue = db.query(func.count(Installment.id)).filter(
        Installment.status == "pending", Installment.due_date < now
    ).scalar() or 0
    if overdue > 0:
        insights.append({"type": "warning",
                         "message": f"{overdue} installments are overdue. Run the reminder job."})

    # Low stock products
    low_stock = db.query(Product).filter(
        Product.stock_quantity <= Product.low_stock_alert,
        Product.is_active == True,
    ).count()
    if low_stock:
        insights.append({"type": "warning",
                         "message": f"{low_stock} product(s) are below their low stock alert threshold."})

    top_region = db.query(Customer.region, func.count(Customer.id).label("cnt"))\
        .group_by(Customer.region).order_by(func.count(Customer.id).desc()).first()
    if top_region:
        insights.append({"type": "info",
                         "message": f"{top_region[0] or 'Unknown'} region has the highest customer base ({top_region[1]} customers)."})

    insights.append({"type": "info",
                     "message": "Run the demand forecast model to predict next month's product needs."})

    return insights


@router.get("/debt-collection-summary")
def debt_collection_summary(db: Session = Depends(get_db), _=Depends(get_current_user)):
    total_due  = db.query(func.sum(Payment.amount_due)).scalar() or 0
    total_paid = db.query(func.sum(Payment.amount_paid)).scalar() or 0
    outstanding = db.query(func.sum(Customer.total_debt)).scalar() or 0
    collection_rate = round((total_paid / max(total_due, 1)) * 100, 1)

    return {
        "total_due_rwf":       round(total_due, 2),
        "total_collected_rwf": round(total_paid, 2),
        "outstanding_rwf":     round(outstanding, 2),
        "collection_rate_pct": collection_rate,
    }
