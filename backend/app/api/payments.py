"""payments router"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.models import Payment
from app.schemas import PaymentCreate, PaymentUpdate, PaymentOut
from app.auth import get_current_user

router = APIRouter()

@router.get("/", response_model=List[PaymentOut])
def list_payments(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), _=Depends(get_current_user)):
    return db.query(Payment).offset(skip).limit(limit).all()

@router.post("/", response_model=PaymentOut, status_code=201)
def create_payment(data: PaymentCreate, db: Session = Depends(get_db), _=Depends(get_current_user)):
    remaining = data.amount_due - data.amount_paid
    status = "paid" if data.amount_paid >= data.amount_due else ("partial" if data.amount_paid > 0 else "pending")
    payment = Payment(**data.model_dump(), remaining_balance=remaining, status=status)
    db.add(payment)
    db.commit()
    db.refresh(payment)
    return payment

@router.patch("/{payment_id}", response_model=PaymentOut)
def update_payment(payment_id: int, data: PaymentUpdate, db: Session = Depends(get_db), _=Depends(get_current_user)):
    payment = db.query(Payment).filter(Payment.id == payment_id).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(payment, field, value)
    if data.amount_paid is not None:
        payment.remaining_balance = payment.amount_due - data.amount_paid
        if data.amount_paid >= payment.amount_due:
            payment.status = "paid"
        elif data.amount_paid > 0:
            payment.status = "partial"
    db.commit()
    db.refresh(payment)
    return payment
