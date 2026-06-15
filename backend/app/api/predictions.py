"""
AI/ML Predictions — risk scoring, demand forecasting, customer segmentation.
v2: auto-trigger risk update when payments change, improved segmentation.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, case
import json
from datetime import datetime
from app.database import get_db
from app.models import Customer, Payment, AIPrediction
from app.schemas import (
    RiskPredictionRequest, RiskPredictionResponse,
    DemandForecastRequest, DemandForecastResponse,
)
from app.auth import get_current_user

router = APIRouter()


def _compute_risk(missed: int, total: int, months: int) -> tuple[float, str, str]:
    """
    Risk scoring rules:
      0 missed        → Low Risk    (score 0.05)
      1 missed        → Medium Risk (score 0.25)
      2 missed        → Medium Risk (score 0.35)
      3+ missed       → High Risk   (score 0.60+)
      New (<3m) + any missed → High Risk (emergency escalation)

    Returns (score, level, recommendation)
    """
    if missed >= 3:
        score = min(0.60 + (missed - 3) * 0.08, 1.0)
        level = "high"
        rec   = f"Immediate follow-up required. {missed} missed payments detected. Consider restructuring the payment plan."
    elif missed == 2:
        score, level = 0.35, "medium"
        rec   = "2 missed payments. Send a reminder and schedule a check-in call."
    elif missed == 1:
        score, level = 0.25, "medium"
        rec   = "1 missed payment. Send a friendly reminder."
    else:
        score, level = 0.05, "low"
        rec   = "Customer is on track. No action needed."

    # New accounts with any missed payment get escalated
    if months < 3 and missed >= 1:
        level = "high"
        score = min(score + 0.25, 1.0)
        rec   = "New customer with missed payment(s). Urgent follow-up needed."

    return round(score, 3), level, rec


@router.post("/repayment-risk", response_model=RiskPredictionResponse)
def predict_repayment_risk(
    req: RiskPredictionRequest,
    db:  Session = Depends(get_db),
    _=Depends(get_current_user),
):
    score, level, recommendation = _compute_risk(
        req.missed_payments, req.total_payments, req.months_active
    )

    customer = db.query(Customer).filter(Customer.id == req.customer_id).first()
    if customer:
        customer.risk_score = score
        customer.risk_level = level

    pred = AIPrediction(
        customer_id=req.customer_id,
        prediction_type="repayment_risk",
        input_features=req.model_dump(),
        output_result={"score": score, "level": level},
        confidence=0.90,
        model_version="rule_v2_3missed_high",
    )
    db.add(pred)
    db.commit()

    return RiskPredictionResponse(
        customer_id=req.customer_id,
        risk_score=score,
        risk_level=level,
        confidence=0.90,
        recommendation=recommendation,
    )


@router.post("/batch-risk-update")
def batch_update_risk(db: Session = Depends(get_db), _=Depends(get_current_user)):
    """
    Recalculate risk for ALL customers efficiently using aggregated DB queries.
    Fixed: replaced N+1 loop with a single aggregated payment query.
    """
    now = datetime.utcnow()

    # FIX 1: Single query to get missed/total payments per customer
    payment_stats = db.query(
        Payment.customer_id,
        func.count(Payment.id).label("total"),
        func.sum(
            case((Payment.status == "missed", 1), else_=0)
        ).label("missed"),
        func.sum(
            case(
                (Payment.status != "paid", Payment.remaining_balance),
                else_=0
            )
        ).label("debt"),
    ).group_by(Payment.customer_id).all()

    # Build a lookup dict: customer_id → stats
    stats_map = {
        row.customer_id: {
            "total":  row.total  or 0,
            "missed": int(row.missed or 0),
            "debt":   float(row.debt  or 0),
        }
        for row in payment_stats
    }

    # FIX 2: Load all customers in one query (no joinedload needed)
    customers = db.query(Customer).all()
    counts = {"high": 0, "medium": 0, "low": 0}

    for c in customers:
        # FIX 3: Safe join_date handling
        if c.join_date:
            months = max(1, (now - c.join_date).days // 30)
        else:
            months = 12  # assume established if no join date

        s      = stats_map.get(c.id, {"total": 0, "missed": 0, "debt": 0.0})
        score, level, _ = _compute_risk(s["missed"], s["total"], months)

        c.risk_score = score
        c.risk_level = level
        c.total_debt = s["debt"]
        counts[level] += 1

    db.commit()

    return {
        "updated":      len(customers),
        "high_risk":    counts["high"],
        "medium_risk":  counts["medium"],
        "low_risk":     counts["low"],
        "message":      f"✓ Risk updated for {len(customers)} customers.",
    }


@router.post("/demand-forecast", response_model=DemandForecastResponse)
def predict_demand(
    req: DemandForecastRequest,
    db:  Session = Depends(get_db),
    _=Depends(get_current_user),
):
    from app.models import Distribution, Product

    product = db.query(Product).filter(
        Product.category.ilike(f"%{req.product_type}%")
    ).first()

    base_demand = 20
    if product:
        recent = db.query(func.sum(Distribution.quantity)).filter(
            Distribution.product_id == product.id
        ).scalar() or base_demand
        base_demand = max(int(recent / 3), 5)

    now      = datetime.utcnow()
    forecast = []
    for i in range(1, req.periods + 1):
        predicted  = int(base_demand * (1.05 ** i))
        month_num  = (now.month + i - 1) % 12 + 1
        year       = now.year + (now.month + i - 1) // 12
        label      = datetime(year, month_num, 1).strftime("%b %Y")
        forecast.append({"month": label, "predicted_demand": predicted})

    return DemandForecastResponse(
        product_type=req.product_type,
        region=req.region,
        forecast=forecast,
        trend="increasing",
    )


@router.get("/segmentation")
def customer_segmentation(db: Session = Depends(get_db), _=Depends(get_current_user)):
    """
    Segment customers into:
      Champions — low risk, 6+ months active
      Loyal     — low risk, 3–6 months
      At Risk   — medium risk
      High Risk — high risk or defaulted
      New       — <3 months old
    """
    now = datetime.utcnow()
    customers = db.query(Customer).all()
    segments  = {"Champions": 0, "Loyal": 0, "At Risk": 0, "High Risk": 0, "New": 0}

    for c in customers:
        # FIX: safe join_date handling
        months = max(1, (now - c.join_date).days // 30) if c.join_date else 12

        if months < 3:
            segments["New"] += 1
        elif c.risk_level == "high" or c.status == "defaulted":
            segments["High Risk"] += 1
        elif c.risk_level == "medium":
            segments["At Risk"] += 1
        elif months >= 6:
            segments["Champions"] += 1
        else:
            segments["Loyal"] += 1

    return [{"segment": k, "count": v} for k, v in segments.items()]


@router.get("/prediction-history")
def get_prediction_history(
    customer_id: int,
    limit:       int = 10,
    db:          Session = Depends(get_db),
    _=Depends(get_current_user),
):
    preds = db.query(AIPrediction).filter(
        AIPrediction.customer_id == customer_id
    ).order_by(AIPrediction.created_at.desc()).limit(limit).all()
    return preds