"""
Customers API — CRUD + payment summary + debt tracking.
v2: total_debt auto-update, audit logging, CustomerDetail response.
"""
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import List, Optional
from app.database import get_db
from app.models import Customer, Payment, Installment
from app.schemas import CustomerCreate, CustomerUpdate, CustomerOut, CustomerDetail
from app.auth import get_current_user, require_staff_or_admin, require_admin, log_action

router = APIRouter()


def _update_debt(customer: Customer):
    """Recompute total_debt from unpaid/partial payments."""
    customer.total_debt = sum(
        (p.remaining_balance or 0) for p in customer.payments if p.status != "paid"
    )


@router.get("/", response_model=List[CustomerOut])
def list_customers(
    search:      Optional[str] = Query(None),
    region:      Optional[str] = Query(None),
    status:      Optional[str] = Query(None),
    risk_level:  Optional[str] = Query(None),
    payment_plan:Optional[str] = Query(None),
    skip:        int           = Query(default=0, ge=0),
    limit:       int           = Query(default=100, ge=1, le=1000),
    db:          Session       = Depends(get_db),
    _=Depends(get_current_user),
):
    q = db.query(Customer)
    if search:
        q = q.filter(or_(
            Customer.name.ilike(f"%{search}%"),
            Customer.phone.ilike(f"%{search}%"),
            Customer.location.ilike(f"%{search}%"),
        ))
    if region:
        q = q.filter(Customer.region == region)
    if status:
        q = q.filter(Customer.status == status)
    if risk_level:
        q = q.filter(Customer.risk_level == risk_level)
    if payment_plan:
        q = q.filter(Customer.payment_plan == payment_plan)
    return q.order_by(Customer.join_date.desc()).offset(skip).limit(limit).all()


@router.post("/", response_model=CustomerOut, status_code=201)
def create_customer(
    data:         CustomerCreate,
    request:      Request,
    db:           Session = Depends(get_db),
    current_user=Depends(require_staff_or_admin),
):
    customer = Customer(**data.model_dump(), created_by=current_user.id)
    db.add(customer)
    db.flush()
    log_action(db, current_user.id, "create_customer", "Customer", customer.id,
               detail=data.model_dump(), ip_address=request.client.host if request.client else None)
    db.commit()
    db.refresh(customer)
    return customer


@router.get("/{customer_id}", response_model=CustomerDetail)
def get_customer(
    customer_id: int,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    payments = customer.payments
    total_paid  = sum(p.amount_paid for p in payments)
    total_due   = sum(p.amount_due for p in payments)
    missed      = sum(1 for p in payments if p.status == "missed")

    return CustomerDetail(
        **CustomerOut.model_validate(customer).model_dump(),
        notes=customer.notes,
        total_paid=total_paid,
        total_due=total_due,
        missed_count=missed,
        payment_count=len(payments),
    )


@router.patch("/{customer_id}", response_model=CustomerOut)
def update_customer(
    customer_id:  int,
    data:         CustomerUpdate,
    request:      Request,
    db:           Session = Depends(get_db),
    current_user=Depends(require_staff_or_admin),
):
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    for field, value in data.model_dump(exclude_none=True).items():
        setattr(customer, field, value)

    log_action(db, current_user.id, "update_customer", "Customer", customer_id,
               detail=data.model_dump(exclude_none=True),
               ip_address=request.client.host if request.client else None)
    db.commit()
    db.refresh(customer)
    return customer


@router.delete("/{customer_id}", status_code=204)
def delete_customer(
    customer_id:  int,
    request:      Request,
    db:           Session = Depends(get_db),
    current_user=Depends(require_admin),
):
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    log_action(db, current_user.id, "delete_customer", "Customer", customer_id,
               ip_address=request.client.host if request.client else None)
    db.delete(customer)
    db.commit()


@router.get("/{customer_id}/payments")
def get_customer_payments(
    customer_id: int,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    payments = db.query(Payment).filter(
        Payment.customer_id == customer_id
    ).order_by(Payment.due_date).all()

    return {
        "customer":     CustomerOut.model_validate(customer),
        "payments":     payments,
        "total_paid":   sum(p.amount_paid for p in payments),
        "total_due":    sum(p.amount_due for p in payments),
        "missed_count": sum(1 for p in payments if p.status == "missed"),
        "paid_count":   sum(1 for p in payments if p.status == "paid"),
    }


@router.get("/{customer_id}/installments")
def get_customer_installments(
    customer_id: int,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    installments = db.query(Installment).filter(
        Installment.customer_id == customer_id
    ).order_by(Installment.installment_no).all()

    return {
        "customer":          CustomerOut.model_validate(customer),
        "installments":      installments,
        "total_installments": len(installments),
        "paid":              sum(1 for i in installments if i.status == "paid"),
        "pending":           sum(1 for i in installments if i.status == "pending"),
        "missed":            sum(1 for i in installments if i.status == "missed"),
    }
