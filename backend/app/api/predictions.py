"""
AI/ML predictions — FIXED risk logic.
Rule: 3+ missed payments = High Risk, 1-2 = Medium, 0 = Low
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
import numpy as np
import json
from datetime import datetime
from app.database import get_db
from app.models import Customer, Payment, AIPrediction
from app.schemas import RiskPredictionRequest, RiskPredictionResponse, DemandForecastRequest, DemandForecastResponse
from app.auth import get_current_user

router = APIRouter()


def _compute_risk(missed: int, total: int, months: int) -> tuple:
    """
    REQUIRED LOGIC:
      0 missed   = Low Risk    (score 0.05)
      1-2 missed = Medium Risk (score 0.25-0.35)
      3+ missed  = High Risk   (score 0.60+)

    Recency: new account (<3 months) with any missed payment → bump to High.
    """
    if missed >= 3:
        score = min(0.60 + (missed - 3) * 0.08, 1.0)
        level = "high"
        rec = "Immediate follow-up required. 3+ missed payments detected. Consider restructuring the payment plan."
    elif missed == 2:
        score = 0.35
        level = "medium"
        rec = "2 missed payments. Send a payment reminder and schedule a check-in call."
    elif missed == 1:
        score = 0.25
        level = "medium"
        rec = "1 missed payment. Send a friendly payment reminder."
    else:
        score = 0.05
        level = "low"
        rec = "Customer is on track. No action needed."

    # New account with any missed payment is more risky
    if months < 3 and missed >= 1:
        level = "high"
        score = min(score + 0.25, 1.0)
        rec = "New customer with missed payment(s). Urgent follow-up needed."

    return round(score, 3), level, rec


@router.post("/repayment-risk", response_model=RiskPredictionResponse)
def predict_repayment_risk(
    req: RiskPredictionRequest,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    score, level, recommendation = _compute_risk(
        req.missed_payments, req.total_payments, req.months_active
    )
    # Save to customer record
    customer = db.query(Customer).filter(Customer.id == req.customer_id).first()
    if customer:
        customer.risk_score = score
        customer.risk_level = level
        db.commit()

    # Log prediction
    pred = AIPrediction(
        customer_id=req.customer_id,
        prediction_type="repayment_risk",
        input_features=json.dumps(req.model_dump()),
        output_result=json.dumps({"score": score, "level": level}),
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
    """Recalculate ALL customers using 3+ missed = High rule."""
    customers = db.query(Customer).all()
    high = medium = low = 0
    for c in customers:
        payments = c.payments
        missed = sum(1 for p in payments if p.status == "missed")
        total = len(payments)
        months = max(1, (datetime.utcnow() - c.join_date).days // 30) if c.join_date else 1
        score, level, _ = _compute_risk(missed, total, months)
        c.risk_score = score
        c.risk_level = level
        if level == "high": high += 1
        elif level == "medium": medium += 1
        else: low += 1
    db.commit()
    return {
        "updated": len(customers),
        "high_risk": high,
        "medium_risk": medium,
        "low_risk": low,
        "message": f"✓ Risk updated for {len(customers)} customers: {high} high, {medium} medium, {low} low.",
    }


@router.post("/demand-forecast", response_model=DemandForecastResponse)
def predict_demand(
    req: DemandForecastRequest,
    db: Session = Depends(get_db),
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

    forecast = []
    now = datetime.utcnow()
    for i in range(1, req.periods + 1):
        predicted = int(base_demand * (1.05 ** i))
        month_num = (now.month + i - 1) % 12 + 1
        forecast.append({
            "month": now.replace(month=month_num).strftime("%b %Y"),
            "predicted_demand": predicted,
        })

    return DemandForecastResponse(
        product_type=req.product_type,
        region=req.region,
        forecast=forecast,
        trend="increasing",
    )


@router.get("/segmentation")
def customer_segmentation(db: Session = Depends(get_db), _=Depends(get_current_user)):
    customers = db.query(Customer).all()
    segments = {"Champions": [], "At Risk": [], "High Risk": [], "New": []}
    for c in customers:
        months = max(1, (datetime.utcnow() - c.join_date).days // 30) if c.join_date else 1
        if months < 3:
            segments["New"].append(c.id)
        elif c.risk_level == "high" or c.status == "defaulted":
            segments["High Risk"].append(c.id)
        elif c.risk_level == "medium":
            segments["At Risk"].append(c.id)
        else:
            segments["Champions"].append(c.id)
    return [{"segment": k, "count": len(v)} for k, v in segments.items()]
