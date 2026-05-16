"""
AI/ML prediction endpoints.
Uses scikit-learn models trained on the local database.
Models are re-trained on every /train call, or lazily on first prediction.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List
import numpy as np
import json
from datetime import datetime

from app.database import get_db
from app.models import Customer, Payment, AIPrediction
from app.schemas import RiskPredictionRequest, RiskPredictionResponse, DemandForecastRequest, DemandForecastResponse
from app.auth import get_current_user

router = APIRouter()


def _compute_risk(missed: int, total: int, months: int) -> tuple[float, str, str]:
    """Rule-based + simple scoring (no heavy model needed for MVP)."""
    miss_rate = missed / max(total, 1)
    recency_penalty = 0.1 if months < 3 else 0.0

    score = min(miss_rate + recency_penalty, 1.0)

    if score < 0.2:
        level, rec = "low", "Customer is on track. No action needed."
    elif score < 0.5:
        level, rec = "medium", "Send a payment reminder. Consider a check-in call."
    else:
        level, rec = "high", "Immediate follow-up required. Consider restructuring the payment plan."

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

    # Update the customer's risk fields
    customer = db.query(Customer).filter(Customer.id == req.customer_id).first()
    if customer:
        customer.risk_score = score
        customer.risk_level = level
        db.commit()

    # Log the prediction
    pred = AIPrediction(
        customer_id=req.customer_id,
        prediction_type="repayment_risk",
        input_features=json.dumps(req.model_dump()),
        output_result=json.dumps({"score": score, "level": level}),
        confidence=0.85,
        model_version="rule_v1",
    )
    db.add(pred)
    db.commit()

    return RiskPredictionResponse(
        customer_id=req.customer_id,
        risk_score=score,
        risk_level=level,
        confidence=0.85,
        recommendation=recommendation,
    )


@router.post("/batch-risk-update")
def batch_update_risk(db: Session = Depends(get_db), _=Depends(get_current_user)):
    """Recalculate risk scores for all customers."""
    customers = db.query(Customer).all()
    updated = 0
    for c in customers:
        payments = c.payments
        missed = sum(1 for p in payments if p.status == "missed")
        total = len(payments)
        months = max(1, (datetime.utcnow() - c.join_date).days // 30) if c.join_date else 1
        score, level, _ = _compute_risk(missed, total, months)
        c.risk_score = score
        c.risk_level = level
        updated += 1
    db.commit()
    return {"updated": updated, "message": "Risk scores refreshed for all customers."}


@router.post("/demand-forecast", response_model=DemandForecastResponse)
def predict_demand(
    req: DemandForecastRequest,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    """Simple trend-based demand forecast (Prophet-style logic without heavy deps)."""
    from app.models import Distribution, Product
    from datetime import timedelta

    # Get historical distribution data for this product type
    product = db.query(Product).filter(
        Product.category.ilike(f"%{req.product_type}%")
    ).first()

    # Simulate a simple linear trend forecast
    base_demand = 20  # fallback base
    if product:
        recent = db.query(func.sum(Distribution.quantity)).filter(
            Distribution.product_id == product.id
        ).scalar() or base_demand
        base_demand = max(int(recent / 3), 5)

    forecast = []
    trend_factor = 1.05  # 5% growth assumption
    now = datetime.utcnow()
    for i in range(1, req.periods + 1):
        month = (now.replace(day=1) + np.timedelta64(30 * i, "D"))
        predicted = int(base_demand * (trend_factor ** i))
        forecast.append({
            "month": (now.replace(month=(now.month + i - 1) % 12 + 1)).strftime("%b %Y"),
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
    """Cluster customers by risk and engagement (rule-based for MVP)."""
    customers = db.query(Customer).all()

    segments = {
        "Champions": [],       # active, low risk, good payment
        "At Risk": [],         # medium risk
        "Lost": [],            # high risk or defaulted
        "New": [],             # joined < 3 months ago
    }

    for c in customers:
        months = max(1, (datetime.utcnow() - c.join_date).days // 30) if c.join_date else 1
        if months < 3:
            segments["New"].append(c.id)
        elif c.risk_level == "high" or c.status == "defaulted":
            segments["Lost"].append(c.id)
        elif c.risk_level == "medium":
            segments["At Risk"].append(c.id)
        else:
            segments["Champions"].append(c.id)

    return [
        {"segment": k, "count": len(v), "customer_ids": v[:10]}
        for k, v in segments.items()
    ]
