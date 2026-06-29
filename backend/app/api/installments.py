"""
Installments API — generate and manage PayGo payment schedules.
New in v2.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timedelta
from app.database import get_db
from app.models import Installment, Customer
from app.schemas import InstallmentCreate, InstallmentOut, GenerateInstallmentsRequest
from app.auth import get_current_user, require_staff_or_admin

router = APIRouter()


def _next_due_date(start: datetime, frequency: str, n: int) -> datetime:
    """Compute the due date of installment #n (1-indexed)."""
    if frequency == "daily":
        return start + timedelta(days=n)
    elif frequency == "weekly":
        return start + timedelta(weeks=n)
    else:  # monthly
        month  = start.month + n - 1
        year   = start.year + (month - 1) // 12
        month  = (month - 1) % 12 + 1
        day    = min(start.day, [31,28,31,30,31,30,31,31,30,31,30,31][month-1])
        return start.replace(year=year, month=month, day=day)


@router.post("/generate", response_model=List[InstallmentOut])
def generate_installment_schedule(
    req: GenerateInstallmentsRequest,
    db:  Session = Depends(get_db),
    _=Depends(require_staff_or_admin),
):
    """
    Auto-generate a payment schedule for a customer.
    Divides total_amount evenly across num_installments at the given frequency.
    """
    customer = db.query(Customer).filter(Customer.id == req.customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    # Remove existing pending installments to avoid duplicates
    db.query(Installment).filter(
        Installment.customer_id == req.customer_id,
        Installment.status == "pending",
    ).delete()

    amount_per = round(req.total_amount / req.num_installments, 2)
    created: List[Installment] = []

    for i in range(1, req.num_installments + 1):
        due = _next_due_date(req.start_date, req.frequency, i)
        inst = Installment(
            customer_id=req.customer_id,
            installment_no=i,
            frequency=req.frequency,
            amount_due=amount_per,
            due_date=due,
            status="pending",
        )
        db.add(inst)
        created.append(inst)

    # Update customer payment plan
    customer.payment_plan = req.frequency
    db.commit()
    for inst in created:
        db.refresh(inst)
    return created


@router.get("", response_model=List[InstallmentOut])
def list_installments(
    customer_id: Optional[int] = Query(None),
    status:      Optional[str] = Query(None),
    overdue_only: bool         = Query(False),
    skip:        int           = Query(default=0, ge=0),
    limit:       int           = Query(default=200, ge=1, le=1000),
    db:          Session       = Depends(get_db),
    _=Depends(get_current_user),
):
    q = db.query(Installment)
    if customer_id:
        q = q.filter(Installment.customer_id == customer_id)
    if status:
        q = q.filter(Installment.status == status)
    if overdue_only:
        q = q.filter(
            Installment.status == "pending",
            Installment.due_date < datetime.utcnow(),
        )
    return q.order_by(Installment.due_date).offset(skip).limit(limit).all()


@router.patch("/{installment_id}/mark-paid", response_model=InstallmentOut)
def mark_installment_paid(
    installment_id: int,
    paid_amount:    Optional[float] = None,
    db:             Session = Depends(get_db),
    _=Depends(require_staff_or_admin),
):
    inst = db.query(Installment).filter(Installment.id == installment_id).first()
    if not inst:
        raise HTTPException(status_code=404, detail="Installment not found")

    amount = paid_amount or inst.amount_due
    inst.paid_amount = amount
    inst.paid_date   = datetime.utcnow()
    inst.status      = "paid" if amount >= inst.amount_due else "partial"
    db.commit()
    db.refresh(inst)
    return inst


@router.get("/overdue-summary")
def overdue_summary(
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    """How many installments are overdue right now, grouped by customer."""
    now = datetime.utcnow()
    overdue = db.query(Installment).filter(
        Installment.status == "pending",
        Installment.due_date < now,
    ).all()

    by_customer: dict = {}
    for inst in overdue:
        cid = inst.customer_id
        if cid not in by_customer:
            by_customer[cid] = {"customer_id": cid, "overdue_count": 0, "overdue_amount": 0.0}
        by_customer[cid]["overdue_count"] += 1
        by_customer[cid]["overdue_amount"] += inst.amount_due

    return {
        "total_overdue_installments": len(overdue),
        "total_overdue_amount":       sum(i.amount_due for i in overdue),
        "by_customer":                list(by_customer.values()),
    }