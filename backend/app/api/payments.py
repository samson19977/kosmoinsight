"""
Payments API — record, update, delete payments + mobile money initiation.
v2: payment method tracking, provider hook, total_debt sync, audit logging.
"""
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from app.database import get_db
from app.models import Payment, Customer, PaymentProviderLog
from app.schemas import (
    PaymentCreate, PaymentUpdate, PaymentOut,
    PaymentInitiateRequest, PaymentInitiateResponse,
)
from app.auth import get_current_user, require_staff_or_admin, require_admin, log_action

router = APIRouter()


def _sync_customer_debt(customer_id: int, db: Session):
    """Recompute and save customer.total_debt after any payment change."""
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if customer:
        customer.total_debt = sum(
            (p.remaining_balance or 0)
            for p in customer.payments
            if p.status != "paid"
        )


@router.get("/", response_model=List[PaymentOut])
def list_payments(
    skip:        int           = Query(default=0, ge=0),
    limit:       int           = Query(default=200, ge=1, le=2000),
    customer_id: Optional[int] = Query(None),
    status:      Optional[str] = Query(None),
    method:      Optional[str] = Query(None),
    db:          Session       = Depends(get_db),
    _=Depends(get_current_user),
):
    q = db.query(Payment)
    if customer_id:
        q = q.filter(Payment.customer_id == customer_id)
    if status:
        q = q.filter(Payment.status == status)
    if method:
        q = q.filter(Payment.payment_method == method)
    return q.order_by(Payment.id.desc()).offset(skip).limit(limit).all()


@router.post("/", response_model=PaymentOut, status_code=201)
def create_payment(
    data:    PaymentCreate,
    request: Request,
    db:      Session = Depends(get_db),
    current_user=Depends(require_staff_or_admin),
):
    # Verify customer exists
    if not db.query(Customer).filter(Customer.id == data.customer_id).first():
        raise HTTPException(status_code=404, detail="Customer not found")

    remaining = data.amount_due - data.amount_paid
    if data.amount_paid >= data.amount_due:
        pay_status = "paid"
    elif data.amount_paid > 0:
        pay_status = "partial"
    else:
        pay_status = "pending"

    payment = Payment(
        **data.model_dump(),
        remaining_balance=remaining,
        status=pay_status,
        recorded_by=current_user.id,
    )
    db.add(payment)
    db.flush()
    _sync_customer_debt(data.customer_id, db)
    log_action(db, current_user.id, "create_payment", "Payment", payment.id,
               detail=data.model_dump(), ip_address=request.client.host if request.client else None)
    db.commit()
    db.refresh(payment)
    return payment


@router.patch("/{payment_id}", response_model=PaymentOut)
def update_payment(
    payment_id: int,
    data:       PaymentUpdate,
    request:    Request,
    db:         Session = Depends(get_db),
    current_user=Depends(require_staff_or_admin),
):
    payment = db.query(Payment).filter(Payment.id == payment_id).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")

    for field, value in data.model_dump(exclude_none=True).items():
        setattr(payment, field, value)

    # Recalculate status and balance
    if data.amount_paid is not None:
        payment.remaining_balance = payment.amount_due - data.amount_paid
        if data.amount_paid >= payment.amount_due:
            payment.status = "paid"
            if not payment.paid_date:
                payment.paid_date = datetime.utcnow()
        elif data.amount_paid > 0:
            payment.status = "partial"

    _sync_customer_debt(payment.customer_id, db)
    log_action(db, current_user.id, "update_payment", "Payment", payment_id,
               detail=data.model_dump(exclude_none=True),
               ip_address=request.client.host if request.client else None)
    db.commit()
    db.refresh(payment)
    return payment


@router.delete("/{payment_id}", status_code=204)
def delete_payment(
    payment_id:  int,
    request:     Request,
    db:          Session = Depends(get_db),
    current_user=Depends(require_admin),
):
    payment = db.query(Payment).filter(Payment.id == payment_id).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    customer_id = payment.customer_id
    log_action(db, current_user.id, "delete_payment", "Payment", payment_id,
               ip_address=request.client.host if request.client else None)
    db.delete(payment)
    db.flush()
    _sync_customer_debt(customer_id, db)
    db.commit()


# ─── Mobile Money initiation (future-ready) ──────────────────────────────────

@router.post("/initiate-mobile-money", response_model=PaymentInitiateResponse)
async def initiate_mobile_money(
    req: PaymentInitiateRequest,
    db:  Session = Depends(get_db),
    current_user=Depends(require_staff_or_admin),
):
    """
    Trigger a mobile money payment request.
    Currently uses the SimulatedProvider — plug in MTN/Airtel via .env ACTIVE_PROVIDER.
    """
    from app.services.payment_provider import get_provider

    payment = db.query(Payment).filter(Payment.id == req.payment_id).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")

    provider = get_provider(req.provider)
    reference = f"PAY-{req.payment_id}-{int(datetime.utcnow().timestamp())}"

    try:
        result = await provider.initiate_payment(req.phone, req.amount, reference)
    except NotImplementedError:
        raise HTTPException(
            status_code=501,
            detail=f"{req.provider} integration is not yet configured. Check .env for API credentials."
        )

    # Log the provider attempt
    log_entry = PaymentProviderLog(
        payment_id=req.payment_id,
        provider=req.provider,
        phone=req.phone,
        amount=req.amount,
        transaction_ref=result.get("transaction_ref"),
        status=result.get("status"),
        provider_response=result,
    )
    db.add(log_entry)

    # Update payment with transaction ref
    if result.get("transaction_ref"):
        payment.transaction_ref = result["transaction_ref"]
        payment.payment_method  = req.provider

    db.commit()
    return PaymentInitiateResponse(**result)
