"""
Reports API — CSV downloads + JSON summaries.
Solves: "too complicated to convert JSON to Word/PDF"
→ Now has direct CSV download endpoints that open in Excel immediately.
"""
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime
import csv, io
from app.database import get_db
from app.models import Customer, Payment, Distribution, HealthSession
from app.auth import get_current_user

router = APIRouter()


def _kpi_data(db: Session) -> dict:
    total_customers = db.query(func.count(Customer.id)).scalar() or 0
    active = db.query(func.count(Customer.id)).filter(Customer.status == "active").scalar() or 0
    high = db.query(func.count(Customer.id)).filter(Customer.risk_level == "high").scalar() or 0
    medium = db.query(func.count(Customer.id)).filter(Customer.risk_level == "medium").scalar() or 0
    low = db.query(func.count(Customer.id)).filter(Customer.risk_level == "low").scalar() or 0
    revenue = db.query(func.sum(Payment.amount_paid)).scalar() or 0
    due = db.query(func.sum(Payment.amount_due)).scalar() or 1
    missed = db.query(func.count(Payment.id)).filter(Payment.status == "missed").scalar() or 0
    total_p = db.query(func.count(Payment.id)).scalar() or 1
    distributed = db.query(func.sum(Distribution.quantity)).scalar() or 0
    sessions = db.query(func.count(HealthSession.id)).scalar() or 0
    return {
        "generated_at": datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
        "total_customers": total_customers,
        "active_customers": active,
        "high_risk_customers": high,
        "medium_risk_customers": medium,
        "low_risk_customers": low,
        "total_revenue_rwf": round(revenue, 2),
        "collection_rate_pct": round((revenue / due) * 100, 1),
        "missed_payment_rate_pct": round((missed / total_p) * 100, 1),
        "products_distributed": distributed or 0,
        "health_sessions": sessions,
    }


@router.get("/summary")
def get_summary(db: Session = Depends(get_db), _=Depends(get_current_user)):
    data = _kpi_data(db)
    generated_at = data.pop("generated_at")
    return {"generated_at": generated_at, "kpis": data, "status": "KosmoInsight AI Summary Report"}


@router.get("/summary/csv")
def download_summary_csv(db: Session = Depends(get_db), _=Depends(get_current_user)):
    """⬇ Download KPI report as CSV — opens directly in Excel."""
    data = _kpi_data(db)
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["KosmoInsight AI — KPI Summary Report"])
    w.writerow([f"Generated: {data['generated_at']}"])
    w.writerow([])
    w.writerow(["Metric", "Value"])
    labels = {
        "total_customers": "Total Customers",
        "active_customers": "Active Customers",
        "high_risk_customers": "High Risk Customers",
        "medium_risk_customers": "Medium Risk Customers",
        "low_risk_customers": "Low Risk Customers",
        "total_revenue_rwf": "Total Revenue (RWF)",
        "collection_rate_pct": "Collection Rate (%)",
        "missed_payment_rate_pct": "Missed Payment Rate (%)",
        "products_distributed": "Products Distributed",
        "health_sessions": "Health Sessions Held",
    }
    for k, v in data.items():
        if k != "generated_at":
            w.writerow([labels.get(k, k), v])
    out.seek(0)
    fname = f"kpi-report-{datetime.utcnow().strftime('%Y-%m-%d')}.csv"
    return StreamingResponse(iter([out.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": f"attachment; filename={fname}"})


@router.get("/customers/csv")
def download_customers_csv(db: Session = Depends(get_db), _=Depends(get_current_user)):
    """⬇ Download all customers as CSV — opens in Excel."""
    customers = db.query(Customer).all()
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["ID", "Name", "Phone", "Region", "Location", "Product Type",
                "Payment Plan", "Status", "Risk Level", "Risk Score %", "Join Date"])
    for c in customers:
        w.writerow([
            c.id, c.name, c.phone, c.region or "", c.location or "",
            c.product_type or "", c.payment_plan or "", c.status,
            c.risk_level, f"{c.risk_score * 100:.0f}%",
            c.join_date.strftime("%Y-%m-%d") if c.join_date else "",
        ])
    out.seek(0)
    fname = f"customers-{datetime.utcnow().strftime('%Y-%m-%d')}.csv"
    return StreamingResponse(iter([out.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": f"attachment; filename={fname}"})


@router.get("/payments/csv")
def download_payments_csv(db: Session = Depends(get_db), _=Depends(get_current_user)):
    """⬇ Download all payments as CSV — opens in Excel."""
    payments = db.query(Payment).all()
    cust_names = {c.id: c.name for c in db.query(Customer).all()}
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["ID", "Customer Name", "Installment #", "Amount Due (RWF)",
                "Amount Paid (RWF)", "Balance (RWF)", "Status", "Due Date", "Paid Date"])
    for p in payments:
        w.writerow([
            p.id, cust_names.get(p.customer_id, f"#{p.customer_id}"),
            p.installment_number or "",
            p.amount_due, p.amount_paid,
            round(p.remaining_balance or 0, 2), p.status,
            p.due_date.strftime("%Y-%m-%d") if p.due_date else "",
            p.paid_date.strftime("%Y-%m-%d") if p.paid_date else "",
        ])
    out.seek(0)
    fname = f"payments-{datetime.utcnow().strftime('%Y-%m-%d')}.csv"
    return StreamingResponse(iter([out.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": f"attachment; filename={fname}"})


@router.get("/donor")
def get_donor_report(db: Session = Depends(get_db), _=Depends(get_current_user)):
    data = _kpi_data(db)
    return {
        "generated_at": datetime.utcnow().isoformat(),
        "title": "Kosmotive Social Impact Report",
        "impact_metrics": {
            "women_reached": data["total_customers"],
            "health_sessions_held": data["health_sessions"],
            "high_risk_customers_flagged": data["high_risk_customers"],
            "total_revenue_collected_rwf": data["total_revenue_rwf"],
        },
        "narrative": "Kosmotive is empowering women with affordable menstrual and maternal health products through PayGo financing.",
    }
