from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime
from app.database import get_db
from app.models import Customer, Payment, Distribution, HealthSession, Report
from app.auth import get_current_user

router = APIRouter()

@router.get("/summary")
def get_summary_report(db: Session = Depends(get_db), _=Depends(get_current_user)):
    """Generate a KPI summary report."""
    total_customers = db.query(func.count(Customer.id)).scalar()
    total_revenue = db.query(func.sum(Payment.amount_paid)).scalar() or 0
    total_due = db.query(func.sum(Payment.amount_due)).scalar() or 1
    total_distributed = db.query(func.sum(Distribution.quantity)).scalar() or 0
    sessions = db.query(func.count(HealthSession.id)).scalar()

    return {
        "generated_at": datetime.utcnow().isoformat(),
        "kpis": {
            "total_customers": total_customers,
            "total_revenue_rwf": round(total_revenue, 2),
            "collection_rate_pct": round((total_revenue / total_due) * 100, 1),
            "products_distributed": total_distributed,
            "health_sessions": sessions,
        },
        "status": "KosmoInsight AI Summary Report",
    }

@router.get("/donor")
def get_donor_report(db: Session = Depends(get_db), _=Depends(get_current_user)):
    """Donor-friendly impact report."""
    customers = db.query(func.count(Customer.id)).scalar()
    high_risk = db.query(func.count(Customer.id)).filter(Customer.risk_level == "high").scalar()
    sessions = db.query(func.count(HealthSession.id)).scalar()
    return {
        "generated_at": datetime.utcnow().isoformat(),
        "title": "Kosmotive Social Impact Report",
        "impact_metrics": {
            "women_reached": customers,
            "health_sessions_held": sessions,
            "high_risk_customers_flagged": high_risk,
        },
        "narrative": "Kosmotive is empowering women with affordable menstrual and maternal health products through PayGo financing.",
    }
